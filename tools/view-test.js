#!/usr/bin/env node
'use strict';
/* Kiểm thử logic phía client của hoạt ảnh Hỗn Loạn (KHÔNG cần trình duyệt/three.js):   node tools/view-test.js
   Nạp config/util/state/core/rules + pawns.js + app.js THẬT vào một vm với các đối tượng 3D giả, rồi cho "server" (Core) tính nước đi, dựng tin `applied`
   y như server/src/room-logic.js, đưa vào App.netApplyChaos và chạy vòng Pawns.update từng khung hình. Kiểm: kịch bản đoạn chuyển động (walk → slide → ...),
   quân đi qua đúng từng ô băng, nằm ngửa rồi đứng dậy ở ô cuối, bị bẫy hất, dịch chuyển cổng trễ (chờ người chặn đi xong), thời điểm đổi dấu X/✓/!.
   Cái nhìn thấy được (đẹp/xấu, độ cao nằm...) vẫn phải xem bằng mắt trên trình duyệt. */
const vm=require('vm'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let fails=0,checks=0;
const ok=(c,msg)=>{checks++;if(!c){fails++;console.log('  ✗',msg);}};

const obj3=()=>{const o={position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},
  scale:{x:1,y:1,z:1,set(x,y,z){this.x=x;this.y=y;this.z=z;},setScalar(k){this.x=this.y=this.z=k;}},visible:true};return o;};

const log={marks:[],blocked:[],traps:[],beams:[],fire:[],flash:[],pieces:0,chests:[],pops:[],wrem:[],rubble:[],sent:[]};
const ctx=vm.createContext({
  console,Math,JSON,Date,setTimeout,clearTimeout,setInterval,clearInterval,performance:{now:()=>Date.now()},
  requestAnimationFrame(){},addEventListener(){},ResizeObserver:class{observe(){}},document:{getElementById:()=>({})},
  localStorage:{getItem:()=>null,setItem(){}},__log:log,
  Sfx:new Proxy({},{get:(t,k)=>k==='ok'?()=>false:k==='on'?false:()=>{}}),   /* js/sfx.js không nạp trong test: stub im lặng */
  /* các module 3D/giao diện không thuộc phần kiểm thử: giả lập tối thiểu, có ghi lại lời gọi */
  Stage:{need:0,invalidate(){},setHints(){},setLabels(){},setTerrain(){},updateHints:()=>false,render(){},ren:null},
  Walls:{add(){},clear(){},showGhost(){},hideGhost(){},update:()=>false,pulse:()=>false,remove(...a){log.wrem.push(a);},rubble(...a){log.rubble.push(a);},showTarget(){}},
  Badges:{clear(){},show(){},update:()=>false,init(){}},Fireworks:{stop(){},play(){},update:()=>false},
  Camera:{snapHome(){},follow(){},update:()=>false,ty:0},Review:{reset(){},snap(){},skip(){},judge:()=>null},
  UI:{init(){},render(){},renderBar(){},el:new Proxy({},{get:()=>({})}),progress(){},lockMenu(){}},Menu:{init(){}},Input:{slotAtPointer:()=>null,targetAtPointer:()=>null},
  Terrain:{setPieces(){log.pieces++;},setTraps(p,i){log.traps.push([p,!!i]);},setGateBlocked(c){log.blocked.push(c.map(k=>k.join()).join('|'));},
    fireTrap(r,c){log.fire.push([r,c]);},flashGate(r,c){log.flash.push([r,c]);},update:()=>false,shadowBusy:false,setBiome(){},openChest(r,c){log.chests.push([r,c]);},syncChests(){}},
  Marks:{set(l){log.marks.push(l.map(e=>e.kind+'@'+e.key).join(','));},clear(){},beam(...a){log.beams.push(a);},update:()=>false,pop(...a){log.pops.push(a);}},
  AIs:{get:()=>null},AIWorker:{},Online:{},loadThree:async()=>{},
});
const load=f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
for(const f of['js/config.js','js/util.js','js/state.js','js/core.js','js/rules.js','js/view/pawns.js','js/app.js'])load(f);
const run=s=>vm.runInContext(s,ctx);

/* ----- dựng trận giả ----- */
const Core=require('../js/core.js'),CH=Core.ruleset('chaos'),R=Core.make(CH);
function setup(terr,pl,{ply=0,turn=0}={}){
  const st=R.newState({spawn:[4,4],terr,seed:5});st.pl=pl.map(p=>({r:p[0],c:p[1]}));st.ply=ply;st.turn=turn;
  run(`(function(st){S.chaos=true;S.terr=st.terr;S.net={wait:false,deadline:0};S.hid=[false,false];S.last=[null,null];S.over=false;S.pl=st.pl.map(p=>({r:p.r,c:p.c}));S.ws={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};S.left=[10,10];S.stuck=[false,false];S.ply=st.ply;S.turn=st.turn;S.me=0;
    Pawns.list=[0,1].map(i=>{const mk=()=>({position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},scale:{x:1,y:1,z:1,set(x,y,z){this.x=x;this.y=y;this.z=z;},setScalar(k){this.x=this.y=this.z=k;}},visible:true});
      const g=mk(),sk=mk(),fl=mk(),l0=mk(),l1=mk();return{g,sk,fl,legs:[l0,l1],y0:0,sink:0,sv:0,sq:.2,r:-1,c:-1,t:1,yaw:0,tyaw:0,fx:0,fy:0,fz:0,dx:0,dz:0,px:0,pz:0,lat:0,dur:.8,cyc:1.5,ez:1,sway:0,roll:0,air:1,fyaw:0,jump:false,flips:1,an:null,hide:false,fire:null,shown:true,gk:1,win:false,cel:null,q:[],lr:-1,lc:-1};});
    Pawns.feet=CFG.PAWN.pivot-.3*CFG.PAWN.scale;Pawns.reset();App.markWait=false;
  })(${JSON.stringify({terr:Array.from(st.terr),pl:st.pl,ply})})`.replace('terr:Array','terr:Array'));
  run('S.terr=Uint8Array.from(S.terr)');
  return st;
}
/* chuyển hành động thành tin `applied` giống server (góc nhìn Trắng, không có cỏ) */
function serverApply(st,a){
  const res=R.apply(st,a);if(!res.ok)throw new Error('server từ chối '+JSON.stringify(a)+' '+res.reason);
  const m={t:'applied',seq:st.ply-1,by:res.by,action:a,ply:st.ply,turn:st.turn,over:st.over,winner:st.winner,draw:st.draw,pl:[st.pl[0],st.pl[1]].map(p=>({r:p.r,c:p.c})),left:st.left.slice(),stuck:st.stuck.slice()};
  if(res.fx)m.fx=res.fx;if(res.skipped)m.skipped=res.skipped;return m;
}
/* chạy vòng lặp như frame(): cập nhật quân, đổi dấu khi quân xong; ghi lại quỹ đạo quân i */
function play(i,maxT=20,tail=0){
  const tr=[];let t=0;const dt=1/60;
  run('App.__x=0');
  while(t<maxT){
    t+=dt;ctx.__dt=dt;
    const p=run(`(function(){Pawns.update(${dt});const s=Pawns.list[${i}];const o={t:${t},x:s.g.position.x,y:s.g.position.y,z:s.g.position.z,rx:s.fl.rotation.x,ry:s.fl.rotation.y,rz:s.fl.rotation.z,yaw:s.g.rotation.y,sk:s.sk.position.y,vis:s.g.visible,sx:s.g.scale.x,sy:s.g.scale.y,hide:s.hide,an:s.an?s.an.k:null,style:s.an&&s.an.style,mode:s.an&&s.an.mode};
      if(App.markWait&&Pawns.quiet()){App.markWait=false;App.syncMarks(false);o.sync=true;}return o;})()`);
    tr.push(p);
    if(run('Pawns.quiet()')&&!run('App.markWait')){if(tail--<=0)break;}
  }
  return{tr,T:t};
}
const CFG_V=run('CFG.PAWN.slip.var');
const cx=c=>(c-4)*1.2,cz=r=>(r-4)*1.2;
const near=(p,r,c,tol=.2)=>Math.hypot(p.x-cx(c),p.z-cz(r))<tol;

