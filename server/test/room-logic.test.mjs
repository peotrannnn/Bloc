/* Kiểm thử RoomLogic bằng Node (không cần Cloudflare):  node test/room-logic.test.mjs
   Mỗi "người chơi giả" giữ bản trạng thái riêng, chỉ cập nhật từ tin server gửi (started/applied/state) bằng chính Core,
   để chứng minh giao thức đủ để hai client luôn đồng bộ với server. */
import Core from '../../js/core.js';
import {RoomLogic} from '../src/room-logic.js';

const R=Core.make(Core.ruleset('classic'));
let fails=0,checks=0;
const ok=(c,msg)=>{checks++;if(!c){fails++;console.log('  ✗',msg);}};
let seed=20261123;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
const pick=a=>a[Math.floor(rnd()*a.length)];
const clone=x=>JSON.parse(JSON.stringify(x));

/* ----- môi trường giả: lưu trữ, kết nối, đồng hồ báo thức ----- */
function makeRoom(){
  const env={store:undefined,conns:new Set(),alarm:null,wiped:0};
  const io={
    load:async()=>env.store===undefined?undefined:clone(env.store),
    save:async g=>{env.store=clone(g);},                        /* ép qua JSON để chắc dữ liệu lưu được là JSON thuần */
    send:(c,m)=>{c.inbox.push(clone(m));},
    conns:()=>[...env.conns].filter(c=>!c.closed),
    getSeat:c=>c.slot===undefined?-1:c.slot,
    setSeat:(c,s)=>{c.slot=s;},
    close:(c,code)=>{c.closed=code;},
    alarm:ms=>{env.alarm=ms;},
    wipe:async()=>{env.store=undefined;env.wiped++;}
  };
  env.logic=new RoomLogic(io,{rand:rnd});
  env.io=io;
  /* mô phỏng Durable Object bị "ngủ" rồi dậy: dựng RoomLogic mới trên cùng kho lưu trữ */
  env.evict=()=>{env.logic=new RoomLogic(io,{rand:rnd});};
  return env;
}
/* một người chơi giả */
function player(env,token){
  env.players=env.players||[];
  const p={env,token,conn:null,inbox:null,st:null,side:null,msgs:[],
    connect(){p.conn={inbox:[],slot:undefined,closed:null};env.conns.add(p.conn);return p;},
    async say(o){await env.logic.onMessage(p.conn,typeof o==='string'?o:JSON.stringify(o));for(const q of env.players)q.pump();},
    async hello(){await p.say({t:'hello',token});},
    pump(){
      for(const m of p.conn.inbox.splice(0)){
        p.msgs.push(m);
        if(m.t==='started'){p.side=m.you;p.st=R.fromSnapshot(m.snapshot);}
        else if(m.t==='state'){p.side=m.you;p.st=R.fromSnapshot(m.snapshot);}
        else if(m.t==='applied'&&p.st){const r=R.apply(p.st,m.action);ok(r.ok,'client áp dụng được nước server phát');}
      }
    },
    last(t){return [...p.msgs].reverse().find(m=>m.t===t);},
    count(t){return p.msgs.filter(m=>m.t===t).length;}
  };
  env.players.push(p);
  return p.connect();
}
const tok=n=>('tokentokentoken'+n).padEnd(24,'x');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function randomAction(st){
  const p=st.turn;
  if(st.left[p]>0&&rnd()<.4){const ws=[];for(const o of['h','v'])for(let r=0;r<R.WN;r++)for(let c=0;c<R.WN;c++)if(R.canWall(st,o,r,c))ws.push({o,r,c});if(ws.length)return{wall:pick(ws)};}
  return{move:pick(R.moves(st,p))};
}
async function newGame(){
  const env=makeRoom(),a=player(env,tok(1)),b=player(env,tok(2));
  await a.hello();await b.hello();return{env,a,b};
}
const turnPlayer=(a,b)=>a.side===a.st.turn?a:b;

