#!/usr/bin/env node
'use strict';
/* Kiểm thử js/mapgen.js — chạy độc lập bằng Node:   node tools/mapgen-test.js
   Kiểm: cùng seed → cùng map; hàng spawn trống; số cụm và kích thước trong khoảng; đá và cỏ không có lỗ kín; mỗi cụm liền cạnh, không chồng nhau; ô lẻ (bẫy, rương, cổng) đúng luật;
   cả hai bên luôn có đường về đích, chênh lệch chi phí ≤ ngưỡng; biome nghiêng đúng hướng; biome sông (sông kín ngang, cả hai bên phải lội) và sa mạc (không băng, 2 cụm cát ở 2 góc); nước/cát rải rác sát băng/đá;
   serialize ↔ JSON; ghép với Core (BFS của lõi khớp BFS của mapgen; chơi thử ván thật trên map sinh ra). */
const MapGen=require('../js/mapgen.js'),Core=require('../js/core.js');
let fails=0,checks=0;
const ok=(c,msg)=>{checks++;if(!c){fails++;console.log('  ✗',msg);}};
const N=MapGen.N,SAFE=MapGen.SAFE,T=MapGen.T,SEEDS=1000;
const D4=[[-1,0],[1,0],[0,-1],[0,1]];
const typeOf={stone:T.STONE,brush:T.BRUSH,ice:T.ICE,water:T.WATER,sand:T.SAND};
/* khoảng hợp lệ lấy thẳng từ MapGen.KINDS (kích thước) và MapGen.COUNT (số cụm) để chỉnh mapgen.js không phải sửa lại test */
const MAXN=Math.max(...Object.values(MapGen.COUNT).map(r=>r[1]));
const RANGE={};for(const k of Object.keys(MapGen.KINDS))RANGE[k]={n:[0,MAXN],s:MapGen.KINDS[k].size};

/* cụm có liền cạnh không (BFS trong chính tập ô của cụm) */
function connected(cells){
  const set=new Set(cells),seen=new Set([cells[0]]),q=[cells[0]];
  for(let h=0;h<q.length;h++){
    const r=(q[h]/N)|0,c=q[h]%N;
    for(const[dr,dc]of D4){const k=(r+dr)*N+(c+dc);if(r+dr>=0&&r+dr<N&&c+dc>=0&&c+dc<N&&set.has(k)&&!seen.has(k)){seen.add(k);q.push(k);}}
  }
  return seen.size===cells.length;
}
/* ô không phải đá mà loang 4 hướng từ (0,0) không tới được = bị đá (hoặc đá + mép bàn) bao kín */
function enclosed(terr,types){
  const seen=new Uint8Array(N*N),q=[0];seen[0]=1;
  for(let h=0;h<q.length;h++){
    const r=(q[h]/N)|0,c=q[h]%N;
    for(const[dr,dc]of D4){const r2=r+dr,c2=c+dc;if(r2<0||r2>=N||c2<0||c2>=N)continue;const k=r2*N+c2;if(seen[k]||types.includes(terr[k]))continue;seen[k]=1;q.push(k);}
  }
  for(let k=0;k<N*N;k++)if(!types.includes(terr[k])&&!seen[k])return true;
  return false;
}
const KINDS5=['stone','brush','ice','water','sand'];
const sum={};for(const b of MapGen.BIOMES)sum[b]={stone:0,brush:0,ice:0,water:0,sand:0,n:0,water_dots:0,sand_dots:0,rivers:0,sandClusters:0,iceClusters:0};
ok(MapGen.BIOMES.includes('river')&&MapGen.BIOMES.includes('desert'),'có biome river và desert');
ok(Core.TERR.WATER===T.WATER&&Core.TERR.SAND===T.SAND&&Core.TERR.STONE===T.STONE,'mã ô nước/cát/đá của Core khớp MapGen.T');
let fallbacks=0,retried=0;