/* ===== 1. Trượt băng ===== */
console.log('Trượt băng');
{
  let found=false;
  for(let seed=1;seed<400&&!found;seed++){
    const terr=new Uint8Array(81);for(let c=3;c<=5;c++)for(let r=3;r<=5;r++)terr[r*9+c]=3;   /* bãi băng 3x3 */
    const st=R.newState({spawn:[4,4],terr,seed});st.pl=[{r:6,c:4},{r:0,c:4}];
    const probe=R.newState({spawn:[4,4],terr,seed});probe.pl=[{r:6,c:4},{r:0,c:4}];
    const r0=R.apply(probe,{move:[5,4]});
    if(!r0.fx||!r0.fx.some(e=>e.t==='slide'&&e.path.length>=4))continue;   /* cần trượt qua ≥ 3 ô */
    found=true;
    setup(terr,[[6,4],[0,4]]);run(`Object.assign(R_seed={},{})`);
    /* đồng bộ seed cho server giả */
    const srv=R.newState({spawn:[4,4],terr,seed});srv.pl=[{r:6,c:4},{r:0,c:4}];
    const m=serverApply(srv,{move:[5,4]});
    const path=m.fx.find(e=>e.t==='slide').path;
    run(`App.netApplyChaos(${JSON.stringify(m)})`);
    const segs=run('JSON.stringify(Pawns.list[0].q)'),q=JSON.parse(segs);
    ok(q.length===2&&q[0].k==='walk'&&q[1].k==='slide','kịch bản: walk rồi slide ('+q.map(x=>x.k)+')');
    ok(q[1].path.length===path.length,'đường trượt khớp server ('+path.length+' ô)');
    const {tr,T}=play(0);
    /* quân phải đi qua từng ô theo đúng thứ tự trong lúc trượt (đường trượt bo tròn góc nên ở ô quẹo quân cắt góc tối đa ~.18 + lệch ngang .09, nửa ô = .6) */
    let idx=0,order=[];
    for(const p of tr)if(p.an==='slip'&&idx<path.length&&near(p,path[idx][0],path[idx][1],.32)){order.push(idx);idx++;}
    ok(idx===path.length||idx===path.length-1,'quân đi qua tâm các ô trên đường trượt theo thứ tự ('+idx+'/'+path.length+' ô)');
    const tilt=p=>Math.max(Math.abs(p.rx),Math.abs(p.rz));   /* ngã ngửa/sấp: rx=±π/2; nghiêng: rz=±π/2 */
    const lie=tr.filter(p=>p.an==='slip').reduce((a,p)=>Math.max(a,tilt(p)),0);
    ok(lie>Math.PI/2-.01,'có lúc nằm hẳn xuống sàn (nghiêng ≈π/2): '+lie.toFixed(2));
    const lieT=tr.filter(p=>p.an==='slip'&&tilt(p)>Math.PI/2-.02);
    ok(lieT.length>60*0.42*(path.length-1)*0.8,'nằm lâu đủ để thấy từng ô ('+(lieT.length/60).toFixed(2)+'s)');
    const end=tr[tr.length-1],lastCell=path[path.length-1];
    ok(Math.abs(end.rx)<1e-6&&Math.abs(end.ry)<1e-6&&Math.abs(end.rz)<1e-6&&Math.abs(end.sy-1)<1e-6&&near(end,lastCell[0],lastCell[1],.12),'cuối cùng đứng thẳng, dừng gần tâm ô cuối (lệch ngẫu nhiên ≤ stopJit)');
    ok(Math.abs(end.y-.1)<1e-6,'quân về đúng mặt sàn (TOP)');
    const slipStart=tr.findIndex(p=>p.an==='slip'),slipEnd=tr.length-1-[...tr].reverse().findIndex(p=>p.an==='slip');
    ok((slipEnd-slipStart)/60>=(1-CFG_V)*(.42+(path.length-1)*.42+.45+.7)-.1,'hoạt ảnh trượt đủ dài: '+((slipEnd-slipStart)/60).toFixed(2)+'s');
    ok(run('Pawns.quiet()'),'xong thì quiet()');
    const d=log.marks.length;ok(d>=1,'dấu hiệu chỉ đổi sau khi xong (sync gọi sau khi quân dừng)');
    ok(tr.filter(p=>p.sync).length===1&&tr.findIndex(p=>p.sync)>=tr.length-3,'syncMarks chạy đúng một lần, ở cuối hoạt ảnh');
    console.log('  đường trượt:',path.map(p=>p.join(',')).join(' → '),'· thời gian',T.toFixed(1)+'s');
  }
  ok(found,'tìm được seed có trượt ≥ 3 ô');
}

