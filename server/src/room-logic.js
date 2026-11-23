/* [SERVER/ROOM-LOGIC] Toàn bộ quy tắc của MỘT phòng, không phụ thuộc Cloudflare: nhận tin nhắn, kiểm bằng Core (luật dùng chung với
   client), cập nhật trạng thái, phát lại. Mọi thứ bên ngoài đi qua `io` (do room.js cấp; test dùng bản giả trong bộ nhớ):
     io.load() / io.save(g)       đọc/ghi bản ghi phòng (JSON thuần)
     io.send(conn,obj)            gửi một tin tới một kết nối
     io.conns()                   các kết nối đang mở
     io.getSeat(conn) / io.setSeat(conn,slot)   ghế gắn với kết nối (-1 = chưa vào ghế); sống sót qua lúc Durable Object "ngủ"
     io.close(conn,code,reason)   io.alarm(ms)   hẹn giờ dọn phòng      io.wipe()   xóa sạch dữ liệu phòng
   "slot" = ghế 0/1 theo thứ tự vào phòng (gắn với token ẩn danh). "side" = phe 0 (Trắng, đi trước) / 1 (Đen), bốc thăm khi đủ 2 người.

   Giao thức (JSON):
     client → server  hello{token} · action{seq, move:[r,c] | wall:{o,r,c}} · resign · sync · ping
     server → client  welcome{slot,started,players,mode,visibility} · started{ruleset,you,snapshot} · state{you,snapshot,over,winner} ·
                      applied{seq,by,action,ply,turn,over,winner,draw} · rejected{seq,reason,ply} · over{winner,reason} ·
                      opponentStatus{online} · full · replaced · error{reason: badtoken|noroom} · pong
   Phòng chỉ tồn tại sau khi Worker gọi init() (POST /create). Vào mã chưa được tạo → error{noroom} rồi đóng (mã 4004).
   seq = số nước đã đi (st.ply) tại lúc gửi: server chỉ nhận đúng seq kế tiếp, nên không bao giờ áp dụng trùng hoặc lệch nước. */
import Core from '../../js/core.js';

const RS=Core.ruleset('classic');
const R=Core.make(RS);
const MAX_MSG=2048;
const ALARM_WAITING=60*60e3,ALARM_PLAYING=6*60*60e3,ALARM_OVER=30*60e3;   /* dọn phòng bỏ trống / đang chơi quá lâu / đã xong */
const TOKEN=/^[A-Za-z0-9_-]{16,64}$/;

const fresh=()=>({created:false,mode:null,visibility:null,slots:[null,null],side:[null,null],started:false,over:false,reason:null,snap:null});

export class RoomLogic{
  constructor(io,opts){this.io=io;this.rand=(opts&&opts.rand)||Math.random;this.g=null;this.st=null;}

  async ensure(){
    if(this.g)return;
    this.g=(await this.io.load())||fresh();
    this.st=this.g.snap?R.fromSnapshot(this.g.snap):null;
  }
  async exists(){await this.ensure();return !!this.g.created;}
  /* Tạo phòng (Worker gọi khi có POST /create). Trả false nếu mã này đã có người dùng → Worker thử mã khác. */
  async init(o){
    await this.ensure();
    if(this.g.created)return false;
    this.g.created=true;this.g.mode=o.mode;this.g.visibility=o.visibility;
    await this.persist();this.io.alarm(ALARM_WAITING);   /* phòng tạo ra mà không ai vào thì tự hết hạn */
    return true;
  }
  async persist(){if(this.st)this.g.snap=R.snapshot(this.st);await this.io.save(this.g);}
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
    if(joined){await this.persist();if(players===1)this.io.alarm(ALARM_WAITING);}

    if(!g.started&&players===2)return this.start();
    if(g.started)this.sendState(conn,slot);
    this.send(conn,{t:'opponentStatus',online:this.bySlot(1-slot,conn).length>0});
    for(const o of this.bySlot(1-slot))this.send(o,{t:'opponentStatus',online:true});
  }

  async start(){
    const g=this.g,white=this.rand()<.5?0:1;
    g.side[white]=0;g.side[1-white]=1;g.started=true;this.st=R.newState();
    await this.persist();this.io.alarm(ALARM_PLAYING);
    const snap=R.snapshot(this.st);
    for(const c of this.io.conns()){const s=this.io.getSeat(c);if(s>=0)this.send(c,{t:'started',ruleset:{id:RS.id,N:RS.N,walls:RS.walls},you:g.side[s],snapshot:snap});}
    for(const c of this.io.conns()){const s=this.io.getSeat(c);if(s>=0)this.send(c,{t:'opponentStatus',online:this.bySlot(1-s).length>0});}
  }

  sendState(conn,slot){this.send(conn,{t:'state',you:this.g.side[slot],snapshot:R.snapshot(this.st),over:this.st.over,winner:this.st.winner});}
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
    if(st.over){g.over=true;g.reason=st.draw?'draw':'goal';}
    await this.persist();
    this.broadcast({t:'applied',seq:m.seq,by:res.by,action:a,ply:st.ply,turn:st.turn,over:st.over,winner:st.winner,draw:st.draw});
    if(st.over){this.broadcast({t:'over',winner:st.winner,reason:g.reason});this.io.alarm(ALARM_OVER);}
  }

  async resign(conn){
    const slot=this.io.getSeat(conn),g=this.g,st=this.st;
    if(slot<0||!g.started||!st||st.over)return;
    st.over=true;st.winner=1-g.side[slot];g.over=true;g.reason='resign';
    await this.persist();
    this.broadcast({t:'over',winner:st.winner,reason:'resign'});this.io.alarm(ALARM_OVER);
  }

  async onClose(conn){
    await this.ensure();
    const slot=this.io.getSeat(conn);
    if(slot<0||this.bySlot(slot,conn).length)return;           /* chưa có ghế, hoặc đã có kết nối khác thay chỗ: không phải rớt thật */
    for(const o of this.bySlot(1-slot,conn))this.send(o,{t:'opponentStatus',online:false});
  }

  async onAlarm(){
    for(const c of this.io.conns())this.io.close(c,4002,'expired');
    await this.io.wipe();this.g=null;this.st=null;
  }
}