/* ===== 1. Vào phòng, bốc thăm phe, bắt đầu ===== */
console.log('1. Vào phòng và bắt đầu');
{
  const env=makeRoom(),a=player(env,tok(1));
  await a.hello();
  ok(a.last('welcome').players===1&&!a.last('welcome').started,'người đầu tiên: chờ đối thủ');
  ok(a.last('opponentStatus').online===false,'chưa có đối thủ');
  ok(env.alarm>0,'hẹn giờ dọn phòng trống');
  const b=player(env,tok(2));await b.hello();
  ok(a.last('started')&&b.last('started'),'đủ 2 người thì bắt đầu');
  ok(a.side!==b.side&&[0,1].includes(a.side),'hai phe khác nhau');
  ok(same(a.last('started').snapshot,R.snapshot(R.newState())),'thế cờ ban đầu đúng');
  ok(a.last('opponentStatus').online===true&&b.last('opponentStatus').online===true,'báo đối thủ đang online');
  const c=player(env,tok(3));await c.hello();
  ok(c.last('full')&&c.conn.closed===4001,'người thứ ba bị từ chối');
  const d=player(env,'xx');await d.hello();
  ok(d.last('error')&&d.last('error').reason==='badtoken','token sai định dạng');
}

/* ===== 2. Chơi trọn nhiều ván ngẫu nhiên, hai bên luôn đồng bộ ===== */
console.log('2. Ván ngẫu nhiên trọn vẹn');
{
  let wins=[0,0],draws=0;
  for(let g=0;g<25;g++){
    const {env,a,b}=await newGame();
    let n=0;
    while(!a.st.over&&n++<400){
      const pl=turnPlayer(a,b),act=randomAction(pl.st);
      await pl.say({t:'action',seq:pl.st.ply,...act});
      ok(same(R.snapshot(a.st),R.snapshot(b.st)),'hai client đồng bộ sau mỗi nước');
      ok(same(R.snapshot(a.st),env.store.snap),'client khớp bản lưu của server');
    }
    ok(a.st.over&&b.st.over,'ván kết thúc');
    const ov=a.last('over');
    if(a.st.draw)draws++;else{wins[a.st.winner]++;ok(ov&&ov.winner===a.st.winner&&ov.reason==='goal','tin over đúng');}
    ok(env.alarm===30*60e3,'hẹn dọn phòng sau khi xong');
    const pl=turnPlayer(a,b);await pl.say({t:'action',seq:pl.st.ply,move:[0,0]});
    ok(pl.last('rejected').reason==='over','sau khi xong mọi nước bị từ chối');
  }
  console.log('   25 ván: Trắng thắng',wins[0],'· Đen thắng',wins[1],'· hòa',draws);
}

/* ===== 3. Hành động sai bị từ chối, trạng thái không đổi ===== */
console.log('3. Từ chối hành động sai');
{
  const {env,a,b}=await newGame();
  const me=turnPlayer(a,b),other=me===a?b:a,snap=()=>JSON.stringify(env.store.snap);
  const before=snap();
  const cases=[
    [other,{t:'action',seq:0,move:[0,0]},'turn','sai lượt'],
    [me,{t:'action',seq:5,move:[0,0]},'seq','sai seq'],
    [me,{t:'action',seq:0,move:[0,0]},'badmove','nước đi bất hợp pháp'],
    [me,{t:'action',seq:0,move:[1.5,2]},'format','tọa độ lẻ'],
    [me,{t:'action',seq:0,wall:{o:'q',r:0,c:0}},'badwall','loại tường lạ'],
    [me,{t:'action',seq:0,wall:{o:'h',r:99,c:0}},'badwall','tường ngoài bàn'],
    [me,{t:'action',seq:0},'format','thiếu nội dung'],
    [me,{t:'action',seq:'0',move:[7,4]},'format','seq không phải số'],
  ];
  for(const [pl,msg,reason,label] of cases){
    await pl.say(msg);
    const r=pl.last('rejected');ok(r&&r.reason===reason,'từ chối: '+label+' → '+reason+' (nhận '+(r&&r.reason)+')');
    pl.msgs.length=0;
  }
  ok(snap()===before,'trạng thái server không đổi sau các hành động sai');
  /* không hiểu JSON / quá dài / tin lạ: bỏ qua, không sập */
  await me.say('{không phải json');await me.say('x'.repeat(5000));await me.say({t:'bay_len_troi'});await me.say('[1,2]');
  ok(snap()===before,'tin rác bị bỏ qua');
  /* hết tường */
  const env2=makeRoom(),p1=player(env2,tok(1)),p2=player(env2,tok(2));await p1.hello();await p2.hello();
  const cur=turnPlayer(p1,p2);env2.logic.st.left[cur.side]=0;
  await cur.say({t:'action',seq:0,wall:{o:'h',r:3,c:3}});
  ok(cur.last('rejected').reason==='nowalls','hết tường');
  /* tường làm kín đường */
  const env3=makeRoom(),q1=player(env3,tok(1)),q2=player(env3,tok(2));await q1.hello();await q2.hello();
  for(const c of[2,4,6])R.setW(env3.logic.st,'h',3,c,1);R.setW(env3.logic.st,'h',3,7,1);
  const cur3=turnPlayer(q1,q2);await cur3.say({t:'action',seq:0,wall:{o:'h',r:3,c:0}});
  ok(cur3.last('rejected').reason==='badwall','tường bịt kín đường bị từ chối');
}