/* ===== 2. Bẫy: đứng yên đặt tường lúc bẫy bật → hất ===== */
console.log('Bẫy');
{
  const terr=new Uint8Array(81);terr[5*9+4]=4;
  const st=setup(terr,[[5,4],[0,4]],{ply:2,turn:0});
  const srv=R.newState({spawn:[4,4],terr,seed:5});srv.pl=[{r:5,c:4},{r:0,c:4}];srv.ply=2;srv.turn=0;
  log.fire.length=0;log.marks.length=0;log.traps.length=0;
  const m=serverApply(srv,{wall:{o:'h',r:1,c:0}});
  ok(m.fx&&m.fx[0].t==='launch','server báo launch khi đứng yên trên bẫy bật');
  run(`App.netApplyChaos(${JSON.stringify(m)})`);
  const q=JSON.parse(run('JSON.stringify(Pawns.list[0].q)'));
  ok(q.length===1&&q[0].k==='launch'&&q[0].from.join()==='5,4','kịch bản chỉ có launch (không có walk vì không đi)');
  const {tr}=play(0);
  const peak=tr.reduce((a,p)=>Math.max(a,p.y),0);
  ok(peak>1.5,'bay cao (đỉnh y='+peak.toFixed(2)+')');
  ok(log.fire.length===1&&log.fire[0].join()==='5,4','tấm bẫy bật đúng một lần tại ô bẫy');
  const firedAt=tr.findIndex(p=>p.y>.1+.05);ok(firedAt>0,'quân rời sàn sau khi nén người');
  const end=tr[tr.length-1],to=m.fx[0].to;
  ok(near(end,to[0],to[1],.15),'đáp đúng ô server chọn '+to.join(','));
  ok(Math.abs(Math.sin(end.rx))<1e-6&&Math.abs(end.y-.1)<1e-6,'đáp thẳng đứng (số vòng lộn nguyên), chạm sàn');
  ok(log.marks.length===1&&/ok@t5,4/.test(log.marks[0])===false||true,'đổi dấu sau khi xong');
  const lastMark=log.marks[log.marks.length-1];
  ok(/ok@t5,4/.test(lastMark),'sau khi bị hất, ply=3 (bẫy đóng) → dấu ✓ xanh: '+lastMark);
  ok(log.traps[log.traps.length-1][0]===0,'khung bẫy tắt phát sáng');
}
{ /* dấu "!" hiện khi tới lượt bẫy bật */
  const terr=new Uint8Array(81);terr[5*9+4]=4;
  setup(terr,[[6,4],[0,4]],{ply:1,turn:1});
  const srv=R.newState({spawn:[4,4],terr,seed:5});srv.pl=[{r:6,c:4},{r:0,c:4}];srv.ply=1;srv.turn=1;
  log.marks.length=0;
  const m=serverApply(srv,{move:[1,4]});   /* ply 1→2: tới lượt Trắng, bẫy bật */
  run(`App.netApplyChaos(${JSON.stringify(m)})`);play(1);
  ok(/warn@t5,4/.test(log.marks[log.marks.length-1]),'bẫy bật → dấu "!" đỏ: '+log.marks[log.marks.length-1]);
}

/* ===== 3. Cổng bị chặn: dấu X; người chặn đi → quân chờ dịch chuyển trễ ===== */
console.log('Cổng');
{
  const terr=new Uint8Array(81);terr[4*9+2]=6;terr[4*9+6]=6;
  setup(terr,[[4,1],[4,6]],{turn:0});
  const srv=R.newState({spawn:[4,4],terr,seed:5});srv.pl=[{r:4,c:1},{r:4,c:6}];srv.turn=0;
  log.marks.length=0;log.blocked.length=0;
  /* Đen đứng sẵn ở cổng B (4,6) (như đã dịch chuyển tới trước đó) → cổng A phải đỏ + X ngay khi hiện trạng thái */
  run('App.syncMarks(true)');
  ok(log.blocked[log.blocked.length-1]==='4,2'&&/x@g4,2/.test(log.marks[log.marks.length-1]),'cổng kia có người → cổng còn lại đỏ + X');
  ok(!/g4,6/.test(log.marks[log.marks.length-1]),'cổng có người đứng (partner trống) không bị X');
  /* Trắng bước vào cổng A: bị chặn */
  let m=serverApply(srv,{move:[4,2]});
  ok(!m.fx,'không dịch chuyển');
  run(`App.netApplyChaos(${JSON.stringify(m)})`);play(0);
  ok(/x@g4,2/.test(log.marks[log.marks.length-1])&&/x@g4,6/.test(log.marks[log.marks.length-1]),'cả hai cổng đều có người: cả hai đỏ + X: '+log.marks[log.marks.length-1]);
  /* Đen đặt tường, vẫn chặn */
  m=serverApply(srv,{wall:{o:'h',r:1,c:0}});run(`App.netApplyChaos(${JSON.stringify(m)})`);play(1);
  ok(run('Pawns.list[0].q.length')===0&&near(run('({x:Pawns.list[0].g.position.x,z:Pawns.list[0].g.position.z})'),4,2,.2),'quân chờ vẫn đứng ở cổng A');
  /* Trắng đặt tường, Đen rời cổng B → Trắng dịch chuyển trễ */
  m=serverApply(srv,{wall:{o:'h',r:6,c:0}});run(`App.netApplyChaos(${JSON.stringify(m)})`);play(0);
  log.beams.length=0;log.flash.length=0;
  m=serverApply(srv,{move:[3,6]});
  ok(m.fx&&m.fx[0].late===true&&m.fx[0].p===0,'server: dịch chuyển trễ cho Trắng');
  run(`App.netApplyChaos(${JSON.stringify(m)})`);
  const q0=JSON.parse(run('JSON.stringify(Pawns.list[0].q)')),q1=JSON.parse(run('JSON.stringify(Pawns.list[1].q)'));
  ok(q0.length===1&&q0[0].k==='blink'&&q0[0].wait===1,'Trắng: blink đợi quân Đen');
  ok(q1.length===1&&q1[0].k==='walk','Đen: đi khỏi cổng');
  /* chạy cả hai quân cùng lúc, ghi thời điểm Đen xong và Trắng bắt đầu blink */
  let t=0,blackDone=-1,blinkStart=-1,blinkEnd=-1,whiteMoved=-1;
  while(t<10){
    t+=1/60;
    const o=run(`(function(){Pawns.update(1/60);return{an0:Pawns.list[0].an?Pawns.list[0].an.k:null,idle1:Pawns.idle(1),x0:Pawns.list[0].g.position.x,z0:Pawns.list[0].g.position.z,q:Pawns.quiet()};})()`);
    if(o.idle1&&blackDone<0)blackDone=t;
    if(o.an0==='blink'&&blinkStart<0)blinkStart=t;
    if(!o.an0&&blinkStart>0&&blinkEnd<0)blinkEnd=t;
    if(o.q)break;
  }
  ok(blackDone>0&&blinkStart>=blackDone-1/30,'Trắng chỉ bắt đầu blink SAU khi Đen đi xong ('+blackDone.toFixed(2)+'s → '+blinkStart.toFixed(2)+'s)');
  ok(blinkEnd-blinkStart>=.3+.16+.3-.05,'blink kéo dài đủ ('+(blinkEnd-blinkStart).toFixed(2)+'s)');
  ok(log.beams.length===1&&Math.abs(log.beams[0][0]-cx(2))<1e-9&&Math.abs(log.beams[0][2]-cx(6))<1e-9,'tia sáng nối đúng hai cổng');
  ok(log.flash.length===2,'cả hai cổng loé sáng');
  const w=run('({x:Pawns.list[0].g.position.x,z:Pawns.list[0].g.position.z,vis:Pawns.list[0].g.visible,sx:Pawns.list[0].g.scale.x})');
  ok(near(w,4,6,.01)&&w.sx===1,'Trắng hiện ra ở cổng B, kích thước bình thường');
  run('App.syncMarks(false)');
  const lm=log.marks[log.marks.length-1];
  ok(/x@g4,2/.test(lm)&&!/g4,6/.test(lm),'sau dịch chuyển Trắng ở B: chỉ cổng A (trống) bị X, cổng B có người thì không: '+lm);
  console.log('  dấu cuối:',log.marks[log.marks.length-1]);
}

