/* Kiểm tra phía CLIENT của Hỗn Loạn online, không cần trình duyệt/three.js/mạng:   node tools/chaos-client-test.mjs
   Nạp config/util/state/core/rules/app.js thật vào một vm với các lớp 3D giả, cho RoomLogic thật (server) chơi với client:
   một bên là client (dùng đúng moves/canWall/App.netIn của trò chơi), bên kia là "bot" lấy nước đi hợp lệ từ trạng thái thật của server.
   Sau MỖI tin của server, so sánh S của client với trạng thái thật: phần nhìn thấy phải khớp, phần bị cỏ che không được lộ. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {RoomLogic} from '../server/src/room-logic.js';
import Core from '../js/core.js';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
let bad=0;const ck=(ok,m)=>{if(!ok){bad++;console.log('  ✗',m);}};
const ok1=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};
const RC=Core.make(Core.ruleset('chaos'));
const clone=o=>JSON.parse(JSON.stringify(o));
const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
let now=1e12;Date.now=()=>now;

/* ---------- client: nạp file thật vào vm ---------- */
function makeClient(){
  const log={blk:[],walls:[],terrain:[],pieces:[],traps:[],place:[],won:[],hints:0,chests:0,pops:0,removed:0};
  const el=new Proxy({},{get:()=>({style:{},textContent:'',hidden:false,setAttribute(){},firstElementChild:{style:{}}})});
  const ctx={console,Math,Date,Uint8Array,Int16Array,Int32Array,Array,Object,JSON,Number,String,Boolean,Promise,Error,performance:{now:()=>0},
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame(){},addEventListener(){},ResizeObserver:class{observe(){}},
    document:{getElementById:()=>({})},localStorage:{getItem:()=>null,setItem(){}},
    confirm:()=>true,
    UI:{el,render(){},renderBar(){},init(){},lockMenu(){},progress(){},theme(){},renderStatus(){}},
    Menu:{init(){},leaveRoom(){},show(){}},
    Stage:{setHints(){log.hints++;},setLabels(){},invalidate(){},setTerrain(t,seed){log.terrain.push({terr:t?Array.from(t).join(''):null,seed});}},
    Walls:{add(o,r,c,p){log.walls.push({o,r,c,p});},clear(){log.walls.length=0;},showGhost(){},hideGhost(){},showTarget(){},rubble(){},remove(){log.removed++;}},
    Badges:{clear(){},show(){}},Marks:{set(){},clear(){},beam(){},update(){return false;},pop(){log.pops++;}},Review:{reset(){},snap(){},skip(){},judge(){return null;}},
    Fireworks:{stop(){},play(p){log.won.push(p);}},
    Pawns:{reset(){},place(i){log.place.push(i);},win(){},script(){},quiet(){return true;},list:[{},{}]},
    Camera:{snapHome(){},follow(){},cycle(){},toggleFollow(){},ty:0,lock(){},unlock(){}},
    Blocker:{clear(){},sync(){},update(){return false;},pick:()=>-1,s:null,enter(c,cb){log.blk.push('E');cb.onArrive();cb.onDone();},leave(cb){log.blk.push('L');cb.onGo();cb.onDone();}},   /* hoạt ảnh diễn xong ngay */
    Terrain:{openChest(){log.chests++;},syncChests(){},setBiome(b){log.biome=b;},setPieces(l){log.pieces=l;},setTraps(v){log.traps.push(v);},setGateBlocked(){},fireTrap(){},flashGate(){},update(){return false;}},
    Input:{slotAtPointer:()=>null,targetAtPointer:()=>null},AIs:{},AIWorker:{}};
  ctx.globalThis=ctx;vm.createContext(ctx);
  for(const f of['js/config.js','js/util.js','js/state.js','js/core.js','js/rules.js','js/blocker-plan.js']){vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});}
  let app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
  app=app.replace(/\nUI\.init\(\);Menu\.init\(\);App\.bind\(\);requestAnimationFrame\(App\.frame\);\s*$/,'\n');
  if(/App\.bind\(\)/.test(app))throw new Error('không bỏ được dòng khởi động của app.js');
  vm.runInContext(app,ctx,{filename:'js/app.js'});
  const get=e=>vm.runInContext(e,ctx);
  return{ctx,log,get,S:get('S'),App:get('App'),moves:get('moves'),canWall:get('canWall'),R:get('R')};
}

