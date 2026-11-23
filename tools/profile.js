#!/usr/bin/env node
'use strict';
/* Đo "dấu vân tay" lối chơi của từng AI: mỗi AI đấu với mọi AI khác (trừ bé khờ), rồi thống kê hành vi của riêng nó.
   Dùng: node tools/profile.js [số ván mỗi cặp=40] */
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const files=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]).filter(s=>/^js\/(config|util|state|core|rules|eval)\.js$/.test(s)||/^js\/ai\//.test(s));
const G=vm.runInNewContext(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n;\n')+'\n;({S,CFG,AIs,N,WN,HALF,goalRow,moves,dist,setW,canWall,AITools})',{Math,console,Set,Map,Int8Array,Int16Array,Int32Array,Uint8Array,Float32Array});
const {S,CFG,AIs,N,WN,HALF,goalRow,moves,dist,setW,canWall,AITools}=G;
const games=+process.argv[2]||40,ids=AIs.list.map(a=>a.id);
const acc={};for(const id of ids)acc[id]={g:0,own:0,walls:0,firstWall:0,fwN:0,early:0,earlyT:0,late:0,lateT:0,near:0,nearN:0,jumps:0,side:0,vert:0,link:0,ownHalf:0,chain:0,retal:0,retalN:0,mir:0,mirN:0,cdev:0,cdevN:0,chainSum:0,chainN:0,colChg:0,moves:0,pace:0,paceN:0,wins:0,gain:0};
function play(a0,a1){
  S.ai=[a0,a1];S.pl=[{r:N-1,c:HALF},{r:0,c:HALF}];S.ws={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};
  S.left=[CFG.WALLS,CFG.WALLS];S.turn=0;S.over=false;S.draw=false;S.ply=0;
  const own=[0,0],fw=[-1,-1],lastOpWall=[null,null],mine=[[],[]];
  while(S.ply<200){
    const p=S.turn,id=S.ai[p],A=acc[id],o=S.pl[1-p],a=AIs.get(id).decide(p);own[p]++;A.own++;
    if(own[p]===10){}
    const ph=own[p]<=10?'early':own[p]>25?'late':null;
    if(a.wall){
      A.walls++;mine[p].push(a.wall);if(fw[p]<0){fw[p]=own[p];}
      if(own[p]<=10){A.early++;}if(own[p]>25)A.late++;
      A.near+=Math.abs(a.wall.r+.5-o.r)+Math.abs(a.wall.c+.5-o.c);A.nearN++;
      if(a.wall.o==='v')A.vert++;
      if(AITools.links(a.wall.o,a.wall.r,a.wall.c)>0)A.link++;
      const home=goalRow(1-p);if(Math.abs(a.wall.r+.5-home)<Math.abs(a.wall.r+.5-goalRow(p)))A.ownHalf++;
      if(lastOpWall[p]&&lastOpWall[p].t===S.ply-1&&AITools.connected(lastOpWall[p],a.wall)){A.retal++;}
      if(lastOpWall[p]&&lastOpWall[p].t===S.ply-1)A.retalN++;
      lastOpWall[1-p]={o:a.wall.o,r:a.wall.r,c:a.wall.c,t:S.ply};
      const op=1-p,d0=dist(op,S.pl[op]);setW(a.wall.o,a.wall.r,a.wall.c,1);const d1=dist(op,S.pl[op]);A.gain+=d1-d0;S.left[p]--;
    }else{
      A.moves++;const before=dist(p,S.pl[p]),pos={r:a.move[0],c:a.move[1]};
      if(Math.abs(a.move[0]-S.pl[p].r)+Math.abs(a.move[1]-S.pl[p].c)>1)A.jumps++;
      if(dist(p,pos)>=before)A.side++;
      if(pos.c!==S.pl[p].c)A.colChg++;S.pl[p]=pos;A.cdev+=Math.abs(pos.c-HALF);A.cdevN++;
    }
    if(own[p]<=10)A.earlyT++;if(own[p]>25)A.lateT++;
    S.ply++;
    if(S.pl[p].r===goalRow(p)){acc[id].wins++;break;}
    S.turn=1-p;
  }
  for(const p of[0,1]){const A=acc[S.ai[p]];A.g++;
    let best=0;const has=(o,r,c)=>mine[p].some(w=>w.o===o&&w.r===r&&w.c===c);
    for(const w of mine[p]){let n=1;const dr=w.o==='v'?2:0,dc=w.o==='h'?2:0;
      if(has(w.o,w.r-dr,w.c-dc))continue;   /* chỉ đếm từ đầu chuỗi */
      while(has(w.o,w.r+dr*n,w.c+dc*n))n++;best=Math.max(best,n);}
    A.chainSum+=best;A.chainN++;if(fw[p]>0){A.firstWall+=fw[p];A.fwN++;}}
}
for(const a of ids)for(const b of ids){if(a===b||a==='dumb'||b==='dumb')continue;for(let i=0;i<games;i++)play(a,b);}
const f=(x,d=1)=>x.toFixed(d);
console.log('bot'.padEnd(9),'tường ngang%'.padEnd(13),'nối liền%'.padEnd(11),'sát nhà mình%'.padEnd(15),'trả đũa%'.padEnd(10),'lệch cột giữa','tường/ván','tường đầu@','sát mặt','chuỗi thẳng','đổi cột/ván');
for(const id of ids){if(id==='dumb')continue;const A=acc[id];
  console.log(id.padEnd(9),(f(100*(1-A.vert/Math.max(1,A.walls)),0)+'%').padEnd(13),(f(100*A.link/Math.max(1,A.walls),0)+'%').padEnd(11),(f(100*A.ownHalf/Math.max(1,A.walls),0)+'%').padEnd(15),(f(100*A.retal/Math.max(1,A.retalN),0)+'%').padEnd(10),f(A.cdev/Math.max(1,A.cdevN),2).padEnd(13),f(A.walls/A.g).padEnd(9),f(A.firstWall/Math.max(1,A.fwN)).padEnd(10),f(A.near/Math.max(1,A.nearN)).padEnd(9),f(A.chainSum/Math.max(1,A.chainN)).padEnd(12),f(A.colChg/A.g));}