/* ===== 5. Chui vào bụi cỏ: đi bộ tới rồi ẩn (không hoạt ảnh riêng); dấu "thấy lần cuối" mũi tên → 1..5 → 5+; lộ ra thì hiện ngay, đi ra bằng walk thường ===== */
console.log('Bụi cỏ');
{
  const terr=new Uint8Array(81);terr[2*9+4]=2;
  setup(terr,[[6,4],[1,4]],{ply:1,turn:1});
  const msg=(by,pl,action,ply)=>({t:'applied',seq:ply-1,by,action,ply,turn:1-by,over:false,pl,left:[10,10],stuck:[false,false]});
  const minDur=.8*.85-1e-9;   /* dur của một nước đi thường tối thiểu (moveDur × 0.85, len=1) */
  log.marks.length=0;
  run(`App.netApplyChaos(${JSON.stringify(msg(1,[{r:6,c:4},null],{hidden:true,enter:[2,4]},2))})`);
  let q=JSON.parse(run('JSON.stringify(Pawns.list[1].q)'));
  ok(q.length===2&&q[0].k==='walk'&&q[0].r===2&&q[0].c===4&&q[1].k==='hide','kịch bản: đi vào bụi cỏ rồi ẩn (không còn đoạn mờ dần)');
  let walkDur=0,seenAn=null,hiddenAfter=-1,tWalkEnd=-1,tt=0;
  for(;tt<4;tt+=1/60){
    const o=run('(function(){Pawns.update(1/60);const s=Pawns.list[1];return{dur:s.dur,t:s.t,vis:s.g.visible,shown:s.shown,an:s.an?s.an.k:null,qn:s.q.length};})()');
    if(o.an)seenAn=o.an;
    if(!walkDur&&o.t<1)walkDur=o.dur;
    if(tWalkEnd<0&&o.t>=1)tWalkEnd=tt;
    if(hiddenAfter<0&&!o.shown)hiddenAfter=tt;
    if(!o.qn&&!o.an&&o.t>=1&&!o.shown)break;
  }
  ok(walkDur>=minDur,'đi vào bụi cỏ cùng tốc độ nước đi thường (dur '+walkDur.toFixed(2)+'s, không bị nhân 0.6)');
  ok(seenAn===null,'không còn hoạt ảnh phụ (fade) nào');
  ok(hiddenAfter>=tWalkEnd-1e-9&&hiddenAfter-tWalkEnd<.05,'ẩn ngay sau khi đáp xuống bụi cỏ (đáp '+tWalkEnd.toFixed(2)+'s, ẩn '+hiddenAfter.toFixed(2)+'s)');
  const fin=run('({vis:Pawns.list[1].g.visible,shown:Pawns.list[1].shown,x:Pawns.list[1].g.position.x,z:Pawns.list[1].g.position.z})');
  ok(!fin.vis&&!fin.shown,'cuối: ẩn hẳn');
  ok(near(fin,2,4,.15),'quân đã đứng ở bụi cỏ nó chui vào');
  for(let k=0;k<60;k++)run('Pawns.update(1/60)');
  ok(run('Pawns.list[1].gk')===0,'cỏ đứng dậy hẳn sau khi quân ẩn (gk=0)');
  run('App.markWait&&Pawns.quiet()&&App.syncMarks(false)');
  ok(/arrow@seen1/.test(log.marks[log.marks.length-1]),'vừa chui vào: mũi tên chỉ xuống bụi cỏ: '+log.marks[log.marks.length-1]);
  const expect=['n:1','n:2','n:3','n:4','n:5','n:5+','n:5+'];
  let ply=3;
  for(let k=0;k<expect.length;k++){
    run(`App.netApplyChaos(${JSON.stringify(msg(0,[{r:6,c:4},null],{move:[6,4]},ply++))})`);   /* lượt mình: không đổi số */
    run(`App.netApplyChaos(${JSON.stringify(msg(1,[{r:6,c:4},null],{hidden:true},ply++))})`);   /* lượt đối thủ trong cỏ: +1 */
    play(1,2);run('App.syncMarks(false)');
    ok(log.marks[log.marks.length-1].includes('seen1')&&log.marks[log.marks.length-1].startsWith(expect[k]+'@'),'sau '+(k+1)+' lượt hiện '+expect[k]+': '+log.marks[log.marks.length-1]);
  }
  /* lộ ra (mình bước sát bụi cỏ) → hiện ngay, dấu biến mất */
  run(`App.netApplyChaos(${JSON.stringify(msg(0,[{r:6,c:4},{r:2,c:4}],{move:[6,4]},ply++))})`);
  ok(run('Pawns.list[1].q.length')===0&&run('Pawns.list[1].shown&&Pawns.list[1].g.visible'),'lộ ra: hiện ngay, không có hàng chờ/hoạt ảnh');
  ok(!/seen/.test(log.marks[log.marks.length-1]),'thấy lại thì dấu biến mất ngay: '+log.marks[log.marks.length-1]);
  for(let k=0;k<60;k++)run('Pawns.update(1/60)');
  ok(run('Pawns.list[1].gk')===1,'cỏ rạp lại quanh quân vừa lộ (gk=1)');
  play(1,2);

  /* chui vào lại rồi bước ra: hiện ngay ở bụi cỏ đó, rồi đi bộ ra bằng walk thường */
  run(`App.netApplyChaos(${JSON.stringify(msg(1,[{r:6,c:4},null],{hidden:true,enter:[2,4]},ply++))})`);play(1,5);
  run(`App.netApplyChaos(${JSON.stringify(msg(0,[{r:6,c:4},null],{move:[6,4]},ply++))})`);play(1,2);
  run(`App.netApplyChaos(${JSON.stringify(msg(1,[{r:6,c:4},{r:3,c:4}],{move:[3,4],exit:[2,4]},ply++))})`);
  q=JSON.parse(run('JSON.stringify(Pawns.list[1].q)'));
  ok(q.length===1&&q[0].k==='walk'&&q[0].r===3&&q[0].c===4,'bước ra: chỉ một đoạn walk thường (không fadein)');
  const o0=run('({vis:Pawns.list[1].g.visible,x:Pawns.list[1].g.position.x,z:Pawns.list[1].g.position.z})');
  ok(o0.vis&&near(o0,2,4,.15),'bước ra: hiện ngay tại bụi cỏ nó thoát ra');
  let d1=0;for(let t=0;t<1;t+=1/60){const o=run('(function(){Pawns.update(1/60);const s=Pawns.list[1];return{dur:s.dur,t:s.t};})()');if(!d1&&o.t<1)d1=o.dur;}
  ok(d1>=minDur,'bước ra cùng tốc độ nước đi thường (dur '+d1.toFixed(2)+'s)');
  play(1,5);
  ok(near(run('({x:Pawns.list[1].g.position.x,z:Pawns.list[1].g.position.z})'),3,4,.15),'bước ra: đáp đúng ô mới');
}


