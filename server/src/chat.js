/* [SERVER/CHAT] Chat trong ván online: làm sạch chữ + chống spam. Thuần hàm (không Cloudflare, không DOM) nên test được bằng Node.
   Nguyên tắc an toàn mạng / không quá tải server:
     1. Chat KHÔNG ghi storage và không lưu lịch sử: mỗi tin chỉ được phát lại cho hai người trong phòng rồi bỏ (không tốn lượt ghi Durable Object).
     2. Mỗi ghế có một "xô token" riêng (burst nhỏ, nạp chậm) + khoảng cách tối thiểu giữa hai tin + chặn tin trùng + phạt tăng dần
        (vi phạm liên tục thì bị cấm chat 30 giây, lần sau gấp đôi, tối đa 10 phút).
     3. Tin bị từ chối chỉ được trả lời tối đa ~1 lần mỗi 1,5 giây (kẻ spam không bắt server phải trả lời từng tin).
     4. Mọi loại tin (không riêng chat) của MỘT kết nối đi qua `makeFlood`: gửi dồn dập quá mức thì bị bỏ qua, quá nữa thì bị đóng kết nối.
     5. Chữ chỉ là chữ: giao diện luôn dùng textContent (không bao giờ innerHTML), server vẫn bỏ ký tự điều khiển / ký tự ẩn / định hướng chữ.
   Mọi hằng số nằm ở CHAT bên dưới để chỉnh một chỗ. */
export const CHAT={
  MAX:120,            /* ký tự tối đa mỗi tin (tính theo ký tự Unicode, không tính byte) */
  CAP:4,              /* xô token: gửi dồn tối đa ngần này tin liền... */
  PER_SEC:1/3,        /* ...rồi chỉ được thêm 1 tin mỗi 3 giây */
  GAP_MS:600,         /* hai tin liền nhau phải cách tối thiểu ngần này */
  DUP_MS:15e3,        /* cùng nội dung với tin trước trong khoảng này = trùng (bị chặn) */
  STRIKES:4,          /* tích đủ ngần này lần vi phạm (gửi quá nhanh / trùng) thì bị cấm chat */
  STRIKE_DECAY_MS:10e3, /* mỗi 10 giây yên lặng thì được xóa bớt 1 lần vi phạm */
  MUTE_MS:30e3,       /* lần cấm đầu; lần sau gấp đôi, tối đa MUTE_MAX_MS */
  MUTE_MAX_MS:10*60e3,
  REPLY_MS:1500       /* tin từ chối chỉ phản hồi tối đa 1 lần mỗi ngần này (chống bắt server trả lời từng tin spam) */
};

const HIDDEN=new RegExp('['+['\\u0000-\\u001f','\\u007f-\\u009f','\\u00ad','\\u061c','\\u200b-\\u200f','\\u2028-\\u202e','\\u2060-\\u206f','\\ufeff','\\ufff9-\\ufffc'].join('')+']','g');
/* Làm sạch một tin chat. Trả '' nếu rỗng sau khi làm sạch (không gửi). */
export function cleanChat(s){
  if(typeof s!=='string')return '';
  let t=s.replace(HIDDEN,' ').replace(/\s+/g,' ').trim();   /* điều khiển, ký tự ẩn, định hướng chữ, xuống dòng */
  t=t.replace(/(.)\1{7,}/gu,'$1$1$1$1$1$1$1');                    /* "aaaaaaaaaaaa..." / "!!!!!!!!!!!" → tối đa 7 ký tự giống nhau liền nhau */
  return Array.from(t).slice(0,CHAT.MAX).join('').trim();
}

/* Người gác chat của MỘT ghế. check(text, now) → {ok:true,text} hoặc {ok:false,reason,wait?,silent?}
   reason: 'empty' · 'rate' (gửi nhanh quá, wait = ms phải chờ) · 'dup' (trùng tin trước) · 'muted' (đang bị cấm, wait = ms còn lại).
   silent=true: server không cần trả lời tin này (đã trả lời gần đây). */
export function makeChatGuard(cfg){
  const C=Object.assign({},CHAT,cfg);
  let tokens=C.CAP,at=0,lastAt=0,last='',strikes=0,strikeAt=0,level=0,muteUntil=0,replyAt=-1e15,started=false;
  const reply=(now,o)=>{if(now-replyAt<C.REPLY_MS)o.silent=true;else replyAt=now;return o;};
  const banned=now=>{replyAt=now;return{ok:false,reason:'muted',wait:muteUntil-now};};   /* lúc BỊ CẤM luôn báo (không bị nén im lặng) để người chơi biết vì sao tin không đi */
  const strike=now=>{
    strikes=Math.max(0,strikes-Math.floor((now-strikeAt)/C.STRIKE_DECAY_MS));strikeAt=now;   /* yên lặng một lúc thì được tha dần */
    if(++strikes>=C.STRIKES){strikes=0;muteUntil=now+Math.min(C.MUTE_MAX_MS,C.MUTE_MS*Math.pow(2,level));level++;return true;}
    return false;
  };
  return{
    check(raw,now){
      now=now===undefined?Date.now():now;
      if(now<muteUntil)return reply(now,{ok:false,reason:'muted',wait:muteUntil-now});
      const text=cleanChat(raw);
      if(!text)return{ok:false,reason:'empty',silent:true};
      if(!started){started=true;at=now;}
      tokens=Math.min(C.CAP,tokens+(now-at)/1000*C.PER_SEC);at=now;
      if(now-lastAt<C.GAP_MS||tokens<1){
        const wait=Math.max(C.GAP_MS-(now-lastAt),tokens<1?Math.ceil((1-tokens)/C.PER_SEC*1000):0);
        if(strike(now))return banned(now);
        return reply(now,{ok:false,reason:'rate',wait});
      }
      if(text===last&&now-lastAt<C.DUP_MS){
        if(strike(now))return banned(now);
        return reply(now,{ok:false,reason:'dup'});
      }
      tokens-=1;lastAt=now;last=text;
      if(level>0&&now-strikeAt>C.MUTE_MAX_MS)level=0;                 /* hành xử tốt đủ lâu thì xóa bậc phạt */
      return{ok:true,text};
    }
  };
}

/* Chống dồn dập mọi loại tin trên MỘT kết nối (ping, action, chat, sync...). Người chơi thật gửi vài tin mỗi phút nên giới hạn rộng.
   take(now) → 'ok' | 'drop' (bỏ qua tin này) | 'kick' (dồn dập kéo dài: đóng kết nối). */
export function makeFlood({cap=40,perSec=12,kickAfter=300}={}){
  let tokens=cap,at=0,over=0,started=false;
  return{
    take(now){
      now=now===undefined?Date.now():now;
      if(!started){started=true;at=now;}
      tokens=Math.min(cap,tokens+(now-at)/1000*perSec);at=now;
      if(tokens>=1){tokens-=1;if(over>0)over--;return 'ok';}
      return ++over>=kickAfter?'kick':'drop';
    }
  };
}