/* ===== 4. Rớt mạng và nối lại, thay thế kết nối, DO "ngủ" ===== */
console.log('4. Nối lại / thay kết nối / DO ngủ');
{
  const {env,a,b}=await newGame();
  for(let i=0;i<6;i++){const pl=turnPlayer(a,b);await pl.say({t:'action',seq:pl.st.ply,...randomAction(pl.st)});}
  /* a rớt */
  a.conn.closed=1006;await env.logic.onClose(a.conn);b.pump();
  ok(b.last('opponentStatus').online===false,'báo đối thủ rớt');
  /* a nối lại bằng token cũ */
  const a2=player(env,a.token);await a2.hello();b.pump();
  ok(a2.last('welcome').started&&a2.last('welcome').slot===a.conn.slot,'nối lại đúng ghế cũ');
  ok(a2.side===a.side&&same(R.snapshot(a2.st),R.snapshot(b.st)),'nhận lại đúng thế cờ và phe');
  ok(b.last('opponentStatus').online===true,'báo đối thủ trở lại');
  /* mở tab thứ hai cùng token: tab cũ bị thay, không báo rớt */
  const a3=player(env,a.token);const nb=b.count('opponentStatus');await a3.hello();
  ok(a2.last('replaced')&&a2.conn.closed===4000,'kết nối cũ bị thay');
  await env.logic.onClose(a2.conn);b.pump();
  ok(b.count('opponentStatus')===nb+0||b.last('opponentStatus').online===true,'thay kết nối không làm đối thủ tưởng rớt');
  /* DO ngủ rồi dậy giữa ván */
  env.evict();
  const pl=turnPlayer(a3,b);await pl.say({t:'action',seq:pl.st.ply,...randomAction(pl.st)});
  ok(!pl.last('rejected')&&same(R.snapshot(a3.st),R.snapshot(b.st)),'sau khi DO dậy ván vẫn chạy tiếp');
  /* sync */
  b.st=null;await b.say({t:'sync'});ok(same(R.snapshot(b.st),env.store.snap),'sync trả đúng thế cờ');
  /* người lạ không chen vào được giữa ván */
  const x=player(env,tok(9));await x.hello();ok(x.last('full'),'người lạ bị chặn giữa ván');
}

/* ===== 5. Đầu hàng, báo thức ===== */
console.log('5. Đầu hàng và dọn phòng');
{
  const {env,a,b}=await newGame();
  await a.say({t:'resign'});
  ok(a.last('over').winner===b.side&&a.last('over').reason==='resign'&&b.last('over').winner===b.side,'đầu hàng → đối thủ thắng');
  const pl=turnPlayer(a,b);await pl.say({t:'action',seq:0,move:[0,0]});ok(pl.last('rejected').reason==='over','sau đầu hàng không đi tiếp được');
  await env.logic.onAlarm();
  ok(a.conn.closed===4002&&env.wiped===1&&env.store===undefined,'báo thức dọn sạch phòng');
  const c=player(env,tok(5));await c.hello();ok(c.last('welcome').players===1&&!c.last('welcome').started,'phòng sau khi dọn dùng lại được');
  await c.say({t:'ping'});ok(c.last('pong'),'ping/pong');
}

console.log(fails?'\nTHẤT BẠI '+fails+'/'+checks:'\nTất cả '+checks+' kiểm tra đạt');
process.exit(fails?1:0);