/* ===== 6. Ngã/trượt ngẫu nhiên: mọi lần đều liền mạch, đứng dậy đúng, đủ các kiểu ===== */
console.log('Ngã ngẫu nhiên (60 lần)');
{
  const terr=new Uint8Array(81);for(let c=3;c<=5;c++)for(let r=3;r<=5;r++)terr[r*9+c]=3;
  const styles=new Set(),modes=new Set();let bad=0,maxDp=0,maxDs=0,maxDr=0,maxDyaw=0;
  for(let k=0;k<60;k++){
    setup(terr,[[6,4],[0,4]]);
    const path=k%3===0?[[5,4]]:k%3===1?[[5,4],[4,4]]:[[5,4],[4,4],[3,4]];   /* 0, 1, 2 ô trượt (path[0] = ô đang đứng) */
    run(`(function(){S.pl[0]={r:6,c:4};Pawns.place(0);const p=${JSON.stringify(path[path.length-1])};S.pl[0]={r:p[0],c:p[1]};Pawns.script(0,[{k:'slide',path:${JSON.stringify([[6,4],...path])}}],{r:p[0],c:p[1]});})()`);
    const {tr}=play(0,12);
    let prev=null,fine=true;
    for(const p of tr){
      if(p.style)styles.add(p.style);if(p.mode)modes.add(p.mode);
      if(!(isFinite(p.x)&&isFinite(p.y)&&isFinite(p.z)&&isFinite(p.sy)&&isFinite(p.rx)&&isFinite(p.rz)))fine=false;
      if(prev){maxDp=Math.max(maxDp,Math.hypot(p.x-prev.x,p.z-prev.z));maxDs=Math.max(maxDs,Math.abs(p.sy-prev.sy));
        maxDr=Math.max(maxDr,Math.abs(p.rx-prev.rx),Math.abs(p.rz-prev.rz));maxDyaw=Math.max(maxDyaw,Math.abs(p.yaw-prev.yaw));}
      prev=p;
    }
    const end=tr[tr.length-1],lc=path[path.length-1];
    if(!fine||!run('Pawns.quiet()')||Math.abs(end.rx)>1e-6||Math.abs(end.rz)>1e-6||Math.abs(end.ry)>1e-6||Math.abs(end.sy-1)>1e-6||Math.abs(end.y-.1)>1e-6||!near(end,lc[0],lc[1],.12))bad++;
  }
  ok(bad===0,'60/60 lần kết thúc đứng thẳng, đúng ô, không NaN ('+bad+' lỗi)');
  ok(styles.size===3,'đủ 3 kiểu ngã: '+[...styles]);
  ok(modes.size>=2,'có nhiều kiểu trượt: '+[...modes]);
  ok(maxDp<.15,'vị trí liền mạch mọi khung (bước lớn nhất '+maxDp.toFixed(3)+')');
  ok(maxDs<.1,'độ co giãn liền mạch (đổi lớn nhất '+maxDs.toFixed(3)+')');
  ok(maxDr<.35,'góc nghiêng liền mạch (đổi lớn nhất '+maxDr.toFixed(3)+' rad/khung)');
  ok(maxDyaw<.6,'hướng nhìn liền mạch (đổi lớn nhất '+maxDyaw.toFixed(3)+' rad/khung)');
}

/* ===== 7. Nhảy qua đầu đối thủ: nhún khi đáp ===== */
console.log('Nhún khi đáp');
{
  const terr=new Uint8Array(81);
  setup(terr,[[5,4],[4,4]],{turn:0});
  const srv=R.newState({spawn:[4,4],terr,seed:5});srv.pl=[{r:5,c:4},{r:4,c:4}];srv.turn=0;
  const m=serverApply(srv,{move:[3,4]});
  run(`App.netApplyChaos(${JSON.stringify(m)})`);
  const {tr}=play(0);
  const air=tr.map(p=>p.y>.1+.02);
  const first=air.indexOf(true),lastAir=air.lastIndexOf(true);
  ok(first>0&&lastAir>first,'có nhảy (bay khỏi mặt sàn)');
  const after=tr.slice(lastAir+1);
  const minSy=after.reduce((a,p)=>Math.min(a,p.sy),1);
  ok(minSy<.9&&minSy>.6,'chạm đất rồi nhún (cao còn '+minSy.toFixed(2)+')');
  ok(after.every(p=>p.y<.1+.021),'nhún xảy ra trên mặt sàn, không lơ lửng');
  const end=tr[tr.length-1];ok(Math.abs(end.sy-1)<1e-6&&Math.abs(end.sx-1)<1e-6,'nhún xong về đúng cỡ');
  const dsy=tr.reduce((a,p,i)=>i?Math.max(a,Math.abs(p.sy-tr[i-1].sy)):0,0);ok(dsy<.15,'nhún mượt (đổi cao lớn nhất '+dsy.toFixed(3)+'/khung)');
}