/* ---------- server giả như chaos-room.mjs ---------- */
function makeRoom(rand){
  const room={store:undefined,conns:[]};
  room.io={load:async()=>room.store?clone(room.store):undefined,save:async g=>{room.store=clone(g);},
    send:(c,m)=>{if(c.open)c.inbox.push(clone(m));},conns:()=>room.conns.filter(c=>c.open),
    getSeat:c=>c.seat,setSeat:(c,s)=>{c.seat=s;},close:(c)=>{c.open=false;},alarm:()=>{},wipe:async()=>{room.store=undefined;},lobby:async()=>{}};
  room.logic=new RoomLogic(room.io,{grace:45e3,rand});
  room.connect=()=>{const c={open:true,seat:-1,inbox:[]};room.conns.push(c);return c;};
  room.say=async(c,o)=>{await room.logic.onMessage(c,JSON.stringify(o));};
  return room;
}
const tok=n=>n.padEnd(20,'x');

/* Một ván: client (ghế A) đấu bot (ghế B). Trả về thống kê. */
async function playGame(biome,seed,maxPlies,opts){
  const rnd=lcg(seed),rm=makeRoom(rnd);
  await rm.logic.init({mode:'chaos',visibility:'private',code:'ABCDEF',biome});
  const A=rm.connect(),B=rm.connect(),cl=makeClient(),{S,App}=cl;
  await rm.say(A,{t:'hello',token:tok('A')});await rm.say(B,{t:'hello',token:tok('B')});
  const st0=A.inbox.find(m=>m.t==='started');
  const stats={plies:0,hidden:0,stuckMe:0,rejects:0,badRejects:0,sync:0,over:false,items:{boots:0,glove:0,hammer:0,pick:0},chests:0,extra:0};
  const conn={action(){},sync(){stats.sync++;},rematch(){},resign(){}};
  App.cfg={ai:[null,null],net:{conn,you:st0.you,snap:st0.snapshot,turnLeft:st0.turnLeft,state:null,mode:'chaos',map:st0.map}};
  App.newGameState();App.newGameBuild();App.newGameFinish();App.netReady=true;App.ready=true;App.busy=false;   /* newGame() giờ là async (màn hình tải): gọi thẳng ba bước dựng ván */
  A.inbox=A.inbox.filter(m=>m.t!=='started');
  const truth=()=>rm.logic.st,me=st0.you;
  const check=where=>{
    const st=truth();
    ck(S.ply===st.ply&&S.turn===st.turn,`${biome}/${seed} ${where}: ply/turn ${S.ply}/${S.turn} ≠ ${st.ply}/${st.turn}`);
    ck(S.left[0]===st.left[0]&&S.left[1]===st.left[1],`${biome}/${seed} ${where}: số tường còn lại lệch`);
    ck(S.blocker===st.blocker,`${biome}/${seed} ${where}: người chặn đường lệch (client ${S.blocker}, server ${st.blocker})`);
    ck(S.pl[me].r===st.pl[me].r&&S.pl[me].c===st.pl[me].c,`${biome}/${seed} ${where}: quân của mình lệch`);
    const o=1-me;
    if(!S.hid[o])ck(S.pl[o].r===st.pl[o].r&&S.pl[o].c===st.pl[o].c,`${biome}/${seed} ${where}: quân đối thủ (đang thấy) lệch`);
    else{stats.hidden++;ck(RC.sees(st,me,o)===false,`${biome}/${seed} ${where}: client nói đối thủ bị che nhưng server nói thấy`);}
    if(!st.over)ck(RC.sees(st,me,o)===!S.hid[o],`${biome}/${seed} ${where}: cờ hid không khớp luật nhìn thấy`);
    ck(S.stuck[me]===st.stuck[me],`${biome}/${seed} ${where}: stuck của mình lệch`);
    if(!S.hid[o])ck(S.stuck[o]===st.stuck[o],`${biome}/${seed} ${where}: stuck đối thủ lệch`);
    const cw=[];for(const w of['h','v'])for(let i=0;i<RC.WN*RC.WN;i++)if(S.ws[w][i])cw.push(w+i);
    const sw=[];for(const w of['h','v'])for(let i=0;i<RC.WN*RC.WN;i++)if(st.ws[w][i])sw.push(w+i);
    ck(cw.join()===sw.join(),`${biome}/${seed} ${where}: tường lệch`);
    ck(cl.log.pieces.length===(S.hid[o]?1:2),`${biome}/${seed} ${where}: setPieces lộ/thiếu quân (${cl.log.pieces.length})`);
    ck(!JSON.stringify(Object.keys(S)).includes('rng'),'S không có rng');
    /* rương và vật phẩm: túi đồ, giày, chủ tường, ô chết và địa hình (rương đã mở) đều công khai, phải khớp server tuyệt đối */
    ck(JSON.stringify(S.inv)===JSON.stringify(st.inv),`${biome}/${seed} ${where}: túi đồ lệch ${JSON.stringify(S.inv)} ≠ ${JSON.stringify(st.inv)}`);
    ck(JSON.stringify(S.bonus)===JSON.stringify(st.bonus),`${biome}/${seed} ${where}: bonus giày lệch`);
    ck(Array.from(S.terr).join('')===Array.from(st.terr).join(''),`${biome}/${seed} ${where}: địa hình lệch (rương đã mở?)`);
    for(const w of['h','v']){ck(Array.from(S.wo[w]).join('')===Array.from(st.wo[w]).join(''),`${biome}/${seed} ${where}: chủ tường ${w} lệch`);ck(Array.from(S.dead[w]).join('')===Array.from(st.dead[w]).join(''),`${biome}/${seed} ${where}: khe bị phá ${w} lệch`);}
  };
  const runEvent=()=>{for(let i=0;i<4&&S.event;i++){S.event.t0=0;App.eventTick();}};   /* người chặn đường: để sự kiện diễn xong (S.blocker cập nhật, tin xếp hàng được xử lý) */
  const drain=()=>{const q=A.inbox;A.inbox=[];for(const m of q){if(m.t==='applied'&&m.fx&&m.fx.some(e=>e.t==='chest'))stats.chests++;if(m.t==='rejected'){stats.rejects++;if(!S.hid[1-me])stats.badRejects++;}App.netIn(m.t,m);runEvent();}};
  const send=async a=>{S.net.wait=true;const seq=S.ply;await rm.say(A,{t:'action',seq,...a});drain();};
  check('khởi đầu');
  ck(cl.log.terrain.length===1&&cl.log.terrain[0].terr===truth().terr.join(''),'địa hình dựng đúng terr của server');
  ck(cl.log.biome===(st0.map.biome==='balanced'?'meadow':st0.map.biome),'biome truyền cho Terrain đúng');
  while(!truth().over&&truth().ply<maxPlies){
    const st=truth();
    const myTurn=rm.logic.g.side[0]===st.turn;   /* ghế A */
    if(myTurn){
      ck(S.turn===me,`${biome}/${seed}: client tưởng không phải lượt mình`);
      if(S.stuck[me]){stats.stuckMe++;ck(cl.moves(me).length===0,'đứng yên thì moves() rỗng');}
      const mv=cl.moves(S.turn),r=rnd();let a=null;
      const extra=S.bonus[me]===2;
      /* dùng vật phẩm (chỉ dựa vào trạng thái CỦA CLIENT: nếu S lệch thì server từ chối và badRejects > 0) */
      if(!extra&&S.inv[me].length&&rnd()<.45){
        const u=S.inv[me][(rnd()*S.inv[me].length)|0],ow=cl.R.oppWalls(S,me);
        if(u==='boots'&&S.bonus[me]===0)a={item:{use:u}};
        else if(u==='glove'&&S.left[1-me]>=2)a={item:{use:u}};
        else if((u==='hammer'||u==='pick')&&ow.length){const w=ow[(rnd()*ow.length)|0];a={item:{use:u,o:w.o,r:w.r,c:w.c}};}
        if(a)stats.items[u]++;
      }
      if(a){/* đã chọn vật phẩm */}
      else if(extra||(mv.length&&(r<.8||S.left[me]===0))){const m=mv[(rnd()*mv.length)|0];a={move:[m[0],m[1]]};}
      else{
        const tries=[];for(const o of['h','v'])for(let rr=0;rr<RC.WN;rr++)for(let cc=0;cc<RC.WN;cc++)if(cl.canWall(o,rr,cc))tries.push({o,r:rr,c:cc});
        if(tries.length&&S.left[me]>0&&!extra)a={wall:tries[(rnd()*tries.length)|0]};
        else if(mv.length){const m=mv[0];a={move:[m[0],m[1]]};}
      }
      if(!a)break;
      await send(a);
      if(S.net.wait){   /* bị từ chối: rejected đã xử lý wait=false; nếu vẫn chờ là lỗi */
        ck(false,`${biome}/${seed}: wait kẹt sau nước của client`);break;
      }
    }else{                                            /* bot: nước hợp lệ lấy từ trạng thái thật */
      const mv=RC.moves(st,st.turn);let a;const bx=st.bonus[st.turn]===2;
      if(!bx&&st.inv[st.turn].length&&rnd()<.4){
        const u=st.inv[st.turn][(rnd()*st.inv[st.turn].length)|0],ow=RC.oppWalls(st,st.turn);
        const c=u==='boots'||u==='glove'?{item:{use:u}}:ow.length?{item:{use:u,...ow[(rnd()*ow.length)|0]}}:null;
        if(c&&RC.check(st,c).ok)a=c;
      }
      if(a){/* bot dùng vật phẩm */}
      else if(mv.length&&(bx||rnd()<.75)){const m=mv[(rnd()*mv.length)|0];a={move:[m[0],m[1]]};}
      else{const t=[];for(const o of['h','v'])for(let r=0;r<RC.WN;r++)for(let c=0;c<RC.WN;c++)if(st.left[st.turn]>0&&RC.canWall(st,o,r,c))t.push({o,r,c});
        a=t.length&&!bx?{wall:t[(rnd()*t.length)|0]}:{move:[mv[0][0],mv[0][1]]};}
      await rm.say(B,{t:'action',seq:st.ply,...a});drain();
    }
    stats.plies++;if(truth().bonus.includes(2))stats.extra++;
    check('ply '+truth().ply);
    if(opts&&opts.resyncEvery&&stats.plies%opts.resyncEvery===0){   /* vào lại giữa ván: dựng lại từ 'state' */
      await rm.say(A,{t:'sync'});drain();check('sau resync ở ply '+truth().ply);
    }
  }
  stats.over=truth().over;stats.removed=cl.log.removed;stats.pops=cl.log.pops;
  if(stats.over){
    ck(S.over===true,`${biome}/${seed}: client chưa biết ván đã xong`);
    if(!truth().draw)ck(S.winner===truth().winner,`${biome}/${seed}: người thắng lệch`);
    ck(!S.hid[0]&&!S.hid[1],'hết ván thì lộ hết');
  }
  return stats;
}

