/* Kiểm tra phía server của chế độ Hỗn Loạn (chaos), không cần Cloudflare, không cần mạng:   cd server && node test/chaos-room.mjs
   Phủ: mã chế độ/biome, ghép phòng theo biome, bắt đầu ván (map, rng không lộ), biome ngẫu nhiên, giấu quân dưới cỏ theo từng người,
   nối lại sau hibernate, đấu lại ra map mới, Classic không đổi. */
import {RoomLogic} from '../src/room-logic.js';
import {MODES,BIOMES,pickBiome} from '../src/codes.js';
import {add,take} from '../src/lobby-logic.js';
import Core from '../../js/core.js';

let bad=0;const ck=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};
const RC=Core.make(Core.ruleset('chaos'));
let now=1e12;Date.now=()=>now;
const clone=o=>JSON.parse(JSON.stringify(o));
const tok=n=>n.padEnd(20,'x');
const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

function makeRoom(rand){
  const room={store:undefined,conns:[],lobby:[]};
  room.io={
    load:async()=>room.store?clone(room.store):undefined,save:async g=>{room.store=clone(g);},
    send:(c,m)=>{if(c.open)c.inbox.push(clone(m));},conns:()=>room.conns.filter(c=>c.open),
    getSeat:c=>c.seat,setSeat:(c,s)=>{c.seat=s;},close:(c,code)=>{c.open=false;c.closeCode=code;},
    alarm:()=>{},wipe:async()=>{room.store=undefined;},lobby:async op=>{room.lobby.push(op);}
  };
  room.logic=new RoomLogic(room.io,{grace:45e3,rand:rand||lcg(7)});
  room.restart=()=>{room.logic=new RoomLogic(room.io,{grace:45e3,rand:rand||lcg(99)});};
  room.connect=()=>{const c={open:true,seat:-1,inbox:[],log:[]};room.conns.push(c);return c;};
  room.say=async(c,o)=>{await room.logic.onMessage(c,JSON.stringify(o));};
  room.take=(c,t)=>{const i=c.inbox.findIndex(m=>m.t===t);return i<0?null:c.inbox.splice(i,1)[0];};
  return room;
}
async function start(mode,biome,rand){
  const rm=makeRoom(rand);
  await rm.logic.init({mode,visibility:'private',code:'ABCDEF',biome});
  const A=rm.connect(),B=rm.connect();
  await rm.say(A,{t:'hello',token:tok('A')});await rm.say(B,{t:'hello',token:tok('B')});
  const wA=A.inbox.find(m=>m.t==='welcome');
  const sA=rm.take(A,'started'),sB=rm.take(B,'started');
  const white=sA.you===0?A:B,black=white===A?B:A;
  return{rm,A,B,sA,sB,wA,white,black};
}