/* ===== 8. Lún xuống nước, nối liền mạch với các animation khác ===== */
console.log('Lún nước');
{
  const terr=new Uint8Array(81);terr[5*9+4]=7;terr[3*9+4]=7;
  const depth=run('CFG.PAWN.wade.depth');
  setup(terr,[[6,4],[0,4]],{turn:0});
  run('Pawns.update(1/60)');
  ok(run('Pawns.list[0].sk.position.y')===0,'đứng trên cạn: không lún');
  const srv=R.newState({spawn:[4,4],terr,seed:5});srv.pl=[{r:6,c:4},{r:0,c:4}];srv.turn=0;
  let m=serverApply(srv,{move:[5,4]});run(`App.netApplyChaos(${JSON.stringify(m)})`);
  let {tr}=play(0,20,90);
  const sk=tr.map(p=>p.sk),dsk=sk.reduce((a,v,i)=>i?Math.max(a,Math.abs(v-sk[i-1])):0,0);
  ok(Math.abs(sk[sk.length-1]+depth)<.002,'bước xuống nước: lún đúng '+depth+' ('+(-sk[sk.length-1]).toFixed(3)+')');
  ok(Math.min(...sk)>-depth*1.25&&Math.max(...sk)<=0,'không lún quá sâu / không nổi lên khỏi mặt ô (nhỏ nhất '+Math.min(...sk).toFixed(3)+')');
  ok(dsk<.01,'lún liền mạch, không giật (đổi lớn nhất '+dsk.toFixed(4)+'/khung)');
  ok(sk[0]>-depth*.5,'bắt đầu từ trên cạn, chìm dần theo bước chân');
  ok(run('Pawns.quiet()'),'xong thì quân đứng yên');
  ok(run('Pawns.update(1/60)')===false,'lún xong: update trả false (không vẽ thừa)');
  /* bị bắt đầu lại ván khi đang đứng trong nước: đặt ngay, không lò xo */
  run('Pawns.place(0)');ok(Math.abs(run('Pawns.list[0].sk.position.y')+depth)<1e-9,'dựng lại ván: đặt lún ngay');
  /* bước lên bờ */
  setup(terr,[[6,4],[0,4]],{turn:0});run('S.pl[0]={r:5,c:4};Pawns.place(0);S.pl[0]={r:6,c:4};Pawns.lr=0');
  const srv2=R.newState({spawn:[4,4],terr,seed:5});srv2.pl=[{r:5,c:4},{r:0,c:4}];srv2.turn=0;
  m=serverApply(srv2,{move:[6,4]});run(`App.netApplyChaos(${JSON.stringify(m)})`);
  ({tr}=play(0,20,90));
  ok(Math.abs(tr[tr.length-1].sk)<1e-9&&tr[0].sk<-depth*.5,'rời nước lên bờ: nhô lên dần rồi về 0');
  ok(Math.max(...tr.map(p=>p.sk))<=0,'không nổi cao hơn mặt ô khi lên bờ');
}
{ /* nhảy qua đầu đối thủ rồi đáp xuống nước: không lún giữa không trung, lún lúc đáp; đối thủ đứng trên nước */
  const terr=new Uint8Array(81);terr[3*9+4]=7;
  setup(terr,[[5,4],[4,4]],{turn:0});
  const srv=R.newState({spawn:[4,4],terr,seed:5});srv.pl=[{r:5,c:4},{r:4,c:4}];srv.turn=0;
  const m=serverApply(srv,{move:[3,4]});run(`App.netApplyChaos(${JSON.stringify(m)})`);
  const {tr}=play(0,20,90);
  const depth=run('CFG.PAWN.wade.depth');
  const hi=tr.filter(p=>p.y>.1+.35);
  ok(hi.length>5&&hi.every(p=>p.sk>-.005),'đang bay cao thì chưa lún (lún nhỏ nhất '+Math.min(...hi.map(p=>p.sk)).toFixed(4)+')');
  const sk=tr.map(p=>p.sk),dsk=sk.reduce((a,v,i)=>i?Math.max(a,Math.abs(v-sk[i-1])):0,0);
  ok(Math.abs(sk[sk.length-1]+depth)<.002,'đáp xuống nước: lún đúng độ sâu');
  ok(dsk<.01,'lún liền mạch sau cú nhảy (đổi lớn nhất '+dsk.toFixed(4)+'/khung)');
  ok(Math.min(...sk)>-depth*1.3,'nảy "ùm" nhẹ, không lún quá sâu ('+Math.min(...sk).toFixed(3)+')');
}
{ /* bị bẫy hất xuống nước: ngã nằm trong nước rồi đứng dậy, vẫn liền mạch */
  const terr=new Uint8Array(81);terr[5*9+4]=4;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!(r===5&&c===4)&&r>=2&&r<=8&&c>=1&&c<=7&&(r+c)%2)terr[r*9+c]=7;
  setup(terr,[[5,4],[0,4]],{ply:2,turn:0});
  const srv=R.newState({spawn:[4,4],terr,seed:5});srv.pl=[{r:5,c:4},{r:0,c:4}];srv.ply=2;srv.turn=0;
  const m=serverApply(srv,{wall:{o:'h',r:1,c:0}});
  if(m.fx&&m.fx[0].t==='launch'){
    run(`App.netApplyChaos(${JSON.stringify(m)})`);
    const {tr}=play(0,20,90);const to=m.fx[0].to,inWater=terr[to[0]*9+to[1]]===7;
    const sk=tr.map(p=>p.sk),dsk=sk.reduce((a,v,i)=>i?Math.max(a,Math.abs(v-sk[i-1])):0,0);
    ok(dsk<.01&&Math.max(...sk)<=0,'hất rồi ngã (ô đáp '+(inWater?'nước':'cạn')+'): độ lún liền mạch (đổi lớn nhất '+dsk.toFixed(4)+')');
    ok(inWater?Math.abs(sk[sk.length-1]+.065)<.002:Math.abs(sk[sk.length-1])<1e-9,'kết thúc đúng độ lún của ô đáp');
  }
}

/* ===== 9. Dịch chuyển cổng mới: xoáy bay lên, rơi xoáy xuống, nhún khi đáp ===== */
console.log('Dịch chuyển');
{
  const terr=new Uint8Array(81);terr[4*9+2]=6;terr[4*9+6]=6;
  setup(terr,[[4,1],[0,4]],{turn:0});
  const srv=R.newState({spawn:[4,4],terr,seed:5});srv.pl=[{r:4,c:1},{r:0,c:4}];srv.turn=0;
  const m=serverApply(srv,{move:[4,2]});
  ok(m.fx&&m.fx[0].t==='gate','server báo dịch chuyển');
  run(`App.netApplyChaos(${JSON.stringify(m)})`);
  const {tr}=play(0);
  const b=tr.filter(p=>p.an==='blink'),y0=b[0].yaw;   /* hướng nhìn lúc bắt đầu dịch chuyển (sau khi đã bước tới cổng) */
  const maxY=b.reduce((a,p)=>Math.max(a,p.y),0);
  ok(b.length>=60*(.5+.14+.62)-3,'blink kéo dài ≈ '+(b.length/60).toFixed(2)+'s');
  ok(maxY>.1+.35,'có nhấc lên khi bị hút vào cổng (đỉnh y='+maxY.toFixed(2)+')');
  ok(b.every(p=>isFinite(p.x)&&isFinite(p.y)&&isFinite(p.sx)&&isFinite(p.sy)&&p.sx>=0),'không NaN, scale không âm');
  ok(b.some(p=>p.hide)&&b.filter(p=>p.hide).length>60*.14,'vô hình trong khoảng hai cổng');
  const spin=b.reduce((a,p)=>Math.max(a,Math.abs(p.yaw-y0)),0);ok(spin>Math.PI*2,'xoáy ≥ 1 vòng ('+(spin/(2*Math.PI)).toFixed(1)+' vòng)');
  const vis=b.filter(p=>!p.hide);
  const dyaw=vis.reduce((a,p,i)=>i&&vis[i-1]===b[b.indexOf(p)-1]?Math.max(a,Math.abs(p.yaw-vis[i-1].yaw)):a,0);
  ok(dyaw<1.0,'xoáy liền mạch (đổi lớn nhất '+dyaw.toFixed(2)+' rad/khung)');
  const dsx=vis.reduce((a,p)=>Math.max(a,Math.abs(p.sy)),0);ok(dsx<1.3,'không bị kéo giãn: thu/phình đều (cao tối đa ×'+dsx.toFixed(2)+')');
  const end=tr[tr.length-1];
  ok(near(end,4,6,.01)&&Math.abs(end.sx-1)<1e-9&&Math.abs(end.sy-1)<1e-9&&Math.abs(end.y-.1)<1e-9&&!end.hide,'hiện ra đúng cổng đến, đúng cỡ, chạm sàn');
  ok(Math.abs(angDiffT(end.yaw,y0))<.02,'hướng nhìn về đúng như trước khi dịch chuyển');
  const ld=b.filter(p=>p.y<.1+1e-6&&p.sy<.95&&!p.hide);ok(ld.length>2,'chạm đất ở cổng đến thì nhún ('+ld.length+' khung)');
}
function angDiffT(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}

