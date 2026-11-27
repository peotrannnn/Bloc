#!/usr/bin/env node
'use strict';
/* Kiểm thử cát lún của lõi luật (js/core.js, Hỗn Loạn):   node tools/sand-test.js
   Bước vào ô cát: 25% (rs.sandSink) bị lún → lượt kế tiếp bị bỏ qua TRỌN VẸN (không đi, không tường, không đồ). Classic không bị ảnh hưởng. */
const Core=require('../js/core.js');
let fails=0,checks=0;
const ok=(c,msg)=>{checks++;if(!c){fails++;console.log('  ✗',msg);}};
const T=Core.TERR;
const terrOf=(...cells)=>{const t=new Uint8Array(81);for(const[r,c,v]of cells)t[r*9+c]=v;return t;};
const mk=(R,terr,pl,seed)=>{const st=R.newState({spawn:[4,4],terr,seed:seed||7});if(pl)st.pl=pl.map(p=>({r:p[0],c:p[1]}));return st;};

console.log('Cát lún');
{
  ok(Core.ruleset('chaos').sandSink===.25,'ruleset chaos: sandSink mặc định 25%');
  ok(Core.ruleset('classic').sandSink===undefined,'Classic không có sandSink');
  /* sandSink=1: luôn lún. Trắng bước vào cát → sunk, Đen đi, tới lượt Trắng thì bị bỏ qua, Đen đi tiếp */
  const R=Core.make(Core.ruleset('chaos',{sandSink:1}));
  const st=mk(R,terrOf([4,4,T.SAND]),[[5,4],[1,1]]);
  const r1=R.apply(st,{move:[4,4]});
  ok(r1.ok&&st.sunk[0]===true,'bước vào cát (100%) → lún');
  ok((r1.fx||[]).some(e=>e.t==='sink'&&e.p===0),'fx sink');
  ok(st.turn===1&&!st.stuck[0],'tới lượt Đen; lún không phải "đứng yên" của nước');
  const ply0=st.ply;
  const r2=R.apply(st,{move:[1,2]});
  ok(r2.ok&&(r2.skipped||[]).includes(0),'sau nước của Đen, lượt Trắng bị bỏ qua (skipped có Trắng)');
  ok((r2.fx||[]).some(e=>e.t==='sunkskip'&&e.p===0),'fx sunkskip');
  ok(st.turn===1&&st.sunk[0]===false&&st.ply===ply0+2,'Đen đi tiếp ngay; hết lún; ply +2');
  const r3=R.apply(st,{move:[1,3]});ok(r3.ok,'Đen đi tiếp được');
  ok(st.turn===0&&R.moves(st,0).length>0,'lượt sau Trắng đi lại bình thường');
  /* snapshot khứ hồi giữ cờ lún */
  const st2=mk(R,terrOf([4,4,T.SAND]),[[5,4],[1,1]]);R.apply(st2,{move:[4,4]});
  ok(R.fromSnapshot(R.snapshot(st2)).sunk[0]===true,'snapshot giữ sunk');
  ok(R.snapshotFor(st2,1).sunk[0]===true,'snapshotFor có sunk');
}
{
  /* sandSink=0: không bao giờ lún */
  const R=Core.make(Core.ruleset('chaos',{sandSink:0}));
  const st=mk(R,terrOf([4,4,T.SAND]),[[5,4],[1,1]]);
  R.apply(st,{move:[4,4]});ok(!st.sunk[0]&&st.turn===1,'sandSink=0 → không lún');
}
{
  /* giày + lún: lượt thêm bị hủy */
  const R=Core.make(Core.ruleset('chaos',{sandSink:1}));
  const st=mk(R,terrOf([4,4,T.SAND]),[[5,4],[1,1]]);
  st.inv[0]=['boots'];R.apply(st,{item:{use:'boots'}});
  const r=R.apply(st,{move:[4,4]});
  ok(st.sunk[0]&&st.bonus[0]===0&&st.turn===1,'lún thì không được lượt thêm của giày');
}
{
  /* lún KHÔNG áp dụng cho dịch chuyển cổng / không có cát: ô thường không lún */
  const R=Core.make(Core.ruleset('chaos',{sandSink:1}));
  const st=mk(R,terrOf(),[[5,4],[1,1]]);R.apply(st,{move:[4,4]});
  ok(!st.sunk[0],'ô thường không lún');
}
{
  /* Xác suất: ~25% qua nhiều seed */
  const R=Core.make(Core.ruleset('chaos'));let n=0,K=4000;
  for(let s=1;s<=K;s++){const st=mk(R,terrOf([4,4,T.SAND]),[[5,4],[1,1]],s*7919);R.apply(st,{move:[4,4]});if(st.sunk[0])n++;}
  ok(n/K>.22&&n/K<.28,'tỉ lệ lún ≈ 25% (đo '+(100*n/K).toFixed(1)+'%)');
}
{
  /* Classic: không có terr nên không có sunk */
  const R=Core.make(Core.ruleset('classic'));const st=R.newState();
  ok(st.sunk===undefined,'Classic: không có trạng thái sunk');
}
console.log(fails?'THẤT BẠI '+fails+'/'+checks:'ĐẠT ('+checks+' kiểm tra)');
process.exit(fails?1:0);
