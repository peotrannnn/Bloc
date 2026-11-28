import __Core from '../../js/core.js';const HELLO_V=__Core.PROTO;   /* số phiên bản giao thức, như client thật gửi */
/* Kiểm tra người chặn đường ở phía SERVER, không cần Cloudflare, không cần mạng:   cd server && node test/blocker-room.mjs
   Phủ: Hỗn Loạn — server tự chạy lịch (vào ở nước 20-30, ở lại 5-7 nước, trống 20-30 nước, lặp lại), chọn ô hợp lệ, báo fx{t:'blocker'} cho CẢ HAI bên
   (kể cả khi quân bị cỏ che), snapshot có blocker, nối lại giữa lúc người chặn đang đứng, đấu lại thì lịch đặt lại, bù giờ lượt.
   Classic — quoridor truyền thống: KHÔNG BAO GIỜ có người chặn, địa hình, vật phẩm; tin applied giữ nguyên định dạng cũ. */
import {RoomLogic} from '../src/room-logic.js';
import Core from '../../js/core.js';

let bad=0;const ck=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};
let now=1e12;Date.now=()=>now;
const clone=o=>JSON.parse(JSON.stringify(o));
const tok=n=>n.padEnd(20,'x');
const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const RC=Core.make(Core.ruleset('chaos')),RK=Core.make(Core.ruleset('classic'));

function makeRoom(rand){
  const room={store:undefined,conns:[]};
  room.io={
    load:async()=>room.store?clone(room.store):undefined,save:async g=>{room.store=clone(g);},
    send:(c,m)=>{if(c.open)c.inbox.push(clone(m));},conns:()=>room.conns.filter(c=>c.open),
    getSeat:c=>c.seat,setSeat:(c,s)=>{c.seat=s;},close:(c,code)=>{c.open=false;c.closeCode=code;},
    alarm:()=>{},wipe:async()=>{room.store=undefined;},lobby:async()=>{}
  };
  room.logic=new RoomLogic(room.io,{grace:45e3,rand});
  room.restart=r=>{room.logic=new RoomLogic(room.io,{grace:45e3,rand:r||rand});};
  room.connect=()=>{const c={open:true,seat:-1,inbox:[]};room.conns.push(c);return c;};
  room.say=async(c,o)=>{await room.logic.onMessage(c,JSON.stringify(o));};
  room.take=(c,t)=>{const i=c.inbox.findIndex(m=>m.t===t);return i<0?null:c.inbox.splice(i,1)[0];};
  return room;
}
async function start(mode,biome,seed){
  const rm=makeRoom(lcg(seed));
  await rm.logic.init({mode,visibility:'private',code:'ABCDEF',biome});
  const A=rm.connect(),B=rm.connect();
  await rm.say(A,{t:'hello',v:HELLO_V,token:tok('A')});await rm.say(B,{t:'hello',v:HELLO_V,token:tok('B')});
  const sA=rm.take(A,'started'),sB=rm.take(B,'started');
  const white=sA.you===0?A:B,black=white===A?B:A;
  return{rm,A,B,sA,sB,white,black};
}

/* Bot: ưu tiên đặt tường, đi quân thì nửa đường ngắn nhất nửa lang thang (kéo dài ván cho tới khi qua mọi mốc của lịch). Trả về số nước đã áp dụng thành công. */
async function play(g,plies,rnd,R){
  const {rm}=g,msgs={A:[],B:[]};let applied=0;
  for(let guard=0;guard<plies*6&&applied<plies;guard++){
    const st=rm.logic.st;if(st.over)break;
    const seat=rm.logic.g.side.indexOf(st.turn),conn=rm.conns.find(c=>c.seat===seat);
    const act=[];
    if(st.left[st.turn]>0&&rnd()<.8){
      for(let t=0;t<30;t++){const o=rnd()<.5?'h':'v',r=(rnd()*8)|0,c=(rnd()*8)|0;if(R.canWall(st,o,r,c)){act.push({wall:{o,r,c}});break;}}
    }
    const mv=R.moves(st,st.turn);
    if(mv.length){
      let best=1e9,bm=[];for(const m of mv){const s={r:m[0],c:m[1]};const d=R.dist(st,st.turn,s);if(d<best){best=d;bm=[m];}else if(d===best)bm.push(m);}
      act.push({move:rnd()<.5?mv[(rnd()*mv.length)|0]:bm[(rnd()*bm.length)|0]});   /* nửa số nước đi lang thang để ván đủ dài */
    }
    if(!act.length)break;
    const before=st.ply;
    await rm.say(conn,{t:'action',seq:st.ply,...act[0]});
    if(rm.logic.st.ply===before&&act[1]){await rm.say(conn,{t:'action',seq:st.ply,...act[1]});}
    if(rm.logic.st.ply>before)applied++;
    for(const [k,c] of [['A',g.A],['B',g.B]])while(c.inbox.length){const m=c.inbox.shift();msgs[k].push(m);}
  }
  return msgs;
}
const blockerFx=m=>(m.fx||[]).filter(e=>e.t==='blocker');

