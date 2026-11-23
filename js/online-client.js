/* [CLIENT/ONLINE] Kết nối chế độ online, không đụng tới giao diện: chỉ lo token, tạo phòng, vào phòng bằng mã và chuyển tin nhắn.
   Dùng:
     import Online from './online-client.js';
     const {code}=await Online.createRoom({mode:'classic',visibility:'private'});   // hiển thị code cho bạn bè
     const conn=Online.join(code);                                                   // hoặc Online.join(mãNgườiKhácGửi)
     conn.on('welcome',m=>...); conn.on('started',m=>...); conn.on('applied',m=>...); conn.on('over',m=>...);
     conn.on('error',m=>...); conn.on('full',()=>...); conn.on('close',ev=>...);     // ev.code 4004 = mã không tồn tại, 4001 = phòng đầy
     conn.action(seq,{move:[r,c]}) / conn.action(seq,{wall:{o,r,c}}); conn.resign(); conn.sync();
   Khi vào ván online, gọi App.start({analysis:{on:false, lock:true}}) để tắt và khóa thanh đánh giá. */

const SERVER='https://bloc-online.peotrannnn.workers.dev';   /* đổi nếu sau này gắn tên miền riêng; ws/wss suy ra từ đây */
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';           /* trùng với server: không có 0/O/1/I */
const KEY='bloc.token';

/* Token ẩn danh: sinh một lần, nhớ trong localStorage để lấy lại đúng ghế khi nối lại. Server yêu cầu 16–64 ký tự [A-Za-z0-9_-]. */
function getToken(){
  try{const t=localStorage.getItem(KEY);if(t&&/^[A-Za-z0-9_-]{16,64}$/.test(t))return t;}catch(e){}
  const b=crypto.getRandomValues(new Uint8Array(32));
  let t='';for(const x of b)t+=ALPHABET[x&31];
  try{localStorage.setItem(KEY,t);}catch(e){}                 /* không lưu được (chế độ riêng tư) thì token chỉ sống trong tab này */
  return t;
}

/* Người dùng gõ "abc 23x" → "ABC23X". Trả về null nếu không đúng định dạng mã của server, để báo lỗi ngay mà khỏi gọi mạng. */
function normalizeCode(s){
  const c=String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  return new RegExp('^['+ALPHABET+']{6}$').test(c)?c:null;
}

async function createRoom(opts){
  const o=opts||{};
  const r=await fetch(SERVER+'/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:o.mode||'classic',visibility:o.visibility||'private'})});
  if(!r.ok)throw new Error('create_failed_'+r.status);
  return r.json();                                            /* {code,mode,visibility} */
}

function join(rawCode){
  const code=normalizeCode(rawCode);
  if(!code)throw new Error('bad_code');
  const ws=new WebSocket(SERVER.replace(/^http/,'ws')+'/ws?room='+code);
  const handlers={};
  const emit=(t,m)=>{(handlers[t]||[]).forEach(f=>{try{f(m);}catch(e){console.error(e);}});};
  const send=o=>{if(ws.readyState===1)ws.send(JSON.stringify(o));};

  ws.onopen=()=>send({t:'hello',token:getToken()});
  ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}if(m&&m.t)emit(m.t,m);};
  ws.onclose=ev=>emit('close',{code:ev.code,reason:ev.reason});
  ws.onerror=()=>emit('close',{code:0,reason:'network'});

  return{
    code,
    on(t,f){(handlers[t]=handlers[t]||[]).push(f);return this;},
    action:(seq,a)=>send({t:'action',seq,...a}),
    resign:()=>send({t:'resign'}),
    sync:()=>send({t:'sync'}),
    ping:()=>send({t:'ping'}),
    close:()=>ws.close()
  };
}

export default{createRoom,join,normalizeCode,getToken};
