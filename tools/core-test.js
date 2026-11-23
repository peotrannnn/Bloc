#!/usr/bin/env node
'use strict';
/* Kiểm thử lõi luật (js/core.js) — chạy độc lập bằng Node, không cần config/trình duyệt:   node tools/core-test.js
   Nội dung: ván ngẫu nhiên chạy hết bằng Core.apply; hành động sai bị từ chối và không đổi trạng thái; nhảy thẳng/nhảy chéo;
   tường làm kín đường bị từ chối; snapshot ↔ JSON; ruleset cỡ khác (N=7) chạy được, chứng tỏ lõi không phụ thuộc hằng số toàn cục. */
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
      ok(R.dist(st,0,st.pl[0])<99&&R.dist(st,1,st.pl[1])<99,'không bao giờ bị kín đường');
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
console.log(fails?'\nTHẤT BẠI '+fails+'/'+checks+' kiểm tra':'\nTất cả '+checks+' kiểm tra đạt');
process.exit(fails?1:0);
