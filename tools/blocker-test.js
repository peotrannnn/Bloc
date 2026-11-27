#!/usr/bin/env node
'use strict';
/* Kiểm thử logic sự kiện "người chặn đường" (KHÔNG cần trình duyệt/three.js):   node tools/blocker-test.js
   Nạp config/util/state/core/rules/pawns/blocker/app + AI THẬT vào một vm với đối tượng 3D giả. Kiểm: chọn ô (không hàng đích, không quân, không đá, hai bên còn đường),
   đường chạy (liền kề, tránh tường + quân, bắt đầu ở mép), hoạt ảnh đi đủ trình tự drop → run → arrive → hold và dừng đúng tâm ô, tạm dừng cả hai bên
   (humanTurn, máy không đi, tin server xếp hàng), camera khóa/gỡ, rời đi, và AI không bước vào ô có người chặn.
   Cái nhìn thấy được (đẹp/xấu, góc camera) vẫn phải xem bằng mắt trên trình duyệt (phím B). */
const vm=require('vm'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let fails=0,checks=0;
const ok=(c,msg)=>{checks++;if(!c){fails++;console.log('  ✗',msg);}};
const mk=()=>({position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},
  scale:{x:1,y:1,z:1,set(x,y,z){this.x=x;this.y=y;this.z=z;},setScalar(k){this.x=this.y=this.z=k;}},visible:true});

const log={cam:[],invalidate:0};
const ctx=vm.createContext({
  console,Math,JSON,Date,Set,Int16Array,Uint8Array,setTimeout,clearTimeout,setInterval,clearInterval,performance:{now:()=>Date.now()},
  requestAnimationFrame(){},addEventListener(){},ResizeObserver:class{observe(){}},document:{getElementById:()=>({})},localStorage:{getItem:()=>null,setItem(){}},__log:log,
  Stage:{need:0,invalidate(){log.invalidate++;},setHints(){},setLabels(){},setTerrain(){},updateHints:()=>false,render(){},ren:null},
  Walls:{add(){},clear(){},showGhost(){},hideGhost(){},update:()=>false,pulse:()=>false,remove(){},rubble(){},showTarget(){}},
  Badges:{clear(){},show(){},update:()=>false,init(){}},Fireworks:{stop(){},play(){},update:()=>false},
  Camera:{snapHome(){},follow(){},update:()=>false,ty:0,lock(o,c){log.cam.push(['lock',!!o,c.dist]);},unlock(){log.cam.push(['unlock']);}},
  Review:{reset(){},snap(){},skip(){},judge:()=>null},
  UI:{init(){},render(){},renderBar(){},el:new Proxy({},{get:()=>({})}),progress(){},lockMenu(){}},Menu:{init(){}},Input:{slotAtPointer:()=>null,targetAtPointer:()=>null},
  Terrain:{setPieces(){},setTraps(){},setGateBlocked(){},fireTrap(){},flashGate(){},update:()=>false,shadowBusy:false,setBiome(){},openChest(){},syncChests(){}},
  Marks:{set(){},clear(){},beam(){},update:()=>false,pop(){}},
  AIWorker:{decide:async()=>null},Online:{},loadThree:async()=>{},
});
const load=f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
for(const f of['js/config.js','js/util.js','js/state.js','js/core.js','js/rules.js','js/ai/registry.js','js/ai/basic.js','js/ai/dumb.js','js/ai/tools.js','js/ai/attacker.js','js/ai/defender.js','js/ai/thug.js','js/ai/mirror.js','js/ai/keeper.js','js/ai/control.js','js/ai/gambler.js','js/ai/biet.js','js/blocker-plan.js','js/view/pawns.js','js/view/blocker.js','js/app.js'])load(f);
const run=s=>vm.runInContext(s,ctx);

