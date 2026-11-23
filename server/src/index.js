/* [SERVER/INDEX] Cửa vào của Worker:
     POST /create  {mode,visibility} → {code}   server cấp mã phòng 6 ký tự (bỏ 0/O/1/I) và tạo Durable Object tên = mã
     GET  /ws?room=CODE (WebSocket)             chuyển tiếp tới Durable Object của phòng; mã chưa tạo thì phòng tự báo lỗi
     GET  /health
   Mọi luật chơi và trạng thái ván nằm trong Room (room-logic.js); Worker này không giữ gì cả. */
export {Room} from './room.js';

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* đúng 32 ký tự: 24 chữ (không I, O) + 8 số (không 0, 1) → x&31 chọn đều, không lệch */
const CODE=/^[A-HJ-NP-Z2-9]{6}$/;
const MODES=['classic'],VISIBILITY=['public','private'];

function newCode(){
  let s='';for(const x of crypto.getRandomValues(new Uint8Array(6)))s+=ALPHABET[x&31];
  return s;
}
const roomOf=(env,code)=>env.ROOM.get(env.ROOM.idFromName(code));

/* Trả về {ok, origin}. Không có Origin (công cụ ngoài trình duyệt) vẫn cho qua, đây chỉ là lớp chặn cơ bản. */
function checkOrigin(req,env){
  const origin=req.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  return{ok:!(origin&&allowed.length&&!allowed.includes(origin)),origin};
}
function json(obj,status,origin){
  const h={'Content-Type':'application/json'};
  if(origin){h['Access-Control-Allow-Origin']=origin;h['Vary']='Origin';}
  return new Response(JSON.stringify(obj),{status,headers:h});
}

async function create(req,env,origin){
  let b={};try{b=await req.json();}catch(e){}
  const mode=b.mode||'classic',visibility=b.visibility||'private';
  if(!MODES.includes(mode)||!VISIBILITY.includes(visibility))return json({error:'badparams'},400,origin);
  for(let i=0;i<5;i++){                                    /* trùng mã (hiếm) thì thử mã khác */
    const code=newCode();
    const r=await roomOf(env,code).fetch('https://room/init',{method:'POST',body:JSON.stringify({mode,visibility})});
    if(r.status===200)return json({code,mode,visibility},200,origin);
    if(r.status!==409)break;
  }
  return json({error:'busy'},503,origin);
}

export default{
  async fetch(req,env){
    const url=new URL(req.url);
    if(url.pathname==='/health')return new Response('ok');

    const {ok,origin}=checkOrigin(req,env);
    if(url.pathname==='/create'){
      if(!ok)return new Response('Forbidden origin',{status:403});
      if(req.method==='OPTIONS'){                           /* preflight CORS của trình duyệt */
        return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin||'*','Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}});
      }
      if(req.method!=='POST')return new Response('Method not allowed',{status:405});
      return create(req,env,origin);
    }

    if(url.pathname!=='/ws')return new Response('Not found',{status:404});
    if(req.headers.get('Upgrade')!=='websocket')return new Response('Expected websocket',{status:426});
    if(!ok)return new Response('Forbidden origin',{status:403});
    const code=(url.searchParams.get('room')||'').toUpperCase();
    if(!CODE.test(code))return new Response('Bad room code',{status:400});
    return roomOf(env,code).fetch(req);
  }
};
