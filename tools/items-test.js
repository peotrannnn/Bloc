#!/usr/bin/env node
'use strict';
/* Kiểm thử rương và vật phẩm của lõi luật (js/core.js, chế độ Hỗn Loạn):   node tools/items-test.js
   Rương: mở khi đi vào / nhảy qua đối thủ đáp xuống / trượt băng dừng đúng ô; quà theo trọng số, deterministic theo seed; túi đầy thì bỏ món cũ nhất.
   Giày (miễn phí + lượt thêm chỉ đi quân), găng (≥2 tường), búa (trả tường), cuốc chim (khe bị chiếm vĩnh viễn, hết chắn đường).
   Cuối file: ván ngẫu nhiên có đủ rương/vật phẩm kiểm các bất biến (bảo toàn số tường, túi ≤ 2, chủ tường khớp, snapshot khứ hồi). */
const Core=require('../js/core.js');
let fails=0,checks=0;
const ok=(c,msg)=>{checks++;if(!c){fails++;console.log('  ✗',msg);}};
let seed=24681357;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
const pick=a=>a[Math.floor(rnd()*a.length)];
const T=Core.TERR;
const mkRS=gifts=>Core.ruleset('chaos',gifts?{gifts}:{});
const only=g=>mkRS([[g,1]]);
function mk(R,terr,o){
  const st=R.newState({spawn:[4,4],terr:terr||new Uint8Array(81),seed:(o&&o.seed)||7});
  if(o&&o.pl)st.pl=o.pl.map(p=>({r:p[0],c:p[1]}));
  if(o&&o.inv)st.inv=o.inv.map(b=>b.slice());
  return st;
}
const terrOf=(...cells)=>{const t=new Uint8Array(81);for(const[r,c,v]of cells)t[r*9+c]=v;return t;};
const sumWalls=(R,st)=>{let n=0;for(const o of['h','v'])for(let i=0;i<R.WN*R.WN;i++)if(st.ws[o][i])n++;return n;};

