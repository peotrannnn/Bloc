#!/usr/bin/env node
'use strict';
/* Công cụ đấu thử AI (chạy bằng Node, không cần trình duyệt).
   Nạp đúng các file logic của game (config, util, state, rules, eval, ai/*) theo thứ tự trong index.html,
   nên AI mới thêm vào index.html sẽ tự có mặt ở đây.

   Cách dùng:
     node tools/tournament.js <idA> <idB> [số ván=200]      đấu A với B, đổi phe luân phiên
     node tools/tournament.js --all [số ván mỗi cặp=100]    đấu vòng tròn mọi AI
     node tools/tournament.js --list                        liệt kê AI
   Tùy chọn:
     --set AI.attacker.eager=0.9     ghi đè một số trong CFG (lặp lại được) để thử tham số không cần sửa file
     --quiet                         chỉ in dòng kết quả cuối
   Kết quả: tỉ lệ thắng của A (có khoảng sai số 95%), tỉ lệ khi cầm Trắng/Đen, số nước trung bình,
   số tường dùng, và chỉ số đa dạng (bao nhiêu ván khác nhau hoàn toàn / bao nhiêu nước mở đầu khác nhau). */
const fs=require('fs'),vm=require('vm'),path=require('path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const files=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1])
  .filter(s=>/^js\/(config|util|state|core|rules|eval)\.js$/.test(s)||/^js\/ai\//.test(s));
const code=files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n;\n');
const G=vm.runInNewContext(code+'\n;({S,CFG,AIs,N,WN,HALF,goalRow,moves,dist,setW,canWall})',{Math,console,Set,Map,Int8Array,Int16Array,Int32Array,Uint8Array,Float32Array});

/* ----- tham số dòng lệnh ----- */
const args=process.argv.slice(2),pos=[],sets=[];let quiet=false,all=false,list=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--set')sets.push(args[++i]);
  else if(args[i]==='--quiet')quiet=true;
  else if(args[i]==='--all')all=true;
  else if(args[i]==='--list')list=true;
  else pos.push(args[i]);
}
for(const s of sets){
  const [k,v]=s.split('=');const keys=k.split('.');let o=G.CFG;
  while(keys.length>1)o=o[keys.shift()];
  o[keys[0]]=JSON.parse(v);
}
if(list){for(const a of G.AIs.list)console.log(a.id.padEnd(10),a.name.padEnd(16),a.desc);process.exit(0);}

/* ----- một ván: trả về {win:0|1|-1, plies, walls:[w0,w1], log} ----- */
const {S,CFG,AIs,N,WN,HALF,goalRow,moves,setW,canWall}=G;
function play(id0,id1,maxPly){
  S.ai=[id0,id1];S.pl=[{r:N-1,c:HALF},{r:0,c:HALF}];
  S.ws={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};
  S.left=[CFG.WALLS,CFG.WALLS];S.turn=0;S.over=false;S.draw=false;S.ply=0;
  const log=[],why=[];let illegal=0,bad=null;
  while(S.ply<maxPly){
    const p=S.turn,a=AIs.get(S.ai[p]).decide(p);
    if(a.wall){
      if(S.left[p]<=0||!canWall(a.wall.o,a.wall.r,a.wall.c)){illegal++;bad=S.ai[p];break;}
      setW(a.wall.o,a.wall.r,a.wall.c,1);S.left[p]--;log.push('W'+a.wall.o+a.wall.r+a.wall.c);why.push(S.ai[p]+':'+(a.why||'?'));
    }else{
      if(!moves(p).some(m=>m[0]===a.move[0]&&m[1]===a.move[1])){illegal++;bad=S.ai[p];break;}
      S.pl[p]={r:a.move[0],c:a.move[1]};log.push('M'+a.move[0]+a.move[1]);
    }
    S.ply++;
    if(S.pl[p].r===goalRow(p))return{win:p,plies:S.ply,walls:[CFG.WALLS-S.left[0],CFG.WALLS-S.left[1]],log,illegal,bad,why};
    S.turn=1-p;
  }
  return{win:-1,plies:S.ply,walls:[CFG.WALLS-S.left[0],CFG.WALLS-S.left[1]],log,illegal,bad,why};
}

/* ----- đấu một cặp: A và B đổi phe luân phiên ----- */
function match(idA,idB,games){
  const r={A:idA,B:idB,games,winA:0,winB:0,draw:0,aWhite:0,aWhiteN:0,aBlack:0,aBlackN:0,plies:0,wallsA:0,wallsB:0,illegal:0,bad:{},pl:[],fw:[],fwB:[],first:{},why:{},seen:new Set(),open:new Set(),ms:0};
  const t0=Date.now();
  for(let g=0;g<games;g++){
    const aWhite=g%2===0,res=play(aWhite?idA:idB,aWhite?idB:idA,CFG.MAX_PLY);
    const aSide=aWhite?0:1;
    r.illegal+=res.illegal;if(res.bad)r.bad[res.bad]=(r.bad[res.bad]||0)+1;
    r.pl.push(res.plies);
    const fi=res.log.findIndex(x=>x[0]==='W');if(fi>=0){const id=(fi%2===0?(aWhite?idA:idB):(aWhite?idB:idA));r.first[id]=(r.first[id]||0)+1;}
    for(const w of res.why)r.why[w]=(r.why[w]||0)+1;
    for(let i=1-aSide;i<res.log.length;i+=2)if(res.log[i][0]==='W'){r.fwB.push(i>>1);break;}
    for(let i=aSide;i<res.log.length;i+=2)if(res.log[i][0]==='W'){r.fw.push(i>>1);break;}   /* nước thứ mấy của A là tường đầu tiên */
    if(res.win<0)r.draw++;else if(res.win===aSide)r.winA++;else r.winB++;
    if(aWhite){r.aWhiteN++;if(res.win===0)r.aWhite++;}else{r.aBlackN++;if(res.win===1)r.aBlack++;}
    r.plies+=res.plies;r.wallsA+=res.walls[aSide];r.wallsB+=res.walls[1-aSide];
    r.seen.add(res.log.join(','));r.open.add(res.log.slice(0,8).join(','));
  }
  r.ms=Date.now()-t0;return r;
}
const pct=x=>(100*x).toFixed(1)+'%';
function show(r){
  const n=r.games-r.draw,p=n?r.winA/n:.5,se=n?1.96*Math.sqrt(p*(1-p)/n):0;
  console.log(`${r.A} vs ${r.B} · ${r.games} ván · A thắng ${pct(p)} ±${(100*se).toFixed(1)} (A ${r.winA} – B ${r.winB}, hòa ${r.draw})`+
    ` · A cầm Trắng ${pct(r.aWhite/r.aWhiteN)} / Đen ${pct(r.aBlack/r.aBlackN)}`+
    ` · ${(r.plies/r.games).toFixed(1)} nước · tường A ${(r.wallsA/r.games).toFixed(1)} B ${(r.wallsB/r.games).toFixed(1)}`+
    ` · khác nhau ${r.seen.size}/${r.games} ván, ${r.open.size} kiểu mở đầu · ${(r.ms/r.games).toFixed(0)}ms/ván`+(r.illegal?` · !!! ILLEGAL: ${JSON.stringify(r.bad)}`:''));
  const sd=a=>{const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)*(y-m),0)/a.length);};
  if(r.fw.length){const m=r.fw.reduce((x,y)=>x+y,0)/r.fw.length;
    console.log(`   đa dạng: độ dài ván ${Math.min(...r.pl)}–${Math.max(...r.pl)} (lệch chuẩn ${sd(r.pl).toFixed(1)}) · tường đầu của A ở nước thứ ${Math.min(...r.fw)}–${Math.max(...r.fw)} (TB ${m.toFixed(1)}, lệch chuẩn ${sd(r.fw).toFixed(1)})`);}
  console.log('   ai đặt tường đầu tiên của ván:',Object.entries(r.first).map(([k,v])=>k+' '+pct(v/r.games)).join(' · '),
    '\n   lý do đặt tường:',Object.entries(r.why).sort().map(([k,v])=>k+'='+(v/r.games).toFixed(1)).join(' '));
  if(r.fwB.length){const m=r.fwB.reduce((x,y)=>x+y,0)/r.fwB.length;
    console.log(`            tường đầu của B ở nước thứ ${Math.min(...r.fwB)}–${Math.max(...r.fwB)} (TB ${m.toFixed(1)}, lệch chuẩn ${sd(r.fwB).toFixed(1)})`);}
}

if(all){
  const g=+pos[0]||100,ids=AIs.list.map(a=>a.id),score={};
  for(const id of ids)score[id]=[0,0];
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const r=match(ids[i],ids[j],g);if(!quiet)show(r);
    score[ids[i]][0]+=r.winA;score[ids[i]][1]+=r.winB;score[ids[j]][0]+=r.winB;score[ids[j]][1]+=r.winA;
  }
  console.log('\nTổng kết (thắng/thua):');
  for(const id of ids)console.log(' ',id.padEnd(10),score[id][0],'/',score[id][1]);
}else{
  const [a,b,g]=pos;if(!a||!b){console.log('Dùng: node tools/tournament.js <idA> <idB> [số ván] | --all | --list');process.exit(1);}
  show(match(a,b,+g||200));
}