/* thế cờ giả: hai quân + tường; Pawns.list giả đứng yên (idle) để Pawns.quiet() đúng */
function setup({pl=[[8,4],[0,4]],walls=[],turn=0,terr=null,ai=[null,null],chaos=true}={}){   /* chaos=true: người chặn đường chỉ chạy ở Hỗn Loạn; chaos:false để thử Classic */
  run(`(function(pl,walls,turn,terr,ai,chaos){
    S.over=false;S.event=null;S.bplan={on:false,at:1e9};S.blocker=-1;S.net=null;S.chaos=chaos;S.terr=terr?Uint8Array.from(terr):null;S.hid=[false,false];S.last=[null,null];S.animLock=false;
    S.pl=pl.map(p=>({r:p[0],c:p[1]}));S.ws={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};S.left=[10,10];S.turn=turn;S.ply=0;S.mode='move';S.ai=ai;S.paused=false;S.delay=50;S.me=ai[0]===null?0:-1;S.stuck=null;
    for(const w of walls)setW(w[0],w[1],w[2],1);
    const mk=()=>({position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},scale:{x:1,y:1,z:1,set(x,y,z){this.x=x;this.y=y;this.z=z;},setScalar(k){this.x=this.y=this.z=k;}},visible:true});
    Pawns.list=[0,1].map(i=>({t:1,an:null,q:[],cel:null,lr:pl[i][0],lc:pl[i][1]}));
    Blocker.s={g:mk(),fl:mk(),legs:[mk(),mk()],flames:[Object.assign(mk(),{userData:{ph:0}}),Object.assign(mk(),{userData:{ph:1.7}})],yaw:0,tyaw:0};Blocker.fx=null;Blocker.jt=Blocker.jv=0;Blocker.s.g.visible=false;Blocker.pv=.56;Blocker.feet=.35;Blocker.an=null;Blocker.cb=null;Blocker.flash=0;Blocker.bt=0;
    Blocker.symMat={emissiveIntensity:1};Blocker.limbMat={emissiveIntensity:1};
    App.ready=true;App.busy=false;App.cfg={net:null,ai:ai};App.timer=0;App.aiTok=0;
  })(${JSON.stringify(pl)},${JSON.stringify(walls)},${turn},${JSON.stringify(terr)},${JSON.stringify(ai)},${chaos})`);
}
const get=e=>JSON.parse(run(`JSON.stringify(${e})`));

/* ===== 1. Chọn ô ===== */
console.log('Chọn ô');
setup();
let k=get('Blocker.pick()');
ok(k>=0,'ván trống: có ô để chặn');
{
  const r=(k/9)|0;ok(r>=1&&r<=7,'không phải hàng đích (hàng '+r+')');
  ok(Math.abs(k%9-4)<=1,'bàn trống, hai quân cùng cột giữa: ô nằm trên đường thẳng giữa (cột '+(k%9)+')');
}
/* hàng loạt thế ngẫu nhiên: ô luôn hợp lệ và hai bên còn đường */
{
  let bad=0,none=0;
  for(let t=0;t<400;t++){
    const rnd=n=>Math.floor(Math.random()*n);
    const pl=[[1+rnd(7),rnd(9)],[1+rnd(7),rnd(9)]];if(pl[0][0]===pl[1][0]&&pl[0][1]===pl[1][1])continue;
    const walls=[];for(let i=0;i<rnd(9);i++)walls.push([['h','v'][rnd(2)],rnd(8),rnd(8)]);
    setup({pl,walls:[]});
    run(`(function(w){for(const x of w)if(canWall(x[0],x[1],x[2]))setW(x[0],x[1],x[2],1);})(${JSON.stringify(walls)})`);
    const idx=get('Blocker.pick()');
    if(idx<0){none++;continue;}
    const r=(idx/9)|0,c=idx%9;
    const good=get(`(function(){const k=${idx};S.blocker=k;const a=dist(0,S.pl[0])<9999&&dist(1,S.pl[1])<9999;S.blocker=-1;return a;})()`);
    if(r<1||r>7||pl.some(p=>p[0]===r&&p[1]===c)||!good)bad++;
  }
  ok(bad===0,'400 thế ngẫu nhiên: mọi ô chọn đều hợp lệ và hai bên còn đường ('+bad+' sai, '+none+' không có chỗ)');
}
/* Hỗn Loạn: không chọn ô có địa hình đặc biệt, không chọn đá */
{
  const terr=new Array(81).fill(0);for(let c=0;c<9;c++){terr[4*9+c]=c%2?1:3;}   /* hàng 4: đá xen băng */
  setup({terr});
  let all=true;for(let t=0;t<50;t++){const i=get('Blocker.pick()');if(i<0||terr[i]!==0)all=false;}
  ok(all,'Hỗn Loạn: chỉ chọn ô thường (không đá/băng)');
}

