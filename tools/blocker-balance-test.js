#!/usr/bin/env node
'use strict';
/* Kiểm thử CÂN BẰNG của người chặn đường (thuần logic, không cần trình duyệt):   node tools/blocker-balance-test.js
   Kiểm: không xuất hiện khi chưa ai dẫn đủ xa; chỉ nhắm đúng bên dẫn, ô nằm trên đường đi của bên dẫn; bên bị dẫn không bị thiệt hơn; hai bên còn đường;
   lợi thế càng lớn thì ô càng SÁT bên dẫn và đứng càng LÂU; rời sớm khi lợi thế tụt. */
const path=require('path'),root=path.join(__dirname,'..');
const Core=require(path.join(root,'js/core.js')),BP=require(path.join(root,'js/blocker-pick.js')),BPl=require(path.join(root,'js/blocker-plan.js'));
const R=Core.make(Core.ruleset('chaos')),N=R.N;
let fails=0,checks=0;const ok=(c,m)=>{checks++;if(!c){fails++;console.log('  ✗',m);}};
const lcg=s=>()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
function mkState(rnd,{nw=0}={}){
  const st=R.newState({spawn:[[8,4],[0,4]],terr:new Uint8Array(N*N),seed:1});
  st.turn=(rnd()*2)|0;
  for(let i=0;i<nw;i++){const o=rnd()<.5?'h':'v',r=(rnd()*8)|0,c=(rnd()*8)|0;if(R.canWall(st,o,r,c))R.setWall?R.setWall(st,o,r,c):null;}
  return st;
}
/* đặt quân 0 ở hàng r0 (cách đích 0 là r0 bước), quân 1 ở hàng r1 (cách đích 8-r1 bước) */
function place(st,r0,c0,r1,c1){st.pl[0].r=r0;st.pl[0].c=c0;st.pl[1].r=r1;st.pl[1].c=c1;}

console.log('Không ai dẫn đủ xa → không xuất hiện');
{
  const rnd=lcg(1);let bad=0;
  for(let t=0;t<200;t++){
    const st=mkState(rnd);const r0=1+((rnd()*7)|0),r=r0;place(st,r,(rnd()*9)|0,Math.min(7,8-r+((rnd()*3)|0)-1),(rnd()*9)|0);   /* d0=r, d1≈r: hòa hoặc lệch ≤1-2 */
    if(st.pl[0].r===st.pl[1].r&&st.pl[0].c===st.pl[1].c)continue;
    const L=BP.leadOf(R,st);
    const pk=BP.pickTarget(R,st,rnd);
    if(L&&L.lead<3&&pk)bad++;
  }
  ok(bad===0,'lead < 3 thì pickTarget trả null ('+bad+' sai)');
  const st=mkState(lcg(2));place(st,4,4,4,5);ok(BP.pickTarget(R,st,lcg(3))===null,'hai bên bằng nhau: không xuất hiện');
}

console.log('Nhắm đúng bên dẫn, ô hợp lệ');
{
  const rnd=lcg(7);let n=0,bad=0,wrongSide=0,hurtTrailer=0,notOnPath=0;
  for(let t=0;t<600;t++){
    const st=mkState(rnd);
    place(st,1+((rnd()*7)|0),(rnd()*9)|0,1+((rnd()*7)|0),(rnd()*9)|0);
    if(st.pl[0].r===st.pl[1].r&&st.pl[0].c===st.pl[1].c)continue;
    const pk=BP.pickTarget(R,st,rnd);if(!pk)continue;n++;
    const L=BP.leadOf(R,st),k=pk.cell,r=(k/N)|0,c=k%N,p=pk.tgt,q=1-p;
    if(p!==L.p)wrongSide++;
    if(!BP.okCell(R,st,r,c))bad++;
    const d=[R.dist(st,0,st.pl[0]),R.dist(st,1,st.pl[1])];
    st.blocker=k;const a=[R.dist(st,0,st.pl[0]),R.dist(st,1,st.pl[1])];st.blocker=-1;
    if(a[0]>=Core.NOPATH||a[1]>=Core.NOPATH)bad++;
    if(a[q]-d[q]>a[p]-d[p])hurtTrailer++;
    if(R.dist(st,p,{r,c})>d[p])notOnPath++;   /* ô nằm sau lưng bên dẫn hơn quãng đường còn lại: vô lý */
  }
  ok(n>100,'đủ ca có người chặn để kiểm ('+n+')');
  ok(wrongSide===0,'luôn nhắm đúng bên dẫn ('+wrongSide+' sai)');
  ok(bad===0,'ô hợp lệ, hai bên còn đường ('+bad+' sai)');
  ok(hurtTrailer===0,'bên bị dẫn không bị thiệt hơn bên dẫn ('+hurtTrailer+' sai)');
  ok(notOnPath===0,'ô nằm trên hành lang đường đi ('+notOnPath+' sai)');
}

