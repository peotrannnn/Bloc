/* Kiểm tra logic phòng (RoomLogic) bằng io giả trong bộ nhớ, đồng hồ giả: không cần Cloudflare, không cần mạng.
     cd server && node test/room-logic.mjs
   Phủ: vào phòng, bắt đầu, nước đi, rớt mạng và nối lại, quá hạn nối lại bị xử thua, hết hạn phòng, hibernate (tạo lại RoomLogic từ storage). */
import {RoomLogic} from '../src/room-logic.js';
import Core from '../../js/core.js';

let bad=0;const ck=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};
const R=Core.make(Core.ruleset('classic'));
let now=1e12;Date.now=()=>now;                      /* đồng hồ giả: tự tua */
const clone=o=>JSON.parse(JSON.stringify(o));
const tok=n=>n.padEnd(20,'x');

function makeRoom(){
  const room={store:undefined,conns:[],alarmAt:null,lobby:[],wiped:false};
  room.io={
    load:async()=>room.store?clone(room.store):undefined,
    save:async g=>{room.store=clone(g);},
    send:(c,m)=>{if(c.open)c.inbox.push(clone(m));},
    conns:()=>room.conns.filter(c=>c.open),
    getSeat:c=>c.seat,setSeat:(c,s)=>{c.seat=s;},
    close:(c,code)=>{c.open=false;c.closeCode=code;},
    alarm:ms=>{room.alarmAt=now+ms;},
    wipe:async()=>{room.store=undefined;room.wiped=true;},
    lobby:async op=>{room.lobby.push(op);}
  };
  room.logic=new RoomLogic(room.io,{grace:45e3,rand:()=>.1});
  room.restart=()=>{room.logic=new RoomLogic(room.io,{grace:45e3,rand:()=>.1});};   /* mô phỏng DO bị hibernate/đổi bộ nhớ: mất bộ nhớ, còn storage */
  room.connect=()=>{const c={open:true,seat:-1,inbox:[],closeCode:null};room.conns.push(c);return c;};
  room.say=(c,o)=>room.logic.onMessage(c,JSON.stringify(o));
  room.drop=async c=>{c.open=false;await room.logic.onClose(c);};    /* client rớt mạng */
  room.alarm=async()=>{room.alarmAt=null;await room.logic.onAlarm();};
  room.take=(c,t)=>{const i=c.inbox.findIndex(m=>m.t===t);return i<0?null:c.inbox.splice(i,1)[0];};
  room.has=(c,t)=>c.inbox.some(m=>m.t===t);
  return room;
}
const legalMove=(st,p)=>R.moves(st,p)[0];