/* ===== 1b. Choke point ===== */
console.log('Choke point');
{
  /* hành lang: tường dài cắt ngang hàng 3-4 trừ khe ở cột 8 → ô quanh khe là choke point (chặn là cả hai bên đi thêm nhiều) */
  const walls=[['h',3,0],['h',3,2],['h',3,4]];   /* khe rộng 3 ô (cột 6-8) */
  setup({pl:[[6,4],[2,4]],walls});
  const d0=get('dist(0,S.pl[0])'),d1=get('dist(1,S.pl[1])');
  let best=-1,bestG=-1;
  for(let r=1;r<8;r++)for(let c=0;c<9;c++){if(!get(`Blocker.okCell(${r},${c})`))continue;const g=get(`Blocker.gainOf(${r*9+c},${d0},${d1})`);if(g>bestG){bestG=g;best=r*9+c;}}
  const picks=new Set();for(let t=0;t<60;t++)picks.add(get('Blocker.pick()'));
  const gains=[...picks].map(k=>get(`Blocker.gainOf(${k},${d0},${d1})`));
  ok(bestG>=2,'thế có khe: tồn tại ô chặn làm hai bên đi thêm >= 2 bước (max '+bestG+')');
  ok(gains.every(g=>g>=bestG-1),'mọi ô được chọn đều gần mức chặn đau nhất ('+[...picks].join(',')+' gain '+gains.join(',')+')');
  /* ván trống hai quân giữa bàn: vẫn chọn được ô */
  setup();ok(get('Blocker.pick()')>=0,'ván trống vẫn chọn được ô');
  /* chặn kín: một ô chặn làm bên nào hết đường thì không bao giờ được chọn (gain=-1) */
  setup({pl:[[1,0],[7,8]],walls:[['v',0,0],['h',1,0]]});   /* quân Trắng ở (1,0) chỉ còn đường qua một ô */
  let bad=0;for(let t=0;t<40;t++){const k=get('Blocker.pick()');if(k>=0&&get(`Blocker.gainOf(${k},${get('dist(0,S.pl[0])')},${get('dist(1,S.pl[1])')})`)<0)bad++;}
  ok(bad===0,'không chọn ô làm một bên hết đường');
}

/* ===== 2. Đường ra khỏi bàn ===== */
console.log('Đường rời đi');
{
  const walls=[['h',3,0],['h',3,2],['h',3,4],['h',3,6]];
  setup({pl:[[6,4],[2,4]],walls});
  const start=4*9+4;
  let allOk=true,edgeOk=true,wallOk=true,pawnOk=true,startOk=true;
  for(let t=0;t<40;t++){
    const cells=get(`Blocker.exitRoute(${start})`);
    if(!cells){allOk=false;break;}
    if(cells[0]!==start)startOk=false;
    const e=cells[cells.length-1],er=(e/9)|0,ec=e%9;
    if(!(er===0||er===8||ec===0||ec===8))edgeOk=false;
    for(let i=1;i<cells.length;i++){
      const a=cells[i-1],b=cells[i],dr=((b/9)|0)-((a/9)|0),dc=b%9-a%9;
      if(Math.abs(dr)+Math.abs(dc)!==1||get(`blk(${(a/9)|0},${a%9},${dr},${dc})`))wallOk=false;
    }
    if(cells.some(c=>c===6*9+4||c===2*9+4))pawnOk=false;
  }
  ok(allOk,'có đường ra mép');ok(startOk,'bắt đầu từ ô người chặn');ok(edgeOk,'kết thúc ở ô mép bàn');ok(wallOk,'liền kề và không xuyên tường');ok(pawnOk,'không đi xuyên quân');
  /* đứng sẵn ở mép: đường có thể chỉ một ô */
  setup();const c2=get('Blocker.exitRoute(1*9+0)');ok(c2&&c2[0]===9,'ô sát mép vẫn có đường');
  /* bị vây kín: tường bao quanh ô (4,4) → không có đường (null) */
  setup({pl:[[8,0],[0,8]],walls:[['h',3,3],['h',4,3],['v',3,3],['v',3,4]]});   /* bốn tường quanh ô (4,4)? kiểm bằng BFS bên dưới */
  const closed=get('Blocker.exitRoute(4*9+4)');
  const nb=[[-1,0],[1,0],[0,-1],[0,1]].filter(([dr,dc])=>!get(`blk(4,4,${dr},${dc})`)).length;
  ok((nb===0)===(closed===null),'vây kín ⇔ không có đường (số hướng thoáng '+nb+', đường '+(closed?'có':'null')+')');
  /* hướng nhảy: vuông góc với cạnh bàn, hướng ra ngoài */
  setup();
  const dirs=[[0*9+4,[0,-1]],[8*9+4,[0,1]],[4*9+0,[-1,0]],[4*9+8,[1,0]]];
  let dOk=true;for(const[k,_]of dirs){const o=get(`Blocker.outDir(${k})`),cx=get(`cellX(${k%9})`),cz=get(`cellZ(${(k/9)|0})`);
    if(Math.abs(Math.hypot(o[0],o[1])-1)>1e-9||(cx*o[0]+cz*o[1])<=0)dOk=false;}   /* tâm bàn ở gốc: hướng ra ngoài thì tích vô hướng với vị trí ô > 0 */
  ok(dOk,'outDir: đơn vị và chỉ ra ngoài bàn');
}

