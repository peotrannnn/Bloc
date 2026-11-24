/* [SERVER/ROOM-LOGIC] Toàn bộ quy tắc của MỘT phòng, không phụ thuộc Cloudflare: nhận tin nhắn, kiểm bằng Core (luật dùng chung với
   client), cập nhật trạng thái, phát lại. Mọi thứ bên ngoài đi qua `io` (do room.js cấp; test dùng bản giả trong bộ nhớ):
     io.load() / io.save(g)       đọc/ghi bản ghi phòng (JSON thuần)
     io.send(conn,obj)            gửi một tin tới một kết nối
     io.conns()                   các kết nối đang mở
     io.getSeat(conn) / io.setSeat(conn,slot)   ghế gắn với kết nối (-1 = chưa vào ghế); sống sót qua lúc Durable Object "ngủ"
     io.close(conn,code,reason)   io.alarm(ms)   hẹn giờ dọn phòng      io.wipe()   xóa sạch dữ liệu phòng
   "slot" = ghế 0/1 theo thứ tự vào phòng (gắn với token ẩn danh). "side" = phe 0 (Trắng, đi trước) / 1 (Đen), bốc thăm khi đủ 2 người.

   Giao thức (JSON):
     client → server  hello{token} · action{seq, move:[r,c] | wall:{o,r,c}} · resign · rematch · sync · ping
     server → client  welcome{slot,started,players,mode,visibility} · started{ruleset,you,snapshot,turnLeft} · state{you,snapshot,over,winner,reason,log,turnLeft,rematch} ·
                      applied{seq,by,action,ply,turn,over,winner,draw,turnLeft} · rematchStatus{me,opp} · rejected{seq,reason,ply} · over{winner,reason} ·
                      opponentStatus{online} · full · replaced · error{reason: badtoken|noroom} · pong
   Phòng chỉ tồn tại sau khi Worker gọi init() (POST /create). Vào mã chưa được tạo → error{noroom} rồi đóng (mã 4004).
   Nối lại: cùng token mở kết nối mới → welcome rồi state (kèm log = các nước đã đi {p,a}, để client dựng lại bàn cờ đúng màu tường).
   Rớt kết nối giữa ván: giữ ghế GRACE_MS (45 giây); quá hạn thì xử người rớt thua, over{reason:'timeout'}.
   Đồng hồ lượt: mỗi lượt TURN_MS (90 giây, turnLeft = ms còn lại); hết giờ thì bên đang tới lượt thua, over{reason:'turn'}.
   Đấu lại: ván xong, mỗi bên gửi rematch; đủ hai bên thì đổi phe và gửi started mới (cùng phòng).
   seq = số nước đã đi (st.ply) tại lúc gửi: server chỉ nhận đúng seq kế tiếp, nên không bao giờ áp dụng trùng hoặc lệch nước. */
import Core from '../../js/core.js';

const RS=Core.ruleset('classic');
const R=Core.make(RS);
const MAX_MSG=2048;
const ALARM_WAITING=60*60e3,ALARM_PLAYING=6*60*60e3,ALARM_OVER=30*60e3;   /* dọn phòng bỏ trống / đang chơi quá lâu / đã xong */
const TURN_MS=90e3;    /* thời gian tối đa cho một lượt; quá hạn thì xử thua (tránh ván treo mãi, nhất là khi ghép với người lạ) */
const GRACE_MS=45e3;   /* thời gian giữ ghế khi một người rớt mạng giữa ván */
const TOKEN=/^[A-Za-z0-9_-]{16,64}$/;

const fresh=()=>({created:false,mode:null,visibility:null,code:null,slots:[null,null],side:[null,null],started:false,over:false,reason:null,snap:null,log:[],away:[0,0],expireAt:0,turnEnds:0,rematch:[false,false]});

export class RoomLogic{
  constructor(io,opts){this.io=io;this.rand=(opts&&opts.rand)||Math.random;this.grace=(opts&&opts.grace)||GRACE_MS;this.turn=(opts&&opts.turn)||TURN_MS;this.g=null;this.st=null;}