/* ---------- 1. Rương: mở khi bước vào ---------- */
console.log('Rương');
{
  const R=Core.make(mkRS());
  ok(T.CHEST===5,'mã ô rương = 5');
  const st=mk(R,terrOf([4,4,T.CHEST]),{pl:[[5,4],[1,1]]});
  ok(R.moves(st,0).some(m=>m[0]===4&&m[1]===4),'rương là ô đi được');
  const r=R.apply(st,{move:[4,4]});
  ok(r.ok&&st.pl[0].r===4&&st.pl[0].c===4,'quân bước vào ô rương');
  ok(st.terr[4*9+4]===0,'rương biến mất (ô thành ô thường)');
  const e=r.fx&&r.fx.find(x=>x.t==='chest');
  ok(e&&e.p===0&&e.cell.join()==='4,4'&&['brick','boots','hammer','glove','pick'].includes(e.gift),'fx chest đủ trường');
  ok(st.turn===1&&st.ply===1,'mở rương không đổi nhịp lượt');
}
/* quà theo từng loại */
for(const g of['brick','boots','hammer','glove','pick']){
  const R=Core.make(only(g)),st=mk(R,terrOf([4,4,T.CHEST]),{pl:[[5,4],[1,1]]});
  const r=R.apply(st,{move:[4,4]});
  const e=r.fx.find(x=>x.t==='chest');
  ok(e.gift===g,'ép quà '+g);
  if(g==='brick')ok(st.left[0]===11&&st.inv[0].length===0,'gạch: +1 tường, không vào túi');
  else ok(st.left[0]===10&&st.inv[0].join()===g,g+': vào túi, không đổi số tường');
}
/* túi đầy: bỏ món CŨ NHẤT, giữ món mới */
{
  const R=Core.make(only('hammer')),st=mk(R,terrOf([4,4,T.CHEST]),{pl:[[5,4],[1,1]],inv:[['boots','glove'],[]]});
  const r=R.apply(st,{move:[4,4]}),e=r.fx.find(x=>x.t==='chest');
  ok(st.inv[0].join()==='glove,hammer'&&e.drop==='boots','túi đầy: bỏ món cũ nhất (boots), giữ món mới');
  /* gạch khi túi đầy: không đụng túi */
  const R2=Core.make(only('brick')),s2=mk(R2,terrOf([4,4,T.CHEST]),{pl:[[5,4],[1,1]],inv:[['boots','glove'],[]]});
  const r2=R2.apply(s2,{move:[4,4]});
  ok(s2.inv[0].join()==='boots,glove'&&s2.left[0]===11&&!r2.fx.find(x=>x.t==='chest').drop,'gạch không làm đầy túi');
}
/* nhảy qua đối thủ đáp xuống rương */
{
  const R=Core.make(only('boots')),st=mk(R,terrOf([3,4,T.CHEST]),{pl:[[5,4],[4,4]]});
  const r=R.apply(st,{move:[3,4]});
  ok(r.ok&&st.pl[0].r===3&&st.terr[3*9+4]===0&&r.fx.some(x=>x.t==='chest'),'nhảy qua đối thủ đáp xuống rương: mở');
}
/* trượt băng dừng đúng ô rương: ô băng bị bao đá hai bên nên chỉ trượt được về phía rương */
{
  const R=Core.make(only('glove')),terr=terrOf([4,4,T.ICE],[4,3,T.STONE],[4,5,T.STONE],[3,4,T.CHEST]);
  const st=mk(R,terr,{pl:[[5,4],[0,0]]});
  const r=R.apply(st,{move:[4,4]});
  ok(r.ok&&st.pl[0].r===3&&st.pl[0].c===4,'trượt băng dừng trên ô rương');
  ok(r.fx[0].t==='slide'&&r.fx[1]&&r.fx[1].t==='chest'&&st.terr[3*9+4]===0&&st.inv[0].join()==='glove','slide rồi chest, rương mở');
}
/* quân đối thủ cũng mở được; ô rương không mở khi chỉ đặt tường */
{
  const R=Core.make(only('pick')),st=mk(R,terrOf([4,4,T.CHEST]),{pl:[[6,4],[3,4]]});
  R.apply(st,{wall:{o:'h',r:0,c:0}});               /* Trắng đặt tường */
  const r=R.apply(st,{move:[4,4]});                    /* Đen bước xuống rương (3,4)→(4,4) */
  ok(r.ok&&st.inv[1].join()==='pick'&&st.inv[0].length===0,'Đen mở rương: quà vào túi Đen');
}
/* deterministic: cùng seed + cùng nước → cùng quà; phân bố đúng cỡ */
{
  const R=Core.make(mkRS()),cnt={};let same=true;
  for(let s=1;s<=2000;s++){
    const a=mk(R,terrOf([4,4,T.CHEST]),{pl:[[5,4],[1,1]],seed:s}),b=mk(R,terrOf([4,4,T.CHEST]),{pl:[[5,4],[1,1]],seed:s});
    const ga=R.apply(a,{move:[4,4]}).fx[0].gift,gb=R.apply(b,{move:[4,4]}).fx[0].gift;
    if(ga!==gb)same=false;cnt[ga]=(cnt[ga]||0)+1;
  }
  ok(same,'cùng seed → cùng quà');
  const pc=g=>(cnt[g]||0)/20;   /* % trên 2000 lần */
  ok(Math.abs(pc('brick')-30)<4&&Math.abs(pc('boots')-20)<4&&Math.abs(pc('hammer')-20)<4&&Math.abs(pc('glove')-15)<4&&Math.abs(pc('pick')-15)<4,
     'tỉ lệ quà ≈ 30/20/20/15/15 (đo '+Object.keys(cnt).map(k=>k+' '+pc(k).toFixed(1)).join(', ')+')');
}
/* Classic: không có rương/vật phẩm, hành động item bị từ chối */
{
  const R=Core.make(Core.ruleset('classic')),st=R.newState();
  ok(!st.inv&&!st.wo&&!st.dead&&!st.bonus,'Classic không có trường vật phẩm');
  const v=R.apply(st,{item:{use:'boots'}});ok(!v.ok&&v.reason==='format','Classic từ chối item');
  R.apply(st,{wall:{o:'h',r:2,c:2}});
  const sn=R.snapshot(st);ok(sn.walls.length===1&&sn.walls[0].p===undefined&&sn.inv===undefined,'snapshot Classic không đổi định dạng');
}