/* chạy một hoạt ảnh tới hết, ghi lại các pha, độ cao, vị trí, lửa */
function runAn(maxT=30){
  const kinds=[],tr={maxY:0,minY:1e9,jetMax:0,jetOnPhases:new Set(),jetOffAtHold:true,dt:1/60,t:0,pos:[]};
  while(tr.t<maxT&&get('Blocker.an')){
    run(`Blocker.update(${tr.dt})`);tr.t+=tr.dt;
    const a=get('Blocker.an');if(a&&kinds[kinds.length-1]!==a.k)kinds.push(a.k);
    const y=run('Blocker.s.g.position.y');tr.maxY=Math.max(tr.maxY,y);tr.minY=Math.min(tr.minY,y);
    const jv=run('Blocker.jv');tr.jetMax=Math.max(tr.jetMax,jv);
    if(a&&jv>.3)tr.jetOnPhases.add(a.k);
    if(a&&(a.k==='hold'||a.k==='arrive')&&jv>.05)tr.jetOffAtHold=false;
    tr.pos.push([run('Blocker.s.g.position.x'),y,run('Blocker.s.g.position.z')]);
    if(get('__ev').includes('arrive@-1')&&get('S.blocker')<0&&globalThis.__idx>=0)run(`S.blocker=${globalThis.__idx}`);
  }
  tr.kinds=kinds;return tr;
}

/* ===== 3. Hoạt ảnh bay vào ===== */
console.log('Hoạt ảnh bay vào');
{
  let startsRandom=new Set(),allLand=true,allHigh=true,jetsOk=true,seqOk=true,vertOk=true,timeOk=true;
  for(let rep=0;rep<12;rep++){
    setup();
    const idx=get('Blocker.pick()');globalThis.__idx=idx;
    run(`(function(){globalThis.__ev=[];Blocker.enter(${idx},{onArrive:()=>__ev.push('arrive@'+S.blocker),onDone:()=>__ev.push('done')});})()`);
    const p0=[run('Blocker.s.g.position.x'),run('Blocker.s.g.position.y'),run('Blocker.s.g.position.z')];
    startsRandom.add(p0[0].toFixed(2)+','+p0[2].toFixed(2));
    const cx=get(`cellX(${idx%9})`),cz=get(`cellZ(${(idx/9)|0})`),TOP=get('TOP');
    if(p0[1]<TOP+4.5||Math.hypot(p0[0]-cx,p0[2]-cz)<5)allHigh=false;
    const tr=runAn();
    if(tr.kinds.join('>')!=='fly>land>arrive>hold')seqOk=false;
    if(!tr.jetOnPhases.has('fly')||!tr.jetOffAtHold)jetsOk=false;
    const px=run('Blocker.s.g.position.x'),pz=run('Blocker.s.g.position.z'),py=run('Blocker.s.g.position.y');
    if(Math.abs(px-cx)>.02||Math.abs(pz-cz)>.02||Math.abs(py-TOP)>1e-6)allLand=false;
    /* đoạn cuối hạ thẳng đứng: 12 khung cuối của pha fly gần như không đổi x,z */
    const fl=tr.pos.findIndex(p=>p[1]<=TOP+.02);
    if(fl>8){const a=tr.pos[fl-8],b=tr.pos[fl];if(Math.hypot(a[0]-b[0],a[2]-b[2])>.25)vertOk=false;}
    if(tr.t<2||tr.t>12)timeOk=false;
    if(get('Blocker.s.g.scale.x')!==1||get('Blocker.s.g.scale.y')!==1||get('Blocker.s.fl.rotation.x')!==0||get('Blocker.s.legs[0].rotation.x')!==0)seqOk=false;
    if(get('__ev').join()!=='arrive@-1,done')seqOk=false;
  }
  ok(startsRandom.size>=8,'điểm xuất phát NGẪU NHIÊN trên trời ('+startsRandom.size+'/12 khác nhau)');
  ok(allHigh,'xuất phát cao >= 4.5 và cách ô đích >= 5 ngang');
  ok(seqOk,'đi đủ fly → land → arrive → hold, onArrive trước onDone, về tư thế đứng yên');
  ok(jetsOk,'lửa phản lực bật lúc bay và đã tắt khi đứng');
  ok(allLand,'đáp đúng tâm ô và đúng mặt ô');
  ok(vertOk,'đoạn cuối hạ gần thẳng đứng');
  ok(timeOk,'thời gian hợp lý');
}

