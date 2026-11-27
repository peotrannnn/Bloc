'use strict';
/* [ONLINE] Kết nối chế độ online, không đụng tới giao diện: chỉ lo token, tạo phòng, vào phòng bằng mã và chuyển tin nhắn.
   Là script thường (như các file khác), tạo biến toàn cục Online. Menu (menu.js) và App (app.js) dùng nó.
     const {code}=await Online.createRoom({mode:'classic',visibility:'private'});   // hoặc: await Online.quick('classic') → vào tự động
     Hỗn Loạn: Online.createRoom({mode:'chaos',biome:'forest',visibility:'private'}) · Online.quick('chaos','forest')
       biome: 'random' | 'balanced' | 'forest' | 'mountain' | 'snow' | 'river' | 'desert' (bỏ trống = 'random'; Classic bỏ qua biome)
     const conn=Online.join(code);
     conn.on('welcome'|'started'|'applied'|'over'|'opponentStatus'|'full'|'error'|'close', m=>...);   // close: m.code 4004 = mã không tồn tại, 4001 = đầy
     conn.autoReconnect(true)  → rớt mạng thì tự nối lại (phát 'reconnecting'), server trả 'welcome' rồi 'state'
     conn.action(seq,{move:[r,c]}) · conn.action(seq,{wall:{o,r,c}}) · conn.resign() · conn.sync() · conn.close() */
const Online=(()=>{
  /* ws/wss suy ra từ đây; đổi nếu sau này gắn tên miền riêng. Chạy thử ở máy: mở trang với ?server=http://localhost:8787 để nối vào
     server `wrangler dev` thay vì bản thật (chỉ có tác dụng khi trang đang mở từ localhost/127.0.0.1, trang trên mạng không bị đổi được). */
  const SERVER=(()=>{
    try{
      const s=new URLSearchParams(location.search).get('server');
      if(s&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(s)&&/^(localhost|127\.0\.0\.1)$/.test(location.hostname))return s;
    }catch(e){}
    return 'https://bloc-online.peotrannnn.workers.dev';
  })();
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
    const r=await fetch(SERVER+'/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:o.mode||'classic',visibility:o.visibility||'private',biome:o.biome})});   /* biome undefined thì JSON bỏ qua */
    if(!r.ok)throw new Error('create_failed_'+r.status);
    return r.json();                                            /* {code,mode,visibility} */
  }

  /* Vào tự động: server ghép vào phòng công khai đang chờ lâu nhất, chưa có thì tạo phòng mới. Trả {code, created}. */
  async function quick(mode,biome){
    const r=await fetch(SERVER+'/quick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:mode||'classic',biome})});
    if(!r.ok)throw new Error('quick_failed_'+r.status);
    return r.json();
  }

  /* Phòng gần nhất đang chơi (mỗi tab một giá trị): tải lại trang vẫn vào lại được đúng ván. */
  function lastRoom(){try{return normalizeCode(sessionStorage.getItem('bloc.room'));}catch(e){return null;}}
  function setLastRoom(code){try{if(code)sessionStorage.setItem('bloc.room',code);else sessionStorage.removeItem('bloc.room');}catch(e){}}

  const RECONNECT_MS=50e3;                 /* tự nối lại tối đa ngần này; server giữ ghế 45 giây rồi xử thua */
  const FATAL=[4000,4001,4002,4004];       /* bị thay thế, phòng đầy, hết hạn, không tồn tại: nối lại vô ích */

  function join(rawCode){
    const code=normalizeCode(rawCode);
    if(!code)throw new Error('bad_code');
    const url=SERVER.replace(/^http/,'ws')+'/ws?room='+code;
    const handlers={};
    const emit=(t,m)=>{(handlers[t]||[]).forEach(f=>{try{f(m);}catch(e){console.error(e);}});};
    let ws=null,keep=false,done=false,attempt=0,giveUpAt=0,timer=0;
    const send=o=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o));};

    function open(){
      const me=new WebSocket(url);ws=me;                       /* me!==ws nghĩa là kết nối cũ đã bị thay: bỏ qua mọi sự kiện của nó */
      me.onopen=()=>{if(me===ws)send({t:'hello',token:getToken()});};
      me.onmessage=ev=>{
        if(me!==ws)return;
        let m;try{m=JSON.parse(ev.data);}catch(e){return;}
        if(!m||!m.t)return;
        if(m.t==='welcome'){attempt=0;giveUpAt=0;}              /* nối được rồi: lần rớt sau tính lại từ đầu */
        emit(m.t,m);
      };
      me.onclose=ev=>{
        if(me!==ws||done)return;
        if(keep&&!FATAL.includes(ev.code)){                     /* đang trong ván: rớt mạng thì tự nối lại, cùng token nên server trả đúng ghế */
          if(!giveUpAt)giveUpAt=Date.now()+RECONNECT_MS;
          if(Date.now()<giveUpAt){emit('reconnecting',{attempt:++attempt});timer=setTimeout(open,Math.min(3000,400*attempt));return;}
        }
        done=true;emit('close',{code:ev.code,reason:ev.reason});
      };
      me.onerror=()=>{};                                        /* lỗi luôn kéo theo onclose, xử lý ở đó */
    }
    open();

    return{
      code,
      on(t,f){(handlers[t]=handlers[t]||[]).push(f);return this;},
      autoReconnect(on){keep=!!on;return this;},               /* bật khi ván bắt đầu; trước đó rớt mạng là báo lỗi ngay */
      action:(seq,a)=>send({t:'action',seq,...a}),
      resign:()=>send({t:'resign'}),
      rematch:()=>send({t:'rematch'}),                         /* ván xong: bấm "Đấu lại"; đủ cả hai thì server đổi phe và gửi 'started' mới */
      sync:()=>send({t:'sync'}),                               /* xin server gửi lại trạng thái đầy đủ (state) */
      ping:()=>send({t:'ping'}),
      close(){done=true;clearTimeout(timer);if(ws)ws.close();}
    };
  }

  return{createRoom,quick,join,normalizeCode,getToken,lastRoom,setLastRoom};
})();