/* ---------- 2. Giày ---------- */
console.log('Giày');
{
  const R=Core.make(mkRS());
  let st=mk(R,null,{pl:[[5,4],[1,1]],inv:[['boots'],[]]});
  let r=R.apply(st,{item:{use:'boots'}});
  ok(r.ok&&r.free&&st.ply===0&&st.turn===0&&st.bonus[0]===1&&st.inv[0].length===0,'dùng giày: miễn phí, không đổi lượt/ply');
  ok(!R.apply(st,{item:{use:'boots'}}).ok,'không dùng giày hai lần');
  r=R.apply(st,{move:[4,4]});
  ok(r.ok&&st.turn===0&&st.bonus[0]===2&&st.ply===1,'hành động đầu xong: vẫn lượt của mình (lượt thêm)');
  let v=R.apply(st,{wall:{o:'h',r:2,c:2}});ok(!v.ok&&v.reason==='moveonly','lượt thêm: không được đặt tường');
  st.inv[0]=['glove'];v=R.apply(st,{item:{use:'glove'}});ok(!v.ok&&v.reason==='moveonly','lượt thêm: không được dùng vật phẩm');
  st.inv[0]=[];
  r=R.apply(st,{move:[3,4]});
  ok(r.ok&&st.turn===1&&st.bonus[0]===0&&st.ply===2,'lượt thêm xong: chuyển lượt, hết bonus');
  /* hành động đầu là đặt tường vẫn được lượt thêm */
  st=mk(R,null,{pl:[[5,4],[1,1]],inv:[['boots'],[]]});
  R.apply(st,{item:{use:'boots'}});r=R.apply(st,{wall:{o:'h',r:2,c:2}});
  ok(r.ok&&st.turn===0&&st.bonus[0]===2,'đặt tường rồi vẫn có lượt thêm đi quân');
  r=R.apply(st,{move:[4,4]});ok(st.turn===1,'rồi mới sang đối thủ');
  /* hành động đầu là vật phẩm tốn lượt (găng) */
  st=mk(R,null,{pl:[[5,4],[1,1]],inv:[['boots','glove'],[]]});
  R.apply(st,{item:{use:'boots'}});r=R.apply(st,{item:{use:'glove'}});
  ok(r.ok&&st.turn===0&&st.bonus[0]===2&&st.left[1]===9,'giày + găng: găng tốn lượt đầu, vẫn còn lượt thêm');
  /* lượt đầu bước vào nước → đứng yên → mất lượt thêm */
  st=mk(R,terrOf([4,4,T.WATER]),{pl:[[5,4],[1,1]],inv:[['boots'],[]]});
  R.apply(st,{item:{use:'boots'}});r=R.apply(st,{move:[4,4]});
  ok(r.ok&&st.stuck[0]&&st.turn===1&&st.bonus[0]===0,'bước vào nước: mất lượt thêm (đứng yên)');
  /* thắng ngay ở hành động đầu: không có lượt thêm */
  st=mk(R,null,{pl:[[1,4],[7,1]],inv:[['boots'],[]]});
  R.apply(st,{item:{use:'boots'}});r=R.apply(st,{move:[0,4]});
  ok(r.over&&r.winner===0,'tới đích ở hành động đầu: thắng luôn');
  /* người đang đứng yên (nước) dùng giày + đặt tường → lượt thêm được đi */
  st=mk(R,terrOf([5,4,T.WATER]),{pl:[[5,4],[1,1]],inv:[['boots'],[]]});st.stuck[0]=true;
  R.apply(st,{item:{use:'boots'}});r=R.apply(st,{wall:{o:'h',r:2,c:2}});
  ok(r.ok&&st.turn===0&&st.bonus[0]===2&&R.moves(st,0).length>0,'đang đứng yên + giày: đặt tường xong vẫn được đi ở lượt thêm');
}

