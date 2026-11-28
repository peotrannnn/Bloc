#!/usr/bin/env node
'use strict';
/* Bé Khờ (và mọi AI) không được đặt tường làm một bên mất đường về đích (luật Classic: canWall).
   Lỗi cũ: dumb.js lọc tường bằng wallFree (chỉ kiểm ô trống) nên đặt đại được tường bịt kín đường, dựng thành vòng kín nhốt cả hai quân.
   Test: cho từng AI đấu với Bé Khờ (cả hai màu) và Bé Khờ đấu Bé Khờ; sau MỌI nước phải còn đường về đích cho cả hai, và mọi tường AI trả về phải qua canWall.
   Dùng: node tools/dumb-test.js [số ván mỗi cặp=300] */
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const files=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]).filter(s=>/^js\/(config|util|state|core|rules|eval)\.js$/.test(s)||/^js\/ai\//.test(s)&&!/worker/.test(s)&&!/client/.test(s));
const G=vm.runInNewContext(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n;\n')+'\n;({S,CFG,AIs,N,WN,HALF,goalRow,moves,dist,setW,canWall,R})',{Math,console,Set,Map,Int8Array,Int16Array,Int32Array,Uint8Array,Float32Array});
const {S,CFG,AIs,N,WN,HALF,goalRow,moves,dist,setW,canWall,R}=G;
const games=+process.argv[2]||300,ids=AIs.list.map(a=>a.id);
let checks=0,bad=0,wallsPlaced=0,finished=0;const firstBad=[];
function play(a0,a1){
  S.ai=[a0,a1];S.pl=[{r:N-1,c:HALF},{r:0,c:HALF}];S.ws={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};
  S.left=[CFG.WALLS,CFG.WALLS];S.turn=0;S.over=false;S.draw=false;S.ply=0;
  while(S.ply<300){
    const p=S.turn,a=AIs.get(S.ai[p]).decide(p);
    if(a.wall){
      checks++;wallsPlaced++;
      if(!canWall(a.wall.o,a.wall.r,a.wall.c)){bad++;if(firstBad.length<5)firstBad.push(`${S.ai[p]} ply ${S.ply}: tường ${a.wall.o}(${a.wall.r},${a.wall.c}) không qua canWall`);}
      setW(a.wall.o,a.wall.r,a.wall.c,1);S.left[p]--;
    }else{
      const ok=moves(p).some(m=>m[0]===a.move[0]&&m[1]===a.move[1]);checks++;
      if(!ok){bad++;if(firstBad.length<5)firstBad.push(`${S.ai[p]} ply ${S.ply}: nước đi ${a.move} không hợp lệ`);}
      S.pl[p]={r:a.move[0],c:a.move[1]};
    }
    let broken=false;
    for(const q of[0,1]){checks++;if(dist(q,S.pl[q])>=R.NOPATH){bad++;broken=true;if(firstBad.length<5)firstBad.push(`${S.ai[0]} vs ${S.ai[1]} ply ${S.ply}: ${S.ai[p]} đi xong thì bên ${q} mất đường về đích`);}}
    if(broken)return;   /* bàn đã hỏng: dừng ván, đừng để AI khác chạy tiếp trên trạng thái bất khả thi */
    S.ply++;
    if(S.pl[p].r===goalRow(p)){finished++;break;}
    S.turn=1-p;
  }
}
for(const id of ids){
  const n=id==='biet'?Math.min(games,3):games;   /* biet tìm rất sâu nên chậm: vài ván là đủ, lỗi nằm ở bên Bé Khờ */
  for(let i=0;i<n;i++){play('dumb',id);play(id,'dumb');}
}
for(let i=0;i<games;i++)play('dumb','dumb');
console.log(`ván xong: ${finished} · tường đặt: ${wallsPlaced} · kiểm tra: ${checks} · lỗi: ${bad}`);
for(const m of firstBad)console.log('  ✗',m);
if(bad){console.log('THẤT BẠI');process.exit(1);}
console.log('ĐẠT');
