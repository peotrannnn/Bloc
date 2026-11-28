'use strict';
/* [ONLINE] Kết nối chế độ online, không đụng tới giao diện: chỉ lo token, tạo phòng, vào phòng bằng mã và chuyển tin nhắn.
   Là script thường (như các file khác), tạo biến toàn cục Online. Menu (menu.js) và App (app.js) dùng nó.
     const {code}=await Online.createRoom({mode:'classic',visibility:'private'});   // hoặc: await Online.quick('classic') → vào tự động
     Hỗn Loạn: Online.createRoom({mode:'chaos',biome:'forest',visibility:'private'}) · Online.quick('chaos','forest')
       biome: 'random' | 'balanced' | 'forest' | 'mountain' | 'snow' | 'river' | 'desert' (bỏ trống = 'random'; Classic bỏ qua biome)
     const conn=Online.join(code);
     Online.getName()/setName(s) · Online.rooms({mode,biome}) → danh sách phòng chờ · Online.presence(n=>...) → số người online (null = không biết)
     conn.on('welcome'|'started'|'applied'|'over'|'opponentStatus'|'full'|'error'|'close', m=>...);   // close: m.code 4004 = mã không tồn tại, 4001 = đầy, 4005 = lệch phiên bản giao thức (Core.PROTO)
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

  /* ----- Tên hiển thị (không đăng nhập): lưu ở localStorage để lần sau khỏi nhập lại. Server vẫn làm sạch lại (client không đáng tin).
     Sau này có tài khoản thật thì chỉ cần thay chỗ lấy tên này. ----- */
  const NAME_KEY='bloc.name',NAME_MAX=16;
  const cleanName=s=>Array.from(String(s||'').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e<>&"`]/g,'').replace(/\s+/g,' ').trim()).slice(0,NAME_MAX).join('').trim();
  let memName='';   /* dự phòng khi localStorage bị chặn: tên vẫn được gửi cho server trong lần mở trang này */
  function getName(){try{return cleanName(localStorage.getItem(NAME_KEY))||memName;}catch(e){return memName;}}
  function setName(s){const n=cleanName(s);if(n)memName=n;try{if(n)localStorage.setItem(NAME_KEY,n);}catch(e){}return n;}
  function randomName(){return 'Khách'+(1000+crypto.getRandomValues(new Uint16Array(1))[0]%9000);}

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

  /* Danh sách phòng công khai đang chờ (cửa sổ "Ghép nhanh"). f = {mode?:'classic'|'chaos'|'all', biome?:'all'|...}. Trả mảng [{code,mode,biome,name,age}]. */
  async function rooms(f){
    const o=f||{};
    const r=await fetch(SERVER+'/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:o.mode||'all',biome:o.biome||'all'})});
    if(!r.ok)throw new Error('rooms_failed_'+r.status);
    return (await r.json()).rooms||[];
  }

  /* "Có mặt": giữ một WebSocket tới server để được tính là đang online; server đẩy {t:'online',n}. cb(n) với n = số người online toàn server, hoặc cb(null)
     khi mất kết nối / server chưa hỗ trợ (giao diện ẩn con số). Tự nối lại; tab bị ẩn lâu thì ngắt cho đỡ tốn, quay lại thì nối tiếp. */
  function presence(cb){
    let ws=null,timer=0,hb=0,fails=0,dead=false;
    const url=SERVER.replace(/^http/,'ws')+'/presence';
    const stop=()=>{clearInterval(hb);clearTimeout(timer);if(ws){const w=ws;ws=null;try{w.close();}catch(e){}}};
    function open(){
      if(dead||ws)return;
      const me=new WebSocket(url);ws=me;let got=false;
      me.onopen=()=>{hb=setInterval(()=>{try{if(me.readyState===1)me.send('ping');}catch(e){}},30000);};   /* chuỗi 'ping' trần: server tự trả 'pong' mà không đánh thức Durable Object */
      me.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch(e){return;}if(m&&m.t==='online'&&Number.isInteger(m.n)){got=true;fails=0;cb(m.n);}};
      me.onclose=()=>{if(me!==ws)return;ws=null;clearInterval(hb);cb(null);if(dead||document.hidden)return;fails=got?0:fails+1;if(fails>=5)return;timer=setTimeout(open,Math.min(30000,2000*(fails+1)));};   /* 5 lần liền không nối được (server cũ chưa có /presence) thì thôi */
      me.onerror=()=>{};
    }
    document.addEventListener('visibilitychange',()=>{if(dead)return;if(document.hidden){clearTimeout(timer);fails=0;const w=ws;if(w){ws=null;clearInterval(hb);try{w.close();}catch(e){}}}else open();});
    open();
    return{close(){dead=true;stop();}};
  }

  /* Phòng gần nhất đang chơi (mỗi tab một giá trị): tải lại trang vẫn vào lại được đúng ván. */
  function lastRoom(){try{return normalizeCode(sessionStorage.getItem('bloc.room'));}catch(e){return null;}}
  function setLastRoom(code){try{if(code)sessionStorage.setItem('bloc.room',code);else sessionStorage.removeItem('bloc.room');}catch(e){}}

  const RECONNECT_MS=50e3;                 /* tự nối lại tối đa ngần này; server giữ ghế 45 giây rồi xử thua */
  const FATAL=[4000,4001,4002,4004,4005];  /* bị thay thế, phòng đầy, hết hạn, không tồn tại, lệch phiên bản: nối lại vô ích */

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
      me.onopen=()=>{if(me===ws)send({t:'hello',v:Core.PROTO,token:getToken(),name:getName()});};
      me.onmessage=ev=>{
        if(me!==ws)return;
        let m;try{m=JSON.parse(ev.data);}catch(e){return;}
        if(!m||!m.t)return;
        if(m.t==='welcome'&&m.v!==Core.PROTO){done=true;emit('error',{t:'error',reason:'version',v:m.v});try{me.close(4005,'version');}catch(e){}return;}   /* server cũ/mới hơn client: báo tải lại trang */
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
    const hb=setInterval(()=>{if(done)clearInterval(hb);else send({t:'ping'});},25000);   /* heartbeat: tránh kết nối im lặng bị mạng ngắt */

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

  return{createRoom,quick,rooms,presence,join,normalizeCode,getToken,getName,setName,randomName,cleanName,lastRoom,setLastRoom};
})();
