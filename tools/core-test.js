#!/usr/bin/env node
'use strict';
/* Kiểm thử lõi luật (js/core.js) — chạy độc lập bằng Node, không cần config/trình duyệt:   node tools/core-test.js
   Nội dung: ván ngẫu nhiên chạy hết bằng Core.apply; hành động sai bị từ chối và không đổi trạng thái; nhảy thẳng/nhảy chéo;
   tường làm kín đường bị từ chối; snapshot ↔ JSON; ruleset cỡ khác (N=7) chạy được, chứng tỏ lõi không phụ thuộc hằng số toàn cục.
   Phần 'chaos' (cuối file): bàn 9x9 + 10 tường như Classic, spawn tùy ý, đá chặn, mê cung đường dài, người chặn đường, ô nước/cát (cạnh cấm tường, đứng yên, mất lượt), hết nước đi thì bên gần đích thắng. */
const Core=require('../js/core.js');
let fails=0,checks=0;
const ok=(c,msg)=>{checks++;if(!c){fails++;console.log('  ✗',msg);}};
let seed=987654321;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
const pick=a=>a[Math.floor(rnd()*a.length)];

function allWalls(R,st){const out=[];for(const o of['h','v'])for(let r=0;r<R.WN;r++)for(let c=0;c<R.WN;c++)if(R.canWall(st,o,r,c))out.push({o,r,c});return out;}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

for(const rsDef of[Core.ruleset('classic'),Core.ruleset('classic',{id:'mini',N:7,walls:6,maxPly:200})]){
  const R=Core.make(rsDef);console.log('Ruleset',rsDef.id,'N='+rsDef.N,'tường='+rsDef.walls);
  let finished=0,draws=0;
  for(let g=0;g<60;g++){
    const st=R.newState();
    ok(st.pl[0].r===R.N-1&&st.pl[1].r===0&&st.left[0]===rsDef.walls,'trạng thái ban đầu');
    while(!st.over){
      const p=st.turn,snap=JSON.stringify(R.snapshot(st));
      /* hành động sai phải bị từ chối và KHÔNG đổi st */
      const bads=[null,{},{move:[99,99]},{move:[st.pl[p].r,st.pl[p].c]},{wall:{o:'x',r:0,c:0}},{wall:{o:'h',r:-1,c:0}},{wall:{o:'h',r:0.5,c:0}}];
      for(const b of bads){const v=R.apply(st,b);ok(!v.ok&&JSON.stringify(R.snapshot(st))===snap,'từ chối '+JSON.stringify(b));}
      let a;
      const ws=st.left[p]>0&&rnd()<.4?allWalls(R,st):[];
      a=ws.length?{wall:pick(ws)}:{move:pick(R.moves(st,p))};
      const chk=R.check(st,a);ok(chk.ok,'check khớp hành động hợp lệ');
      const res=R.apply(st,a);ok(res.ok&&res.by===p,'apply hành động hợp lệ');
      if(st.over)break;
      ok(st.turn===1-p,'đổi lượt');
      ok(R.dist(st,0,st.pl[0])<R.NOPATH&&R.dist(st,1,st.pl[1])<R.NOPATH,'không bao giờ bị kín đường');
    }
    ok(R.apply(st,{move:[0,0]}).reason==='over','sau khi hết ván mọi hành động bị từ chối');
    if(st.draw)draws++;else{finished++;ok(st.winner===0||st.winner===1,'có người thắng');ok(st.pl[st.winner].r===R.goalRow(st.winner),'người thắng đã tới hàng đích');}
    /* snapshot ↔ JSON ↔ trạng thái */
    const sn=R.snapshot(st),back=R.snapshot(R.fromSnapshot(JSON.parse(JSON.stringify(sn))));ok(same(sn,back),'snapshot đi về nguyên vẹn');
  }
  console.log('  ván có người thắng:',finished,'· hòa:',draws);
}

/* ----- Tình huống nhảy ----- */
{
  const R=Core.make(Core.ruleset('classic')),st=R.newState();
  st.pl=[{r:4,c:4},{r:3,c:4}];st.turn=0;
  let m=R.moves(st,0).map(x=>x.join(',')).sort();
  ok(m.includes('2,4')&&!m.includes('3,4'),'nhảy thẳng qua đầu đối thủ');
  R.setW(st,'h',2,3,1);   /* tường sau lưng đối thủ (giữa hàng 2 và 3, cột 3-4) */
  m=R.moves(st,0).map(x=>x.join(',')).sort();
  ok(!m.includes('2,4')&&m.includes('3,3')&&m.includes('3,5'),'bị chắn sau lưng → nhảy chéo hai bên');
  ok(R.apply(st,{move:[3,5]}).ok&&st.pl[0].c===5&&st.pl[0].r===3,'đi nước nhảy chéo');
}
/* ----- Tường làm kín đường bị từ chối ----- */
{
  const R=Core.make(Core.ruleset('classic')),st=R.newState();
  /* dựng hàng rào ngang kín gần hết giữa hàng 3 và 4, chừa đúng một khe ở cột 0-1; tường lấp nốt khe phải bị từ chối */
  for(const c of[2,4,6])R.setW(st,'h',3,c,1);R.setW(st,'h',3,7,0);
  R.setW(st,'h',3,7,1);   /* cột 7-8 */
  ok(R.canWall(st,'h',3,0)===false,'tường lấp khe cuối làm kín đường → bị từ chối');
  ok(R.check(st,{wall:{o:'h',r:3,c:0}}).reason==='badwall','lý do badwall');
  st.left[0]=0;ok(R.check(st,{wall:{o:'h',r:0,c:0}}).reason==='nowalls','hết tường');
}

