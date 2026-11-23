/* [SERVER/INDEX] Cửa vào của Worker:
     POST /create  {mode,visibility} → {code}      server cấp mã phòng 6 ký tự (bỏ 0/O/1/I) và tạo Durable Object tên = mã
     POST /quick   {mode} → {code, created}        vào tự động: ghép vào phòng công khai đang chờ lâu nhất, chưa có thì tạo phòng mới
     GET  /ws?room=CODE (WebSocket)                chuyển tiếp tới Durable Object của phòng; mã chưa tạo thì phòng tự báo lỗi
     GET  /health
   Mọi luật chơi và trạng thái ván nằm trong Room (room-logic.js); danh sách phòng chờ nằm trong Lobby. Worker này không giữ gì cả. */
export {Room} from './room.js';
export {Lobby} from './lobby.js';
import {CODE,MODES,VISIBILITY,newCode} from './codes.js';

const roomOf=(env,code)=>env.ROOM.get(env.ROOM.idFromName(code));
const lobbyOf=env=>env.LOBBY.get(env.LOBBY.idFromName('main'));

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
    const r=await roomOf(env,code).fetch('https://room/init',{method:'POST',body:JSON.stringify({mode,visibility,code})});
    if(r.status===200){
      if(visibility==='public'){try{await lobbyOf(env).fetch('https://lobby/add',{method:'POST',body:JSON.stringify({code,mode})});}catch(e){}}
      return json({code,mode,visibility},200,origin);
    }
    if(r.status!==409)break;
  }
  return json({error:'busy'},503,origin);
}

async function quick(req,env,origin){
  let b={};try{b=await req.json();}catch(e){}
  const mode=b.mode||'classic';
  if(!MODES.includes(mode))return json({error:'badparams'},400,origin);
  const r=await lobbyOf(env).fetch('https://lobby/quick',{method:'POST',body:JSON.stringify({mode})});
  if(!r.ok)return json({error:'busy'},503,origin);
  return json(await r.json(),200,origin);
}

const POSTS={'/create':create,'/quick':quick};

export default{
  async fetch(req,env){
    const url=new URL(req.url);
    if(url.pathname==='/health')return new Response('ok');

    const {ok,origin}=checkOrigin(req,env);
    const handler=POSTS[url.pathname];
    if(handler){
      if(!ok)return new Response('Forbidden origin',{status:403});
      if(req.method==='OPTIONS'){                           /* preflight CORS của trình duyệt */
        return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin||'*','Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}});
      }
      if(req.method!=='POST')return new Response('Method not allowed',{status:405});
      try{return await handler(req,env,origin);}
      catch(e){return json({error:'internal',detail:String(e&&e.message||e)},500,origin);}   /* lỗi bất ngờ (vd Durable Object ném lỗi): trả JSON có nội dung lỗi thay vì trang HTML của Cloudflare */
    }

    if(url.pathname!=='/ws')return new Response('Not found',{status:404});
    if(req.headers.get('Upgrade')!=='websocket')return new Response('Expected websocket',{status:426});
    if(!ok)return new Response('Forbidden origin',{status:403});
    const code=(url.searchParams.get('room')||'').toUpperCase();
    if(!CODE.test(code))return new Response('Bad room code',{status:400});
    return roomOf(env,code).fetch(req);
  }
};