console.log('Lợi thế lớn → sát hơn + đứng lâu hơn');
{
  /* quân 0 ở hàng 7 (d0=7): đứng ngoài biên; kéo quân 1 lùi để tăng lợi thế. Quân 0 dẫn khi d1 lớn: d1 = 8-r1 */
  const rows=[ [3,4],[4,5],[5,6],[6,7],[7,8] ];   /* sau đây ta đo theo lead */
  const by={};
  const rnd=lcg(11);
  for(let t=0;t<400;t++){
    const st=mkState(rnd);
    const r0=1+((rnd()*5)|0);                   /* d0 = r0 (1..5) */
    const r1=(rnd()*(8-r0))|0;                  /* d1 = 8-r1 ≥ 8-... */
    place(st,r0,3+((rnd()*3)|0),Math.max(0,r1),3+((rnd()*3)|0));
    if(st.pl[0].r===st.pl[1].r&&st.pl[0].c===st.pl[1].c)continue;
    const L=BP.leadOf(R,st);if(!L||L.lead<3)continue;
    const pk=BP.pickTarget(R,st,rnd);if(!pk)continue;
    const dl=(()=>{const q=[[st.pl[pk.tgt].r,st.pl[pk.tgt].c]];return Math.abs(((pk.cell/N)|0)-st.pl[pk.tgt].r)+Math.abs(pk.cell%N-st.pl[pk.tgt].c);})();
    const b=Math.min(3,Math.floor((L.lead-3)/2));(by[b]=by[b]||[]).push({dl,stay:pk.stay,s:pk.s});
  }
  const avg=(a,f)=>a.reduce((x,y)=>x+f(y),0)/a.length;
  const ks=Object.keys(by).map(Number).sort((a,b)=>a-b);
  ok(ks.length>=3,'có đủ các mức lợi thế để so ('+ks.join(',')+')');
  let mono=true,monoStay=true;
  for(let i=1;i<ks.length;i++){
    if(avg(by[ks[i]],x=>x.dl)>avg(by[ks[i-1]],x=>x.dl)+1e-9)mono=false;
    if(avg(by[ks[i]],x=>x.stay)<avg(by[ks[i-1]],x=>x.stay)-1e-9)monoStay=false;
  }
  console.log('   (mức lead → khoảng cách TB, số nước đứng TB):',ks.map(k=>k+':'+avg(by[k],x=>x.dl).toFixed(2)+'/'+avg(by[k],x=>x.stay).toFixed(2)).join('  '));
  ok(mono,'lợi thế càng lớn → ô chặn càng sát (khoảng cách TB không tăng)');
  ok(monoStay,'lợi thế càng lớn → đứng càng lâu (số nước TB không giảm)');
  const all=ks.flatMap(k=>by[k]);
  ok(all.every(x=>x.stay>=2&&x.stay<=9),'số nước đứng trong [2,9]');
  ok(avg(by[ks[ks.length-1]],x=>x.dl)<avg(by[ks[0]],x=>x.dl),'mức cao nhất sát hơn hẳn mức thấp nhất');
}

console.log('Rời sớm + lịch');
{
  const st=mkState(lcg(5));place(st,2,4,6,5);   /* hòa: mỗi bên cách đích 2 */
  ok(BP.released(R,st,0)===true&&BP.released(R,st,1)===true,'hết dẫn rõ: nên rời sớm');
  place(st,1,4,1,5);st.pl[1].r=0;                 /* quân 0 gần đích hơn rất nhiều */
  ok(BP.released(R,st,0)===false||BP.leadFor(R,st,0)>=1,'còn dẫn: chưa rời');
  ok(BP.released(R,st,undefined)===false,'chưa biết mục tiêu (bản ghi cũ): không rời sớm');
  const p={on:true,since:10,at:18};
  ok(BPl.due(p,11,true)===null,'mới đứng 1 nước: chưa cho rời sớm');
  ok(BPl.due(p,12,true)==='leave','đã đứng đủ tối thiểu + hết dẫn: rời sớm');
  ok(BPl.due(p,12,false)===null&&BPl.due(p,18,false)==='leave','không có release thì theo lịch');
  const q=BPl.init({first:[1,1],stay:[5,7],gap:[20,30]},()=>0,0);BPl.done(q,5,'enter',{stay:[5,7]},()=>0,4);
  ok(q.on&&q.at===9&&q.since===5,'enter với stay riêng: at = ply + stay');
}
console.log(fails?'\n'+fails+' / '+checks+' kiểm tra SAI':'\nTất cả '+checks+' kiểm tra đạt');
process.exit(fails?1:0);