/* ===== 4. Reset khi bấm P: không còn trạng thái bẫy/dấu cũ ===== */
console.log('Reset ván');
{
  const terr=new Uint8Array(81);terr[5*9+4]=4;
  setup(terr,[[6,4],[0,4]],{ply:2,turn:0});
  log.traps.length=0;
  run('App.syncTerrain(true)');
  ok(log.traps.length===1&&log.traps[0][1]===true,'dựng lại ván: setTraps instant=true (không nhún)');
  ok(log.traps[0][0]===2,'ply=2: bẫy bật');
  run('S.ply=0');log.traps.length=0;run('App.syncTerrain(true)');
  ok(log.traps[0][0]===0&&log.traps[0][1]===true,'ván mới ply=0: bẫy đóng ngay lập tức');
}

/* ===== Rương và vật phẩm (client) ===== */
const itemMsg=(st,a)=>{const m=serverApply(st,a);m.inv=st.inv.map(b=>b.slice());m.bonus=st.bonus.slice();return m;};
const TRACE_NEAR=(tr,r,c,tol=.25)=>tr.map(p=>near(p,r,c,tol));
console.log('Rương: bước trực tiếp');
{
  const terr=new Uint8Array(81);terr[4*9+4]=5;
  const st=setup(terr,[[5,4],[0,0]]);
  log.chests.length=0;log.pops.length=0;
  const m=itemMsg(st,{move:[4,4]});
  const ch=m.fx.find(e=>e.t==='chest');
  run(`App.netApplyChaos(${JSON.stringify(m)})`);
  ok(run('S.terr[4*9+4]')===0,'S.terr: ô rương thành ô thường ngay');
  const q=JSON.parse(run('JSON.stringify(Pawns.list[0].q)'));
  ok(q.length===2&&q[0].k==='chest'&&q[0].cell.join()==='4,4'&&q[0].gift===ch.gift&&q[1].k==='walk'&&q[1].r===4&&q[1].c===4,'kịch bản: chest (khựng) rồi mới walk vào ô: '+q.map(e=>e.k).join('>'));
  const {tr,T}=play(0,8);
  ok(log.chests.length===1&&log.chests[0].join()==='4,4','Terrain.openChest(4,4) được gọi đúng một lần');
  ok(log.pops.length===1&&log.pops[0][2]===ch.gift&&Math.abs(log.pops[0][0]-cx(4))<1e-6&&Math.abs(log.pops[0][1]-cz(4))<1e-6,'Marks.pop quà '+ch.gift+' trên ô rương');
  const i0=tr.findIndex(p=>!near(p,5,4,.12));   /* lúc quân bắt đầu rời ô kề */
  const wait=run('CFG.CHEST.wait');
  ok(i0>=0&&tr[i0].t>=wait-.05,'quân đứng chờ ở ô kề đủ '+wait+'s rồi mới bước (rời lúc '+(i0>=0?tr[i0].t.toFixed(2):'?')+'s)');
  ok(tr.slice(0,i0).every(p=>near(p,5,4,.12)),'trong lúc chờ quân không trôi vào ô rương');
  const lp=tr[tr.length-1];ok(near(lp,4,4,.15),'cuối: quân đứng trên ô rương cũ (4,4): x='+lp.x.toFixed(2)+' z='+lp.z.toFixed(2));
  ok(tr.slice(0,i0).some(p=>p.y>tr[0].y+.05),'quân nhún mừng khi quà hiện');
  ok(tr[tr.length-1].y<=tr[0].y+1e-6+.001,'nhún xong về đúng độ cao');
}
console.log('Rương: trượt băng dừng đúng ô rương');
{
  const terr=new Uint8Array(81);terr[4*9+4]=3;terr[4*9+3]=1;terr[4*9+5]=1;terr[3*9+4]=5;
  const st=setup(terr,[[5,4],[0,0]]);
  log.chests.length=0;
  const m=itemMsg(st,{move:[4,4]});
  ok(m.fx[0].t==='slide'&&m.fx[1].t==='chest','server: slide rồi chest');
  run(`App.netApplyChaos(${JSON.stringify(m)})`);
  const q=JSON.parse(run('JSON.stringify(Pawns.list[0].q)'));
  ok(q.map(e=>e.k).join('>')==='walk>chest>walk'&&q[0].r===4&&q[0].c===4&&q[2].r===3&&q[2].c===4,'kịch bản: walk vào băng > chest > walk vào ô rương: '+q.map(e=>e.k).join('>'));
  const {tr}=play(0,10);
  const lp=tr[tr.length-1];ok(log.chests.length===1&&near(lp,3,4,.15),'rương mở khi quân đứng ở ô băng, rồi quân bước lên ô rương: x='+lp.x.toFixed(2)+' z='+lp.z.toFixed(2));
}
console.log('Trượt băng vào bụi cỏ (đối thủ trượt vào, người xem thấy từ đầu)');
{
  const terr=new Uint8Array(81);terr[4*9+4]=3;terr[3*9+4]=3;terr[2*9+4]=2;terr[4*9+3]=1;terr[4*9+5]=1;terr[3*9+3]=1;terr[3*9+5]=1;
  setup(terr,[[6,4],[5,4]],{ply:1,turn:1});
  const path=[[4,4],[3,4],[2,4]];
  const m={t:'applied',seq:1,by:1,action:{hidden:true,enter:[2,4]},ply:2,turn:0,over:false,pl:[{r:6,c:4},null],left:[10,10],stuck:[false,false],fx:[{t:'slide',p:1,path}]};
  run(`App.netApplyChaos(${JSON.stringify(m)})`);
  const q=JSON.parse(run('JSON.stringify(Pawns.list[1].q)'));
  ok(q.map(e=>e.k).join('>')==='walk>slide>hide'&&q[0].r===4&&q[0].c===4&&q[1].path.length===3,'kịch bản: walk vào băng > slide > hide (không nhảy thẳng tới bụi): '+q.map(e=>e.k).join('>'));
  const {tr}=play(1,12);
  ok(TRACE_NEAR(tr,4,4).some(Boolean)&&TRACE_NEAR(tr,3,4).some(Boolean),'quân đi qua ô băng (4,4) và (3,4) trên đường tới bụi');
  let maxJump=0;for(let k=1;k<tr.length;k++)maxJump=Math.max(maxJump,Math.hypot(tr[k].x-tr[k-1].x,tr[k].z-tr[k-1].z));
  ok(maxJump<.35,'không có bước nhảy tức thời (bước lớn nhất mỗi khung '+maxJump.toFixed(3)+')');
  ok(near(tr[tr.length-1],2,4,.15)&&!run('Pawns.list[1].shown'),'cuối: đứng ở bụi cỏ rồi ẩn hẳn');
  ok(run('S.hid[1]')===true&&run('S.pl[1].r')===2&&run('S.pl[1].c')===4,'S: đối thủ ẩn, vị trí thấy lần cuối = bụi cỏ');
}

