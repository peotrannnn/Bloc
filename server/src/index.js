/* [SERVER/INDEX] Cửa vào của Worker. Chỉ làm 3 việc: kiểm tra yêu cầu, lấy mã phòng, chuyển tiếp tới Durable Object của phòng đó.
   Mọi luật chơi và trạng thái ván nằm trong Room (room-logic.js), Worker này không giữ gì cả. */
export {Room} from './room.js';

const CODE=/^[A-Z0-9]{4,8}$/;   /* mã phòng 4-8 ký tự; sau này server cấp mã 5-6 ký tự, bỏ 0/O/1/I (Giai đoạn 3) */

export default{
  async fetch(req,env){
    const url=new URL(req.url);
    if(url.pathname==='/health')return new Response('ok');
    if(url.pathname!=='/ws')return new Response('Not found',{status:404});
    if(req.headers.get('Upgrade')!=='websocket')return new Response('Expected websocket',{status:426});

    /* Chặn trang lạ dùng server của mình (trình duyệt luôn gửi Origin; công cụ ngoài trình duyệt thì giả được, đây chỉ là lớp cơ bản) */
    const origin=req.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(origin&&allowed.length&&!allowed.includes(origin))return new Response('Forbidden origin',{status:403});

    const code=(url.searchParams.get('room')||'').toUpperCase();
    if(!CODE.test(code))return new Response('Bad room code',{status:400});
    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(req);
  }
};