/* ---------- 3. Găng tay ---------- */
console.log('Găng tay');
{
  const R=Core.make(mkRS());
  let st=mk(R,null,{pl:[[5,4],[1,1]],inv:[['glove'],[]]});
  let r=R.apply(st,{item:{use:'glove'}});
  ok(r.ok&&st.left[0]===11&&st.left[1]===9&&st.turn===1&&st.ply===1&&st.inv[0].length===0,'cướp 1 tường, tốn một lượt');
  ok(r.fx[0].t==='glove'&&r.fx[0].p===0,'fx glove');
  st=mk(R,null,{pl:[[5,4],[1,1]],inv:[['glove'],[]]});st.left[1]=1;
  const snap=JSON.stringify(R.snapshot(st));r=R.apply(st,{item:{use:'glove'}});
  ok(!r.ok&&r.reason==='glovefail'&&JSON.stringify(R.snapshot(st))===snap,'đối thủ chỉ còn 1 tường: không cướp được, không đổi gì');
  st.left[1]=2;r=R.apply(st,{item:{use:'glove'}});ok(r.ok&&st.left[1]===1&&st.left[0]===11,'đối thủ còn đúng 2 tường: cướp được');
  st=mk(R,null,{pl:[[5,4],[1,1]]});
  r=R.apply(st,{item:{use:'glove'}});ok(!r.ok&&r.reason==='noitem','không có găng: bị từ chối');
}