console.log('1. Ván hoàn chỉnh với từng biome (client ↔ server thật)');
const tot={games:0,plies:0,hidden:0,stuckMe:0,rejects:0,badRejects:0,over:0,chests:0,removed:0,extra:0,items:{boots:0,glove:0,hammer:0,pick:0}};
for(const biome of['balanced','forest','mountain','snow','river','desert','random']){
  for(let seed=1;seed<=10;seed++){
    const s=await playGame(biome,seed*7919+biome.length,260,{resyncEvery:seed%2?0:9});
    tot.games++;tot.plies+=s.plies;tot.hidden+=s.hidden;tot.stuckMe+=s.stuckMe;tot.rejects+=s.rejects;tot.badRejects+=s.badRejects;tot.over+=s.over?1:0;tot.chests+=s.chests;tot.removed+=s.removed;tot.extra+=s.extra;for(const k in s.items)tot.items[k]+=s.items[k];
  }
}
console.log(`   ${tot.games} ván · ${tot.plies} nước · ${tot.over} ván kết thúc · lượt đối thủ bị che ${tot.hidden} · lượt mình đứng yên ${tot.stuckMe} · bị từ chối ${tot.rejects}`);
console.log(`   rương mở ${tot.chests} · tường bị gỡ/phá ${tot.removed} · lượt thêm của giày ${tot.extra} · client dùng: giày ${tot.items.boots}, găng ${tot.items.glove}, búa ${tot.items.hammer}, cuốc ${tot.items.pick}`);
ok1(tot.chests>0,'có rương được mở (server gửi fx chest, client cập nhật địa hình + túi đồ khớp)');
ok1(tot.removed>0&&tot.extra>0,'có tường bị búa/cuốc chim gỡ và có lượt thêm của giày');
ok1(tot.items.boots>0&&tot.items.hammer>0&&tot.items.pick>0,'client đã dùng giày, búa và cuốc chim (găng chỉ 15% quà nên không bắt buộc; đã phủ ở items-test/items-room)');
ok1(tot.hidden>0,'có tình huống đối thủ bị cỏ che');
ok1(tot.stuckMe>0,'có tình huống mình đứng yên trong nước');
ok1(tot.badRejects===0,'client không bao giờ gửi nước/tường bị từ chối khi nhìn thấy đủ (chỉ được sai khi đối thủ bị che)');