  async ensure(){
    if(this.g)return;
    this.g=(await this.io.load())||fresh();
    const g=this.g;if(!g.log)g.log=[];if(!g.away)g.away=[0,0];if(!g.expireAt)g.expireAt=0;if(!g.turnEnds)g.turnEnds=0;if(!g.rematch)g.rematch=[false,false];   /* bản ghi cũ (trước Giai đoạn 5) */
    this.st=this.g.snap?R.fromSnapshot(this.g.snap):null;
  }
  async exists(){await this.ensure();return !!this.g.created;}
  /* Tạo phòng (Worker gọi khi có POST /create). Trả false nếu mã này đã có người dùng → Worker thử mã khác. */
  async init(o){
    await this.ensure();
    if(this.g.created)return false;
    this.g.created=true;this.g.mode=o.mode;this.g.visibility=o.visibility;this.g.code=o.code||null;
    await this.expire(ALARM_WAITING);   /* phòng tạo ra mà không ai vào thì tự hết hạn */
    return true;
  }
  /* Báo Lobby (chỉ phòng công khai): 'add' = đang chờ người, 'remove' = đã đủ người / chủ phòng rời / hết hạn. Lobby không phải nguồn sự thật: lỗi thì bỏ qua. */
  async lobby(op){if(this.g.visibility==='public'&&this.g.code&&this.io.lobby)await this.io.lobby(op,this.g);}
  async persist(){if(this.st)this.g.snap=R.snapshot(this.st);await this.io.save(this.g);}

  /* Mỗi Durable Object chỉ có MỘT alarm, nên gộp ba loại hẹn giờ: hết hạn phòng (g.expireAt), hạn nối lại của từng ghế (g.away[slot]) và hạn của lượt đang đi (g.turnEnds).
     schedule() lưu g rồi đặt alarm vào mốc gần nhất; onAlarm() xem mốc nào đã tới. */
  async schedule(){
    const g=this.g;await this.persist();
    const t=[g.expireAt,g.away[0],g.away[1],g.turnEnds].filter(x=>x>0);
    if(t.length)this.io.alarm(Math.max(0,Math.min(...t)-Date.now()));
  }
  async expire(ms){this.g.expireAt=Date.now()+ms;await this.schedule();}
  /* Ván kết thúc (thắng, đầu hàng, quá hạn nối lại): hết hạn nối lại, phòng giữ thêm một lúc để xem kết quả rồi dọn */
  async ended(){this.g.away=[0,0];this.g.turnEnds=0;await this.expire(ALARM_OVER);}
  turnLeft(){return this.g.turnEnds>0?Math.max(0,this.g.turnEnds-Date.now()):0;}   /* ms còn lại của lượt (gửi cho client tự đếm ngược) */
  send(c,m){this.io.send(c,m);}
  bySlot(slot,except){return this.io.conns().filter(c=>c!==except&&this.io.getSeat(c)===slot);}
  broadcast(m){for(const c of this.io.conns())if(this.io.getSeat(c)>=0)this.send(c,m);}

  async onMessage(conn,raw){
    if(typeof raw!=='string'||raw.length>MAX_MSG)return;
    let m;try{m=JSON.parse(raw);}catch(e){return;}
    if(!m||typeof m.t!=='string')return;
    await this.ensure();
    switch(m.t){
      case'hello':return this.hello(conn,m);
      case'action':return this.action(conn,m);
      case'resign':return this.resign(conn);
      case'rematch':return this.rematch(conn);
      case'sync':return this.sync(conn);
      case'ping':return this.send(conn,{t:'pong'});
    }
  }