/* ===== 4. Rời đi: chạy ra mép rồi nhảy / bay lên ===== */
console.log('Hoạt ảnh rời đi');
{
  /* a) có đường: xrun → jump, rơi khỏi bàn, S.blocker xóa ở onGo, ẩn mô hình */
  let seqOk=true,fellOk=true,outOk=true,goOk=true,noJet=true;
  for(let rep=0;rep<8;rep++){
    setup();
    const idx=4*9+4;
    run(`S.blocker=${idx};Blocker.sync=Blocker.sync;(function(){const g=Blocker.s.g;g.visible=true;g.position.set(cellX(4),TOP,cellZ(4));})();globalThis.__ev=[];globalThis.__idx=-1`);
    run(`Blocker.leave({onGo:()=>{__ev.push('go');S.blocker=-1;},onDone:()=>__ev.push('done')})`);
    const tr=runAn();
    if(tr.kinds.join('>')!=='xrun>jump')seqOk=false;
    if(tr.minY>-5)fellOk=false;
    if(get('__ev').join()!=='go,done')goOk=false;
    if(tr.jetMax>.01)noJet=false;
    const last=tr.pos[tr.pos.length-1],TOPv=get('TOP');
    /* rơi ra NGOÀI bàn: cách tâm bàn xa hơn nửa cạnh bàn */
    if(Math.max(Math.abs(last[0]),Math.abs(last[2]))<get('CFG.PITCH')*4.4)outOk=false;
    if(get('Blocker.s.g.visible')!==false)seqOk=false;
  }
  ok(seqOk,'có đường: xrun → jump, rồi ẩn mô hình');
  ok(goOk,'onGo (xóa S.blocker) trước onDone, đúng một lần');
  ok(fellOk,'rơi xuống thấp hơn mặt bàn nhiều rồi biến mất');
  ok(outOk,'rơi ra ngoài mép bàn');
  ok(noJet,'nhảy bằng chân: không bật lửa phản lực');
  /* b) không có đường: bị vây kín → charge → rise, lửa bật, bay lên rồi mất */
  setup({pl:[[8,0],[0,8]],walls:[['h',3,3],['h',4,3],['v',3,3],['v',3,4]]});
  const idx=4*9+4,nb=[[-1,0],[1,0],[0,-1],[0,1]].filter(([dr,dc])=>!get(`blk(4,4,${dr},${dc})`)).length;
  if(nb===0){
    run(`S.blocker=${idx};(function(){const g=Blocker.s.g;g.visible=true;g.position.set(cellX(4),TOP,cellZ(4));})();globalThis.__ev=[];globalThis.__idx=-1`);
    run(`Blocker.leave({onGo:()=>{__ev.push('go');S.blocker=-1;},onDone:()=>__ev.push('done')})`);
    const tr=runAn();
    ok(tr.kinds.join('>')==='charge>rise','vây kín: charge → rise ('+tr.kinds.join('>')+')');
    ok(tr.jetOnPhases.has('rise')&&tr.jetMax>.9,'bay lên có lửa phản lực');
    ok(tr.maxY>get('TOP')+10,'bay lên rất cao (tối đa '+tr.maxY.toFixed(1)+')');
    ok(get('__ev').join()==='go,done'&&get('Blocker.s.g.visible')===false,'onGo, onDone, rồi ẩn');
    ok(tr.t<5,'thời gian hợp lý ('+tr.t.toFixed(1)+'s)');
  }else ok(false,'thế dựng không vây kín được ô (4,4): sửa tường trong test');
  /* c) mô hình đang ẩn: gọi leave vẫn báo onGo/onDone ngay */
  setup();run(`globalThis.__ev=[];Blocker.s.g.visible=false;Blocker.leave({onGo:()=>__ev.push('go'),onDone:()=>__ev.push('done')})`);
  ok(get('__ev').join()==='go,done','ẩn sẵn: leave báo xong ngay');
}

