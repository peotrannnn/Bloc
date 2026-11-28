'use strict';
/* [AI/KEEPER] "Mr. Thủ Môn" — chạy nước rút, giữ nguyên tường, rồi đóng cổng khi đối thủ áp sát vạch đích.
   ----------------------------------------------------------------
   Vạch đích của đối thủ chính là hàng xuất phát của mình. Thủ môn không phí lượt dựng tường từ sớm (mỗi tường dựng sớm
   chỉ làm chậm ~1 bước, trong khi đối thủ còn kịp đổi đường). Nó chờ tới khi đối thủ vào "vùng cấm" (cách đích <= `zone` bước):
   lúc đó mỗi tường đặt vào sát hàng nhà mới có giá trị lớn vì đối thủ hết chỗ vòng.
     1. ĐÓNG CỔNG  đối thủ trong vùng cấm → đặt tường làm đối thủ chậm nhiều, ưu tiên tường NGANG sát hàng nhà (<= 2 hàng) và nối liền
                   với tường khác / mép bàn → thành một hàng rào liền chỉ chừa một khe, buộc đối thủ trượt dọc hàng rào tìm khe.
                   Tường phải lời >= `need` bước (đã trừ phần mình chậm), nếu không thì thôi, đi quân.
     2. THẮNG CUỘC ĐUA  mình đã dẫn trước đối thủ rõ rệt thì khỏi đóng cổng, cứ chạy (vẫn chặn khi đối thủ sắp về đích).
     3. CHẠY       còn lại: đi ngắn nhất về đích của mình.
   Mỗi ván bốc: kích thước vùng cấm, độ ưa hàng rào sát nhà, độ ưa nối tường, ngưỡng lời, số tường dự trữ (CFG.AI.keeper).
   Luôn đúng: về đích được thì về ngay; đối thủ sắp về đích mà chặn được thì chặn. */
(function(){
  const T=AITools,mem=[null,null];

  function roll(){
    const C=CFG.AI.keeper;
    return{zone:T.weighted(C.zone),homeW:T.between(C.homeW),linkW:T.between(C.linkW),need:T.weighted(C.need),
           reserve:T.weighted(C.reserve),lead:T.weighted(C.lead),temp:T.between(C.temp)};
  }

  AIs.register({
    id:'keeper',
    name:'Mr. Thủ Môn',
    desc:'Đắp bê tông ở nhà',

    decide(p){
      if(!mem[p]||S.ply<2)mem[p]=roll();
      const P=mem[p],op=1-p;

      const win=T.winNow(p);if(win)return win;
      const stop=T.block(p);if(stop)return stop;

      const run=()=>{const st=T.steps(p),min=Math.min(...st.map(x=>x.d));return{move:pick1(st.filter(x=>x.d===min)).m};};
      if(S.left[p]<=0)return run();

      const myD=dist(p,S.pl[p]),opD=dist(op,S.pl[op]);
      if(opD>P.zone)return run();                                    /* đối thủ còn xa: cứ chạy */
      if(myD+P.lead<=opD&&opD>2)return run();                        /* đã dẫn xa: khỏi tốn lượt đóng cổng */
      if(S.left[p]<=P.reserve&&opD>2)return run();                   /* giữ lại vài tường cho lúc cận kề */

      const home=goalRow(op);                                         /* hàng xuất phát của mình = đích của đối thủ */
      const cands=T.walls(p).filter(w=>w.opGain>0).map(w=>{
        const d=Math.abs((w.o==='h'?w.r+(home===N-1?1:0):home)-home);  /* tường ngang cách hàng nhà mấy hàng (tường dọc coi như xa) */
        const near=w.o==='h'?Math.max(0,2-d):0;                       /* 2 điểm nếu sát nhà, 0 nếu xa */
        return{o:w.o,r:w.r,c:w.c,v:w.opGain-1.5*w.myLoss+P.homeW*near+P.linkW*w.links};
      }).filter(w=>w.v>=P.need).sort((a,b)=>b.v-a.v);
      if(!cands.length)return run();
      const w=T.softPick(cands.slice(0,3),x=>x.v,P.temp);
      return{wall:{o:w.o,r:w.r,c:w.c}};
    }
  });
})();
