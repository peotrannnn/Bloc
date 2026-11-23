/* Chơi thử một ván THẬT qua WebSocket với server đang chạy (wrangler dev hoặc bản đã deploy):
     terminal 1:  cd server && wrangler dev
     terminal 2:  node test/play-online.mjs                         (mặc định ws://localhost:8787)
                  node test/play-online.mjs wss://bloc-online.<tên>.workers.dev   (thử bản deploy)
   Cần Node 22 trở lên (có WebSocket sẵn). Hai người chơi giả đi ngẫu nhiên tới hết ván, kiểm tra server từ chối nước sai
   và hai bên luôn đồng bộ. In "ĐẠT" nếu mọi thứ đúng. */
import Core from '../../js/core.js';
if(typeof WebSocket==='undefined'){console.error('Cần Node 22+ (có WebSocket sẵn). Kiểm tra: node --version');process.exit(2);}

const base=(process.argv[2]||'ws://localhost:8787').replace(/\/$/,'');
const room='T'+Math.random().toString(36).slice(2,7).toUpperCase();
const R=Core.make(Core.ruleset('classic'));
const rnd=Math.random,pick=a=>a[Math.floor(rnd()*a.length)];
let problems=0;const bad=m=>{problems++;console.log('  ✗',m);};

function randomAction(st){
  const p=st.turn;
  if(st.left[p]>0&&rnd()<.4){const ws=[];for(const o of['h','v'])for(let r=0;r<R.WN;r++)for(let c=0;c<R.WN;c++)if(R.canWall(st,o,r,c))ws.push({o,r,c});if(ws.length)return{wall:pick(ws)};}
  return{move:pick(R.moves(st,p))};
}
function client(name){
  return new Promise(resolve=>{
    const c={name,st:null,side:null,sentBad:false,over:null,rejected:0};
    const token=name+Math.random().toString(36).slice(2).padEnd(20,'x');
    const ws=new WebSocket(base+'/ws?room='+room);
    c.ws=ws;
    const send=o=>ws.send(JSON.stringify(o));
    const myTurn=()=>{
      if(!c.st||c.st.over||c.st.turn!==c.side)return;
      if(!c.sentBad){c.sentBad=true;send({t:'action',seq:c.st.ply,move:[0,0]});}   /* một nước sai cố ý: server phải từ chối */
      send({t:'action',seq:c.st.ply,...randomAction(c.st)});
    };
    ws.onopen=()=>send({t:'hello',token});
    ws.onerror=e=>{bad(name+': lỗi kết nối (server đã chạy chưa?)');resolve(c);};
    ws.onmessage=ev=>{
      const m=JSON.parse(ev.data);
      if(m.t==='started'||m.t==='state'){c.side=m.you;c.st=R.fromSnapshot(m.snapshot);myTurn();}
      else if(m.t==='applied'){const r=R.apply(c.st,m.action);if(!r.ok)bad(name+': không áp dụng được nước server phát');else myTurn();}
      else if(m.t==='rejected'){c.rejected++;}
      else if(m.t==='over'){c.over=m;ws.close();resolve(c);}
      else if(m.t==='full'||m.t==='error'){bad(name+': '+JSON.stringify(m));resolve(c);}
    };
    ws.onclose=()=>resolve(c);
  });
}
const timer=setTimeout(()=>{console.log('Quá 60 giây chưa xong ván — thất bại');process.exit(1);},60000);
console.log('Phòng',room,'→',base);
const [a,b]=await Promise.all([client('A'),client('B')]);
clearTimeout(timer);
console.log('Kết quả:',a.over?JSON.stringify(a.over):'(không có)','· số nước server từ chối A/B:',a.rejected,'/',b.rejected);
if(!a.over||!b.over)bad('ván không kết thúc đúng');
else if(a.over.winner!==b.over.winner)bad('hai bên nhận kết quả khác nhau');
if(a.rejected+b.rejected<1)bad('server không từ chối nước sai cố ý');
if(a.st&&b.st&&JSON.stringify(R.snapshot(a.st))!==JSON.stringify(R.snapshot(b.st)))bad('hai bên không đồng bộ thế cờ');
console.log(problems?'THẤT BẠI':'ĐẠT');process.exit(problems?1:0);
