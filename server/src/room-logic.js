/* [SERVER/ROOM-LOGIC] Toàn bộ quy tắc của MỘT phòng, không phụ thuộc Cloudflare: nhận tin nhắn, kiểm bằng Core (luật dùng chung với
   client), cập nhật trạng thái, phát lại. Mọi thứ bên ngoài đi qua `io` (do room.js cấp; test dùng bản giả trong bộ nhớ):
     io.load() / io.save(g)       đọc/ghi bản ghi phòng (JSON thuần)
     io.send(conn,obj)            gửi một tin tới một kết nối
     io.conns()                   các kết nối đang mở
     io.getSeat(conn) / io.setSeat(conn,slot)   ghế gắn với kết nối (-1 = chưa vào ghế); sống sót qua lúc Durable Object "ngủ"
     io.close(conn,code,reason)   io.alarm(ms)   hẹn giờ dọn phòng      io.wipe()   xóa sạch dữ liệu phòng
   "slot" = ghế 0/1 theo thứ tự vào phòng (gắn với token ẩn danh). "side" = phe 0 (Trắng, đi trước) / 1 (Đen), bốc thăm khi đủ 2 người.

   Chế độ: 'classic' (như cũ) và 'chaos' (Hỗn Loạn: map do MapGen sinh theo biome ở server khi bắt đầu mỗi ván, luật 'chaos' của Core).
   Hỗn Loạn: rng của Core nằm riêng ở server (không bao giờ gửi đi); client chỉ nhận kết quả. Mỗi tin gửi RIÊNG từng người (snapshotFor): quân đối thủ
   bị cỏ che thì pl[đối thủ]=null, và nước đi/hiệu ứng của quân bị che không gửi (action:{hidden:true}). Hết ván thì lộ hết.
   Vật phẩm (chaos): action{seq,item:{use:'boots'|'glove'|'hammer'|'pick', o,r,c (búa/cuốc chim: tường của ĐỐI THỦ)}}; applied chaos thêm {inv:[[..],[..]],bonus:[0|1|2,0|1|2]} và fx{t:'chest'|'glove'|'hammer'|'pick'|'boots'};
   snapshot.walls[i].p = chủ tường (0/1), snapshot.dead = khe bị cuốc chim phá, snapshot.inv/bonus. Giày và búa là hành động MIỄN PHÍ: ply và lượt không đổi, applied{free:true} không làm mới đồng hồ lượt. Lý do rejected mới: noitem · moveonly · bootsbusy · glovefail · badtarget.
   Chaos thêm: started/state{map:{biome,seed}}
   (seed chỉ để dựng hình, không phải rng) · welcome{biome} · applied{pl,left,stuck,skipped?,fx?}.
   Giao thức (JSON):
     client → server  hello{token,v,name?} ·   (name = tên hiển thị, tối đa 16 ký tự, server làm sạch bằng names.js; opp = tên đối thủ, '' nếu họ chưa đặt)   (v = Core.PROTO; lệch → error{reason:'version',v} rồi đóng 4005)  · action{seq, move:[r,c] | wall:{o,r,c}} · resign · rematch · sync · chat{text} · ping
     server → client  welcome{slot,started,players,mode,visibility,opp} · started{ruleset,you,opp,snapshot,turnLeft} · state{you,opp,snapshot,over,winner,reason,log,turnLeft,rematch} ·
                      applied{seq,by,action,ply,turn,over,winner,draw,turnLeft} · rematchStatus{me,opp} · rejected{seq,reason,ply} · over{winner,reason} ·
                      chat{by,name,text,id} · chatRejected{reason,wait?} · opponentStatus{online} · full · replaced · error{reason: badtoken|noroom} · pong
   Phòng chỉ tồn tại sau khi Worker gọi init() (POST /create). Vào mã chưa được tạo → error{noroom} rồi đóng (mã 4004).
   Nối lại: cùng token mở kết nối mới → welcome rồi state (kèm log = các nước đã đi {p,a}, để client dựng lại bàn cờ đúng màu tường).
   Rớt kết nối giữa ván: giữ ghế GRACE_MS (45 giây); quá hạn thì xử người rớt thua, over{reason:'timeout'}.
   Đồng hồ lượt: mỗi lượt TURN_MS (90 giây, turnLeft = ms còn lại); hết giờ thì bên đang tới lượt thua, over{reason:'turn'}.
   Đấu lại: ván xong, mỗi bên gửi rematch; đủ hai bên thì đổi phe và gửi started mới (cùng phòng).
   seq = số nước đã đi (st.ply) tại lúc gửi: server chỉ nhận đúng seq kế tiếp, nên không bao giờ áp dụng trùng hoặc lệch nước. */
