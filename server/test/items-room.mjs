import __Core from '../../js/core.js';const HELLO_V=__Core.PROTO;   /* số phiên bản giao thức, như client thật gửi */
/* Kiểm tra phía server của rương và vật phẩm (Hỗn Loạn), không cần Cloudflare, không cần mạng:   cd server && node test/items-room.mjs
   Phủ: mở rương → fx chest gửi cả hai bên + túi đồ công khai; giày miễn phí (không đổi ply/lượt, không làm mới đồng hồ) rồi lượt thêm chỉ đi quân;
   găng / búa / cuốc chim (tường của đối thủ, trả tường, ô chết); hành động sai bị từ chối đúng lý do; Classic từ chối item; nối lại (state) giữ chủ tường, ô chết, túi. */
import {RoomLogic} from '../src/room-logic.js';

let bad=0;const ck=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};
let now=1e12;Date.now=()=>now;
const clone=o=>JSON.parse(JSON.stringify(o));
const tok=n=>n.padEnd(20,'x');
const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

function makeRoom(rand){
  const room={store:undefined,conns:[]};
  room.io={
    load:async()=>room.store?clone(room.store):undefined,save:async g=>{room.store=clone(g);},
    send:(c,m)=>{if(c.open)c.inbox.push(clone(m));},conns:()=>room.conns.filter(c=>c.open),
    getSeat:c=>c.seat,setSeat:(c,s)=>{c.seat=s;},close:(c,code)=>{c.open=false;c.closeCode=code;},
    alarm:()=>{},wipe:async()=>{room.store=undefined;},lobby:async()=>{}
  };
  room.logic=new RoomLogic(room.io,{grace:45e3,rand:rand||lcg(7)});
  room.connect=()=>{const c={open:true,seat:-1,inbox:[]};room.conns.push(c);return c;};
  room.say=async(c,o)=>{await room.logic.onMessage(c,JSON.stringify(o));};
  room.take=(c,t)=>{const i=c.inbox.findIndex(m=>m.t===t);return i<0?null:c.inbox.splice(i,1)[0];};
  return room;
}
async function start(mode){
  const rm=makeRoom();
  await rm.logic.init({mode,visibility:'private',code:'ABCDEF',biome:mode==='chaos'?'forest':undefined});
  const A=rm.connect(),B=rm.connect();
  await rm.say(A,{t:'hello',v:HELLO_V,token:tok('A')});await rm.say(B,{t:'hello',v:HELLO_V,token:tok('B')});
  const sA=rm.take(A,'started'),sB=rm.take(B,'started');
  const white=sA.you===0?A:B,black=white===A?B:A;
  return{rm,white,black};
}
const clear=g=>{for(const c of[g.white,g.black])c.inbox.length=0;};
/* hành động của một bên; trả {a: applied nhận bởi người gửi, b: bởi người kia, rej: rejected} */
async function act(g,who,seq,body){
  clear(g);const me=who==='w'?g.white:g.black,op=who==='w'?g.black:g.white;
  await g.rm.say(me,{t:'action',seq,...body});
  return{a:g.rm.take(me,'applied'),b:g.rm.take(op,'applied'),rej:g.rm.take(me,'rejected')};
}