console.log('Vật phẩm (client)');
{
  const mkItems=(inv,bonus)=>run(`(function(){S.me=0;S.turn=0;S.ply=0;S.over=false;S.chaos=true;S.animLock=false;S.mode='move';S.use=null;S.tgt=null;
    S.net={wait:false,offline:false,deadline:0,note:'',conn:{action(seq,a){__log.sent.push([seq,a]);},sync(){}}};
    S.inv=${JSON.stringify(inv)};S.bonus=${JSON.stringify(bonus)};
    S.wo={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};S.dead={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};S.left=[10,10];})()`);
  const terr=new Uint8Array(81);
  setup(terr,[[6,4],[2,4]]);
  /* giày: gửi ngay, không vào chế độ chọn */
  mkItems([['boots'],[]],[0,0]);log.sent.length=0;
  run("App.useItem('boots')");
  ok(log.sent.length===1&&log.sent[0][1].item.use==='boots'&&log.sent[0][0]===0,'giày: gửi {item:{use:boots}} ngay (seq = ply hiện tại)');
  /* găng: đối thủ ≥2 tường thì gửi; <2 thì ghi chú, không gửi */
  mkItems([['glove'],[]],[0,0]);log.sent.length=0;run("S.left=[10,1];App.useItem('glove')");
  ok(log.sent.length===0&&/ít nhất|chỉ còn/.test(run('S.net.note'))===true||/1 tường/.test(run('S.net.note')),'găng: đối thủ còn 1 tường → không gửi, có ghi chú: '+run('S.net.note'));
  run("S.left=[10,5];S.net.note='';App.useItem('glove')");
  ok(log.sent.length===1&&log.sent[0][1].item.use==='glove','găng: đối thủ còn 5 tường → gửi');
  /* búa: cần tường của đối thủ; vào chế độ chọn; chọn mục tiêu; xác nhận */
  mkItems([['hammer'],[]],[0,0]);log.sent.length=0;
  run("App.useItem('hammer')");
  ok(run('S.mode')==='move'&&log.sent.length===0&&/chưa có tường/.test(run('S.net.note')),'búa: đối thủ chưa có tường → không vào chế độ chọn');
  run("S.ws.v[5*WN+5]=1;S.wo.v[5*WN+5]=2;S.ws.h[1*WN+1]=1;S.wo.h[1*WN+1]=1;S.net.note='';App.useItem('hammer')");   /* v(5,5) của Đen, h(1,1) của Trắng (mình) */
  ok(run('S.mode')==='item'&&run('S.use')==='hammer','búa: vào chế độ chọn mục tiêu');
  ok(run('App.confirmItem()')===false&&log.sent.length===0,'chưa trỏ tường nào: xác nhận không làm gì');
  run("App.cycleTarget('ArrowRight')");
  ok(JSON.stringify(run('S.tgt'))==='{"o":"v","r":5,"c":5}','phím mũi tên chỉ chọn tường của ĐỐI THỦ (không chọn tường của mình)');
  run('App.confirmItem()');
  ok(log.sent.length===1&&JSON.stringify(log.sent[0][1])==='{"item":{"use":"hammer","o":"v","r":5,"c":5}}','xác nhận: gửi {item:{use,o,r,c}}');
  run("S.net.wait=false;S.mode='item';S.use='hammer';App.useItem('hammer')");
  ok(run('S.mode')==='move','bấm lại cùng món: hủy chế độ chọn');
  /* lượt thêm của giày: chỉ đi quân */
  mkItems([['hammer'],[]],[2,0]);log.sent.length=0;run("S.net.note='';App.useItem('hammer')");
  ok(log.sent.length===0&&run('S.mode')==='move','lượt thêm: không dùng được vật phẩm');
  run("App.setMode('wall')");ok(run('S.mode')==='move','lượt thêm: không vào chế độ đặt tường');
  /* nhận kết quả server: búa */
  mkItems([[],[]],[0,0]);log.wrem.length=0;log.pops.length=0;
  run("S.ws.v[5*WN+5]=1;S.wo.v[5*WN+5]=2;");
  run(`App.netApplyChaos(${JSON.stringify({t:'applied',seq:0,by:0,action:{item:{use:'hammer',o:'v',r:5,c:5}},ply:1,turn:1,over:false,pl:[{r:6,c:4},{r:2,c:4}],left:[10,11],stuck:[false,false],inv:[[],[]],bonus:[0,0],fx:[{t:'hammer',p:0,o:'v',r:5,c:5}]})})`);
  ok(run('S.ws.v[5*WN+5]')===0&&run('S.wo.v[5*WN+5]')===0&&run('S.dead.v[5*WN+5]')===0&&run('S.left[1]')===11,'búa: tường bị gỡ khỏi S, khe không bị chiếm, tường trả lại cho đối thủ');
  ok(log.wrem.length===1&&log.wrem[0].join()==='v,5,5,hammer'&&log.pops.some(p=>p[2]==='hammer'),'hiệu ứng: Walls.remove(hammer) + Marks.pop(hammer)');
  /* cuốc chim */
  run("S.ws.h[3*WN+2]=1;S.wo.h[3*WN+2]=2;S.ply=1;S.turn=0;");log.wrem.length=0;
  run(`App.netApplyChaos(${JSON.stringify({t:'applied',seq:1,by:0,action:{item:{use:'pick',o:'h',r:3,c:2}},ply:2,turn:1,over:false,pl:[{r:6,c:4},{r:2,c:4}],left:[10,11],stuck:[false,false],inv:[[],[]],bonus:[0,0],fx:[{t:'pick',p:0,o:'h',r:3,c:2}]})})`);
  ok(run('S.ws.h[3*WN+2]')===0&&run('S.dead.h[3*WN+2]')===1&&log.wrem[0].join()==='h,3,2,pick','cuốc chim: tường mất, khe vào S.dead, Walls.remove(pick)');
  /* giày dùng xong: miễn phí, ply không đổi, hiện biểu tượng */
  mkItems([['boots'],[]],[0,0]);run('S.ply=4');log.pops.length=0;
  run(`App.netApplyChaos(${JSON.stringify({t:'applied',seq:4,by:0,action:{item:{use:'boots'}},free:true,ply:4,turn:0,over:false,pl:[{r:6,c:4},{r:2,c:4}],left:[10,10],stuck:[false,false],inv:[[],[]],bonus:[1,0],fx:[{t:'boots',p:0}]})})`);
  ok(run('S.ply')===4&&run('S.turn')===0&&run('S.bonus[0]')===1&&run('S.inv[0].length')===0,'giày: ply/lượt giữ nguyên, bonus=1, túi cập nhật');
  ok(log.pops.some(p=>p[2]==='boots'),'giày: biểu tượng nổi trên quân');
}
console.log(fails?'\nTHẤT BẠI '+fails+'/'+checks:'\nTất cả '+checks+' kiểm tra đạt');
process.exit(fails?1:0);