/* ---------- 4. Búa & cuốc chim ---------- */
console.log('Búa và cuốc chim');
{
  const R=Core.make(mkRS());
  /* Trắng đặt h(2,0), Đen đặt v(5,6), rồi Trắng có búa */
  const setup=inv=>{const st=mk(R,null,{pl:[[6,4],[2,4]],inv});
    R.apply(st,{wall:{o:'h',r:2,c:0}});R.apply(st,{wall:{o:'v',r:5,c:6}});return st;};
  let st=setup([['hammer'],[]]);
  ok(st.wo.h[2*8+0]===1&&st.wo.v[5*8+6]===2,'chủ tường được ghi đúng (1 = Trắng, 2 = Đen)');
  ok(R.oppWalls(st,0).length===1&&R.oppWalls(st,0)[0].o==='v'&&R.oppWalls(st,1)[0].o==='h','oppWalls trả tường của đối thủ');
  for(const t of[{o:'h',r:2,c:0},{o:'h',r:4,c:4},{o:'v',r:9,c:0},{o:'x',r:1,c:1}]){
    const sn=JSON.stringify(R.snapshot(st)),v=R.apply(st,{item:{use:'hammer',...t}});
    ok(!v.ok&&JSON.stringify(R.snapshot(st))===sn,'búa từ chối mục tiêu '+JSON.stringify(t));
  }
  const L1=st.left[1],ply0=st.ply;
  let r=R.apply(st,{item:{use:'hammer',o:'v',r:5,c:6}});
  ok(r.ok&&st.ws.v[5*8+6]===0&&st.wo.v[5*8+6]===0&&st.left[1]===L1+1,'búa: tháo tường đối thủ, trả lại cho đối thủ');
  ok(r.free===true&&st.turn===0&&st.ply===ply0&&!r.skipped&&st.inv[0].length===0,'búa MIỄN PHÍ: không tốn lượt, ply giữ nguyên, vẫn là lượt mình, búa mất khỏi túi');
  ok(r.fx[0].t==='hammer'&&r.fx[0].o==='v'&&st.dead.v[5*8+6]===0,'fx hammer, khe không bị chiếm');
  ok(R.canWall(st,'v',5,6),'khe đã tháo đặt lại được');
  {  /* dùng búa xong vẫn đi quân hoặc đặt tường được, rồi mới tới lượt đối thủ */
    let s2=setup([['hammer'],[]]);R.apply(s2,{item:{use:'hammer',o:'v',r:5,c:6}});
    const mv=R.moves(s2,0);
    ok(mv.length>0&&R.apply(s2,{move:mv[0]}).ok&&s2.turn===1&&s2.ply===ply0+1,'búa rồi đi quân: một lượt trọn vẹn, sau đó tới đối thủ');
    s2=setup([['hammer'],[]]);R.apply(s2,{item:{use:'hammer',o:'v',r:5,c:6}});
    const w0=s2.left[0];
    ok(R.apply(s2,{wall:{o:'v',r:5,c:6}}).ok&&s2.left[0]===w0-1&&s2.turn===1,'búa rồi đặt tường (kể cả đúng khe vừa tháo): hợp lệ');
    /* tháo tường mở đường thật: quân bị tường chắn trước mặt thì sau búa đi được ô đó */
    const sb=mk(R,null,{pl:[[6,4],[2,4]],inv:[['hammer'],[]]});
    R.apply(sb,{wall:{o:'h',r:2,c:0}});R.apply(sb,{wall:{o:'h',r:5,c:4}});   /* Đen chắn h(5,4): giữa hàng 5-6, cột 4-5 → Trắng ở (6,4) không lên (5,4) được */
    ok(!R.moves(sb,0).some(m=>m[0]===5&&m[1]===4),'trước búa: tường Đen chắn lối lên');
    R.apply(sb,{item:{use:'hammer',o:'h',r:5,c:4}});
    ok(R.moves(sb,0).some(m=>m[0]===5&&m[1]===4)&&R.apply(sb,{move:[5,4]}).ok,'sau búa: đi được ngay trong cùng lượt');
    /* hai búa liền: túi 2 búa dùng được cả hai trong một lượt, vẫn miễn phí */
    const s3=mk(R,null,{pl:[[6,4],[2,4]],inv:[['hammer','hammer'],[]]});
    R.apply(s3,{wall:{o:'h',r:2,c:0}});R.apply(s3,{wall:{o:'v',r:5,c:6}});
    R.apply(s3,{wall:{o:'h',r:1,c:5}});R.apply(s3,{wall:{o:'v',r:3,c:6}});
    const pl3=s3.ply;
    ok(R.apply(s3,{item:{use:'hammer',o:'v',r:5,c:6}}).ok&&R.apply(s3,{item:{use:'hammer',o:'v',r:3,c:6}}).ok&&s3.turn===0&&s3.ply===pl3&&s3.inv[0].length===0,'hai búa liền trong một lượt, đều miễn phí');
    /* không có búa thì không dùng được; mục tiêu sai không đổi gì (đã kiểm ở trên) */
    ok(!R.apply(setup([[],[]]),{item:{use:'hammer',o:'v',r:5,c:6}}).ok,'không có búa trong túi: từ chối');
  }
  /* cuốc chim */
  st=setup([['pick'],[]]);
  const L1b=st.left[1];
  r=R.apply(st,{item:{use:'pick',o:'v',r:5,c:6}});
  ok(r.ok&&st.ws.v[5*8+6]===0&&st.dead.v[5*8+6]===1&&st.left[1]===L1b,'cuốc chim: phá hẳn, không trả tường');
  ok(!R.blk(st,5,6,0,1)&&!R.blk(st,5,7,0,-1),'tường bị phá không còn chắn đường');
  ok(!R.canWall(st,'v',5,6),'không xây lại cùng khe');
  ok(!R.canWall(st,'h',5,6),'không đặt tường ngang cắt ngang khe đó');
  ok(!R.canWall(st,'v',4,6)&&!R.canWall(st,'v',6,6),'không đặt tường chồng lên đầu khe đó');
  ok(R.canWall(st,'v',5,4)&&R.canWall(st,'h',5,5),'khe khác vẫn đặt bình thường');
  /* tường h cũng vậy: kiểm chồng đầu ngang */
  st=mk(R,null,{pl:[[6,4],[2,4]],inv:[['pick'],[]]});
  R.apply(st,{wall:{o:'h',r:2,c:0}});R.apply(st,{wall:{o:'h',r:5,c:5}});
  R.apply(st,{item:{use:'pick',o:'h',r:5,c:5}});
  ok(!R.canWall(st,'h',5,5)&&!R.canWall(st,'h',5,4)&&!R.canWall(st,'h',5,6)&&!R.canWall(st,'v',5,5)&&R.canWall(st,'h',5,2),'tường ngang bị phá: khe, hai đầu chồng và khe chéo đều bị chiếm');
  /* hết tường mà bị đứng yên nhưng còn búa: không bị bỏ lượt oan */
  st=mk(R,terrOf([6,4,T.WATER]),{pl:[[6,4],[2,4]],inv:[['hammer'],[]]});
  R.apply(st,{wall:{o:'h',r:2,c:0}});R.apply(st,{wall:{o:'v',r:5,c:6}});
  st.left[0]=0;st.stuck[0]=true;st.turn=0;
  ok(R.hasPaidItem(st,0)&&R.check(st,{item:{use:'hammer',o:'v',r:5,c:6}}).ok,'đứng yên, hết tường: vẫn dùng được búa');
  {  /* búa MIỄN PHÍ nhưng nếu dùng xong p vẫn hết hành động (đứng yên, hết tường, hết đồ) thì mất lượt như mọi lượt bí khác, không kẹt ván */
    const r2=R.apply(st,{item:{use:'hammer',o:'v',r:5,c:6}});
    ok(r2.ok&&r2.free===false&&r2.skipped&&r2.skipped[0]===0&&st.turn===1&&st.stuck[0]===false,'đứng yên + hết tường: búa xong vẫn bí → mất lượt, chuyển cho đối thủ');
  }
  /* trong lượt thêm của giày (chỉ được đi quân) thì búa bị từ chối */
  {
    const sg=mk(R,null,{pl:[[6,4],[2,4]],inv:[['boots','hammer'],[]]});
    R.apply(sg,{wall:{o:'h',r:2,c:0}});R.apply(sg,{wall:{o:'v',r:5,c:6}});
    R.apply(sg,{item:{use:'boots'}});R.apply(sg,{move:[5,4]});   /* giày + một nước đi → lượt thêm */
    ok(sg.bonus[0]===2&&sg.turn===0&&R.apply(sg,{item:{use:'hammer',o:'v',r:5,c:6}}).reason==='moveonly','lượt thêm của giày: không dùng búa (chỉ đi quân)');
  }
  {  /* giày chờ rồi búa: búa không phá giày chờ, lượt thêm vẫn tới */
    const sg=mk(R,null,{pl:[[6,4],[2,4]],inv:[['boots','hammer'],[]]});
    R.apply(sg,{wall:{o:'h',r:2,c:0}});R.apply(sg,{wall:{o:'v',r:5,c:6}});
    R.apply(sg,{item:{use:'boots'}});R.apply(sg,{item:{use:'hammer',o:'v',r:5,c:6}});
    ok(sg.bonus[0]===1&&sg.turn===0,'giày chờ + búa: cả hai miễn phí, giày vẫn chờ');
    R.apply(sg,{move:[5,4]});
    ok(sg.bonus[0]===2&&sg.turn===0,'...rồi đi quân: vẫn được lượt thêm của giày');
  }
}