  async hello(conn,m){
    if(typeof m.token!=='string'||!TOKEN.test(m.token))return this.send(conn,{t:'error',reason:'badtoken'});
    if(!this.g.created){this.send(conn,{t:'error',reason:'noroom'});this.io.close(conn,4004,'noroom');return;}
    if(this.io.getSeat(conn)>=0)return;                        /* kết nối này đã có ghế */
    const g=this.g;
    let slot=g.slots.indexOf(m.token),joined=false;
    if(slot<0){
      slot=g.slots.indexOf(null);
      if(slot<0||g.started){this.send(conn,{t:'full'});this.io.close(conn,4001,'full');return;}
      g.slots[slot]=m.token;joined=true;
    }
    this.io.setSeat(conn,slot);
    for(const old of this.bySlot(slot,conn)){                  /* cùng token mở kết nối mới (tab khác/nối lại): kết nối cũ nhường chỗ */
      this.send(old,{t:'replaced'});this.io.close(old,4000,'replaced');
    }
    const players=g.slots.filter(Boolean).length;
    this.send(conn,{t:'welcome',slot,started:g.started,players,mode:g.mode,visibility:g.visibility});
    if(joined){await this.persist();if(players===1)await this.expire(ALARM_WAITING);}
    if(g.away[slot]){g.away[slot]=0;await this.schedule();}      /* người rớt mạng đã nối lại kịp: hủy hạn xử thua */
    if(!g.started&&players===1)await this.lobby('add');          /* chủ phòng vào/nối lại: phòng công khai hiện trong danh sách chờ */

    if(!g.started&&players===2)return this.start();
    if(g.started)this.sendState(conn,slot);
    this.send(conn,{t:'opponentStatus',online:this.bySlot(1-slot,conn).length>0});
    for(const o of this.bySlot(1-slot))this.send(o,{t:'opponentStatus',online:true});
  }

  async start(){
    const g=this.g,white=this.rand()<.5?0:1;
    g.side[white]=0;g.side[1-white]=1;g.started=true;this.st=R.newState();
    g.turnEnds=Date.now()+this.turn;
    await this.expire(ALARM_PLAYING);await this.lobby('remove');
    this.announce();
  }
  /* Báo cho cả hai: ván bắt đầu (kèm phe của từng người) và ai đang online */
  announce(){
    const g=this.g,snap=R.snapshot(this.st),turnLeft=this.turnLeft();
    for(const c of this.io.conns()){const s=this.io.getSeat(c);if(s>=0)this.send(c,{t:'started',ruleset:{id:RS.id,N:RS.N,walls:RS.walls},you:g.side[s],snapshot:snap,turnLeft});}
    for(const c of this.io.conns()){const s=this.io.getSeat(c);if(s>=0)this.send(c,{t:'opponentStatus',online:this.bySlot(1-s).length>0});}
  }

  sendState(conn,slot){this.send(conn,{t:'state',you:this.g.side[slot],snapshot:R.snapshot(this.st),over:this.st.over,winner:this.st.winner,reason:this.g.reason,log:this.g.log,turnLeft:this.turnLeft(),rematch:{me:this.g.rematch[slot],opp:this.g.rematch[1-slot]}});}
  sync(conn){const s=this.io.getSeat(conn);if(s>=0&&this.g.started)this.sendState(conn,s);}

  async action(conn,m){
    const slot=this.io.getSeat(conn),g=this.g,st=this.st;
    const no=reason=>this.send(conn,{t:'rejected',seq:m.seq,reason,ply:st?st.ply:0});
    if(slot<0)return no('notseated');
    if(!g.started||!st)return no('notstarted');
    if(st.over)return no('over');
    if(!Number.isInteger(m.seq))return no('format');
    if(g.side[slot]!==st.turn)return no('turn');
    if(m.seq!==st.ply)return no('seq');
    let a;                                                      /* chỉ lấy đúng các trường cần, bỏ phần thừa do client gửi */
    if(Array.isArray(m.move)&&m.move.length===2)a={move:[m.move[0],m.move[1]]};
    else if(m.wall&&typeof m.wall==='object')a={wall:{o:m.wall.o,r:m.wall.r,c:m.wall.c}};
    else return no('format');
    const res=R.apply(st,a);                                    /* luật nằm ở Core: sai thì không đổi gì */
    if(!res.ok)return no(res.reason);
    g.log.push({p:res.by,a});                                   /* nhật ký nước đi: client nối lại dựng lại bàn cờ (tường đúng màu), sau này dùng cho xem lại ván */
    if(st.over){g.over=true;g.reason=st.draw?'draw':'goal';}
    g.turnEnds=st.over?0:Date.now()+this.turn;                   /* lượt mới: đếm lại từ đầu */
    await this.schedule();
    this.broadcast({t:'applied',seq:m.seq,by:res.by,action:a,ply:st.ply,turn:st.turn,over:st.over,winner:st.winner,draw:st.draw,turnLeft:this.turnLeft()});
    if(st.over){this.broadcast({t:'over',winner:st.winner,reason:g.reason});await this.ended();}
  }