console.log('Kiểm',SEEDS,'seed');
for(let seed=1;seed<=SEEDS;seed++){
  const m=MapGen.generate(seed);
  if(m.fallback){fallbacks++;continue;}
  if(m.attempt>0)retried++;
  /* xác định: sinh lại cùng seed ra y hệt */
  if(seed<=100){
    const m2=MapGen.generate(seed);
    ok(JSON.stringify(MapGen.serialize(m))===JSON.stringify(MapGen.serialize(m2)),'cùng seed cho cùng map (seed '+seed+')');
  }
  ok(m.terr.length===N*N&&MapGen.BIOMES.includes(m.biome),'cấu trúc map');
  /* vùng spawn trống: SAFE hàng đầu và SAFE hàng cuối */
  let clean=true;
  for(let r=0;r<N;r++)if(r<SAFE||r>N-SAFE-1)for(let c=0;c<N;c++)if(m.terr[r*N+c]!==0)clean=false;
  ok(clean,'vùng spawn trống (seed '+seed+')');
  ok(m.spawn.every(c=>Number.isInteger(c)&&c>=0&&c<N),'cột spawn hợp lệ');
  /* cụm: số lượng, kích thước, liền cạnh, không chồng, đúng mã ô */
  const used=new Set(),count={stone:0,brush:0,ice:0,water:0,sand:0};
  for(const cl of m.clusters){
    count[cl.kind]++;
    const rg=RANGE[cl.kind];
    ok(cl.cells.length>=rg.s[0]&&cl.cells.length<=rg.s[1],'kích thước cụm '+cl.kind+' = '+cl.cells.length+' (seed '+seed+')');
    ok(connected(cl.cells),'cụm '+cl.kind+' liền cạnh (seed '+seed+')');
    for(const k of cl.cells){ok(!used.has(k),'không chồng ô (seed '+seed+')');used.add(k);ok(m.terr[k]===typeOf[cl.kind],'mã ô đúng loại');}
  }
  for(const k of Object.keys(count))ok(count[k]>=RANGE[k].n[0]&&count[k]<=RANGE[k].n[1],'số cụm '+k+' = '+count[k]);
  /* đá không bao kín ô nào (cổng/rương/bẫy không rơi vào hố kín); cụm băng có thể có ô rương ở giữa nên chỉ kiểm lỗ với đá */
  ok(!enclosed(m.terr,[T.STONE]),'đá không có lỗ kín (seed '+seed+')');
  ok(!enclosed(m.terr,[T.BRUSH,T.STONE]),'cỏ (cùng đá) không ôm khoảng trống kín nào (seed '+seed+')');
  /* ô lẻ */
  const DF=MapGen.DEFAULTS;
  ok(m.traps.length<=DF.traps[1]&&m.chests.length<=DF.chests[1]&&m.portals.length<=DF.portalPairs[1],'số bẫy/rương/cổng trong khoảng');
  ok(m.water.length<=DF.waterDots[1]&&m.sand.length<=DF.sandDots[1],'số nước/cát rải rác trong khoảng');
  /* nước rải rác luôn sát ô băng, cát rải rác luôn sát ô đá; sông không rải thêm nước, sa mạc không rải thêm cát */
  for(const k of m.water){ok(m.terr[k]===T.WATER,'mã nước rải rác');const r=(k/N)|0,c=k%N;ok(D4.some(([dr,dc])=>{const r2=r+dr,c2=c+dc;return r2>=0&&r2<N&&c2>=0&&c2<N&&m.terr[r2*N+c2]===T.ICE;}),'nước rải rác sát ô băng (seed '+seed+')');ok(r>=SAFE&&r<=N-SAFE-1,'nước rải rác ở vùng giữa');}
  for(const k of m.sand){ok(m.terr[k]===T.SAND,'mã cát rải rác');const r=(k/N)|0,c=k%N;ok(D4.some(([dr,dc])=>{const r2=r+dr,c2=c+dc;return r2>=0&&r2<N&&c2>=0&&c2<N&&m.terr[r2*N+c2]===T.STONE;}),'cát rải rác sát ô đá (seed '+seed+')');ok(r>=SAFE&&r<=N-SAFE-1,'cát rải rác ở vùng giữa');}
  if(m.biome==='river')ok(m.water.length===0,'sông không rải thêm nước');
  if(m.biome==='desert')ok(m.sand.length===0,'sa mạc không rải thêm cát');
  for(const k of m.traps){
    ok(m.terr[k]===T.TRAP,'mã bẫy');
    const r=(k/N)|0,c=k%N;
    ok(!D4.some(([dr,dc])=>{const r2=r+dr,c2=c+dc;return r2>=0&&r2<N&&c2>=0&&c2<N&&m.terr[r2*N+c2]===T.TRAP;}),'bẫy đứng lẻ (seed '+seed+')');
  }
  for(const k of m.chests)ok(m.terr[k]===T.CHEST,'mã rương');
  for(const[a,b]of m.portals){
    ok(m.terr[a]===T.PORTAL&&m.terr[b]===T.PORTAL&&a!==b,'mã cổng');
    const ar=(a/N)|0,ac=a%N,br=(b/N)|0,bc=b%N;
    ok(Math.abs(ar-br)<=MapGen.PORTAL.maxRow&&Math.abs(ar-br)+Math.abs(ac-bc)>=MapGen.PORTAL.minDist,'hai đầu cổng đúng khoảng cách (seed '+seed+')');
  }
  /* rương/bẫy/cổng chỉ ở vùng giữa; rương cách nhau ≥ CHEST_GAP ô */
  for(const k of m.chests.concat(m.traps,...m.portals)){const r=(k/N)|0;ok(r>=SAFE&&r<=N-SAFE-1,'ô lẻ nằm ở vùng giữa (seed '+seed+')');}
  for(let i=0;i<m.chests.length;i++)for(let j=i+1;j<m.chests.length;j++){
    const a=m.chests[i],b=m.chests[j];ok(Math.abs(((a/N)|0)-((b/N)|0))+Math.abs(a%N-b%N)>=MapGen.CHEST_GAP,'rương cách nhau ≥ CHEST_GAP (seed '+seed+')');
  }
  /* đếm ô thật khớp danh sách: không có ô đặc biệt "lạc" */
  const stats={};for(const v of m.terr)stats[v]=(stats[v]||0)+1;
  ok((stats[T.TRAP]||0)===m.traps.length&&(stats[T.CHEST]||0)===m.chests.length&&(stats[T.PORTAL]||0)===m.portals.length*2,'số ô lẻ khớp danh sách');
  const clCells=kd=>m.clusters.filter(c=>c.kind===kd).reduce((a,c)=>a+c.cells.length,0);
  ok((stats[T.WATER]||0)===m.water.length+clCells('water')&&(stats[T.SAND]||0)===m.sand.length+clCells('sand'),'số ô nước/cát khớp (rải rác + sông/cát góc)');
  ok((stats[T.STONE]||0)===m.clusters.filter(c=>c.kind==='stone').reduce((a,c)=>a+c.cells.length,0),'số ô đá khớp các cụm');
  /* đường đi */
  const d0=MapGen.pathDist(m,0),d1=MapGen.pathDist(m,1);
  ok(d0<Infinity&&d1<Infinity,'cả hai bên có đường (seed '+seed+')');
  const q0=MapGen.pathCost(m,0),q1=MapGen.pathCost(m,1);
  ok(Math.abs(q0-q1)<=MapGen.MAXDIFF,'chênh chi phí đường đi ≤ '+MapGen.MAXDIFF+' (seed '+seed+': '+q0+' vs '+q1+')');
  ok(m.paths[0]===d0&&m.paths[1]===d1&&m.costs[0]===q0&&m.costs[1]===q1,'paths/costs khớp pathDist/pathCost');
  ok(q0>=d0&&q1>=d1,'chi phí không bao giờ nhỏ hơn số bước');
  /* ----- biome sông: sông liền cạnh, mỗi cột có nước, kín bề ngang → chặn mọi đường dọc nếu không lội nước ----- */
  const rivers=m.clusters.filter(c=>c.kind==='water');
  if(m.biome==='river'){
    ok(rivers.length===1&&rivers[0].shape==='river','biome sông có đúng một con sông (seed '+seed+')');
    const cols=new Set(rivers[0].cells.map(k=>k%N));
    ok(cols.size===N,'sông phủ đủ mọi cột (seed '+seed+')');
    /* loang 4 hướng từ hàng 0 qua mọi ô KHÔNG phải nước: không bao giờ tới hàng cuối */
    const seen=new Uint8Array(N*N),qq=[];for(let c=0;c<N;c++){seen[c]=1;qq.push(c);}
    for(let h=0;h<qq.length;h++){const r=(qq[h]/N)|0,c=qq[h]%N;for(const[dr,dc]of D4){const r2=r+dr,c2=c+dc;if(r2<0||r2>=N||c2<0||c2>=N)continue;const k2=r2*N+c2;if(seen[k2]||m.terr[k2]===T.WATER)continue;seen[k2]=1;qq.push(k2);}}
    let reach=false;for(let c=0;c<N;c++)if(seen[(N-1)*N+c])reach=true;
    ok(!reach,'không đi từ hàng đầu xuống hàng cuối mà không lội nước (seed '+seed+')');
    ok(q0>d0&&q1>d1,'cả hai bên đều phải lội sông: chi phí > số bước (seed '+seed+')');
    ok(rivers[0].cells.every(k=>{const r=(k/N)|0;return r>=SAFE&&r<=N-SAFE-1;}),'sông nằm trọn trong vùng giữa');
  }else ok(rivers.length===0,'chỉ biome sông mới có sông');
  /* ----- biome sa mạc: không băng, đúng 2 cụm cát lớn, mỗi cụm ở một góc của vùng giữa ----- */
  const dunes=m.clusters.filter(c=>c.kind==='sand');
  if(m.biome==='desert'){
    ok(!m.terr.some(v=>v===T.ICE),'sa mạc không có băng (seed '+seed+')');
    ok(dunes.length===2,'sa mạc có đúng 2 cụm cát lớn (seed '+seed+': '+dunes.length+')');
    const corners=new Set();
    for(const cl of dunes){
      const hit=cl.cells.map(k=>{const r=(k/N)|0,c=k%N;return[r<=SAFE+1?'T':r>=N-SAFE-2?'B':'',c<=1?'L':c>=N-2?'R':''];}).filter(x=>x[0]&&x[1]);
      ok(hit.length>0,'cụm cát nằm ở một góc của vùng giữa (seed '+seed+')');
      if(hit.length)corners.add(hit[0].join(''));
    }
    ok(corners.size===2,'hai cụm cát ở hai góc khác nhau (seed '+seed+')');
  }else ok(dunes.length===0,'chỉ biome sa mạc mới có cụm cát lớn');
  /* thống kê biome */
  const s=sum[m.biome];s.n++;for(const cl of m.clusters)s[cl.kind]+=cl.cells.length;s.water_dots+=m.water.length;s.sand_dots+=m.sand.length;s.iceClusters+=m.clusters.filter(c=>c.kind==='ice').length;
}
ok(fallbacks===0,'không map nào phải dùng bàn trống dự phòng ('+fallbacks+')');
console.log('  map phải sinh lại ít nhất một lần:',retried,'/',SEEDS);