/* ===== 4b. Lịch xuất hiện ===== */
console.log('Lịch xuất hiện');
{
  const BP=require(path.join(root,'js/blocker-plan.js'));
  const plan={first:[20,30],stay:[5,7],gap:[20,30]};
  let okFirst=true,okStay=true,okGap=true,loops=0;
  for(let g=0;g<200;g++){
    const p=BP.init(plan);if(p.at<20||p.at>30||p.on)okFirst=false;
    let ply=0,state='wait',enterAt=-1,leaveAt=-1;
    while(ply<600){
      ply++;const d=BP.due(p,ply);
      if(d==='enter'){if(state!=='wait'&&state!=='gone')okStay=false;if(leaveAt>=0&&ply-leaveAt<20||leaveAt>=0&&ply-leaveAt>30)okGap=false;enterAt=ply;state='on';BP.done(p,ply,'enter',plan);loops++;}
      else if(d==='leave'){const st=ply-enterAt;if(st<5||st>7)okStay=false;leaveAt=ply;state='gone';BP.done(p,ply,'leave',plan);}
    }
  }
  ok(okFirst,'đầu ván đợi 20-30 nước, chưa có người chặn');
  ok(okStay,'ở lại 5-7 nước');
  ok(okGap,'trống 20-30 nước rồi quay lại');
  ok(loops>=200*8,'lặp mãi mãi trong ván dài ('+loops+' lần vào)');
  /* chậm trễ (đang bận): vẫn trả enter ở các nước sau cho tới khi done */
  const p=BP.init(plan);p.at=10;
  ok(BP.due(p,9)===null&&BP.due(p,10)==='enter'&&BP.due(p,15)==='enter','chưa làm được thì nước sau vẫn đòi tiếp');
  /* tích hợp App: đi từng nước, đúng lịch */
  setup({ai:[null,'dumb']});
  run(`S.bplan={on:false,at:3};CFG.BLOCKER.auto=true`);
  run('S.ply=2;S.turn=0;S.mode="move"');
  run('App.endTurn()');
  ok(run('S.ply')===3&&run('S.event')&&run('S.event.k')==='blocker','đến nước 3: App bắt đầu sự kiện vào theo lịch');
  const at=get('S.bplan');ok(at.on===true&&at.at>=3+5&&at.at<=3+7,'lịch đã đặt lại: ở lại 5-7 nước (rời ở nước '+at.at+')');
  /* sự kiện kết thúc rồi đến giờ rời */
  run('S.event.t0=0;App.eventTick()');runAn();
  ok(run('S.blocker')>=0,'người chặn đã đứng ở ô '+run('S.blocker'));
  run(`S.ply=${at.at-1};S.turn=0`);run('App.endTurn()');
  ok(run('S.event')&&run('S.event.k')==='leave','đến giờ: App cho người chặn rời đi');
  const at2=get('S.bplan');ok(at2.on===false&&at2.at>=at.at+20&&at2.at<=at.at+30,'sau khi rời: trống 20-30 nước (quay lại ở nước '+at2.at+')');
  /* online: không tự gọi */
  setup();run(`S.net={conn:{sync(){}},wait:false};S.bplan={on:false,at:1};S.ply=0;S.turn=0`);run('App.endTurn()');
  ok(run('S.event')===null,'ván online: client không tự gọi người chặn');
}