console.log('2. Classic và các chế độ cũ không bị ảnh hưởng');
{
  const c=makeClient(),{S,App}=c;
  App.cfg={ai:[null,'dumb'],net:null};
  ck(S.terr===null&&S.chaos===false,'trạng thái ban đầu là Classic');
  const cs=Core.make(Core.ruleset('classic')),st=cs.newState(),sn=cs.snapshot(st);
  App.cfg={ai:[null,null],net:{conn:{action(){},sync(){}},you:0,snap:sn,turnLeft:0,state:null,mode:'classic',map:null}};
  App.newGameState();App.newGameBuild();App.newGameFinish();App.netReady=true;App.ready=true;App.busy=false;   /* newGame() giờ là async (màn hình tải): gọi thẳng ba bước dựng ván */
  ok1(S.chaos===false&&S.terr===null&&c.log.terrain.length===1&&c.log.terrain[0].terr===null,'Classic online: không dựng địa hình');
  ok1(S.hid[0]===false&&S.hid[1]===false&&c.log.traps.every(v=>v===0),'Classic online: không có quân bị che, bẫy luôn tắt');
  ok1(c.moves(0).length===3&&c.canWall('h',3,3),'moves/canWall Classic như cũ');
}
console.log(bad?`\nCÓ ${bad} LỖI`:'\nĐẠT');
process.exit(bad?1:0);
