#!/usr/bin/env node
'use strict';
/* Xem và thống kê map chế độ Hỗn Loạn (js/mapgen.js), chạy bằng Node, không cần trình duyệt.
   Cách dùng:
     node tools/mapgen-view.js <seed> [--biome=forest|mountain|snow|river|desert|balanced]     in một map ra chữ
     node tools/mapgen-view.js --stats [số seed=1000] [--biome=...]                thống kê hàng loạt
   Ký hiệu:  . thường   # đá   " cỏ   ~ băng   = nước   : cát   ^ bẫy   $ rương   A,B... cổng (cùng chữ = một cặp)   W/B spawn Trắng/Đen */
const MapGen=require('../js/mapgen.js');
const args=process.argv.slice(2);
const flag=n=>{const a=args.find(x=>x.startsWith('--'+n+'='));return a?a.split('=')[1]:undefined;};
const pos=args.filter(x=>!x.startsWith('--'));
const biome=flag('biome');
const opts=biome?{biome}:{};

if(args.includes('--stats')){
  const n=Number(pos[0])||1000,t0=Date.now();
  const byBiome={},kinds=['stone','brush','ice','water','sand'];
  let firstTry=0,fallback=0,maxAttempt=0,sumAttempt=0;
  const diffs=[],paths=[];
  for(let s=1;s<=n;s++){
    const m=MapGen.generate(s,opts);
    firstTry+=m.attempt===0;fallback+=m.fallback;maxAttempt=Math.max(maxAttempt,m.attempt);sumAttempt+=m.attempt;
    diffs.push(Math.abs(m.costs[0]-m.costs[1]));paths.push(m.paths[0],m.paths[1]);
    const b=byBiome[m.biome]||(byBiome[m.biome]={maps:0,clusters:{stone:0,brush:0,ice:0,water:0,sand:0},cells:{stone:0,brush:0,ice:0,water:0,sand:0},waterDots:0,sandDots:0});
    b.maps++;b.waterDots+=m.water.length;b.sandDots+=m.sand.length;
    for(const c of m.clusters){b.clusters[c.kind]++;b.cells[c.kind]+=c.cells.length;}
  }
  const ms=Date.now()-t0;
  console.log('Số map:',n,'· thời gian:',ms+'ms','('+(ms/n).toFixed(2)+'ms/map)');
  console.log('Hợp lệ ngay lần đầu:',(100*firstTry/n).toFixed(1)+'%','· số lần thử TB:',(sumAttempt/n+1).toFixed(2),'· nhiều nhất:',maxAttempt+1,'· bàn trống dự phòng:',fallback);
  diffs.sort((a,b)=>a-b);paths.sort((a,b)=>a-b);
  console.log('Chênh CHI PHÍ đường đi ban đầu giữa hai bên (nước tính 2): TB',(diffs.reduce((a,b)=>a+b,0)/n).toFixed(2),'· trung vị',diffs[n>>1],'· lớn nhất',diffs[n-1]);
  console.log('Đường đi ngắn nhất của một bên: TB',(paths.reduce((a,b)=>a+b,0)/paths.length).toFixed(1),'· nhỏ nhất',paths[0],'· lớn nhất',paths[paths.length-1]);
  for(const b of Object.keys(byBiome).sort()){
    const o=byBiome[b];
    console.log('Biome',b.padEnd(9),'('+o.maps+' map)  số cụm TB / số ô mỗi cụm TB:',
      kinds.map(k=>k+' '+(o.clusters[k]/o.maps).toFixed(2)+' / '+(o.clusters[k]?o.cells[k]/o.clusters[k]:0).toFixed(1)).join(' · ')+' · nước rải rác TB '+(o.waterDots/o.maps).toFixed(2)+' · cát rải rác TB '+(o.sandDots/o.maps).toFixed(2));
  }
}else{
  const seed=pos[0]===undefined?1:(isNaN(Number(pos[0]))?pos[0]:Number(pos[0]));
  const m=MapGen.generate(seed,opts);
  console.log(MapGen.ascii(m));
  const cnt=k=>m.clusters.filter(c=>c.kind===k).map(c=>c.cells.length+'('+c.shape+')').join(' ')||'-';
  console.log('\nseed',seed,'· biome',m.biome,'· thử lần',m.attempt+1,m.fallback?'· BÀN TRỐNG DỰ PHÒNG':'');
  console.log('spawn: Trắng cột',m.spawn[0],'· Đen cột',m.spawn[1],'· đường đi ngắn nhất: Trắng',m.paths[0],'· Đen',m.paths[1],'· chi phí (nước ×2): Trắng',m.costs[0],'· Đen',m.costs[1]);
  console.log('đá:',cnt('stone'),'· cỏ:',cnt('brush'),'· băng:',cnt('ice'),'· sông:',cnt('water'),'· cát góc:',cnt('sand'),'· nước rải rác',m.water.length,'· cát rải rác',m.sand.length,'· bẫy',m.traps.length,'· rương',m.chests.length,'· cặp cổng',m.portals.length);
}