/* ===================== Ruleset 'chaos' (bàn 9x9, 10 tường như Classic, có địa hình) ===================== */
console.log('Ruleset chaos');
const CH=Core.ruleset('chaos');
ok(CH.N===9&&CH.walls===10&&CH.maxPly===300&&CH.maxPlyCloser===true,'thông số chaos');
const idx=(R,r,c)=>r*R.N+c;
/* BFS độc lập (không dùng R.dist) để đối chiếu */
function refDist(R,st,p){
  const goal=R.goalRow(p),seen=new Set(),q=[[st.pl[p].r,st.pl[p].c,0]];seen.add(idx(R,st.pl[p].r,st.pl[p].c));
  for(let h=0;h<q.length;h++){
    const[r,c,d]=q[h];if(r===goal)return d;
    for(const[dr,dc]of R.D){
      if(R.blk(st,r,c,dr,dc))continue;
      const r2=r+dr,c2=c+dc;if(!R.open(st,r2,c2)||seen.has(idx(R,r2,c2)))continue;
      seen.add(idx(R,r2,c2));q.push([r2,c2,d+1]);
    }
  }
  return R.NOPATH;
}
{
  const R=Core.make(CH);
  ok(R.N===9&&R.WN===8,'bàn 9x9');
  /* spawn tùy ý, không đối xứng */
  const st=R.newState({spawn:[3,6]});
  ok(st.pl[0].r===8&&st.pl[0].c===3&&st.pl[1].r===0&&st.pl[1].c===6,'spawn tùy ý');
  ok(st.spawn[0].c===3&&st.spawn[1].c===6,'nhớ ô xuất phát');
  ok(st.left[0]===10&&st.left[1]===10,'mỗi bên đủ 10 tường');
  /* Classic không bị thêm trường địa hình */
  const cl=Core.make(Core.ruleset('classic')).newState();
  ok(cl.terr===undefined&&cl.blocker===undefined&&cl.spawn===undefined,'Classic không có trường địa hình');
  ok(Object.keys(Core.make(Core.ruleset('classic')).snapshot(cl)).sort().join()==='draw,left,over,pl,ply,turn,walls,winner','snapshot Classic giữ nguyên các khóa');
}
{ /* đá chặn đường đi, BFS đi vòng, nhảy vào đá bị coi là chặn */
  const R=Core.make(CH),terr=new Uint8Array(81);
  terr[idx(R,7,5)]=1;
  const st=R.newState({spawn:[5,5],terr});
  ok(!R.moves(st,0).some(m=>m[0]===7&&m[1]===5),'không bước vào ô đá');
  ok(R.check(st,{move:[7,5]}).reason==='badmove','đi vào đá bị từ chối');
  ok(R.dist(st,0,st.pl[0])===9,'đá ngay trước mặt: đi vòng thêm đúng 1 bước (9)');
  /* hàng rào đá kín trừ một khe → đường dài thêm */
  const t2=new Uint8Array(81);for(let c=0;c<9;c++)if(c!==8)t2[idx(R,4,c)]=1;
  const s2=R.newState({spawn:[0,0],terr:t2});
  ok(R.dist(s2,0,s2.pl[0])===refDist(R,s2,0),'BFS khớp BFS đối chiếu qua khe hẹp');
  ok(R.dist(s2,0,s2.pl[0])>8,'khe hẹp làm đường dài ra');
  /* nhảy: đối thủ ngay trước mặt, ô sau lưng đối thủ là đá → nhảy chéo */
  const t3=new Uint8Array(81);t3[idx(R,3,4)]=1;
  const s3=R.newState({spawn:[4,4],terr:t3});s3.pl=[{r:5,c:4},{r:4,c:4}];s3.turn=0;
  const m=R.moves(s3,0).map(x=>x.join(','));
  ok(!m.includes('3,4')&&m.includes('4,3')&&m.includes('4,5'),'sau lưng đối thủ là đá → nhảy chéo');
  /* tường làm kín đường nhờ đá cũng bị từ chối */
  const t4=new Uint8Array(81);for(let c=2;c<9;c++)t4[idx(R,4,c)]=1;
  const s4=R.newState({spawn:[4,4],terr:t4});
  /* khe còn lại ở cột 0-1 hàng 4: tường ngang giữa hàng 4 và 5 phủ cột 0-1 sẽ bịt nốt */
  ok(R.canWall(s4,'h',4,0)===false,'tường bịt khe cuối cùng của hàng đá bị từ chối');
  ok(R.canWall(s4,'h',4,4)===true,'tường ở chỗ khác vẫn hợp lệ');
  /* snapshot ↔ JSON giữ địa hình */
  const sn=JSON.parse(JSON.stringify(R.snapshot(s4))),back=R.fromSnapshot(sn);
  ok(same(R.snapshot(back),sn)&&back.terr[idx(R,4,5)]===1&&back.blocker===-1&&back.spawn[0].c===4,'snapshot chaos đi về nguyên vẹn');
  ok(sn.terr.length===81,'terr nén thành chuỗi 81 chữ số');
}
{ /* mê cung rắn: đường đi rất dài vẫn tính đúng (kiểm lại BFS trên đường quanh co) */
  const R=Core.make(CH),st=R.newState({spawn:[4,4]});
  /* tường ngang giữa hàng r và r+1 phủ gần hết hàng, chừa khe luân phiên trái (cột 0) / phải (cột 8).
     WN=8 nên hàng chừa khe trái đặt tường ở cột lẻ 1,3,5,7 (phủ cột 1..8), hàng chừa khe phải đặt ở cột chẵn 0,2,4,6 (phủ cột 0..7) */
  for(let r=0;r<R.WN;r++){
    const gapLeft=r%2===0;
    for(let c=gapLeft?1:0;c<R.WN;c+=2)R.setW(st,'h',r,c,1);
  }
  const d0=R.dist(st,0,st.pl[0]),ref=refDist(R,st,0);
  ok(d0>50&&d0<R.NOPATH,'mê cung rắn: đường đi dài vẫn tính đúng ('+d0+')');
  ok(d0===ref,'khớp BFS đối chiếu ('+d0+' vs '+ref+')');
}
{ /* người chặn đường: chặn như đá; tường phải giữ đường cả khi có lẫn khi không có người chặn */
  const R=Core.make(CH),st=R.newState({spawn:[2,6]});
  st.blocker=idx(R,8,3);   /* ngay cạnh Trắng (hàng 8, cột 2) */
  ok(!R.moves(st,0).some(m=>m[0]===8&&m[1]===3),'không bước vào ô người chặn');
  ok(R.check(st,{move:[8,3]}).reason==='badmove','đi vào người chặn bị từ chối');
  /* hàng rào tường ngang giữa hàng 3 và 4 phủ cột 0..5; còn khe cột 6..8. Tường (3,6) phủ cột 6-7 chỉ chừa cột 8.
     Người chặn đứng ở (3,8): lúc có người chặn thì khe cuối bị bịt → tường phải bị từ chối; lúc không có người chặn thì vẫn còn đường. */
  const s2=R.newState({spawn:[4,4]});
  for(const c of[0,2,4])R.setW(s2,'h',3,c,1);
  s2.blocker=idx(R,3,8);
  const withB=R.wallDists(s2,'h',3,6);
  s2.blocker=-1;const noB=R.wallDists(s2,'h',3,6);
  ok(withB===null&&noB!==null,'có người chặn bịt khe cuối thì tường bị từ chối, bỏ người chặn thì tường hợp lệ');
  s2.blocker=idx(R,3,8);ok(R.canWall(s2,'h',3,6)===false,'canWall từ chối khi có người chặn bịt khe');
}
/* ----- Ô nước / ô cát: cạnh giữa hai ô nước/cát kề nhau không đặt được tường ----- */
{
  const R=Core.make(CH),WT=Core.TERR.WATER,SD=Core.TERR.SAND;
  ok(WT===7&&SD===8&&Core.TERR.STONE===1,'mã ô nước=7, cát=8, đá=1');
  const mk=cells=>{const terr=new Uint8Array(81);for(const[r,c,v]of cells)terr[r*9+c]=v;return R.newState({spawn:[4,4],terr});};
  /* nước–nước, cát–cát, nước–cát đều là liên kết; kề chéo thì KHÔNG */
  const st=mk([[4,3,WT],[4,4,WT],[2,6,SD],[2,7,SD],[6,1,WT],[6,2,SD],[0,0,0]]);
  ok(R.bridged(st,4,3,4,4)&&R.bridged(st,2,6,2,7)&&R.bridged(st,6,1,6,2),'nước–nước, cát–cát, nước–cát kề nhau đều là liên kết');
  ok(!R.bridged(st,4,4,5,5)&&!R.bridged(st,4,3,3,3),'kề chéo / kề ô thường không phải liên kết');
  /* cạnh dọc giữa (4,3)-(4,4): tường 'v' c=3 phủ hàng r và r+1 → r=4 (hàng 4,5) hoặc r=3 (hàng 3,4) đều phủ cạnh đó */
  ok(R.canWall(st,'v',4,3)===false&&R.canWall(st,'v',3,3)===false,'tường phủ cạnh nước–nước bị từ chối (cả hai cách phủ)');
  ok(R.check(st,{wall:{o:'v',r:4,c:3}}).reason==='badwall','lý do badwall');
  ok(R.canWall(st,'v',5,3)===true,'tường kế bên (không phủ cạnh cấm) vẫn hợp lệ');
  ok(R.canWall(st,'v',2,6)===false&&R.canWall(st,'v',1,6)===false,'cát–cát cũng cấm');
  ok(R.canWall(st,'v',6,1)===false&&R.canWall(st,'v',5,1)===false,'nước–cát cũng cấm');
  /* cạnh ngang: 2 ô nước chồng dọc (3,5),(4,5): tường 'h' r=3 phủ cột c và c+1 */
  const s2=mk([[3,5,WT],[4,5,SD]]);
  ok(R.canWall(s2,'h',3,5)===false&&R.canWall(s2,'h',3,4)===false,'cạnh ngang giữa hai ô nước/cát chồng dọc bị cấm (cả hai cách phủ)');
  ok(R.canWall(s2,'h',3,3)===true&&R.canWall(s2,'h',3,6)===true,'tường ngang cách xa vẫn hợp lệ');
  /* chỉ MỘT ô nước, hoặc nước kề ô thường → không cấm */
  const s3=mk([[4,4,WT],[4,5,0],[5,4,SD]]);
  ok(R.canWall(s3,'v',4,4)===true,'nước kề ô thường: không cấm');
  ok(R.canWall(s3,'h',4,4)===false,'… nhưng nước (4,4) kề cát (5,4) thì cấm tường ngang phủ cạnh đó');
  /* Classic không có luật này; chaos không có terr cũng không */
  const cl=Core.make(Core.ruleset('classic')),cs=cl.newState();
  ok(cl.canWall(cs,'v',4,3)===true&&cl.bridged(cs,4,3,4,4)===false,'Classic không bị ảnh hưởng');
}
/* ----- Ô nước: vừa bước vào thì lượt sau chỉ được đặt tường ----- */
{
  const R=Core.make(CH),terr=new Uint8Array(81);terr[7*9+4]=Core.TERR.WATER;terr[6*9+4]=Core.TERR.WATER;
  const st=R.newState({spawn:[4,4],terr});
  ok(st.stuck[0]===false&&st.stuck[1]===false,'ban đầu không ai đứng yên');
  let r=R.apply(st,{move:[7,4]});   /* Trắng lội xuống nước */
  ok(r.ok&&st.stuck[0]===true&&st.stuck[1]===false,'bước vào nước → đứng yên');
  ok(r.skipped===undefined,'chưa mất lượt (Đen đi trước)');
  R.apply(st,{move:[1,4]});         /* Đen đi */
  ok(st.turn===0&&R.moves(st,0).length===0,'lượt kế của Trắng: không có nước đi');
  const snap=JSON.stringify(R.snapshot(st));
  const bad=R.apply(st,{move:[6,3]});
  ok(!bad.ok&&bad.reason==='frozen'&&JSON.stringify(R.snapshot(st))===snap,'đi khi đứng yên bị từ chối (frozen), không đổi trạng thái');
  ok(R.check(st,{wall:{o:'h',r:2,c:0}}).ok,'đứng yên vẫn đặt được tường');
  r=R.apply(st,{wall:{o:'h',r:2,c:0}});
  ok(r.ok&&st.stuck[0]===false&&st.left[0]===9&&st.turn===1,'đặt tường xong thì hết đứng yên, mất 1 tường');
  R.apply(st,{move:[2,4]});         /* Đen đi */
  ok(R.moves(st,0).length>0,'lượt sau đó Trắng đi lại bình thường (dù vẫn đứng trên ô nước)');
  /* đi tiếp sang một ô nước nữa → lại đứng yên (mỗi ô nước = 1 lượt) */
  r=R.apply(st,{move:[6,4]});
  ok(r.ok&&st.stuck[0]===true,'bước sang ô nước kế → đứng yên lần nữa');
  /* Đen đứng yên rồi Trắng: bên không đứng yên không bị ảnh hưởng */
  ok(st.stuck[1]===false,'chỉ bên bước vào nước mới đứng yên');
}
/* ----- Nhảy chéo vào ô nước cũng đứng yên ----- */
{
  const R=Core.make(CH),terr=new Uint8Array(81);terr[4*9+3]=Core.TERR.WATER;terr[3*9+4]=Core.TERR.STONE;
  const st=R.newState({spawn:[4,4],terr});st.pl=[{r:5,c:4},{r:4,c:4}];st.turn=0;
  const m=R.moves(st,0).map(x=>x.join(','));
  ok(m.includes('4,3')&&!m.includes('3,4'),'đá sau lưng đối thủ → nhảy chéo vào ô nước (4,3)');
  R.apply(st,{move:[4,3]});
  ok(st.stuck[0]===true,'nhảy vào ô nước → đứng yên');
}
/* ----- Hết tường mà đứng yên → mất lượt (tự bỏ qua) ----- */
{
  const R=Core.make(CH),terr=new Uint8Array(81);terr[7*9+4]=Core.TERR.WATER;
  const st=R.newState({spawn:[4,4],terr});
  st.left[0]=0;
  R.apply(st,{move:[7,4]});          /* Trắng xuống nước, không còn tường */
  const ply0=st.ply;
  const r=R.apply(st,{move:[1,4]});  /* Đen đi → tới lượt Trắng nhưng Trắng mất lượt */
  ok(r.ok&&Array.isArray(r.skipped)&&r.skipped.length===1&&r.skipped[0]===0,'kết quả báo Trắng bị mất lượt');
  ok(st.turn===1&&st.stuck[0]===false&&st.ply===ply0+2,'lượt quay về Đen, Trắng hết đứng yên, mất lượt tính 1 nước');
  ok(R.moves(st,0).length>0,'lượt sau Trắng đi lại được');
  /* cả hai cùng mất lượt liên tiếp: Đen đứng yên + hết tường, Trắng đứng yên + hết tường */
  const t2=new Uint8Array(81);t2[7*9+4]=Core.TERR.WATER;t2[1*9+4]=Core.TERR.WATER;
  const s2=R.newState({spawn:[4,4],terr:t2});s2.left=[0,0];
  R.apply(s2,{move:[7,4]});          /* Trắng xuống nước */
  const r2=R.apply(s2,{move:[1,4]}); /* Đen xuống nước → Trắng mất lượt rồi tới Đen mất lượt, quay lại Trắng */
  ok(r2.skipped&&r2.skipped.join()==='0,1'&&s2.turn===0&&!s2.stuck[0]&&!s2.stuck[1],'hai bên cùng mất lượt nối tiếp rồi Trắng đi lại');
}
/* ----- Bị vây kín (không đứng yên) + hết tường → mất lượt, không treo ván ----- */
{
  const R=Core.make(CH),terr=new Uint8Array(81);
  for(const[r,c]of[[3,2],[4,1],[4,3]])terr[r*9+c]=Core.TERR.STONE;
  const st=R.newState({spawn:[4,4],terr});
  st.pl=[{r:4,c:2},{r:0,c:4}];st.blocker=5*9+2;st.left=[0,10];st.turn=1;   /* Trắng bị đá + người chặn đường vây kín, hết tường */
  const r=R.apply(st,{move:[0,3]});
  ok(r.ok&&r.skipped&&r.skipped.join()==='0'&&st.turn===1&&st.ply===2,'bị vây kín + hết tường: Trắng mất lượt, lượt về Đen');
  const s2=R.newState({spawn:[4,4],terr});s2.pl=[{r:4,c:2},{r:0,c:4}];s2.left=[0,10];s2.turn=1;
  const r2=R.apply(s2,{move:[0,3]});
  ok(r2.ok&&!r2.skipped&&s2.turn===0,'còn nước đi (dù hết tường) thì KHÔNG mất lượt');
  const k=Core.make(Core.ruleset('classic')),sk=k.newState();sk.left=[0,0];
  const r3=k.apply(sk,{move:[7,4]});
  ok(r3.ok&&!r3.skipped&&sk.turn===1,'Classic: luật gốc, không bao giờ tự bỏ lượt');
}
/* ----- Snapshot giữ cờ đứng yên ----- */
{
  const R=Core.make(CH),terr=new Uint8Array(81);terr[7*9+4]=Core.TERR.WATER;
  const st=R.newState({spawn:[4,4],terr});R.apply(st,{move:[7,4]});
  const sn=JSON.parse(JSON.stringify(R.snapshot(st))),back=R.fromSnapshot(sn);
  ok(sn.stuck[0]===true&&back.stuck[0]===true&&same(R.snapshot(back),sn),'snapshot ↔ JSON giữ trạng thái đứng yên');
}
{ /* hết số nước: bên gần đích hơn thắng */
  const R=Core.make(Core.ruleset('chaos',{maxPly:4})),st=R.newState({spawn:[5,5]});
  R.apply(st,{move:[7,5]});R.apply(st,{move:[1,5]});R.apply(st,{move:[6,5]});
  const res=R.apply(st,{move:[2,5]});   /* ply 4: Trắng cách đích 6, Đen cách đích 6 → hòa */
  ok(res.over&&res.draw&&res.winner===-1,'bằng khoảng cách thì hòa');
  const s2=R.newState({spawn:[5,5]});
  R.apply(s2,{move:[7,5]});R.apply(s2,{move:[1,5]});R.apply(s2,{move:[6,5]});
  const r2=R.apply(s2,{wall:{o:'h',r:3,c:0}});   /* ply 4 là Đen đặt tường: Trắng cách 6, Đen cách 7 → Trắng gần đích hơn */
  ok(r2.over&&!r2.draw&&r2.winner===0,'hết số nước: bên gần đích hơn thắng');
}
{ /* ván ngẫu nhiên đầy đủ trên bàn chaos có đá + nước + cát + spawn lệch: không crash, luôn còn đường, không kẹt lượt, kết thúc đúng */
  const R=Core.make(Core.ruleset('chaos',{maxPly:200}));
  let done=0,wins=[0,0],draws=0,froze=0,skips=0;
  for(let g=0;g<60;g++){
    const terr=new Uint8Array(81);
    for(let k=0;k<2;k++){const r0=2+Math.floor(rnd()*4),c0=Math.floor(rnd()*6);for(let i=0;i<4;i++)terr[idx(R,r0+(i>>1),c0+(i%3))]=1;}
    for(let k=0;k<10;k++){const r=2+Math.floor(rnd()*5),c=Math.floor(rnd()*9);if(!terr[idx(R,r,c)])terr[idx(R,r,c)]=rnd()<.6?7:8;}   /* nước/cát rải, thành vũng ở chỗ trùng */
    const st=R.newState({spawn:[Math.floor(rnd()*9),Math.floor(rnd()*9)],terr});
    if(R.dist(st,0,st.pl[0])>=R.NOPATH||R.dist(st,1,st.pl[1])>=R.NOPATH)continue;
    while(!st.over){
      const p=st.turn;let a=null;
      if(st.stuck[p]){   /* đứng yên: bắt buộc chỉ có tường, và lõi đã đảm bảo có ít nhất một tường */
        froze++;
        ok(R.moves(st,p).length===0&&R.check(st,{move:[0,0]}).ok===false,'chaos: đứng yên thì không có nước đi');
        const ws=allWalls(R,st);ok(ws.length>0&&st.left[p]>0,'chaos: đứng yên mà tới lượt thì chắc chắn còn tường đặt được');
        if(!ws.length)break;a={wall:pick(ws)};
      }else{
        if(st.left[p]>0&&rnd()<.3){for(let t=0;t<25&&!a;t++){const w={o:rnd()<.5?'h':'v',r:Math.floor(rnd()*R.WN),c:Math.floor(rnd()*R.WN)};if(R.canWall(st,w.o,w.r,w.c))a={wall:w};}}
        if(!a){const ms=R.moves(st,p);if(!ms.length)break;a={move:pick(ms)};}
      }
      const res=R.apply(st,a);ok(res.ok,'chaos: apply hành động hợp lệ');
      if(res.skipped)skips+=res.skipped.length;
      ok(R.dist(st,0,st.pl[0])<R.NOPATH&&R.dist(st,1,st.pl[1])<R.NOPATH,'chaos: không bao giờ bị kín đường');
      /* không bao giờ có tường đặt lên cạnh nước/cát liên kết */
      if(a.wall){const w=a.wall,e=w.o==='h'?[[w.r,w.c,w.r+1,w.c],[w.r,w.c+1,w.r+1,w.c+1]]:[[w.r,w.c,w.r,w.c+1],[w.r+1,w.c,w.r+1,w.c+1]];
        ok(!e.some(x=>R.bridged(st,...x)),'chaos: tường đã đặt không phủ cạnh nước/cát liên kết');}
    }
    ok(st.over,'chaos: ván kết thúc');
    done++;if(st.draw)draws++;else wins[st.winner]++;
  }
  console.log('  ván chaos đã chạy:',done,'· thắng',wins.join('/'),'· hòa',draws,'· lượt đứng yên',froze,'· lượt bị mất',skips);
}
/* ----- Cổng: cổng kia có người → đứng chờ; người đó đi khỏi thì dịch chuyển NGAY trong lượt đó (fx late) ----- */
console.log('Cổng chờ');
{
  const R=Core.make(CH),G=Core.TERR.GATE,terr=new Uint8Array(81);terr[4*9+2]=G;terr[4*9+6]=G;
  const mk=()=>{const st=R.newState({spawn:[4,4],terr,seed:7});st.pl=[{r:4,c:1},{r:4,c:6}];st.turn=0;return st;};
  let st=mk();
  ok(st.gwait[0]===false&&st.gwait[1]===false,'ban đầu không ai chờ cổng');
  /* Đen đứng sẵn trên cổng B (4,6); Trắng bước vào cổng A (4,2) → bị chặn, đứng nguyên */
  let r=R.apply(st,{move:[4,2]});
  ok(r.ok&&st.pl[0].r===4&&st.pl[0].c===2&&st.gwait[0]===true&&!(r.fx&&r.fx.length),'cổng kia có người: không dịch chuyển, đứng chờ');
  /* Đen đặt tường (vẫn đứng ở cổng B): Trắng vẫn chờ */
  r=R.apply(st,{wall:{o:'h',r:1,c:0}});
  ok(r.ok&&st.pl[0].c===2&&st.gwait[0]===true,'đối thủ chưa rời cổng: vẫn chờ');
  /* Trắng đặt tường (vẫn đứng ở cổng A, vẫn chờ); Đen đi khỏi cổng B */
  R.apply(st,{wall:{o:'h',r:6,c:0}});
  ok(st.gwait[0]===true&&st.pl[0].c===2,'tự đặt tường không làm hết chờ');
  const sn=JSON.parse(JSON.stringify(R.snapshot(st))),back=R.fromSnapshot(sn);
  ok(sn.gwait[0]===true&&back.gwait[0]===true&&same(R.snapshot(back),sn),'snapshot ↔ JSON giữ cờ chờ cổng');
  r=R.apply(st,{move:[3,6]});   /* Đen rời cổng B */
  ok(r.ok&&r.fx&&r.fx.length===1&&r.fx[0].t==='gate'&&r.fx[0].late===true&&r.fx[0].p===0,'Đen rời cổng → fx gate (late) cho Trắng');
  ok(r.fx[0].from.join()==='4,2'&&r.fx[0].to.join()==='4,6','từ cổng A sang cổng B');
  ok(st.pl[0].r===4&&st.pl[0].c===6&&st.gwait[0]===false&&st.turn===0,'Trắng đã nằm ở cổng B ngay trong lượt đó, hết chờ, tới lượt Trắng');
  /* Trắng đã "đáp" ở B: không bị dịch chuyển lại khi Đen đi tiếp */
  const w=R.apply(st,{wall:{o:'h',r:5,c:0}});
  ok(w.ok&&st.pl[0].c===6&&!(w.fx&&w.fx.length),'quân vừa đáp xuống cổng không bị dịch chuyển lần nữa');
  R.apply(st,{move:[2,6]});
  ok(st.pl[0].c===6,'… kể cả khi đối thủ đi tiếp');
}
{ /* Trắng đang ở cổng A (đã chờ), chính Trắng bỏ đi → không bị kéo qua; Đen bước vào cổng B lúc A trống thì dịch chuyển bình thường */
  const R=Core.make(CH),G=Core.TERR.GATE,terr=new Uint8Array(81);terr[4*9+2]=G;terr[4*9+6]=G;
  const st=R.newState({spawn:[4,4],terr,seed:7});st.pl=[{r:4,c:1},{r:4,c:6}];st.turn=0;
  R.apply(st,{move:[4,2]});            /* Trắng chờ ở A */
  R.apply(st,{wall:{o:'h',r:1,c:0}});  /* Đen đứng yên ở B */
  const r=R.apply(st,{move:[4,1]});    /* Trắng bước ra khỏi A */
  ok(st.gwait[0]===false&&st.pl[0].c===1&&!(r.fx&&r.fx.length),'tự bước khỏi cổng thì hết chờ, không dịch chuyển');
  const r2=R.apply(st,{move:[4,5]});   /* Đen rời B */
  ok(!(r2.fx&&r2.fx.length)&&st.pl[1].c===5,'không ai chờ → không có dịch chuyển trễ');
}
{ /* cả hai cùng chờ: Trắng ở A (chờ vì Đen ở B), Đen đã ở B từ trước (không chờ). Trắng đi khỏi A → Đen không bị kéo vì Đen không chờ */
  const R=Core.make(CH),G=Core.TERR.GATE,terr=new Uint8Array(81);terr[4*9+2]=G;terr[4*9+6]=G;
  const st=R.newState({spawn:[4,4],terr,seed:7});st.pl=[{r:4,c:1},{r:4,c:7}];st.turn=0;
  R.apply(st,{move:[4,2]});            /* Trắng vào A: B trống → dịch chuyển sang B (4,6) */
  ok(st.pl[0].c===6&&st.gwait[0]===false,'cổng kia trống: dịch chuyển bình thường');
  const r=R.apply(st,{move:[4,6-0]});  /* Đen (4,7) → (4,6)? đang có Trắng: nhảy qua → (4,5) */
  ok(!r.ok||st.pl[1].c!==6,'không được đi vào ô có quân');
}
{ /* Đen chờ rồi Trắng (người chặn) đi khỏi: Đen được dịch chuyển trong lượt của Trắng, phe nào cũng đúng */
  const R=Core.make(CH),G=Core.TERR.GATE,terr=new Uint8Array(81);terr[4*9+2]=G;terr[4*9+6]=G;
  const st=R.newState({spawn:[4,4],terr,seed:7});st.pl=[{r:4,c:2},{r:4,c:7}];st.turn=1;
  R.apply(st,{move:[4,6]});            /* Đen vào B, Trắng đang ở A → Đen chờ */
  ok(st.gwait[1]===true&&st.pl[1].c===6,'Đen bị chặn ở cổng B');
  const r=R.apply(st,{move:[4,1]});    /* Trắng rời A */
  ok(r.fx&&r.fx[0]&&r.fx[0].p===1&&r.fx[0].late&&st.pl[1].c===2&&st.pl[0].c===1&&st.turn===1,'Trắng rời cổng → Đen dịch chuyển sang A ngay');
}
{ /* chỉ có 1 cổng (không đúng cặp) thì không có gì xảy ra */
  const R=Core.make(CH),terr=new Uint8Array(81);terr[4*9+2]=Core.TERR.GATE;
  const st=R.newState({spawn:[4,4],terr});st.pl=[{r:4,c:1},{r:0,c:4}];
  const r=R.apply(st,{move:[4,2]});
  ok(r.ok&&st.pl[0].c===2&&st.gwait[0]===false,'một cổng lẻ không hoạt động, không có chờ');
}
/* ----- Bẫy: bật theo ply; đứng yên trên bẫy lúc nó bật (đặt tường) cũng bị bắn; chỉ tính cho bên đang đi ----- */
console.log('Bẫy');
{
  const R=Core.make(CH),terr=new Uint8Array(81);terr[5*9+4]=Core.TERR.TRAP;
  const mk=(ply,turn,pl)=>{const st=R.newState({spawn:[4,4],terr,seed:11});st.ply=ply;st.turn=turn;st.pl=pl;return st;};
  ok(R.trapOn(mk(2,0,[{r:5,c:4},{r:0,c:4}]),0)===true&&R.trapOn(mk(0,0,[{r:5,c:4},{r:0,c:4}]),0)===false&&R.trapOn(mk(1,0,[{r:5,c:4},{r:0,c:4}]),0)===false,'bẫy bật ở ply%3==2');
  /* 1. đứng sẵn trên bẫy, bẫy đang bật, đặt tường → bị bắn về hàng xuất phát */
  let st=mk(2,0,[{r:5,c:4},{r:0,c:4}]);
  let r=R.apply(st,{wall:{o:'h',r:2,c:0}});
  ok(r.ok&&st.pl[0].r===8&&r.fx&&r.fx[0].t==='launch'&&r.fx[0].p===0&&r.fx[0].from.join()==='5,4','đứng yên trên bẫy đang bật + đặt tường → bị bắn');
  ok(r.fx[0].to.join()===st.pl[0].r+','+st.pl[0].c,'fx.to khớp vị trí mới');
  /* 2. bẫy chưa bật → đứng yên không sao */
  st=mk(1,0,[{r:5,c:4},{r:0,c:4}]);
  r=R.apply(st,{wall:{o:'h',r:2,c:0}});
  ok(r.ok&&st.pl[0].r===5&&!(r.fx&&r.fx.length),'bẫy chưa bật: đứng yên không sao');
  /* 3. bước thẳng vào bẫy đang bật: vẫn bị bắn (như cũ) */
  st=mk(2,0,[{r:6,c:4},{r:0,c:4}]);
  r=R.apply(st,{move:[5,4]});
  ok(r.ok&&st.pl[0].r===8&&r.fx&&r.fx[0].t==='launch','bước vào bẫy đang bật → bị bắn');
  /* 4. bước vào bẫy lúc chưa bật rồi đứng đó: lượt sau (ply%3==2) mà vẫn đứng thì bị bắn */
  st=mk(0,0,[{r:6,c:4},{r:0,c:4}]);
  R.apply(st,{move:[5,4]});ok(st.pl[0].r===5,'bước vào bẫy lúc đóng: an toàn');
  R.apply(st,{move:[0,5]});            /* ply 1→2, tới lượt Trắng (ply=2: bẫy bật) */
  ok(R.trapOn(st,0)&&st.turn===0,'tới lượt Trắng đúng lúc bẫy bật');
  r=R.apply(st,{wall:{o:'h',r:2,c:0}});
  ok(st.pl[0].r===8&&r.fx&&r.fx[0].t==='launch','đứng sẵn rồi bẫy bật, vẫn đứng → bị bắn');
  /* 5. bên KHÔNG tới lượt đứng trên bẫy lúc nó bật thì không bị bắn */
  st=mk(2,1,[{r:5,c:4},{r:3,c:3}]);
  r=R.apply(st,{move:[2,3]});
  ok(st.pl[0].r===5&&!(r.fx&&r.fx.length),'bẫy chỉ tính cho bên đang đi');
  /* 6. bước ra khỏi bẫy ở lượt bẫy bật → an toàn */
  st=mk(2,0,[{r:5,c:4},{r:0,c:4}]);
  r=R.apply(st,{move:[6,4]});
  ok(st.pl[0].r===6&&!(r.fx&&r.fx.length),'bước khỏi bẫy khi nó bật: an toàn');
  /* 7. không bao giờ rơi vào ô đối thủ / ô đá; deterministic theo seed */
  const a=mk(2,0,[{r:5,c:4},{r:8,c:2}]),b=mk(2,0,[{r:5,c:4},{r:8,c:2}]);
  R.apply(a,{wall:{o:'h',r:2,c:0}});R.apply(b,{wall:{o:'h',r:2,c:0}});
  ok(a.pl[0].c===b.pl[0].c&&a.pl[0].c!==2,'cùng seed → cùng ô đáp, không đáp lên đối thủ');
  /* 8. Classic không có địa hình: không đổi gì */
  const cl=Core.make(Core.ruleset('classic')),cs=cl.newState();cs.ply=2;
  const cr=cl.apply(cs,{wall:{o:'h',r:2,c:0}});
  ok(cr.ok&&cr.fx===undefined,'Classic không có fx');
}
{ /* ván chaos đủ loại ô (băng, bẫy, cổng): chạy ngẫu nhiên không lỗi, cờ gwait luôn nhất quán */
  const R=Core.make(Core.ruleset('chaos',{maxPly:240}));
  for(let g=0;g<80;g++){
    const terr=new Uint8Array(81);
    for(let k=0;k<81;k++){const r=(k/9)|0;if(r>=2&&r<=6&&rnd()<.35)terr[k]=pick([3,3,4,6,6,2]);}
    const gates=[];for(let k=0;k<81;k++)if(terr[k]===6)gates.push(k);
    if(gates.length>2)for(const k of gates.slice(2))terr[k]=0;
    const st=R.newState({spawn:[4,4],terr,seed:1000+g});
    while(!st.over){
      const p=st.turn;
      const ws=st.left[p]>0&&rnd()<.3?allWalls(R,st):[],mv=R.moves(st,p);
      const a=ws.length?{wall:pick(ws)}:mv.length?{move:pick(mv)}:{wall:pick(allWalls(R,st))};
      const r=R.apply(st,a);ok(r.ok,'chaos+cổng/bẫy: apply hợp lệ');
      for(let q=0;q<2;q++)if(st.gwait[q]){
        const c=st.pl[q],o=st.pl[1-q];
        ok(st.terr[c.r*9+c.c]===6&&R.gateOther(st,c.r,c.c)&&R.gateOther(st,c.r,c.c).r===o.r&&R.gateOther(st,c.r,c.c).c===o.c,'gwait chỉ đúng khi đang đứng cổng và cổng kia bị đối thủ chiếm');
      }
      if(!R.moves(st,st.turn).length&&!st.stuck[st.turn]&&!st.over)ok(false,'không kẹt nước đi');
    }
  }
}
console.log(fails?'\nTHẤT BẠI '+fails+'/'+checks+' kiểm tra':'\nTất cả '+checks+' kiểm tra đạt');
process.exit(fails?1:0);