try{
  console.log('1. Vào phòng và bắt đầu');
  const rm=makeRoom();
  ck(await rm.logic.init({mode:'classic',visibility:'public',code:'ABCDEF'})===true,'init tạo phòng');
  ck(rm.alarmAt===now+60*60e3,'phòng mới hẹn hết hạn sau 1 giờ');
  const A=rm.connect(),B=rm.connect();
  await rm.say(A,{t:'hello',token:tok('A')});
  ck(rm.take(A,'welcome').slot===0&&rm.lobby.includes('add'),'người đầu vào, phòng công khai báo Lobby add');
  await rm.say(B,{t:'hello',token:tok('B')});
  const stA=rm.take(A,'started'),stB=rm.take(B,'started');
  ck(stA&&stB&&stA.you!==stB.you,'đủ người thì bắt đầu, hai phe khác nhau');
  ck(rm.lobby.includes('remove'),'đủ người thì gỡ khỏi Lobby');
  const white=stA.you===0?A:B,black=white===A?B:A;

  console.log('2. Nước đi và nhật ký');
  const m1=legalMove(R.newState(),0);            /* nước đi hợp lệ đầu tiên của Trắng */
  await rm.say(white,{t:'action',seq:0,move:m1});
  ck(rm.has(A,'applied')&&rm.has(B,'applied'),'nước đi hợp lệ được phát cho cả hai');
  rm.take(A,'applied');rm.take(B,'applied');
  await rm.say(black,{t:'action',seq:1,wall:{o:'h',r:3,c:3}});
  ck(rm.take(A,'applied')&&rm.take(B,'applied'),'đặt tường hợp lệ');
  await rm.say(black,{t:'action',seq:2,move:[0,0]});
  ck(rm.take(black,'rejected').reason==='turn','sai lượt bị từ chối');
  ck(rm.store.log.length===2&&rm.store.log[1].p===1&&rm.store.log[1].a.wall,'nhật ký ghi đúng người đi và hành động');

  console.log('3. Rớt mạng và nối lại kịp');
  B.inbox.length=0;                              /* bỏ tin cũ để chỉ xem tin mới */
  await rm.drop(A);
  ck(rm.has(B,'opponentStatus')&&rm.take(B,'opponentStatus').online===false,'đối thủ nhận "mất kết nối"');
  ck(rm.store.away[0]===now+45e3||rm.store.away[1]===now+45e3,'ghế của người rớt có hạn 45 giây');
  ck(rm.alarmAt===now+45e3,'alarm hẹn đúng mốc hạn nối lại (gần hơn hạn hết phòng)');
  now+=20e3;
  rm.restart();                                         /* hibernate giữa chừng */
  B.inbox.length=0;
  const A2=rm.connect();
  await rm.say(A2,{t:'hello',token:tok('A')});
  const w=rm.take(A2,'welcome'),state=rm.take(A2,'state');
  ck(w.started===true&&w.slot===(A===white?0:1)||w.started===true,'nối lại cùng token: welcome started=true');
  ck(state&&state.snapshot.ply===2&&state.log.length===2&&state.you===(A===white?stA.you:stB.you),'nhận state đủ: ply, nhật ký, phe của mình');
  ck(state.snapshot.walls.length===1,'snapshot có đúng số tường');
  ck(rm.store.away[0]===0&&rm.store.away[1]===0,'nối lại kịp: hủy hạn xử thua');
  ck(rm.take(B,'opponentStatus').online===true,'đối thủ nhận "đã nối lại"');
  await rm.alarm();
  ck(rm.store.over===false,'alarm tới sau khi đã nối lại: ván không bị xử thua');

  console.log('4. Quá hạn nối lại bị xử thua');
  await rm.drop(A2);rm.take(B,'opponentStatus');
  now+=44e3;await rm.alarm();
  ck(!rm.has(B,'over'),'chưa tới hạn (44 giây) thì chưa xử');
  ck(rm.alarmAt!==null,'và hẹn lại alarm');
  now+=2e3;await rm.alarm();
  const ov=rm.take(B,'over');
  ck(ov&&ov.reason==='timeout'&&ov.winner===(B===white?0:1),'quá 45 giây: người ở lại thắng, lý do timeout');
  const A3=rm.connect();await rm.say(A3,{t:'hello',token:tok('A')});
  rm.take(A3,'welcome');const late=rm.take(A3,'state');
  ck(late&&late.over===true&&late.reason==='timeout','nối lại sau khi bị xử: thấy ván đã kết thúc (timeout)');
  await rm.say(A3,{t:'action',seq:2,move:[0,0]});
  ck(rm.take(A3,'rejected').reason==='over','không đi được nữa');

  console.log('5. Hết hạn phòng');
  now+=31*60e3;await rm.alarm();
  ck(rm.wiped&&A3.closeCode===4002,'quá hạn: dọn phòng, đóng kết nối 4002');
  const Z=rm.connect();await rm.say(Z,{t:'hello',token:tok('Z')});
  ck(rm.take(Z,'error').reason==='noroom','vào lại phòng đã dọn: noroom');

  console.log('6. Cả hai cùng rớt: ai rớt trước thua');
  const r2=makeRoom();await r2.logic.init({mode:'classic',visibility:'private',code:'GHJKMN'});
  const P=r2.connect(),Q=r2.connect();
  await r2.say(P,{t:'hello',token:tok('P')});await r2.say(Q,{t:'hello',token:tok('Q')});
  const sp=r2.take(P,'started');
  await r2.drop(Q);now+=5e3;await r2.drop(P);
  now+=46e3;await r2.alarm();
  const P2=r2.connect();await r2.say(P2,{t:'hello',token:tok('P')});r2.take(P2,'welcome');
  const sx=r2.take(P2,'state');
  ck(sx.over&&sx.winner===sp.you,'Q rớt trước nên Q thua, P thắng');

  console.log('7. Đầu hàng và thắng bằng đích dọn hạn nối lại');
  const r3=makeRoom();await r3.logic.init({mode:'classic',visibility:'private',code:'PQRSTU'});
  const X=r3.connect(),Y=r3.connect();
  await r3.say(X,{t:'hello',token:tok('X')});await r3.say(Y,{t:'hello',token:tok('Y')});
  r3.take(X,'started');r3.take(Y,'started');
  await r3.say(X,{t:'resign'});
  const o3=r3.take(Y,'over');
  ck(o3&&o3.reason==='resign','đầu hàng: đối thủ nhận over resign');
  ck(r3.store.away[0]===0&&r3.alarmAt===now+30*60e3,'sau khi kết thúc: không còn hạn nối lại, phòng giữ 30 phút');

  console.log('8. Đồng hồ lượt');
  const r4=makeRoom();await r4.logic.init({mode:'classic',visibility:'private',code:'AAAAAB'});
  const K=r4.connect(),L=r4.connect();
  await r4.say(K,{t:'hello',token:tok('K')});await r4.say(L,{t:'hello',token:tok('L')});
  const sk=r4.take(K,'started');r4.take(L,'started');
  ck(sk.turnLeft===90e3&&r4.alarmAt===now+90e3,'ván bắt đầu: turnLeft 90 giây, alarm hẹn theo hạn lượt');
  now+=89e3;await r4.alarm();
  ck(!r4.has(K,'over')&&r4.alarmAt===now+1e3,'chưa hết giờ (89 giây): chưa xử, hẹn lại đúng 1 giây sau');
  now+=2e3;await r4.alarm();
  const ot=r4.take(L,'over');
  ck(ot&&ot.reason==='turn'&&ot.winner===1,'hết giờ: bên đang tới lượt (Trắng) thua, lý do turn');
  ck(r4.store.turnEnds===0&&r4.store.away[0]===0,'xong ván: hết đồng hồ lượt');

  const r5=makeRoom();await r5.logic.init({mode:'classic',visibility:'private',code:'AAAAAC'});
  const M=r5.connect(),N=r5.connect();
  await r5.say(M,{t:'hello',token:tok('M')});await r5.say(N,{t:'hello',token:tok('N')});
  const sm=r5.take(M,'started');r5.take(N,'started');
  const wh=sm.you===0?M:N,bl=wh===M?N:M;
  now+=60e3;await r5.say(wh,{t:'action',seq:0,move:legalMove(R.newState(),0)});
  const ap=r5.take(bl,'applied');
  ck(ap.turnLeft===90e3&&r5.alarmAt===now+90e3,'đi một nước: đồng hồ lượt đếm lại từ 90 giây');
  now+=89e3;await r5.alarm();
  ck(!r5.has(wh,'over'),'Đen còn 1 giây: chưa thua');
  now+=2e3;await r5.alarm();
  const o5=r5.take(wh,'over');
  ck(o5&&o5.reason==='turn'&&o5.winner===0,'Đen hết giờ: Trắng thắng');

  console.log('9. Đấu lại');
  const r6=makeRoom();await r6.logic.init({mode:'classic',visibility:'private',code:'AAAAAD'});
  const XA=r6.connect(),YA=r6.connect();
  await r6.say(XA,{t:'hello',token:tok('XA')});await r6.say(YA,{t:'hello',token:tok('YA')});
  const sx1=r6.take(XA,'started'),sy1=r6.take(YA,'started');
  await r6.say(YA,{t:'rematch'});
  ck(!r6.has(XA,'rematchStatus'),'chưa xong ván thì phiếu đấu lại bị bỏ qua');
  await r6.say(XA,{t:'action',seq:0,move:legalMove(R.newState(),0)});   /* (nếu XA là Đen thì bị từ chối, không sao) */
  await r6.say(XA,{t:'resign'});
  r6.take(XA,'over');r6.take(YA,'over');
  XA.inbox.length=0;YA.inbox.length=0;
  await r6.say(YA,{t:'rematch'});
  const vx=r6.take(XA,'rematchStatus'),vy=r6.take(YA,'rematchStatus');
  ck(vx&&vx.me===false&&vx.opp===true&&vy.me===true&&vy.opp===false,'một bên bấm: hai bên thấy đúng ai đã đồng ý');
  await r6.say(YA,{t:'rematch'});
  ck(!r6.has(XA,'started'),'bấm lặp không tính thêm');
  await r6.say(XA,{t:'rematch'});
  const sx2=r6.take(XA,'started'),sy2=r6.take(YA,'started');
  ck(sx2&&sy2&&sx2.you===1-sx1.you&&sy2.you===1-sy1.you,'đủ hai phiếu: ván mới, hai bên đổi phe');
  ck(sx2.snapshot.ply===0&&sx2.turnLeft===90e3&&r6.store.log.length===0&&r6.store.over===false,'ván mới sạch: ply 0, đồng hồ 90 giây, nhật ký trống');
  ck(r6.store.rematch[0]===false&&r6.store.rematch[1]===false,'phiếu được xóa cho lần sau');
  const wh2=sx2.you===0?XA:YA;
  await r6.say(wh2,{t:'action',seq:0,move:legalMove(R.newState(),0)});
  ck(r6.has(XA,'applied'),'ván mới chơi được bình thường');

  console.log('10. Nối lại khi đang chờ phiếu đấu lại');
  const r7=makeRoom();await r7.logic.init({mode:'classic',visibility:'private',code:'AAAAAE'});
  const E=r7.connect(),F=r7.connect();
  await r7.say(E,{t:'hello',token:tok('E')});await r7.say(F,{t:'hello',token:tok('F')});
  r7.take(E,'started');r7.take(F,'started');
  await r7.say(E,{t:'resign'});
  await r7.say(F,{t:'rematch'});
  await r7.drop(E);
  ck(r7.store.away[0]===0&&r7.store.away[1]===0,'ván đã xong thì rớt mạng không bị tính hạn xử thua');
  const E2=r7.connect();await r7.say(E2,{t:'hello',token:tok('E')});
  r7.take(E2,'welcome');const se=r7.take(E2,'state');
  ck(se.over===true&&se.rematch.opp===true&&se.rematch.me===false,'nối lại: thấy đối thủ đã đồng ý đấu lại');
  await r7.say(E2,{t:'rematch'});
  ck(r7.has(E2,'started')&&r7.has(F,'started'),'đồng ý nốt thì ván mới bắt đầu');

  console.log('11. Đấu lại khi một bên rớt mạng sau khi bấm');
  const r8=makeRoom();await r8.logic.init({mode:'classic',visibility:'private',code:'AAAAAF'});
  const G=r8.connect(),H=r8.connect();
  await r8.say(G,{t:'hello',token:tok('G')});await r8.say(H,{t:'hello',token:tok('H')});
  r8.take(G,'started');r8.take(H,'started');
  await r8.say(G,{t:'resign'});
  await r8.say(G,{t:'rematch'});await r8.drop(G);
  await r8.say(H,{t:'rematch'});
  const gg=r8.store.slots.indexOf(tok('G'));
  ck(r8.store.started&&!r8.store.over&&r8.has(H,'started'),'đủ phiếu dù một bên đã rớt: ván mới vẫn bắt đầu');
  ck(r8.store.away[gg]===now+45e3&&r8.store.away[1-gg]===0,'bên đang rớt mạng được tính hạn nối lại ngay từ ván mới');
}catch(e){bad++;console.log('  ✗ lỗi bất ngờ:',e.stack||e.message);}
console.log(bad?'THẤT BẠI':'ĐẠT');process.exit(bad?1:0);