async function main(){
{
  console.log('1. Hỗn Loạn: server chạy lịch người chặn đường');
  const g=await start('chaos','forest',11),rnd=lcg(5);
  const events=[];const msgs=await play(g,160,rnd,RC);
  for(const side of['A','B']){
    const list=msgs[side].filter(m=>m.t==='applied');
    for(const m of list)for(const e of blockerFx(m))if(side==='A')events.push({ply:m.ply,e,turnLeft:m.turnLeft});
  }
  const enters=events.filter(x=>x.e.cell),leaves=events.filter(x=>x.e.leave);
  ck(enters.length>=1&&leaves.length>=1,'ván có người dẫn xa thì có vào/rời ('+enters.length+' vào, '+leaves.length+' rời)');
  ck(enters[0].ply>=20,'lần đầu xuất hiện ở nước '+enters[0].ply+' (không sớm hơn 20; còn phải có người dẫn đủ xa)');
  const seq=events.map(x=>x.e.cell?'E':'L').join('');
  ck(/^(EL)+E?$/.test(seq),'vào/rời xen kẽ đúng thứ tự ('+seq+')');
  let stayOk=true,gapOk=true;
  for(let i=0;i<events.length-1;i++){const d=events[i+1].ply-events[i].ply;if(events[i].e.cell&&(d<2||d>8+1+1))stayOk=false;if(events[i].e.leave&&d<20)gapOk=false;}
  ck(stayOk,'ở lại 2-9 nước (tùy lợi thế, có thể rời sớm) rồi mới rời');ck(gapOk,'rời xong trống ít nhất 20 nước mới quay lại');
  ck(enters.every(x=>x.e.cell.length===2&&x.e.cell[0]>=1&&x.e.cell[0]<=7),'ô được chọn nằm trong bàn, không phải hàng đích');
  const bothSaw=msgs.A.filter(m=>m.t==='applied'&&blockerFx(m).length).length===msgs.B.filter(m=>m.t==='applied'&&blockerFx(m).length).length;
  ck(bothSaw,'cả hai bên đều nhận fx người chặn đường (kể cả khi quân bị cỏ che)');
  const withBlocker=msgs.A.filter(m=>m.t==='applied'&&m.turnLeft>0);
  ck(withBlocker.some(m=>blockerFx(m).length&&m.turnLeft>g.rm.logic.turn),'có bù giờ lượt khi người chặn vào/rời (turnLeft > '+g.rm.logic.turn+'ms)');
}

{
  console.log('2. Trạng thái luôn nhất quán với thông báo');
  const g=await start('chaos','snow',21),rnd=lcg(9);let okCell=true,okSnap=true,pawnOnIt=false,cur=-1,n=0;
  for(let i=0;i<120&&!g.rm.logic.st.over;i++){
    const msgs=await play(g,1,rnd,RC);
    for(const m of msgs.A.filter(m=>m.t==='applied')){
      for(const e of blockerFx(m)){if(e.cell)cur=e.cell[0]*9+e.cell[1];else cur=-1;n++;}
    }
    const st=g.rm.logic.st;
    if(st.blocker!==cur)okSnap=false;
    if(cur>=0){if(st.terr[cur]!==0)okCell=false;if(st.pl.some(p=>p.r*9+p.c===cur))pawnOnIt=true;}
    if(RC.dist(st,0,st.pl[0])>=Core.NOPATH||RC.dist(st,1,st.pl[1])>=Core.NOPATH)okCell=false;
  }
  ck(n>0,'có sự kiện để kiểm ('+n+')');
  ck(okSnap,'st.blocker luôn khớp với các fx đã gửi');
  ck(okCell,'ô được chọn là ô thường và hai bên vẫn còn đường');
  ck(!pawnOnIt,'không bao giờ chặn trúng ô đang có quân');
}

{
  console.log('3. Nối lại / hibernate khi người chặn đang đứng');
  const g=await start('chaos','desert',33),rnd=lcg(3);
  let guard=0;while(g.rm.logic.st.blocker<0&&!g.rm.logic.st.over&&guard++<80)await play(g,1,rnd,RC);
  const st=g.rm.logic.st;ck(st.blocker>=0,'đã có người chặn đứng trên bàn (ô '+st.blocker+')');
  const keepAt=g.rm.logic.g.bplan.at;
  g.rm.restart(lcg(777));                                  /* Durable Object "ngủ" rồi dậy: chỉ còn bản ghi đã lưu */
  const C=g.rm.connect();await g.rm.say(C,{t:'hello',v:HELLO_V,token:tok(g.rm.logic.g?'A':'A')});
  const state=g.rm.take(C,'state');
  ck(state&&state.snapshot.blocker===st.blocker,'state sau khi nối lại có blocker đúng ô');
  ck(g.rm.logic.g.bplan&&g.rm.logic.g.bplan.on===true&&g.rm.logic.g.bplan.at===keepAt,'lịch người chặn đường được lưu (on, at) qua lúc ngủ');
  ck(g.rm.logic.st.blocker===st.blocker,'server dựng lại st.blocker từ snapshot');
}

{
  console.log('4. Đấu lại: lịch và người chặn đặt lại');
  const g=await start('chaos','mountain',44),rnd=lcg(8);
  let guard=0;while(g.rm.logic.st.blocker<0&&!g.rm.logic.st.over&&guard++<80)await play(g,1,rnd,RC);
  ck(g.rm.logic.st.blocker>=0,'đang có người chặn');
  await g.rm.say(g.A,{t:'resign'});
  await g.rm.say(g.A,{t:'rematch'});await g.rm.say(g.B,{t:'rematch'});
  const st=g.rm.logic.st,bp=g.rm.logic.g.bplan;
  ck(!st.over&&st.blocker===-1,'ván mới: chưa có người chặn');
  ck(bp&&bp.on===false&&bp.at>=20&&bp.at<=30,'ván mới: lịch bắt đầu lại (đợi 20-30 nước, at='+(bp&&bp.at)+')');
}

{
  console.log('5. CLASSIC: quoridor truyền thống, không người chặn, không địa hình, không vật phẩm');
  const g=await start('classic',undefined,55),rnd=lcg(13);
  const msgs=await play(g,200,rnd,RK);
  const st=g.rm.logic.st,applied=msgs.A.filter(m=>m.t==='applied');
  ck(applied.length>=40,'đã chơi đủ dài để qua mọi mốc lịch ('+applied.length+' nước)');
  ck(applied.every(m=>!m.fx&&!blockerFx(m).length),'không có fx nào trong mọi tin applied');
  ck(applied.every(m=>!('pl' in m)&&!('inv' in m)&&!('stuck' in m)),'applied giữ nguyên định dạng Classic (không pl/inv/stuck)');
  ck(g.rm.logic.g.bplan===null,'Classic không có lịch người chặn (g.bplan = null)');
  ck(st.terr===undefined&&st.blocker===undefined&&st.inv===undefined,'trạng thái Classic không có terr / blocker / túi đồ');
  const sn=g.rm.logic.viewSnap(0);
  ck(!('terr' in sn)&&!('blocker' in sn)&&!('inv' in sn)&&!('spawn' in sn),'snapshot Classic không có terr / blocker / inv / spawn');
  ck(g.sA.map===undefined&&g.sA.snapshot.terr===undefined,'started của Classic không có map / địa hình');
  ck(Core.ruleset('classic').blockerPlan===undefined,'ruleset classic không có lịch người chặn');
  /* vật phẩm bị từ chối ở Classic */
  const st2=g.rm.logic.st;if(!st2.over){
    const seat=g.rm.logic.g.side.indexOf(st2.turn),conn=g.rm.conns.find(c=>c.seat===seat);
    await g.rm.say(conn,{t:'action',seq:st2.ply,item:{use:'boots'}});
    const rj=g.rm.take(conn,'rejected');ck(rj&&rj.reason==='format','Classic: dùng vật phẩm bị từ chối');
  }
  /* đấu lại ở Classic vẫn sạch */
  await g.rm.say(g.A,{t:'resign'});await g.rm.say(g.A,{t:'rematch'});await g.rm.say(g.B,{t:'rematch'});
  ck(g.rm.logic.g.bplan===null&&g.rm.logic.st.terr===undefined,'đấu lại ở Classic: vẫn không người chặn / địa hình');
}
}
main().catch(e=>{console.log('  ✗ lỗi bất ngờ:',e&&e.stack||e);bad++;}).then(()=>{console.log(bad?'\nTHẤT BẠI ('+bad+')':'\nĐẠT');process.exit(bad?1:0);});
