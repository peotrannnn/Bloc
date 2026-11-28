'use strict';
/* [AI/ATTACKER] "Mr. Lấn Ép" — phong cách tấn công.
   ---------------------------------------------------------------
   Triết lý: tường là vũ khí, đừng để dành. Mỗi lượt xét MỌI tường hợp lệ và chấm
       v = (đối thủ phải đi thêm) - selfW × (mình phải đi thêm) + linkW × (số đầu mút nối với tường/mép bàn)
   rồi đặt tường tốt nhất nếu v đạt chuẩn. Thưởng "nối liền" khiến nó tự xây hàng rào dài (đối thủ bị ép đi vòng
   cả đoạn) thay vì rải tường lẻ. Hết tường thì thành chạy thuần: luôn đi nước ngắn nhất tới đích.

   Không chơi 10 ván giống nhau: đầu mỗi ván bốc một "tính cách" (CFG.AI.attacker):
       opening  số nước đi quân trước khi bắt đầu ra đòn      need     tường phải đáng giá bao nhiêu mới đặt
       selfCap  chịu tự làm chậm mình tối đa mấy bước           eager    xác suất chịu đặt khi có tường đạt chuẩn
       linkW    ham xây hàng rào đến đâu                        temp     độ khó đoán khi chọn giữa các tường tốt
   Ngoài ra mỗi lượt còn có xác suất nhỏ (gambit) chọn tường hạng 2-3 thay vì hạng 1, và softmax khi chọn nước đi.
   Hai thứ luôn đúng: về đích được thì về ngay; đối thủ sắp về đích mà chặn được thì chặn.
   Chỉnh độ khó: CFG.AI.attacker trong config.js (hoặc thử nhanh bằng tools/tournament.js --set ...). */
(function(){
  const T=AITools,mem=[null,null];

  function roll(){
    const C=CFG.AI.attacker;
    return{opening:T.intBetween(C.opening),need:T.weighted(C.need),selfCap:T.weighted(C.selfCap),
           eager:T.between(C.eager),linkW:T.between(C.linkW),lineW:T.between(C.lineW),temp:T.between(C.temp),turns:0,mine:[]};
  }

  AIs.register({
    id:'attacker',
    name:'Mr. Lấn Ép',
    desc:'Thằng này thích tấn công',

    decide(p){
      const C=CFG.AI.attacker,op=1-p;
      if(!mem[p]||S.ply<2)mem[p]=roll();     /* ván mới → tính cách mới */
      const P=mem[p];

      const win=T.winNow(p);if(win)return win;
      const stop=T.block(p);if(stop)return stop;
      P.turns++;

      const myD=dist(p,S.pl[p]),opD=dist(op,S.pl[op]);

      /* ----- 1) Ra đòn: đặt tường nếu có tường đáng giá ----- */
      if(S.left[p]>0&&P.turns>P.opening&&T.chance(P.eager)){
        let need=P.need;
        if(myD>opD)need--;                   /* đang bị bỏ lại → chịu đặt tường "rẻ" hơn */
        if(opD<=2)need=1;                    /* đối thủ sắp về đích → có gì chặn nấy */
        need=Math.max(1,need);
        /* Cá tính "hàng rào một mạch": thưởng tường nối thẳng hàng vào đầu một tường của chính mình (cùng loại, liền kề) → rào dài thẳng tắp */
        const has=(o,r,c)=>P.mine.some(w=>w.o===o&&w.r===r&&w.c===c);
        const line=w=>(w.o==='h'?has('h',w.r,w.c-2)||has('h',w.r,w.c+2):has('v',w.r-2,w.c)||has('v',w.r+2,w.c))?1:0;
        const cands=T.walls(p)
          .filter(w=>w.opGain>0&&w.myLoss<=P.selfCap)
          .map(w=>({o:w.o,r:w.r,c:w.c,v:w.opGain-C.selfW*w.myLoss+P.linkW*w.links+P.lineW*line(w)}))
          .filter(w=>w.v>=need)
          .sort((a,b)=>b.v-a.v);
        if(cands.length){
          const top=cands.slice(0,4);
          const w=T.chance(C.gambit)?T.softPick(cands.slice(0,3),()=>0,1):T.softPick(top,x=>x.v,P.temp);
          P.mine.push({o:w.o,r:w.r,c:w.c});
          return{wall:{o:w.o,r:w.r,c:w.c},why:'attack'};   /* why: chỉ để thống kê/gỡ lỗi */
        }
      }

      /* ----- 2) Không có đòn đáng đánh → chạy đường ngắn nhất ----- */
      const st=T.steps(p),min=Math.min(...st.map(x=>x.d));
      return{move:T.softPick(st.filter(x=>x.d<=min),()=>0,1).m};
    }
  });
})();