/* ===== 5'. Sự kiện: tạm dừng hai bên, camera, trình tự ===== */
console.log('Sự kiện (App)');
{
  run('__log.cam.length=0');
  setup({ai:[null,'dumb'],turn:1});
  run(`S.me=0`);
  ok(run('App.blockerEvent()')===true,'blockerEvent() bắt đầu được');
  ok(run('S.event.ph')==='wait','pha chờ');
  ok(run('humanTurn()')===false,'người chơi không bấm được');
  const before=JSON.stringify(get('S.pl'));
  run('App.aiStep()');ok(JSON.stringify(get('S.pl'))===before&&get('S.ply')===0,'máy không đi khi có sự kiện');
  ok(run('App.blockerEvent()')===false,'không gọi chồng hai sự kiện');
  run('Pawns.list[0].q.push({r:5,c:4})');
  run('App.eventTick()');ok(run('S.event.ph')==='wait'&&get('__log.cam').length===0,'đợi quân diễn xong rồi mới vào');
  run('Pawns.list[0].q.length=0;S.event.t0=0');
  run('App.eventTick()');
  ok(run('S.event.ph')==='go'&&get('__log.cam')[0][0]==='lock','hết chờ: khóa camera và bắt đầu');
  let t=0;while(t<20&&get('Blocker.an')){run('Blocker.update(1/60)');t+=1/60;}
  ok(get('S.event')===null,'xong: gỡ sự kiện');
  ok(get('__log.cam').map(x=>x[0]).join()==='lock,unlock','camera khóa rồi gỡ đúng một lần');
  ok(get('S.blocker')>=0,'S.blocker đã ghi ô ('+get('S.blocker')+')');
  ok(run('humanTurn()')===false&&run('S.turn')===1,'lượt vẫn của máy (không mất/đổi lượt)');
  const bk=get('S.blocker'),br=(bk/9)|0,bc=bk%9;
  ok(!get('moves(0)').some(m=>m[0]===br&&m[1]===bc)&&!get('moves(1)').some(m=>m[0]===br&&m[1]===bc),'không quân nào đi được vào ô có người chặn');
  ok(run('App.blockerEvent()')===false,'đã có người chặn thì không gọi thêm');
  run('globalThis.__cam0=__log.cam.length');
  ok(run('App.blockerLeave()')===true,'blockerLeave() bắt đầu');
  run('S.event.t0=0;App.eventTick()');
  t=0;while(t<30&&get('Blocker.an')){run('Blocker.update(1/60)');t+=1/60;}
  ok(get('S.event')===null&&get('S.blocker')===-1,'rời xong: S.blocker=-1, hết sự kiện');
  ok(get('Blocker.s.g.visible')===false,'ẩn mô hình sau khi rời');
  ok(get('__log.cam').slice(get('__cam0')).map(x=>x[0]).join()==='lock,unlock','camera khóa/gỡ khi rời');
  ok(get('moves(0)').length>0,'ô trống lại, quân đi được');
}

/* ===== 5. Tin server xếp hàng trong sự kiện ===== */
console.log('Online: tin xếp hàng');
{
  setup();
  run(`S.net={conn:{sync(){globalThis.__sync=(globalThis.__sync||0)+1;}},wait:false};App.netReady=true;App.netQ=[]`);   /* S.chaos=true (mặc định của setup): người chặn đường chỉ có ở Hỗn Loạn */
  run('App.blockerEvent()');
  run(`App.netIn('opponentStatus',{online:false})`);
  ok(get('App.netQ').length===1,'tin của server bị giữ lại trong lúc sự kiện');
  run('S.event.t0=0;App.eventTick()');let t=0;while(t<20&&get('Blocker.an')){run('Blocker.update(1/60)');t+=1/60;}
  ok(get('App.netQ').length===0&&get('S.net.oppOnline')===false,'xong sự kiện: tin được xử lý (oppOnline=false)');
}