import Core from '../../js/core.js';
import MapGen from '../../js/mapgen.js';
import BlockerPlan from '../../js/blocker-plan.js';
import BlockerPick from '../../js/blocker-pick.js';
import {cleanName} from './names.js';
import {makeChatGuard,makeFlood} from './chat.js';

const RS_BY={classic:Core.ruleset('classic'),chaos:Core.ruleset('chaos')};
const R_BY={classic:Core.make(RS_BY.classic),chaos:Core.make(RS_BY.chaos)};   /* bộ luật theo chế độ của phòng (g.mode) */
const MAX_MSG=2048;
const ALARM_WAITING=60*60e3,ALARM_PLAYING=6*60*60e3,ALARM_OVER=30*60e3;   /* dọn phòng bỏ trống / đang chơi quá lâu / đã xong */
const TURN_MS=90e3;    /* thời gian tối đa cho một lượt; quá hạn thì xử thua (tránh ván treo mãi, nhất là khi ghép với người lạ) */
const GRACE_MS=45e3;   /* thời gian giữ ghế khi một người rớt mạng giữa ván */
const TOKEN=/^[A-Za-z0-9_-]{16,64}$/;
const BLOCKER_PAUSE_MS=10e3;   /* người chặn đường vào/ra thì cả hai bên đứng chờ vài giây: cộng bù cho bên đang tới lượt để không mất giờ oan */

const fresh=()=>({created:false,mode:null,biome:null,map:null,bplan:null,visibility:null,code:null,slots:[null,null],names:['',''],side:[null,null],started:false,over:false,reason:null,snap:null,log:[],away:[0,0],expireAt:0,turnEnds:0,rematch:[false,false]});

export class RoomLogic{
  constructor(io,opts){this.io=io;this.rand=(opts&&opts.rand)||Math.random;this.grace=(opts&&opts.grace)||GRACE_MS;this.turn=(opts&&opts.turn)||TURN_MS;this.g=null;this.st=null;
    this.guards=[null,null];this.floods=new WeakMap();this.chatId=0;   /* chat: người gác theo GHẾ + chống dồn dập theo KẾT NỐI, chỉ nằm trong bộ nhớ (không ghi storage; DO ngủ dậy thì làm lại từ đầu) */
  }

