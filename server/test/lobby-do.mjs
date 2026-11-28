/* Durable Object Lobby (có mặt/online + danh sách phòng) chạy với "Cloudflare giả", không cần wrangler:  node test/lobby-do.mjs
   Giả lập: module 'cloudflare:workers', WebSocketPair, auto-response, storage. Chỉ kiểm logic của lớp Lobby; chạy thật vẫn cần `wrangler dev` (xem README). */
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`
  export async function resolve(s,c,n){if(s==='cloudflare:workers')return{url:'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env;}}',shortCircuit:true};return n(s,c);}
`));
let bad=0;const ck=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};

/* ----- Cloudflare giả ----- */
class FakeWS{constructor(){this.readyState=1;this.inbox=[];}send(m){if(this.readyState!==1)throw new Error('closed');this.inbox.push(JSON.parse(m));}close(){this.readyState=3;}
  last(){return this.inbox.at(-1);}}
globalThis.WebSocketPair=class{constructor(){this[0]=new FakeWS();this[1]=new FakeWS();this[0].server=this[1];}};   /* [0] phía client, [1] phía server (Lobby gửi tin qua socket này) */
globalThis.WebSocketRequestResponsePair=class{constructor(a,b){this.request=a;this.response=b;}};
const RealResponse=Response;
globalThis.Response=class extends RealResponse{constructor(b,i){if(i&&i.status===101){super(null,{status:200});this.status101=true;this.webSocket=i.webSocket;}else super(b,i);}};

const {Lobby}=await import('../src/lobby.js');
const store=new Map(),socks=[];let auto=null;
const ctx={storage:{get:async k=>store.get(k),put:async(k,v)=>{store.set(k,v);}},
  blockConcurrencyWhile:async f=>{await f();},
  getWebSockets:()=>socks.filter(w=>w.accepted),
  acceptWebSocket:w=>{w.accepted=true;socks.push(w);},
  setWebSocketAutoResponse:p=>{auto=p;}};
const env={ROOM:{idFromName:c=>c,get:()=>({fetch:async()=>new Response(null,{status:200})})}};
const L=new Lobby(ctx,env);
const connect=async()=>{const r=await L.fetch(new Request('https://lobby/presence',{headers:{Upgrade:'websocket'}}));return r.webSocket.server;};   /* trả socket phía server: đó là cái Lobby giữ, gửi tin và nhận webSocketClose */
const post=async(path,body)=>L.fetch(new Request('https://lobby'+path,{method:'POST',body:JSON.stringify(body)}));
const online=w=>w.inbox.filter(m=>m.t==='online').at(-1)?.n;

console.log('1. Có mặt (số người online)');
const a=await connect();ck(online(a)===1,'người đầu tiên thấy 1');
const b=await connect();ck(online(a)===2&&online(b)===2,'người thứ hai vào: cả hai thấy 2');
const c=await connect();ck([a,b,c].every(w=>online(w)===3),'ba người thấy 3');
ck(auto&&auto.request==='ping'&&auto.response==='pong','đăng ký auto-response ping→pong (không đánh thức DO)');
await L.webSocketClose(c);
ck(online(a)===2&&online(b)===2,'một người đóng tab: hai người còn lại thấy 2');
b.readyState=3;await L.webSocketError(b);   /* Cloudflare gọi webSocketError khi socket đã hỏng */
ck(online(a)===1,'một kết nối lỗi cũng bị trừ');
const d=await connect();ck(online(d)===2&&online(a)===2,'vào lại: đếm đúng, không cộng dồn kết nối đã đóng');
await L.webSocketClose(a);ck(online(d)===1,'còn một mình thấy 1');
const n0=d.inbox.length;await L.webSocketClose({readyState:3,send(){throw new Error('x');},close(){}});
ck(d.inbox.length>=n0,'đóng kết nối lạ không làm sập');

console.log('2. Danh sách phòng chờ có tên chủ phòng');
await post('/add',{code:'ABCDEF',mode:'chaos',biome:'snow',name:'  Linh <3 '});
await post('/add',{code:'GHJKLM',mode:'classic',name:''});
let r=await (await post('/list',{mode:'all',biome:'all'})).json();
ck(r.rooms.length===2&&r.rooms[0].name==='Linh 3','tên chủ phòng được làm sạch và có trong danh sách');
r=await (await post('/list',{mode:'chaos',biome:'snow'})).json();
ck(r.rooms.length===1&&r.rooms[0].code==='ABCDEF'&&r.rooms[0].biome==='snow','lọc theo chế độ + bản đồ');
r=await (await post('/list',{mode:'classic'})).json();
ck(r.rooms.length===1&&r.rooms[0].mode==='classic','lọc Classic');
await post('/remove',{code:'ABCDEF'});
r=await (await post('/list',{})).json();
ck(r.rooms.length===1,'phòng đủ người / rời thì biến khỏi danh sách');
await post('/add',{code:'sai',mode:'classic'});await post('/add',{code:'ZZZZZZ',mode:'xxx'});
r=await (await post('/list',{})).json();
ck(r.rooms.length===1,'mã / chế độ sai bị bỏ qua');
ck((await L.fetch(new Request('https://lobby/khac',{method:'POST',body:'{}'}))).status===404,'đường lạ → 404');

console.log('3. Ghép nhanh vẫn chạy cùng danh sách');
const q=await (await post('/quick',{mode:'classic'})).json();
ck(q.code==='GHJKLM'&&q.created===false,'ghép vào phòng chờ có sẵn');
const q2=await (await post('/quick',{mode:'classic'})).json();
ck(q2.created===true&&q2.code!=='GHJKLM','phòng đang giữ chỗ → tạo phòng mới');

console.log(bad?'THẤT BẠI':'ĐẠT');process.exit(bad?1:0);