/* ---------- 5. Snapshot ---------- */
console.log('Snapshot');
{
  const R=Core.make(mkRS());
  const st=mk(R,terrOf([4,4,T.CHEST]),{pl:[[6,4],[2,4]],inv:[['boots','pick'],['glove']]});
  R.apply(st,{wall:{o:'h',r:2,c:0}});R.apply(st,{wall:{o:'v',r:5,c:6}});
  R.apply(st,{item:{use:'pick',o:'v',r:5,c:6}});
  st.bonus=[0,1];
  const js=JSON.stringify(R.snapshot(st)),back=R.fromSnapshot(JSON.parse(js));
  ok(JSON.stringify(R.snapshot(back))===js,'snapshot ↔ JSON khứ hồi giữ nguyên');
  ok(back.wo.h[2*8+0]===1&&back.dead.v[5*8+6]===1&&back.inv[0].join()==='boots'&&back.inv[1].join()==='glove'&&back.bonus[1]===1,'owner, dead, túi, bonus được nạp lại');
  const sf=R.snapshotFor(st,0);
  ok(sf.inv[1].join()==='glove'&&sf.walls[0].p===0,'snapshotFor giữ túi đồ công khai và chủ tường');
  /* snapshot cũ (trước vật phẩm) vẫn nạp được */
  const old=JSON.parse(js);delete old.inv;delete old.bonus;delete old.dead;old.walls.forEach(w=>delete w.p);
  const o2=R.fromSnapshot(old);ok(o2.inv[0].length===0&&o2.bonus[0]===0&&o2.wo&&true,'snapshot cũ nạp được với mặc định');
}