  async resign(conn){
    const slot=this.io.getSeat(conn),g=this.g,st=this.st;
    if(slot<0||!g.started||!st||st.over)return;
    st.over=true;st.winner=1-g.side[slot];g.over=true;g.reason='resign';
    await this.persist();
    this.broadcast({t:'over',winner:st.winner,reason:'resign'});await this.ended();
  }

  /* Đấu lại: ván đã xong, mỗi bên bấm một lần; đủ cả hai thì đổi phe và chơi ván mới trong cùng phòng */
  async rematch(conn){
    const slot=this.io.getSeat(conn),g=this.g;
    if(slot<0||!g.started||!this.st||!this.st.over||g.rematch[slot])return;
    g.rematch[slot]=true;
    if(g.rematch[0]&&g.rematch[1])return this.restart();
    await this.persist();
    for(const c of this.io.conns()){const s=this.io.getSeat(c);if(s>=0)this.send(c,{t:'rematchStatus',me:g.rematch[s],opp:g.rematch[1-s]});}
  }
  async restart(){
    const g=this.g,now=Date.now();
    g.side=[1-g.side[0],1-g.side[1]];                            /* đổi phe: bên đi trước ván trước đi sau */
    g.over=false;g.reason=null;g.log=[];g.rematch=[false,false];this.st=R.newState();
    g.away=[0,0];
    for(let s=0;s<2;s++)if(!this.io.conns().some(c=>this.io.getSeat(c)===s))g.away[s]=now+this.grace;   /* ai rớt mạng sau khi bấm đồng ý vẫn được tính hạn nối lại */
    g.turnEnds=now+this.turn;
    await this.expire(ALARM_PLAYING);
    this.announce();
  }

  async onClose(conn){
    await this.ensure();
    const slot=this.io.getSeat(conn);
    if(slot<0||this.bySlot(slot,conn).length)return;           /* chưa có ghế, hoặc đã có kết nối khác thay chỗ: không phải rớt thật */
    if(!this.g.started&&!this.io.conns().some(c=>c!==conn&&this.io.getSeat(c)>=0))await this.lobby('remove');   /* phòng đang chờ mà không còn ai: gỡ khỏi danh sách, khỏi ghép người vào phòng trống */
    if(this.g.started&&this.st&&!this.st.over){this.g.away[slot]=Date.now()+this.grace;await this.schedule();}   /* rớt mạng giữa ván: giữ ghế, hết hạn thì xử thua */
    for(const o of this.bySlot(1-slot,conn))this.send(o,{t:'opponentStatus',online:false});
  }

  async onAlarm(){
    await this.ensure();
    const g=this.g,now=Date.now();
    if(g.started&&this.st&&!this.st.over){                      /* có hạn nào đã tới? lấy hạn tới trước (alarm có thể trễ, khi đó vẫn xử đúng thứ tự) */
      const ev=[];
      for(let i=0;i<2;i++)if(g.away[i]>0&&g.away[i]<=now)ev.push({at:g.away[i],loser:g.side[i],reason:'timeout'});    /* rớt mạng quá hạn nối lại */
      if(g.turnEnds>0&&g.turnEnds<=now)ev.push({at:g.turnEnds,loser:this.st.turn,reason:'turn'});                     /* hết giờ đi quân */
      if(ev.length){
        ev.sort((x,y)=>x.at-y.at);const e=ev[0];
        this.st.over=true;this.st.winner=1-e.loser;g.over=true;g.reason=e.reason;
        this.broadcast({t:'over',winner:this.st.winner,reason:e.reason});
        await this.ended();return;                              /* ended() lưu luôn trạng thái ván đã kết thúc */
      }
    }
    if(g.expireAt>0&&g.expireAt<=now){                          /* hết hạn phòng: dọn sạch */
      await this.lobby('remove');
      for(const c of this.io.conns())this.io.close(c,4002,'expired');
      await this.io.wipe();this.g=null;this.st=null;return;
    }
    await this.schedule();                                      /* alarm tới sớm hơn mốc nào cũng chưa tới: hẹn lại */
  }
}