/* biome nghiêng đúng hướng: loại được ưu tiên có tổng số ô trung bình cao hơn hẳn hai loại kia */
for(const[b,fav]of[['forest','brush'],['mountain','stone'],['snow','ice']]){
  const s=sum[b],avg=k=>s[k]/s.n;
  console.log('  biome',b.padEnd(8),'(',s.n,'map ) số ô TB:','đá',avg('stone').toFixed(1),'· cỏ',avg('brush').toFixed(1),'· băng',avg('ice').toFixed(1));
  for(const k of['stone','brush','ice'])if(k!==fav)ok(avg(fav)>avg(k)*1.4,'biome '+b+': '+fav+' nhiều hơn '+k);
  ok(s.n>SEEDS/8,'biome '+b+' xuất hiện đủ nhiều');
}
{ /* sa mạc: cát nhiều hẳn, ít cỏ, không băng; sông: có đủ số map */
  const d=sum.desert,rv=sum.river,avg=(o,k)=>o[k]/o.n;
  console.log('  biome desert   (',d.n,'map ) số ô TB:','đá',avg(d,'stone').toFixed(1),'· cỏ',avg(d,'brush').toFixed(1),'· băng',avg(d,'ice').toFixed(1),'· cát',avg(d,'sand').toFixed(1));
  console.log('  biome river    (',rv.n,'map ) số ô TB:','đá',avg(rv,'stone').toFixed(1),'· cỏ',avg(rv,'brush').toFixed(1),'· băng',avg(rv,'ice').toFixed(1),'· nước (sông)',avg(rv,'water').toFixed(1));
  ok(d.n>SEEDS/8&&rv.n>SEEDS/8,'sông và sa mạc xuất hiện đủ nhiều');
  ok(d.ice===0,'sa mạc: tổng ô băng = 0');
  ok(avg(d,'sand')>avg(d,'brush')*3,'sa mạc: cát nhiều hơn cỏ hẳn');
  ok(avg(d,'sand')>10,'sa mạc: cát trung bình > 10 ô (hai vùng rộng)');
  /* cát/nước rải rác ở các biome thường có xuất hiện (không phải lúc nào cũng 0) */
  let dots={water:0,sand:0};for(const b of['forest','mountain','snow']){dots.water+=sum[b].water_dots;dots.sand+=sum[b].sand_dots;}
  ok(dots.water>0&&dots.sand>0,'nước/cát rải rác xuất hiện ở biome thường ('+dots.water+' / '+dots.sand+')');
  ok(sum.snow.water_dots/sum.snow.n>sum.mountain.water_dots/sum.mountain.n,'biome tuyết có nhiều nước rải rác hơn núi (nhiều băng hơn)');
  ok(sum.mountain.sand_dots/sum.mountain.n>sum.snow.sand_dots/sum.snow.n,'biome núi có nhiều cát rải rác hơn tuyết (nhiều đá hơn)');
  console.log('  nước rải rác TB/map: rừng',(sum.forest.water_dots/sum.forest.n).toFixed(2),'· núi',(sum.mountain.water_dots/sum.mountain.n).toFixed(2),'· tuyết',(sum.snow.water_dots/sum.snow.n).toFixed(2),
              ' | cát rải rác TB/map: rừng',(sum.forest.sand_dots/sum.forest.n).toFixed(2),'· núi',(sum.mountain.sand_dots/sum.mountain.n).toFixed(2),'· tuyết',(sum.snow.sand_dots/sum.snow.n).toFixed(2));
}