try{
  console.log('1. Mở rương');
  {
    const g=await start('chaos'),st=g.rm.logic.st;
    st.terr.fill(0);st.pl[0]={r:8,c:4};st.pl[1]={r:0,c:4};st.terr[7*9+4]=5;
    const r=await act(g,'w',0,{move:[7,4]});
    ck(r.a&&r.b,'cả hai bên nhận applied');
    const fa=(r.a.fx||[]).find(e=>e.t==='chest'),fb=(r.b.fx||[]).find(e=>e.t==='chest');
    ck(fa&&fb&&fa.gift===fb.gift&&fa.cell.join()==='7,4','cả hai thấy fx chest cùng một món quà ở ô (7,4)');
    ck(Array.isArray(r.a.inv)&&Array.isArray(r.b.inv)&&JSON.stringify(r.a.inv)===JSON.stringify(r.b.inv)&&r.a.bonus.join()==='0,0','túi đồ và bonus công khai, giống nhau ở hai bên');
    ck(fa.gift==='brick'?r.a.left[0]===11:r.a.inv[0].join()===fa.gift,'quà được ghi đúng vào trạng thái (gạch: +1 tường; còn lại: vào túi)');
    ck(g.rm.store.snap.terr[7*9+4]==='0','rương đã biến mất trong dữ liệu lưu của phòng');
  }

  console.log('2. Giày (miễn phí + lượt thêm chỉ đi quân)');
  {
    const g=await start('chaos'),st=g.rm.logic.st;
    st.terr.fill(0);st.pl[0]={r:8,c:4};st.pl[1]={r:0,c:4};st.inv[0]=['boots'];
    const ends0=g.rm.logic.g.turnEnds;now+=20e3;
    let r=await act(g,'w',0,{item:{use:'boots'}});
    ck(r.a&&r.a.free===true&&r.a.ply===0&&r.a.turn===0&&r.a.inv[0].length===0&&r.a.bonus[0]===1,'boots: applied{free,ply:0,turn:0,bonus:1}');
    ck(g.rm.logic.g.turnEnds===ends0,'giày không làm mới đồng hồ lượt');
    r=await act(g,'w',0,{item:{use:'boots'}});ck(r.rej&&['noitem','bootsbusy'].includes(r.rej.reason),'không dùng giày lần hai ('+(r.rej&&r.rej.reason)+')');
    r=await act(g,'w',0,{move:[7,4]});
    ck(r.a&&r.a.turn===0&&r.a.bonus[0]===2&&r.a.ply===1,'đi xong vẫn là lượt của mình (lượt thêm)');
    ck(g.rm.logic.g.turnEnds>ends0,'hành động thường làm mới đồng hồ');
    r=await act(g,'w',1,{wall:{o:'h',r:2,c:2}});ck(r.rej&&r.rej.reason==='moveonly','lượt thêm: đặt tường bị từ chối (moveonly)');
    r=await act(g,'b',1,{move:[1,4]});ck(r.rej&&r.rej.reason==='turn','đối thủ chưa được đi trong lượt thêm của bạn');
    r=await act(g,'w',1,{move:[6,4]});ck(r.a&&r.a.turn===1&&r.a.bonus[0]===0&&r.a.ply===2,'lượt thêm xong: sang đối thủ');
  }

  console.log('3. Găng tay, búa, cuốc chim');
  {
    const g=await start('chaos'),st=g.rm.logic.st;
    st.terr.fill(0);st.pl[0]={r:8,c:4};st.pl[1]={r:0,c:4};st.inv[0]=['glove','hammer'];
    let r=await act(g,'w',0,{wall:{o:'h',r:3,c:2}});ck(r.a&&r.a.left[0]===9,'Trắng đặt tường (chủ = Trắng)');
    r=await act(g,'b',1,{wall:{o:'v',r:5,c:5}});ck(r.a&&r.a.left[1]===9,'Đen đặt tường');
    /* mục tiêu sai: tường của chính mình, ô trống, ngoài bàn */
    r=await act(g,'w',2,{item:{use:'hammer',o:'h',r:3,c:2}});ck(r.rej&&r.rej.reason==='badtarget','búa không nhắm tường của mình');
    r=await act(g,'w',2,{item:{use:'hammer',o:'h',r:6,c:6}});ck(r.rej&&r.rej.reason==='badtarget','búa không nhắm ô trống');
    r=await act(g,'w',2,{item:{use:'hammer'}});ck(r.rej&&r.rej.reason==='format','búa thiếu tọa độ');
    r=await act(g,'w',2,{item:{use:'pick',o:'v',r:5,c:5}});ck(r.rej&&r.rej.reason==='noitem','không có cuốc chim thì không dùng');
    r=await act(g,'w',2,{item:{use:'hammer',o:'v',r:5,c:5}});
    ck(r.a&&r.a.action.item.use==='hammer'&&r.a.left[1]===10&&r.a.turn===0&&r.a.ply===2&&r.a.free===true,'búa: tháo tường Đen, trả lại cho Đen, MIỄN PHÍ (vẫn lượt Trắng, ply giữ nguyên, free:true)');
    ck((r.a.fx||[]).some(e=>e.t==='hammer'&&e.o==='v'&&e.r===5&&e.c===5)&&!!r.b,'fx hammer cho cả hai bên');
    r=await act(g,'b',3,{move:[1,4]});ck(r.rej&&r.rej.reason==='turn','sau búa vẫn là lượt Trắng: Đen chưa được đi');
    r=await act(g,'w',2,{move:[7,4]});ck(r.a&&r.a.turn===1&&r.a.ply===3&&!r.a.free,'búa xong Trắng đi quân: hết lượt, sang Đen');
    r=await act(g,'b',3,{move:[1,4]});ck(r.a&&r.a.turn===0,'Đen đi');
    r=await act(g,'w',4,{item:{use:'glove'}});
    ck(r.a&&r.a.left[0]===10&&r.a.left[1]===9&&r.a.inv[0].length===0,'găng: cướp 1 tường của Đen');
    /* nối lại: sync cho trạng thái đầy đủ với chủ tường và túi */
    clear(g);await g.rm.say(g.white,{t:'sync'});const stt=g.rm.take(g.white,'state');
    ck(stt&&stt.snapshot.walls.length===1&&stt.snapshot.walls[0].p===0&&stt.snapshot.walls[0].o==='h','state: tường còn lại có chủ tường p');
    ck(Array.isArray(stt.snapshot.inv)&&Array.isArray(stt.snapshot.dead),'state: có túi đồ và danh sách ô chết');
  }
  {
    const g=await start('chaos'),st=g.rm.logic.st;
    st.terr.fill(0);st.pl[0]={r:8,c:4};st.pl[1]={r:0,c:4};st.inv[0]=['pick'];
    await act(g,'w',0,{wall:{o:'h',r:3,c:2}});
    await act(g,'b',1,{wall:{o:'v',r:5,c:5}});
    let r=await act(g,'w',2,{item:{use:'pick',o:'v',r:5,c:5}});
    ck(r.a&&r.a.left[1]===9&&(r.a.fx||[]).some(e=>e.t==='pick'),'cuốc chim: phá hẳn, Đen không được trả tường');
    clear(g);await g.rm.say(g.black,{t:'sync'});const stt=g.rm.take(g.black,'state');
    ck(stt&&stt.snapshot.dead.length===1&&stt.snapshot.dead[0].o==='v'&&stt.snapshot.walls.every(w=>!(w.o==='v'&&w.r===5&&w.c===5)),'state: khe bị phá nằm trong dead, không còn trong walls');
    r=await act(g,'b',3,{wall:{o:'v',r:5,c:5}});ck(r.rej&&r.rej.reason==='badwall','không xây lại tại khe bị phá');
  }

  console.log('4. Classic không có vật phẩm');
  {
    const g=await start('classic');
    const r=await act(g,'w',0,{item:{use:'boots'}});
    ck(r.rej&&r.rej.reason==='format','Classic từ chối item');
    const w=await act(g,'w',0,{wall:{o:'h',r:2,c:2}});
    ck(w.a&&!('inv' in w.a)&&!('bonus' in w.a),'applied Classic không có trường mới');
  }

  console.log('5. Trượt băng vào bụi cỏ: người kia vẫn thấy cả đoạn trượt');
  {
    const g=await start('chaos'),st=g.rm.logic.st;
    st.terr.fill(0);st.pl[0]={r:8,c:4};st.pl[1]={r:0,c:0};
    st.terr[5*9+4]=3;st.terr[5*9+3]=1;st.terr[5*9+5]=1;st.terr[4*9+4]=2;   /* băng (5,4) kẹp đá hai bên: chỉ trượt được lên bụi cỏ (4,4) */
    st.pl[0]={r:6,c:4};
    const r=await act(g,'w',0,{move:[5,4]});
    ck(r.a&&r.a.pl[0].r===4&&r.a.pl[0].c===4,'Trắng trượt lên bụi cỏ (4,4)');
    ck(r.b&&r.b.pl[0]===null&&r.b.action.hidden===true&&r.b.action.enter.join()==='4,4','Đen: quân Trắng khuất tầm nhìn, biết bụi nó vào');
    const sl=(r.b.fx||[]).find(e=>e.t==='slide');
    ck(sl&&sl.p===0&&sl.path[0].join()==='5,4'&&sl.path[sl.path.length-1].join()==='4,4','Đen nhận đoạn trượt: bắt đầu ở ô băng, kết thúc ở bụi (ô băng và bụi đều đã lộ)');
    ck((r.b.fx||[]).every(e=>e.t==='slide'),'Đen không nhận fx nào khác của quân bị che');
    ck(!('move' in r.b.action),'action vẫn bị giấu (không lộ ô đích ngoài enter)');
    ck((r.a.fx||[]).some(e=>e.t==='slide'),'Trắng nhận đầy đủ fx của mình');
  }
}catch(e){console.log('  ✗ lỗi bất ngờ:',e&&e.stack||e);bad++;}
console.log(bad?'THẤT BẠI':'ĐẠT');
process.exit(bad?1:0);
