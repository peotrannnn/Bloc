/* Kiểm tra tạo phòng & vào bằng mã (Giai đoạn 3) với server đang chạy:
     node test/rooms.mjs                                  (mặc định ws://localhost:8787)
     node test/rooms.mjs wss://bloc-online.<tên>.workers.dev
   Cần Node 22+. In ĐẠT nếu mọi ca đúng. */
const base=(process.argv[2]||'ws://localhost:8787').replace(/\/$/,''),http=base.replace(/^ws/,'http');
let problems=0;
const check=(ok,msg)=>{console.log(ok?'  ✓':'  ✗',msg);if(!ok)problems++;};
const tok=n=>n+Math.random().toString(36).slice(2).padEnd(24,'x');
const create=(body)=>fetch(http+'/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

/* Mở kết nối, gom tin nhắn; next(t) đợi tin loại t; closed = Promise mã đóng (hoặc 'error' nếu không mở được) */
function conn(code){
  const ws=new WebSocket(base+'/ws?room='+code),q=[],waits=[];
  const c={ws,send:o=>ws.addEventListener?(ws.readyState===1?ws.send(JSON.stringify(o)):ws.addEventListener('open',()=>ws.send(JSON.stringify(o)),{once:true})):0};
  c.closed=new Promise(res=>{ws.onclose=ev=>res(ev.code);ws.onerror=()=>res('error');});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data),i=waits.findIndex(w=>w.t===m.t);if(i>=0)waits.splice(i,1)[0].res(m);else q.push(m);};
  c.next=(t,ms=8000)=>new Promise((res,rej)=>{const i=q.findIndex(m=>m.t===t);if(i>=0)return res(q.splice(i,1)[0]);waits.push({t,res});setTimeout(()=>rej(new Error('quá hạn đợi '+t)),ms);});
  return c;
}

try{
  console.log('1. Tạo phòng');
  const r=await create({mode:'classic',visibility:'public'}),j=await r.json();
  check(r.ok&&/^[A-HJ-NP-Z2-9]{6}$/.test(j.code),'mã 6 ký tự, không có 0/O/1/I: '+j.code);
  check(j.mode==='classic'&&j.visibility==='public','trả đúng mode và visibility');
  check((await create({mode:'zzz'})).status===400,'mode lạ bị từ chối (400)');
  check((await create({visibility:'zzz'})).status===400,'visibility lạ bị từ chối (400)');
  const defaults=await (await create({})).json();
  check(defaults.visibility==='private','không nói gì thì mặc định riêng tư');

  console.log('2. Vào phòng bằng mã');
  const A=conn(j.code),B=conn(j.code);
  A.send({t:'hello',token:tok('A')});
  const wa=await A.next('welcome');
  check(wa.slot===0&&wa.players===1&&wa.visibility==='public'&&wa.mode==='classic','người đầu vào ghế 0, thấy mode/visibility');
  B.send({t:'hello',token:tok('B')});
  const wb=await B.next('welcome');
  check(wb.slot===1&&wb.players===2,'người thứ hai vào ghế 1');
  const sa=await A.next('started'),sb=await B.next('started');
  check(sa.you!==sb.you&&(sa.you===0||sa.you===1),'bốc thăm: hai phe khác nhau ('+sa.you+'/'+sb.you+')');

  console.log('3. Phòng đầy');
  const C=conn(j.code);C.send({t:'hello',token:tok('C')});
  check((await C.next('full')).t==='full','người thứ ba nhận full');
  check(await C.closed===4001,'và bị đóng với mã 4001');

  console.log('4. Mã sai');
  const bogus=conn('AAAAAA');bogus.send({t:'hello',token:tok('X')});
  check((await bogus.next('error')).reason==='noroom','mã đúng định dạng nhưng chưa tạo → noroom');
  check(await bogus.closed===4004,'và bị đóng với mã 4004');
  const badfmt=conn('ab0');
  check(await badfmt.closed==='error','mã sai định dạng không mở được kết nối');

  console.log('5. Vào tự động');
  const quick=async()=>{
    const r=await fetch(http+'/quick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'classic'})}),t=await r.text();
    try{return JSON.parse(t);}catch(e){throw new Error('/quick trả '+r.status+': '+t.slice(0,300));}
  };
  check((await fetch(http+'/quick',{method:'POST',body:JSON.stringify({mode:'zzz'})})).status===400,'mode lạ bị từ chối (400)');
  const q1=await quick(),q2=await quick(),q3=await quick();
  check(/^[A-HJ-NP-Z2-9]{6}$/.test(q1.code),'người 1 nhận mã phòng: '+q1.code+(q1.created?' (phòng mới)':' (phòng có sẵn)'));
  if(q1.created)check(q2.code===q1.code&&q2.created===false,'người 2 được ghép vào đúng phòng của người 1');
  check(q3.code!==q1.code&&q3.code!==q2.code||!q1.created,'người 3 không bị ghép vào phòng đang giữ chỗ');
  if(q1.created){
    const P=conn(q1.code),Q=conn(q1.code);
    P.send({t:'hello',token:tok('P')});Q.send({t:'hello',token:tok('Q')});
    const sp=await P.next('started'),sq=await Q.next('started');
    check(sp.you!==sq.you,'hai người được ghép bắt đầu ván, hai phe khác nhau');
    const after=await quick();
    check(after.code!==q1.code,'phòng đã đủ người không còn trong danh sách chờ');
    P.ws.close();Q.ws.close();
  }

  A.ws.close();B.ws.close();
}catch(e){problems++;console.log('  ✗ lỗi bất ngờ:',e.message);}
console.log(problems?'THẤT BẠI':'ĐẠT');process.exit(problems?1:0);
