'use strict';
/* [UTIL] Hàm nhỏ dùng chung + hằng số hình học bàn cờ suy ra từ CFG. */
const TAU=Math.PI*2;
const $=id=>document.getElementById(id);
const rand=(a,b)=>a+Math.random()*(b-a);
const rsign=()=>Math.random()<.5?-1:1;
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const smooth=t=>t*t*(3-2*t);
const angDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));   /* góc xoay ngắn nhất từ b tới a */
const pick1=a=>a[Math.floor(Math.random()*a.length)];
const nextFrame=()=>new Promise(r=>setTimeout(r,16));

const N=CFG.N,WN=N-1,HALF=WN/2,TOP=CFG.CELL_H/2;   /* WN = số khe tường mỗi chiều */
const cellX=c=>(c-HALF)*CFG.PITCH,cellZ=r=>(r-HALF)*CFG.PITCH;
const wallX=c=>(c+.5-HALF)*CFG.PITCH,wallZ=r=>(r+.5-HALF)*CFG.PITCH;
const wallIdx=x=>clamp(x,0,WN-1);