  rk(){return R_BY[this.g&&this.g.mode]||R_BY.classic;}
  rs(){return RS_BY[this.g&&this.g.mode]||RS_BY.classic;}
  /* Trạng thái ván mới. Chaos: server bốc 2 số riêng — seed của MAP (công khai, chỉ để dựng hình) và seed của RNG lõi (bí mật, quyết định băng/bẫy). */
  newGame(){
    const g=this.g,R=this.rk();
    if(g.mode!=='chaos'){g.map=null;g.bplan=null;return R.newState();}   /* Classic: cờ Quoridor truyền thống, không địa hình, không vật phẩm, KHÔNG có người chặn đường */
    const seed=(this.rand()*4294967296)>>>0,rng=(this.rand()*4294967296)>>>0;
    const m=MapGen.generate(seed,g.biome&&g.biome!=='random'?{biome:g.biome}:{balancedChance:1/6});   /* random: 5 biome + balanced, mỗi loại 1/6 */
    g.map={biome:m.biome,seed};
    g.bplan=BlockerPlan.init(this.rs().blockerPlan,this.rand,0);   /* lịch người chặn đường của ván này (chỉ Hỗn Loạn) */
    return R.newState({spawn:m.spawn,terr:m.terr,seed:rng});
  }
  /* Snapshot gửi cho ghế 'slot'. Classic: nguyên bản. Chaos: giấu quân bị cỏ che, không có rng; hết ván thì lộ hết. */
  viewSnap(slot){
    const g=this.g,st=this.st,R=this.rk();
    if(g.mode!=='chaos')return R.snapshot(st);
    const v=g.side[slot],sn=st.over?R.snapshot(st):R.snapshotFor(st,v);
    delete sn.rng;
    if(sn.pl[1-v]===null&&sn.stuck)sn.stuck[1-v]=false;
    if(sn.pl[1-v]===null&&sn.sunk)sn.sunk[1-v]=false;         /* quân bị che thì cũng không lộ việc nó đang đứng yên */
    return sn;
  }
  /* Nhật ký gửi client chỉ để dựng lại tường: chaos chỉ gửi các nước đặt tường (nước đi của quân có thể lộ vị trí quân bị che) */
  logFor(){return this.g.mode==='chaos'?this.g.log.filter(e=>e.a.wall):this.g.log;}
  async ensure(){
    if(this.g)return;
    this.g=(await this.io.load())||fresh();
    const g=this.g;if(!g.log)g.log=[];if(!g.away)g.away=[0,0];if(!g.expireAt)g.expireAt=0;if(!g.turnEnds)g.turnEnds=0;if(!g.rematch)g.rematch=[false,false];if(!g.names)g.names=['',''];   /* bản ghi cũ (trước Giai đoạn 5 / trước tên người chơi) */
    this.st=this.g.snap?this.rk().fromSnapshot(this.g.snap):null;
    if(g.mode==='chaos'&&this.st&&!g.bplan)g.bplan=BlockerPlan.init(this.rs().blockerPlan,this.rand,this.st.ply);   /* bản ghi cũ (trước khi có người chặn đường) */
  }
  async exists(){await this.ensure();return !!this.g.created;}
  /* Tạo phòng (Worker gọi khi có POST /create). Trả false nếu mã này đã có người dùng → Worker thử mã khác. */
  async init(o){
    await this.ensure();
    if(this.g.created)return false;
    this.g.created=true;this.g.mode=o.mode;this.g.biome=o.mode==='chaos'?(o.biome||'random'):null;this.g.visibility=o.visibility;this.g.code=o.code||null;
    await this.expire(ALARM_WAITING);   /* phòng tạo ra mà không ai vào thì tự hết hạn */
    return true;
  }
  /* Báo Lobby (chỉ phòng công khai): 'add' = đang chờ người, 'remove' = đã đủ người / chủ phòng rời / hết hạn. Lobby không phải nguồn sự thật: lỗi thì bỏ qua. */
  async lobby(op){if(this.g.visibility==='public'&&this.g.code&&this.io.lobby)await this.io.lobby(op,this.g);}
  async persist(){if(this.st)this.g.snap=this.rk().snapshot(this.st);await this.io.save(this.g);}

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
    let fl=this.floods.get(conn);if(!fl){fl=makeFlood();this.floods.set(conn,fl);}
    const f=fl.take();                                          /* mọi loại tin của một kết nối đều qua đây, trước cả JSON.parse: kẻ dồn dập không bắt server làm việc */
    if(f==='kick'){this.io.close(conn,4008,'flood');return;}
    if(f==='drop')return;
    let m;try{m=JSON.parse(raw);}catch(e){return;}
    if(!m||typeof m.t!=='string')return;
    await this.ensure();
    switch(m.t){
      case'hello':return this.hello(conn,m);
      case'action':return this.action(conn,m);
      case'resign':return this.resign(conn);
      case'rematch':return this.rematch(conn);
      case'sync':return this.sync(conn);
      case'chat':return this.chat(conn,m);
      case'ping':return this.send(conn,{t:'pong'});
    }
  }

  async hello(conn,m){
    if(typeof m.token!=='string'||!TOKEN.test(m.token))return this.send(conn,{t:'error',reason:'badtoken'});
    if(m.v!==Core.PROTO){this.send(conn,{t:'error',reason:'version',v:Core.PROTO});this.io.close(conn,4005,'version');return;}   /* client cũ/mới lệch luật: không cho vào (client cũ không gửi v) */
    if(!this.g.created){this.send(conn,{t:'error',reason:'noroom'});this.io.close(conn,4004,'noroom');return;}
    if(this.io.getSeat(conn)>=0)return;                        /* kết nối này đã có ghế */
    const g=this.g;
    let slot=g.slots.indexOf(m.token),joined=false;
    if(slot<0){
      slot=g.slots.indexOf(null);
      if(slot<0||g.started){this.send(conn,{t:'full'});this.io.close(conn,4001,'full');return;}
      g.slots[slot]=m.token;joined=true;
    }
    const nm=cleanName(m.name),named=!!nm&&g.names[slot]!==nm;   /* tên hiển thị: gửi trong hello, server làm sạch; nối lại với tên mới thì cập nhật */
    if(named)g.names[slot]=nm;
    this.io.setSeat(conn,slot);
    for(const old of this.bySlot(slot,conn)){                  /* cùng token mở kết nối mới (tab khác/nối lại): kết nối cũ nhường chỗ */
      this.send(old,{t:'replaced'});this.io.close(old,4000,'replaced');
    }
    const players=g.slots.filter(Boolean).length;
    this.send(conn,{t:'welcome',v:Core.PROTO,slot,started:g.started,players,mode:g.mode,visibility:g.visibility,opp:g.names[1-slot]||'',...(g.mode==='chaos'?{biome:g.biome}:{})});
    if(joined){await this.persist();if(players===1)await this.expire(ALARM_WAITING);}
    else if(named)await this.persist();
    if(g.away[slot]){g.away[slot]=0;await this.schedule();}      /* người rớt mạng đã nối lại kịp: hủy hạn xử thua */
    if(!g.started&&players===1)await this.lobby('add');          /* chủ phòng vào/nối lại: phòng công khai hiện trong danh sách chờ */

    if(!g.started&&players===2)return this.start();
    if(g.started)this.sendState(conn,slot);
    this.send(conn,{t:'opponentStatus',online:this.bySlot(1-slot,conn).length>0});
    for(const o of this.bySlot(1-slot))this.send(o,{t:'opponentStatus',online:true});
  }

  async start(){
    const g=this.g,white=this.rand()<.5?0:1;
    g.side[white]=0;g.side[1-white]=1;g.started=true;this.st=this.newGame();
    g.turnEnds=Date.now()+this.turn;
    await this.expire(ALARM_PLAYING);await this.lobby('remove');
    this.announce();
  }
  /* Báo cho cả hai: ván bắt đầu (kèm phe của từng người) và ai đang online */
  announce(){
    const g=this.g,RS=this.rs(),turnLeft=this.turnLeft();
    for(const c of this.io.conns()){const s=this.io.getSeat(c);if(s>=0)this.send(c,{t:'started',ruleset:{id:RS.id,N:RS.N,walls:RS.walls},you:g.side[s],opp:g.names[1-s]||'',snapshot:this.viewSnap(s),turnLeft,...(g.map?{map:g.map}:{})});}
    for(const c of this.io.conns()){const s=this.io.getSeat(c);if(s>=0)this.send(c,{t:'opponentStatus',online:this.bySlot(1-s).length>0});}
  }

  sendState(conn,slot){this.send(conn,{t:'state',you:this.g.side[slot],opp:this.g.names[1-slot]||'',snapshot:this.viewSnap(slot),...(this.g.map?{map:this.g.map}:{}),over:this.st.over,winner:this.st.winner,reason:this.g.reason,log:this.logFor(),turnLeft:this.turnLeft(),rematch:{me:this.g.rematch[slot],opp:this.g.rematch[1-slot]}});}
  /* Chat trong ván (chỉ khi đã đủ hai người): làm sạch + chống spam (chat.js), rồi phát cho CẢ HAI (kể cả người gửi, để thứ tự giống nhau).
     Không lưu gì. Tin: chat{by:phe 0/1, name, text, id}. Bị từ chối: chatRejected{reason:'rate'|'dup'|'muted', wait?(ms)}. */
  chat(conn,m){
    const slot=this.io.getSeat(conn),g=this.g;
    if(slot<0||!g.started)return;
    const gd=this.guards[slot]||(this.guards[slot]=makeChatGuard());
    const r=gd.check(m.text);
    if(!r.ok){if(!r.silent)this.send(conn,{t:'chatRejected',reason:r.reason,...(r.wait?{wait:r.wait}:{})});return;}
    this.broadcast({t:'chat',by:g.side[slot],name:g.names[slot]||'',text:r.text,id:++this.chatId});
  }

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
    else if(m.item&&typeof m.item==='object'&&!Array.isArray(m.item)){   /* dùng vật phẩm (chỉ Hỗn Loạn): use + (với búa/cuốc chim) tọa độ tường mục tiêu */
      if(g.mode!=='chaos'||typeof m.item.use!=='string'||m.item.use.length>12)return no('format');
      a={item:{use:m.item.use}};
      if(m.item.o!==undefined)a.item={use:m.item.use,o:m.item.o,r:m.item.r,c:m.item.c};
    }
    else return no('format');
    const was=g.mode==='chaos'?[0,1].map(v=>this.rk().sees(st,v,1-v)):null;   /* trước nước đi: mỗi bên có đang thấy quân kia không (để biết quân vừa chui vào cỏ ngay trước mắt) */
    const prev=g.mode==='chaos'?st.pl.map(q=>({r:q.r,c:q.c})):null;   /* ô đứng TRƯỚC nước đi của hai quân (để biết quân vừa thoát khỏi bụi cỏ nào) */
    const res=this.rk().apply(st,a);                                    /* luật nằm ở Core: sai thì không đổi gì */
    if(!res.ok)return no(res.reason);
    g.log.push({p:res.by,a});                                   /* nhật ký nước đi: client nối lại dựng lại bàn cờ (tường đúng màu), sau này dùng cho xem lại ván */
    if(st.over){g.over=true;g.reason=st.draw?'draw':'goal';}
    if(!res.free)g.turnEnds=st.over?0:Date.now()+this.turn;      /* lượt mới: đếm lại từ đầu (giày là hành động miễn phí: không làm mới đồng hồ) */
    if(g.mode==='chaos'&&!res.free&&!st.over)this.blockerStep(res);   /* người chặn đường (CHỈ Hỗn Loạn): tới giờ thì vào/rời, thêm fx{t:'blocker'} vào res và đặt st.blocker */
    await this.schedule();
    const applied={t:'applied',seq:m.seq,by:res.by,action:a,ply:st.ply,turn:st.turn,over:st.over,winner:st.winner,draw:st.draw,turnLeft:this.turnLeft(),...(res.free?{free:true}:{})};
    if(g.mode==='chaos')this.appliedChaos(applied,res,was,prev);else this.broadcast(applied);
    if(st.over){this.broadcast({t:'over',winner:st.winner,reason:g.reason});await this.ended();}
  }

  /* Người chặn đường (CHỈ Hỗn Loạn). Server là trọng tài: tự chạy lịch (BlockerPlan, đơn vị = nước đi), chọn ô (BlockerPick) rồi báo trong fx của tin applied:
       {t:'blocker',cell:[r,c]}  vào     {t:'blocker',leave:true}  rời
     st.blocker đổi NGAY (luật coi ô đó như đá từ nước kế tiếp); client diễn hoạt ảnh và tạm dừng hai bên, tin xếp hàng đợi diễn xong. Chưa chọn được ô (bàn kín) thì nước sau thử lại. */
  blockerStep(res){
    const g=this.g,st=this.st,plan=this.rs().blockerPlan;
    if(!plan||!g.bplan)return;
    const R=this.rk(),N=R.N;
    const due=BlockerPlan.due(g.bplan,st.ply,st.blocker>=0&&BlockerPick.released(R,st,g.bplan.tgt,plan),BlockerPick.minStay);   /* đang đứng mà bên bị nhắm hết dẫn: rời sớm */
    if(!due)return;
    let fx=null,stay=0;
    if(due==='enter'){
      if(st.blocker>=0)return;
      const pk=BlockerPick.pickTarget(R,st,this.rand,plan);   /* chưa ai dẫn đủ xa (hoặc không có ô hợp lệ): không xuất hiện, nước sau xét lại */
      if(!pk)return;
      const k=pk.cell;stay=pk.stay;g.bplan.tgt=pk.tgt;
      st.blocker=k;fx={t:'blocker',cell:[(k/N)|0,k%N]};
    }else{
      if(st.blocker<0){BlockerPlan.done(g.bplan,st.ply,'leave',plan,this.rand);return;}   /* lịch lệch với bàn (không nên xảy ra): coi như đã rời */
      st.blocker=-1;fx={t:'blocker',leave:true};
    }
    BlockerPlan.done(g.bplan,st.ply,due,plan,this.rand,stay);
    res.fx=(res.fx||[]).concat([fx]);
    if(g.turnEnds>0)g.turnEnds+=BLOCKER_PAUSE_MS;
  }

  /* Chaos: kết quả nước đi gửi RIÊNG từng người. Client không có rng nên không tự tính được băng/bẫy/cổng: nó dùng pl/stuck/fx của server.
     Quân đối thủ bị cỏ che (sau nước đi) thì: pl[đối thủ]=null, action của nó thành {hidden:true} (khỏi lộ ô đích), bỏ fx và trạng thái đứng yên của nó. */
  appliedChaos(base,res,was,prev){
    const g=this.g,st=this.st,R=this.rk();
    for(const c of this.io.conns()){
      const s=this.io.getSeat(c);if(s<0)continue;
      const v=g.side[s],o=1-v,seen=st.over||R.sees(st,v,o);
      let slideIn=null;   /* quân đối thủ trượt băng rồi dừng trong bụi cỏ: giữ lại đoạn trượt (xem dưới) */
      const m=Object.assign({},base,{pl:[st.pl[0],st.pl[1]],left:st.left.slice(),stuck:st.stuck.slice(),sunk:st.sunk.slice(),inv:st.inv.map(b=>b.slice()),bonus:st.bonus.slice()});   /* túi đồ và giày là thông tin CÔNG KHAI của cả hai bên */
      if(!seen){
        m.pl[o]=null;m.stuck[o]=false;m.sunk[o]=false;
        if(res.by===o&&base.action.move){
          m.action={hidden:true};
          if(was&&was[v]){
            m.action.enter=[st.pl[o].r,st.pl[o].c];   /* đang thấy quân này và nó vừa chui vào cỏ: cho biết bụi cỏ nó vào (để dựng hoạt ảnh + dấu "thấy lần cuối"); các nước đi tiếp trong cỏ thì vẫn giấu */
            /* Trượt băng rồi dừng trong bụi: mọi ô trên đường trượt (kể cả ô băng đầu tiên, path[0]) đều là ô KHÔNG phải cỏ nên ai cũng thấy; ô cuối chính là bụi đã lộ ở `enter`.
               Gửi kèm đoạn trượt để client dựng: đi bộ vào băng → trượt → vào bụi → ẩn (thay vì nhảy thẳng tới bụi). Các fx khác của quân bị che vẫn không gửi. */
            if(res.fx)slideIn=res.fx.find(e=>e.t==='slide'&&e.p===o)||null;
          }
        }
      }
      else if(res.by===o&&base.action.move&&was&&!was[v]&&prev)m.action=Object.assign({},base.action,{exit:[prev[o].r,prev[o].c]});   /* quân đang bị che mà vừa bước ra chỗ nhìn thấy được: cho biết bụi cỏ nó thoát ra (để dựng hoạt ảnh hiện ra ở bụi rồi mới bước ra) */
      if(res.skipped&&res.skipped.length)m.skipped=res.skipped.slice();
      if(res.fx){const f=res.fx.filter(e=>e.t==='blocker'||e.p===v||seen);   /* người chặn đường: công khai cho cả hai */
       if(slideIn)f.push(slideIn);if(f.length)m.fx=f;}
      this.send(c,m);
    }
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
    g.over=false;g.reason=null;g.log=[];g.rematch=[false,false];this.st=this.newGame();   /* chaos: map mới mỗi ván */
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