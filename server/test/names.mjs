/* Tên người chơi + danh sách phòng chờ (không cần Cloudflare):  node test/names.mjs */
import {RoomLogic} from '../src/room-logic.js';
import {cleanName} from '../src/names.js';
import {add,list} from '../src/lobby-logic.js';
import Core from '../../js/core.js';
const V=Core.PROTO;
let bad=0;const ck=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};
const clone=o=>JSON.parse(JSON.stringify(o));
const tok=n=>n.padEnd(20,'x');

console.log('1. cleanName');
ck(cleanName('  Peo   Tran ')==='Peo Tran','cắt khoảng trắng thừa');
ck(cleanName('<b>Hi</b>&"`')==='bHi/b','bỏ < > & " `');
ck(cleanName('a'.repeat(40)).length===16,'tối đa 16 ký tự');
ck(cleanName('Nguyễn Văn Ạ')==='Nguyễn Văn Ạ','giữ tiếng Việt');
ck(cleanName('😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀')===Array.from('😀'.repeat(16)).join(''),'cắt theo ký tự, không chẻ đôi emoji');
ck(cleanName(123)===''&&cleanName(null)===''&&cleanName('\u0000\u202e')==='','không phải chuỗi / toàn ký tự cấm → rỗng');

console.log('2. Tên đi qua welcome / started / state');
const store={g:undefined,out:[],conns:[]};
const io={load:async()=>store.g?clone(store.g):undefined,save:async g=>{store.g=clone(g);},send:(c,m)=>{if(c.open)c.inbox.push(clone(m));},
  conns:()=>store.conns.filter(c=>c.open),getSeat:c=>c.seat,setSeat:(c,s)=>{c.seat=s;},close:(c)=>{c.open=false;},alarm:()=>{},wipe:async()=>{},lobby:async(op,g)=>{store.out.push([op,(g.names||[])[g.slots.findIndex(Boolean)]||''])}};
const L=new RoomLogic(io,{rand:()=>.1});
const conn=()=>{const c={open:true,seat:-1,inbox:[]};store.conns.push(c);return c;};
const say=(c,o)=>L.onMessage(c,JSON.stringify(o));
const take=(c,t)=>{const i=c.inbox.findIndex(m=>m.t===t);return i<0?null:c.inbox.splice(i,1)[0];};
await L.init({mode:'classic',visibility:'public',code:'ABCDEF'});
const a=conn(),b=conn();
await say(a,{t:'hello',v:V,token:tok('a'),name:'  Linh <3 '});
const wa=take(a,'welcome');
ck(wa.opp==='','welcome: chưa có đối thủ → opp rỗng');
ck(store.out.some(x=>x[0]==='add'&&x[1]==='Linh 3'),'báo Lobby kèm tên chủ phòng đã làm sạch');
await say(b,{t:'hello',v:V,token:tok('b'),name:'Bình'});
const sa=take(a,'started'),sb=take(b,'started');
ck(sa&&sb&&sa.opp==='Bình'&&sb.opp==='Linh 3','started: mỗi người nhận tên của người kia');
const c2=conn();                                   /* a nối lại bằng tab khác, đổi tên */
await say(c2,{t:'hello',v:V,token:tok('a'),name:'Linh Mới'});
const st=take(c2,'state');
ck(st&&st.opp==='Bình','state: có tên đối thủ khi nối lại');
const sb2=b.inbox.find(m=>m.t==='state');
await say(b,{t:'sync'});
ck(take(b,'state').opp==='Linh Mới','đối thủ thấy tên mới sau khi đồng bộ');
const d=conn();await say(d,{t:'hello',v:V,token:tok('z'),name:123});
ck(take(d,'full'),'người thứ ba vẫn bị từ chối (không ảnh hưởng)');
const L2=new RoomLogic(io,{rand:()=>.1});await L2.ensure();
ck(L2.g.names[0]==='Linh Mới'&&L2.g.names[1]==='Bình','tên sống sót qua hibernate (nằm trong storage)');

console.log('3. Danh sách phòng chờ');
let q=[];
q=add(q,{code:'AAAAAA',mode:'classic'},1000);
q=add(q,{code:'BBBBBB',mode:'chaos',biome:'snow',name:'Hà'},2000);
q=add(q,{code:'CCCCCC',mode:'chaos',biome:'random',name:'Nam'},3000);
q=add(q,{code:'AAAAAA',mode:'classic',name:'Chủ A'},4000);
ck(q[0].name==='Chủ A'&&q[0].at===1000,'đăng ký lại bổ sung tên, không đổi thứ tự');
ck(list(q,5000).length===3,'không lọc: đủ 3 phòng');
ck(list(q,5000,{mode:'chaos'}).map(r=>r.code).join()==='BBBBBB,CCCCCC','lọc theo chế độ');
ck(list(q,5000,{mode:'chaos',biome:'snow'}).map(r=>r.code).join()==='BBBBBB','lọc theo bản đồ');
ck(list(q,5000,{mode:'all',biome:'all'}).length===3,"'all' = không lọc");
ck(list(q,5000)[0].code==='AAAAAA'&&list(q,5000)[0].age===4000,'phòng chờ lâu nhất đứng đầu, có tuổi (ms)');
ck(list(q,5000,null,2).length===2,'giới hạn số phòng');
ck(list(q,1000+60*60e3)[0].code==='BBBBBB','phòng quá hạn không hiện');
console.log(bad?'THẤT BẠI':'ĐẠT');process.exit(bad?1:0);