/* ===== 5a. Server báo fx{t:'blocker'} → client diễn sự kiện (Hỗn Loạn) ===== */
console.log('Online: fx của server');
{
  const msg=(fx,over=false)=>`({by:0,action:{move:[7,4]},pl:[{r:7,c:4},{r:0,c:4}],left:[10,10],stuck:[false,false],ply:1,turn:1,over:${over},fx:${JSON.stringify(fx)}})`;
  setup();run(`S.net={conn:{sync(){}},wait:false};App.netReady=true;App.netQ=[]`);
  run(`App.netApplyChaos(${msg([{t:'blocker',cell:[4,4]}])})`);
  ok(get('S.event&&S.event.k')==='blocker'&&get('S.event.cell')===40,'fx vào: bắt đầu sự kiện ở đúng ô (r4,c4)');
  setup();run(`S.net={conn:{sync(){}},wait:false};App.netReady=true;App.netQ=[];S.blocker=40`);
  run(`App.netApplyChaos(${msg([{t:'blocker',leave:true}])})`);
  ok(get('S.event&&S.event.k')==='leave','fx rời: bắt đầu sự kiện rời đi');
  setup({chaos:false});run(`S.net={conn:{sync(){}},wait:false};App.netReady=true;App.netQ=[]`);
  run(`App.netApplyChaos(${msg([{t:'blocker',cell:[4,4]}])})`);
  ok(get('S.event')===null,'Classic: bỏ qua fx người chặn đường nếu lỡ nhận');
}

/* ===== 5b. Classic: KHÔNG có người chặn đường ===== */
console.log('Classic không có người chặn');
{
  setup({chaos:false});
  ok(get('App.blockerEvent()')===false&&get('S.event')===null&&get('S.blocker')===-1,'Classic: blockerEvent() không làm gì');
  run('S.blocker=4*9+4');ok(get('App.blockerLeave()')===false&&get('S.event')===null,'Classic: blockerLeave() không làm gì');
  setup({chaos:false});
  run(`S.bplan={on:false,at:0};CFG.BLOCKER.auto=true;S.ply=5`);run('App.endTurn()');
  ok(get('S.event')===null&&get('S.blocker')===-1,'Classic: tới giờ lịch cũng không có người chặn');
  setup({chaos:false});
  run(`S.net={conn:{sync(){}},wait:false};App.netReady=true;App.netQ=[]`);
  ok(get('S.chaos')===false,'Classic: S.chaos=false');
}

/* ===== 6. Mọi AI đều né người chặn ===== */
console.log('AI');
{
  const ids=get('AIs.list.map(a=>a.id)');
  ok(ids.length>=8,'có đủ AI để thử ('+ids.join(',')+')');
  for(const id of ids){
    let bad=0,n=0;
    for(let t=0;t<40;t++){
      const rnd=m=>Math.floor(Math.random()*m);
      const pl=[[1+rnd(7),rnd(9)],[1+rnd(7),rnd(9)]];if(pl[0][0]===pl[1][0]&&pl[0][1]===pl[1][1])continue;
      const turn=rnd(2);
      setup({pl,turn});
      run(`(function(){for(let i=0;i<${rnd(7)};i++){const o=['h','v'][Math.floor(Math.random()*2)],r=Math.floor(Math.random()*8),c=Math.floor(Math.random()*8);if(canWall(o,r,c))setW(o,r,c,1);}})()`);
      const idx=get('Blocker.pick()');if(idx<0)continue;
      run(`S.blocker=${idx};S.ply=${2+rnd(20)}`);
      let act;try{act=JSON.parse(run(`JSON.stringify(AIs.get('${id}').decide(${turn}))`));}catch(e){bad++;console.log('   lỗi',id,e.message);continue;}
      n++;
      if(act.move){if(!get(`moves(${turn})`).some(m=>m[0]===act.move[0]&&m[1]===act.move[1]))bad++;}
      else if(act.wall){if(!get(`canWall('${act.wall.o}',${act.wall.r},${act.wall.c})`))bad++;}
      else bad++;
    }
    ok(bad===0,id+': '+n+' thế có người chặn, mọi nước đều hợp lệ ('+bad+' sai)');
  }
}

console.log(fails?'\n'+fails+' / '+checks+' kiểm tra SAI':'\nTất cả '+checks+' kiểm tra đạt');
process.exit(fails?1:0);
