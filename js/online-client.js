'use strict';
/* [ONLINE] Kết nối chế độ online, không đụng tới giao diện: chỉ lo token, tạo phòng, vào phòng bằng mã và chuyển tin nhắn.
   Là script thường (như các file khác), tạo biến toàn cục Online. Menu (menu.js) và App (app.js) dùng nó.
     const {code}=await Online.createRoom({mode:'classic',visibility:'private'});   // hoặc: await Online.quick('classic') → vào tự động
     const conn=Online.join(code);
     conn.on('welcome'|'started'|'applied'|'over'|'opponentStatus'|'full'|'error'|'close', m=>...);   // close: m.code 4004 = mã không tồn tại, 4001 = đầy
     conn.action(seq,{move:[r,c]}) · conn.action(seq,{wall:{o,r,c}}) · conn.resign() · conn.sync() · conn.close() */
const Online=(()=>{
  const SERVER='https://bloc-online.peotrannnn.workers.dev';   /* ws/wss suy ra từ đây; đổi nếu sau này gắn tên miền riêng */
  const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';           /* trùng với server: không có 0/O/1/I */
  const KEY='bloc.token';

  /* Token ẩn danh, mỗi TAB một token (sessionStorage): tải lại trang vẫn giữ ghế, còn hai tab là hai người chơi khác nhau
     (nhờ vậy tự thử được bằng hai tab). Server yêu cầu 16–64 ký tự [A-Za-z0-9_-]. */
  function getToken(){
    try{const t=sessionStorage.getItem(KEY);if(t&&/^[A-Za-z0-9_-]{16,64}$/.test(t))return t;}catch(e){}
    let t='';for(const x of crypto.getRandomValues(new Uint8Array(32)))t+=ALPHABET[x&31];
    try{sessionStorage.setItem(KEY,t);}catch(e){}              /* không lưu được thì token chỉ sống trong lần tải trang này */
    return t;
  }

  /* "abc 23x" → "ABC23X"; null nếu không đúng định dạng mã của server (khỏi gọi mạng vô ích) */
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

  /* Vào tự động: server ghép vào phòng công khai đang chờ lâu nhất, chưa có thì tạo phòng mới. Trả {code, created}. */
  async function quick(mode){
    const r=await fetch(SERVER+'/quick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:mode||'classic'})});
    if(!r.ok)throw new Error('quick_failed_'+r.status);
    return r.json();
  }

  function join(rawCode){
    const code=normalizeCode(rawCode);
    if(!code)throw new Error('bad_code');
    const ws=new WebSocket(SERVER.replace(/^http/,'ws')+'/ws?room='+code);
    const handlers={};
    const emit=(t,m)=>{(handlers[t]||[]).forEach(f=>{try{f(m);}catch(e){console.error(e);}});};
    const send=o=>{if(ws.readyState===1)ws.send(JSON.stringify(o));};
    let closed=false;
    const onClose=(c,r)=>{if(closed)return;closed=true;emit('close',{code:c,reason:r});};

    ws.onopen=()=>send({t:'hello',token:getToken()});
    ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}if(m&&m.t)emit(m.t,m);};
    ws.onclose=ev=>onClose(ev.code,ev.reason);
    ws.onerror=()=>onClose(0,'network');

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

  return{createRoom,quick,join,normalizeCode,getToken};
})();
