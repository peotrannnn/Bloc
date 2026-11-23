'use strict';
/* [AI/GAMBLER] "Mr. Con Bạc" — đầu ván đặt cược một kiểu chơi, rồi chơi tới cùng (CFG.AI.gambler). Thắng thua dao động, ván nào cũng kịch tính.
   ----------------------------------------------------------------
   Mỗi ván bốc một "kiểu cược":
     • ALL-IN   (đại gia máu mặt) ném tường rất sớm và liên tục, chấp nhận tự làm mình chậm tối đa `cap` bước để ép đối thủ đi vòng.
                Hết tường thì chạy. Nếu đã dẫn trước >= `lead` bước thì thôi cược, chạy về cho chắc.
     • KEO KIỆT (giữ của)  cắm đầu chạy, không đặt tường nào. Chỉ xả khi đối thủ cách đích <= `trigger` bước, hoặc khi mình bị bỏ lại
                >= `tilt` bước (thua thì gỡ gạc). Đã xả thì xả liền các lượt sau cho tới khi hết lợi hoặc hết tường.
   Cả hai kiểu: mỗi lượt có xác suất nhỏ `yolo` "thấy hên là đánh" — thấy tường lời lớn (>= 2 bước) là đặt, bất kể kiểu đang chơi.
   Tường chọn mềm (softmax) trong vài tường tốt nhất nên không lặp lại ván trước.
   Luôn đúng: về đích được thì về ngay; đối thủ sắp về đích mà chặn được thì chặn. */
(function(){
  const T=AITools,mem=[null,null];

  function roll(){
    const C=CFG.AI.gambler;
    return{mode:T.weighted(C.mode),open:T.weighted(C.open),cap:T.weighted(C.cap),need:T.weighted(C.need),
           lead:T.weighted(C.lead),trigger:T.weighted(C.trigger),tilt:T.weighted(C.tilt),
           yolo:T.between(C.yolo),temp:T.between(C.temp),
           n:0,dumping:false};                                     /* n = số nước đã đi; dumping = kiểu keo kiệt đã bắt đầu xả */
  }

  AIs.register({
    id:'gambler',
    name:'Mr. Con Bạc',
    desc:'Đặt cược mỗi ván: hoặc all-in ném tường sớm ép đối thủ, hoặc keo kiệt cắm đầu chạy rồi xả liều',

    decide(p){
      if(!mem[p]||S.ply<2)mem[p]=roll();
      const P=mem[p],op=1-p;

      const win=T.winNow(p);if(win)return win;
      const stop=T.block(p);if(stop)return stop;

      const run=()=>{P.n++;const st=T.steps(p),min=Math.min(...st.map(x=>x.d));return{move:pick1(st.filter(x=>x.d===min)).m};};
      const pickWall=(c)=>{P.n++;const w=T.softPick(c.slice(0,3),x=>x.v,P.temp);return{wall:{o:w.o,r:w.r,c:w.c}};};
      if(S.left[p]<=0)return run();

      const myD=dist(p,S.pl[p]),opD=dist(op,S.pl[op]),all=T.walls(p);
      const rate=cap=>all.filter(w=>w.myLoss<=cap&&w.opGain>0).map(w=>({o:w.o,r:w.r,c:w.c,v:w.opGain-w.myLoss}))
                         .sort((a,b)=>b.v-a.v);

      /* "thấy hên là đánh": tường lời lớn thì đặt liều, mặc kệ kiểu cược */
      if(T.chance(P.yolo)){
        const big=rate(2).filter(w=>w.v>=2);
        if(big.length)return pickWall(big);
      }

      if(P.mode==='allin'){
        if(P.n<P.open)return run();                                /* có ván khoe vài nước rồi mới cược */
        if(myD+P.lead<=opD&&opD>2)return run();                    /* đã dẫn xa: thôi cược */
        const c=rate(P.cap).filter(w=>w.v>=P.need);
        return c.length?pickWall(c):run();
      }

      /* keo kiệt: chờ tới lúc nguy cấp hoặc bị bỏ lại thì mới xả */
      if(!P.dumping&&(opD<=P.trigger||myD-opD>=P.tilt))P.dumping=true;
      if(!P.dumping)return run();
      const c=rate(1).filter(w=>w.v>=1);                           /* xả: chỉ cần hoà vốn, tối đa tự chậm 1 bước */
      return c.length?pickWall(c):run();
    }
  });
})();