/* tùy chọn ép biome và biome cân bằng */
{
  const a=MapGen.generate(5,{biome:'snow'}),b=MapGen.generate(5,{biome:'balanced'});
  ok(a.biome==='snow'&&b.biome==='balanced','ép biome bằng opts');
  let any=false;for(let s=1;s<=200;s++)if(MapGen.generate(s,{balancedChance:1}).biome==='balanced')any=true;
  ok(any,'balancedChance=1 cho ra biome cân bằng');
  /* seed dạng chuỗi và số cho kết quả ổn định */
  ok(JSON.stringify(MapGen.serialize(MapGen.generate('abc')))===JSON.stringify(MapGen.serialize(MapGen.generate('abc'))),'seed chuỗi ổn định');
  ok(MapGen.serialize(MapGen.generate('abc')).terr!==MapGen.serialize(MapGen.generate('abd')).terr,'seed khác nhau cho map khác nhau');
}

/* serialize ↔ JSON ↔ deserialize, rồi dựng ván với Core */
{
  const m=MapGen.generate(42),back=MapGen.deserialize(JSON.parse(JSON.stringify(MapGen.serialize(m))));
  ok(back.terr.every((v,i)=>v===m.terr[i])&&back.spawn[0]===m.spawn[0]&&back.spawn[1]===m.spawn[1]&&back.portals.length===m.portals.length,'serialize đi về nguyên vẹn');
  ok(MapGen.serialize(m).terr.length===N*N&&N===9,'terr nén là chuỗi 81 chữ số (bàn 9×9)');
  const rv=MapGen.generate(7,{biome:'river'}),rb=MapGen.deserialize(JSON.parse(JSON.stringify(MapGen.serialize(rv))));
  ok(rb.terr.every((v,i)=>v===rv.terr[i])&&rb.terr.some(v=>v===T.WATER),'serialize giữ ô nước của map sông');
}
{ /* BFS của lõi khớp BFS của mapgen (bỏ cổng vì lõi chưa biết cổng) */
  const R=Core.make(Core.ruleset('chaos'));let same=0;
  for(let seed=1;seed<=200;seed++){
    const m=MapGen.generate(seed,{portalPairs:[0,0]}),st=R.newState({spawn:m.spawn,terr:m.terr});
    const a=R.dist(st,0,st.pl[0]),b=R.dist(st,1,st.pl[1]);
    ok(a===m.paths[0]&&b===m.paths[1],'Core.dist khớp mapgen (seed '+seed+': '+a+'/'+b+' vs '+m.paths+')');
    same++;
    /* snapshot của Core giữ nguyên mọi mã ô */
    const sn=R.snapshot(st),back=R.fromSnapshot(JSON.parse(JSON.stringify(sn)));
    ok(sn.terr===Array.from(m.terr).join('')&&back.terr.every((v,i)=>v===m.terr[i]),'snapshot Core giữ mọi mã ô');
  }
  console.log('  đối chiếu BFS Core ↔ mapgen:',same,'map');
}
{ /* chơi thử bằng lõi trên map sông/sa mạc/thường: ô nước/cát thật sự có hiệu lực, không kẹt lượt */
  const R=Core.make(Core.ruleset('chaos',{maxPly:160}));let games=0,froze=0;
  let sd=24680;const rr=()=>{sd=(sd*16807)%2147483647;return sd/2147483647;};
  for(let seed=1;seed<=60;seed++){
    const m=MapGen.generate(seed,{biome:['river','desert','snow','mountain'][seed%4],portalPairs:[0,0]}),st=R.newState({spawn:m.spawn,terr:m.terr});
    while(!st.over){
      const p=st.turn;let a=null;
      if(st.stuck[p]){froze++;const ws=[];for(const o of['h','v'])for(let r=0;r<R.WN;r++)for(let c=0;c<R.WN;c++)if(R.canWall(st,o,r,c))ws.push({o,r,c});
        ok(ws.length>0,'đứng yên mà tới lượt thì có tường đặt được');if(!ws.length)break;a={wall:ws[Math.floor(rr()*ws.length)]};}
      else{const ms=R.moves(st,p);if(!ms.length)break;
        /* thiên về tiến lên để thực sự lội qua sông */
        const goal=R.goalRow(p),fw=ms.filter(x=>Math.abs(x[0]-goal)<Math.abs(st.pl[p].r-goal));
        const pool=fw.length&&rr()<.8?fw:ms;a={move:pool[Math.floor(rr()*pool.length)]};}
      ok(R.apply(st,a).ok,'ván trên map sinh: apply hợp lệ');
    }
    ok(st.over,'ván trên map sinh kết thúc (seed '+seed+')');games++;
  }
  console.log('  ván thử trên map sông/sa mạc/tuyết/núi:',games,'· lượt đứng yên:',froze);
}
console.log(fails?'\nTHẤT BẠI '+fails+'/'+checks+' kiểm tra':'\nTất cả '+checks+' kiểm tra đạt');
process.exit(fails?1:0);