/* ---------- 6. Ván ngẫu nhiên đầy đủ ---------- */
console.log('Ván ngẫu nhiên');
{
  const R=Core.make(mkRS()),WN=R.WN;
  let games=0,chests=0,used={boots:0,glove:0,hammer:0,pick:0},bricks=0;
  for(let g=0;g<250;g++){
    const terr=new Uint8Array(81);
    for(let i=0;i<4;i++){const r=2+Math.floor(rnd()*5),c=Math.floor(rnd()*9);terr[r*9+c]=T.CHEST;}
    for(let i=0;i<3;i++){const r=2+Math.floor(rnd()*5),c=Math.floor(rnd()*9);if(!terr[r*9+c])terr[r*9+c]=pick([T.ICE,T.WATER,T.SAND,T.TRAP]);}
    const st=R.newState({spawn:[4,4],terr,seed:1+g});
    let extraBricks=0,ply=0;
    while(!st.over&&ply++<400){
      const p=st.turn,cand=[];
      for(const m of R.moves(st,p))cand.push({move:m});
      const extra=st.bonus[p]===2;   /* lượt thêm của giày: chỉ đi quân */
      if(!extra&&st.left[p]>0&&rnd()<.5){for(let k=0;k<6;k++){const o=pick(['h','v']),r=Math.floor(rnd()*WN),c=Math.floor(rnd()*WN);if(R.canWall(st,o,r,c))cand.push({wall:{o,r,c}});}}
      if(!extra)for(const u of st.inv[p]){
        if(u==='boots'||u==='glove'){if(R.check(st,{item:{use:u}}).ok){cand.push({item:{use:u}});cand.push({item:{use:u}});}}
        else for(const w of R.oppWalls(st,p))cand.push({item:{use:u,...w}});
      }
      if(!cand.length)break;
      /* hành động bị từ chối thì không đổi st */
      const bad=[{item:{use:'nope'}},{item:{}},{item:null},{item:{use:'hammer',o:'h',r:99,c:0}}];
      for(const b of bad){const sn=JSON.stringify(R.snapshot(st));const v=R.apply(st,b);ok(!v.ok,'hành động item rác bị từ chối');ok(JSON.stringify(R.snapshot(st))===sn,'từ chối không đổi st');}
      const a=pick(cand),chk=R.check(st,a),before=st.turn,beforePly=st.ply,bonus0=st.bonus.slice();
      ok(chk.ok,'ứng viên hợp lệ phải qua check');
      const r=R.apply(st,a);
      ok(r.ok,'apply khớp check');if(!r.ok)break;
      if(a.item)used[a.item.use]++;
      for(const e of r.fx||[]){if(e.t==='chest'){chests++;if(e.gift==='brick'){bricks++;extraBricks++;}}}
      if(r.free)ok(st.ply===beforePly&&st.turn===before,'giày không đổi ply/lượt');
      else ok(st.ply===beforePly+1+(r.skipped?r.skipped.length:0),'hành động thường: ply +1 (cộng lượt bị bỏ qua nếu có)');
      /* bất biến */
      ok(st.inv.every(b=>b.length<=2),'túi tối đa 2');
      ok(st.left[0]>=0&&st.left[1]>=0,'số tường không âm');
      let consist=true,dead=0;
      for(const o of['h','v'])for(let i=0;i<WN*WN;i++){
        if((st.ws[o][i]===1)!==(st.wo[o][i]>0))consist=false;
        if(st.dead[o][i]){dead++;if(st.ws[o][i])consist=false;}
      }
      ok(consist,'chủ tường khớp ws; tường chết không trùng tường sống');
      ok(st.left[0]+st.left[1]+sumWalls(R,st)+dead===20+extraBricks,'bảo toàn tổng số tường (20 + gạch nhặt được; tường bị phá vẫn tính là ô chết)');
      if(st.bonus[st.turn]===2&&!st.over)ok(R.moves(st,st.turn).length>0,'lượt thêm luôn có nước đi');
      if(ply%9===0){const js=JSON.stringify(R.snapshot(st));ok(JSON.stringify(R.snapshot(R.fromSnapshot(JSON.parse(js))))===js,'snapshot khứ hồi giữa ván');}
    }
    games++;
  }
  console.log('  ('+games+' ván; rương mở '+chests+'; gạch '+bricks+'; dùng giày '+used.boots+', găng '+used.glove+', búa '+used.hammer+', cuốc '+used.pick+')');
  ok(chests>100&&used.boots>0&&used.glove>0&&used.hammer>0&&used.pick>0,'ván ngẫu nhiên đã chạm đủ mọi vật phẩm');
}

console.log(fails?'\nTHẤT BẠI '+fails+'/'+checks+' kiểm tra':'\nTất cả '+checks+' kiểm tra đạt');
process.exit(fails?1:0);
