'use strict';
/* [AI/CONTROL] "Mr. Kiểm Soát" — chiếm trung tâm bàn bằng tường trước, rồi từ từ ứng biến.
   ----------------------------------------------------------------
   Ý tưởng: tường ở giữa bàn cắt nhiều đường đi nhất, và tường dựng trước sẽ làm các tường đặt sau lời hơn (nối thành hàng rào,
   đối thủ hết chỗ vòng). Nó đầu tư sớm vào thế trận đó, nhưng chỉ dựng khi không làm mình chậm và đối thủ còn xa đích.
     1. MỞ MÀN     đi quân vài nước trước (0-2) rồi mới bắt đầu dựng.
     2. DỰNG THẾ   (chưa đủ `claim` tường & đối thủ còn cách đích >= `safe` & mình không bị bỏ xa)
                   chọn tường gần tâm bàn (trong bán kính `radius`), KHÔNG làm mình chậm quá `cap` bước,
                   điểm = (đối thủ chậm thêm) - 1.2 × (mình chậm thêm) + centerW × độ gần tâm + chainW × số tường của mình nó chạm vào.
                   Tường nối vào tường đã dựng nên dần thành một cụm ở giữa bàn.
     3. ỨNG BIẾN   xong thế trận: chỉ đặt tường khi thật sự lời (net >= `need`, bị bỏ lại thì hạ chuẩn 1 bước, tường nối vào cụm
                   của mình được cộng thêm). Dẫn trước >= `lead` bước thì khỏi đặt, cứ chạy; giữ lại `reserve` tường cho lúc cận kề.
                   Khi chạy, trong các nước ngắn nhất ưu tiên cột gần giữa bàn (giữ cơ động).
   Mỗi ván bốc một tính cách (CFG.AI.control). Luôn đúng: về đích được thì về ngay; đối thủ sắp về đích mà chặn được thì chặn. */
(function(){
  const T=AITools,mem=[null,null];
  const cdist=w=>Math.abs(w.r+.5-HALF)+Math.abs(w.c+.5-HALF);     /* khoảng cách Manhattan từ tâm tường tới nút giữa bàn (tường sát tâm = 1) */

  function roll(){
    const C=CFG.AI.control;
    return{open:T.weighted(C.open),claim:T.weighted(C.claim),radius:T.between(C.radius),centerW:T.between(C.centerW),
           chainW:T.between(C.chainW),cap:T.weighted(C.cap),safe:T.weighted(C.safe),need:T.weighted(C.need),
           reserve:T.weighted(C.reserve),lead:T.weighted(C.lead),temp:T.between(C.temp),
           n:0,mine:[]};                                           /* n = số nước đã đi, mine = tường mình đã đặt */
  }
  const chain=(P,w)=>P.mine.reduce((k,m)=>k+(T.connected(w,m)?1:0),0);

  AIs.register({
    id:'control',
    name:'Mr. Kiểm Soát',
    desc:'Thằng này thích kiểm soát map',

    decide(p){
      if(!mem[p]||S.ply<2)mem[p]=roll();
      const P=mem[p],op=1-p;

      const win=T.winNow(p);if(win)return win;
      const stop=T.block(p);if(stop){P.mine.push(stop.wall);return stop;}

      /* đi ngắn nhất; hoà thì ưu tiên cột gần giữa bàn */
      const run=()=>{
        P.n++;
        const st=T.steps(p),min=Math.min(...st.map(x=>x.d));
        const c=st.filter(x=>x.d===min).sort((a,b)=>Math.abs(a.m[1]-HALF)-Math.abs(b.m[1]-HALF));
        const best=c.filter(x=>Math.abs(x.m[1]-HALF)===Math.abs(c[0].m[1]-HALF));
        return{move:pick1(best).m};
      };
      const put=w=>{const a={o:w.o,r:w.r,c:w.c};P.mine.push(a);P.n++;return{wall:a};};

      if(S.left[p]<=0)return run();
      if(P.n<P.open)return run();                                  /* 1. mở màn */

      const myD=dist(p,S.pl[p]),opD=dist(op,S.pl[op]),all=T.walls(p);

      /* 2. dựng thế trận ở trung tâm */
      if(P.mine.length<P.claim&&opD>=P.safe&&myD<=opD+1){
        const cands=all.filter(w=>w.myLoss<=P.cap&&cdist(w)<=P.radius).map(w=>({
          o:w.o,r:w.r,c:w.c,v:w.opGain-1.2*w.myLoss+P.centerW*(P.radius-cdist(w))+P.chainW*chain(P,w)
        })).sort((a,b)=>b.v-a.v);
        if(cands.length)return put(T.softPick(cands.slice(0,3),x=>x.v,P.temp));
      }

      /* 3. ứng biến */
      if(myD+P.lead<=opD&&opD>2)return run();                      /* dẫn xa: cứ chạy */
      if(S.left[p]<=P.reserve&&opD>2)return run();                 /* giữ tường cho lúc cận kề */
      const need=Math.max(1,P.need-(myD>opD?1:0));                 /* đang bị bỏ lại thì dễ tính hơn */
      const cands=all.filter(w=>w.opGain>0).map(w=>({
        o:w.o,r:w.r,c:w.c,v:w.opGain-1.5*w.myLoss+.5*P.chainW*chain(P,w)+.15*Math.max(0,P.radius-cdist(w))
      })).filter(w=>w.v>=need).sort((a,b)=>b.v-a.v);
      if(cands.length)return put(T.softPick(cands.slice(0,3),x=>x.v,P.temp));
      return run();
    }
  });
})();