try{
  console.log('1. Mã chế độ và biome');
  ck(MODES.includes('chaos')&&MODES.includes('classic'),'MODES có classic và chaos');
  ck(BIOMES.length===7&&BIOMES[0]==='random'&&BIOMES.includes('balanced'),'7 lựa chọn: random + balanced + 5 biome');
  ck(pickBiome('classic','forest')===null,'Classic bỏ qua biome');
  ck(pickBiome('chaos',undefined)==='random'&&pickBiome('chaos','')==='random','Chaos không chọn gì → random');
  ck(pickBiome('chaos','snow')==='snow'&&pickBiome('chaos','lava')===undefined,'biome lạ bị từ chối');

  console.log('2. Ghép phòng theo chế độ và biome');
  let q=[];q=add(q,{code:'AAAAAA',mode:'chaos',biome:'forest'},1000);q=add(q,{code:'BBBBBB',mode:'classic'},1000);
  ck(take(q,'chaos',5000,'forest').code==='AAAAAA','cùng chaos + cùng biome thì ghép');
  ck(take(q,'chaos',5000,'snow').code===null,'khác biome thì không ghép');
  ck(take(q,'chaos',5000,'random').code===null,'random chỉ ghép với random');
  ck(take(q,'chaos',5000).code===null,'chaos không ghép vào phòng classic/khác biome');
  ck(take(q,'classic',5000).code==='BBBBBB','Classic vẫn ghép như cũ (không truyền biome)');
  ck(add([],{code:'CCCCCC',mode:'chaos',biome:'random'},1)[0].biome==='random','mục chờ lưu biome');

  console.log('3. Bắt đầu ván chaos');
  const g=await start('chaos','desert');
  ck(g.wA.mode==='chaos'&&g.wA.biome==='desert','welcome có mode và biome');
  ck(g.sA.ruleset.id==='chaos'&&g.sA.ruleset.N===9,'ruleset chaos');
  ck(g.sA.map&&g.sA.map.biome==='desert'&&Number.isInteger(g.sA.map.seed),'started có map {biome,seed}');
  ck(typeof g.sA.snapshot.terr==='string'&&g.sA.snapshot.terr.length===81,'snapshot có terr 81 chữ số');
  ck(g.sA.snapshot.terr===g.sB.snapshot.terr&&g.sA.map.seed===g.sB.map.seed,'hai bên cùng một map');
  ck(g.sA.you!==g.sB.you,'hai phe khác nhau');
  ck(!('rng' in g.sA.snapshot)&&!('rng' in g.sB.snapshot),'rng không bao giờ gửi đi');
  ck(typeof g.rm.store.snap.rng==='number','rng nằm trong kho lưu của server');
  ck(g.sA.snapshot.pl.every(p=>p&&p.r!==undefined),'đầu ván cả hai quân đều thấy nhau (spawn không phải cỏ)');
  const sp=g.sA.snapshot.spawn;
  ck(sp[0].r===8&&sp[1].r===0,'spawn Trắng hàng 8, Đen hàng 0');

  console.log('4. Biome ngẫu nhiên');
  const seen=new Set();let valid=true;
  for(let i=0;i<24;i++){const x=await start('chaos','random',lcg(1000+i*77));seen.add(x.sA.map.biome);if(!['balanced','forest','mountain','snow','river','desert'].includes(x.sA.map.biome))valid=false;}
  ck(valid,'random luôn ra một biome cụ thể hợp lệ');
  ck(seen.size>=4,'random ra nhiều biome khác nhau ('+[...seen].join(',')+')');
  const nb=await start('chaos',undefined);
  ck(nb.sA.map.biome&&nb.wA.biome==='random','không chọn biome → random');

  console.log('5. Giấu quân dưới cỏ (gửi riêng từng người)');
  {
    const {rm,white,black}=await start('chaos','forest');
    const st=rm.logic.st,wi=white.seat,bi=black.seat;
    st.terr.fill(0);st.terr[st.pl[1].r*9+st.pl[1].c]=2;      /* quân Đen đứng trên cỏ, Trắng thì không */
    const mv=RC.moves(st,0)[0];
    await rm.say(white,{t:'action',seq:0,move:mv});
    const aw=rm.take(white,'applied'),ab=rm.take(black,'applied');
    ck(aw&&ab,'nước đi hợp lệ được phát');
    ck(aw.pl[1]===null,'Trắng không thấy quân Đen đứng trên cỏ (pl=null)');
    ck(ab.pl[0]&&ab.pl[0].r===mv[0]&&ab.pl[1]&&ab.pl[1].r===st.pl[1].r,'Đen thấy Trắng và thấy chính mình');
    ck(aw.action.move&&ab.action.move,'nước đi của Trắng (thấy được) gửi cho cả hai');
    ck(Array.isArray(aw.left)&&Array.isArray(aw.stuck),'applied có left và stuck');
    const mb=RC.moves(st,1)[0];st.terr[mb[0]*9+mb[1]]=2;       /* Đen bước sang một ô cỏ khác */
    await rm.say(black,{t:'action',seq:1,move:mb});
    const aw2=rm.take(white,'applied'),ab2=rm.take(black,'applied');
    ck(aw2.action.hidden===true&&!aw2.action.move,'Trắng không nhận ô đích của quân Đen bị che');
    ck(aw2.pl[1]===null&&!aw2.fx,'quân Đen vẫn bị che, không có fx');
    ck(ab2.action.move&&ab2.action.move[0]===mb[0]&&ab2.pl[1].r===mb[0],'Đen nhận đủ nước của mình');
    ck(!JSON.stringify([aw,ab,aw2,ab2]).includes('rng'),'không tin applied nào chứa rng');
    await rm.say(black,{t:'action',seq:2,wall:{o:'h',r:3,c:3}});   /* sai lượt (đang tới lượt Trắng) bị từ chối, không rò gì */
    ck(rm.take(black,'rejected').reason==='turn','sai lượt vẫn bị từ chối');
    await rm.say(white,{t:'action',seq:2,wall:{o:'h',r:3,c:3}});
    const wl=rm.take(black,'applied');
    ck(wl.action.wall&&wl.action.wall.r===3,'tường luôn công khai');
  }

  console.log('6. Nối lại sau hibernate');
  {
    const {rm,A,white,black}=await start('chaos','mountain');
    const st=rm.logic.st;
    await rm.say(white,{t:'action',seq:0,move:RC.moves(st,0)[0]});
    await rm.say(black,{t:'action',seq:1,move:RC.moves(st,1)[0]});
    await rm.say(white,{t:'action',seq:2,wall:{o:'v',r:4,c:4}});
    const rngBefore=rm.store.snap.rng,terrBefore=rm.store.snap.terr;
    rm.restart();                                               /* Durable Object ngủ rồi dậy: chỉ còn storage */
    const A2=rm.connect();
    await rm.say(A2,{t:'hello',token:tok(A===white?'A':'B')});
    const w=rm.take(A2,'welcome'),s=rm.take(A2,'state');
    ck(w.started&&w.biome==='mountain','welcome sau khi nối lại có biome');
    ck(s&&s.map&&s.map.biome==='mountain','state có map');
    ck(s.snapshot.terr===terrBefore,'map giữ nguyên sau khi nối lại');
    ck(!('rng' in s.snapshot),'state không chứa rng');
    ck(s.log.length===1&&s.log[0].a.wall,'log gửi lại chỉ có nước đặt tường');
    ck(rm.logic.st.rng===rngBefore,'rng của server được khôi phục đúng (kết quả băng/bẫy không đổi)');
  }

  console.log('7. Đấu lại ra map mới');
  {
    const {rm,A,B,sA}=await start('chaos','random',lcg(5));
    const seed1=sA.map.seed;
    await rm.say(A,{t:'resign'});
    await rm.say(A,{t:'rematch'});await rm.say(B,{t:'rematch'});
    const s2=rm.take(A,'started'),s2b=rm.take(B,'started');
    ck(s2&&s2.map&&s2.map.seed!==seed1,'ván mới có map mới (seed khác)');
    ck(s2.snapshot.terr===s2b.snapshot.terr&&s2.you!==sA.you,'hai bên cùng map mới, đã đổi phe');
    ck(!('rng' in s2.snapshot),'started mới cũng không lộ rng');
  }

  console.log('8. Classic không đổi');
  {
    const {rm,sA,wA,white}=await start('classic',null,()=>.1);
    ck(!('map' in sA)&&!('terr' in sA.snapshot)&&!('biome' in wA),'Classic: không có map/terr/biome');
    await rm.say(white,{t:'action',seq:0,move:Core.make(Core.ruleset('classic')).moves(Core.make(Core.ruleset('classic')).newState(),0)[0]});
    const ap=rm.take(white,'applied');
    ck(ap&&ap.action.move&&!('pl' in ap)&&!('stuck' in ap),'Classic: applied giữ nguyên định dạng cũ');
  }
}catch(e){console.log('  ✗ lỗi:',e&&e.stack||e);bad++;}
console.log(bad?'THẤT BẠI':'ĐẠT');process.exit(bad?1:0);
