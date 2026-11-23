'use strict';
/* [AI/DEFENDER] "Mr. Nhây Nhưa" — phong cách phòng thủ phản công.
   ---------------------------------------------------------------
   Triết lý: không ra đòn trước. Nó nhớ những tường đã có trên bàn, và mỗi lượt đối chiếu để biết đối thủ VỪA đặt gì.
   Chỉ đặt tường khi một trong các điều kiện sau (và luôn giữ lại `reserve` tường cho lúc cần):
     • PHẢN CÔNG  đối thủ vừa đặt tường  → tìm tường đáp trả, thưởng thêm nếu nối đúng vào tường họ vừa đặt
                  (dùng chính hàng rào của họ làm tường của mình) và thưởng thêm nếu tường đó làm mình chậm đi.
     • BỊ BỎ LẠI  mình đang thua cuộc đua đường đi  → tìm tường lật được thế cờ.
     • NGUY HIỂM  đối thủ cách đích <= `danger` bước → xả tường chặn, bỏ cả khoản dự trữ.
     • AN TOÀN    đối thủ đã hết tường → không còn gì phải sợ, xả nốt tường còn lại cho những tường thật sự lời.
   Còn lại là ĐI QUÂN THÔNG MINH: trong các nước ngắn nhất, chọn nước mà ở đó đối thủ đặt tường tốt nhất cũng ít lời nhất
   (né hành lang hẹp, ưu tiên đường đã bị tường chiếm chỗ nên khó chặn thêm). Nước đi phạt thêm theo số bước dài ra.

   Không chơi 10 ván giống nhau: mỗi ván bốc một "tính cách" (CFG.AI.defender): lượng tường dự trữ, độ dễ phản công,
   ngưỡng báo động, mức ham nối tường, độ kỹ khi né. Mỗi lượt còn có xác suất nhỏ (feint) bỏ qua phản công để đi bộ.
   Hai thứ luôn đúng: về đích được thì về ngay; đối thủ sắp về đích mà chặn được thì chặn.
   Chỉnh độ khó: CFG.AI.defender trong config.js (hoặc thử nhanh bằng tools/tournament.js --set ...). */
(function(){
  const T=AITools,mem=[null,null];

  function roll(){
    const C=CFG.AI.defender;
    return{reserve:T.weighted(C.reserve),counterNeed:T.weighted(C.counterNeed),danger:T.weighted(C.danger),
           linkW:T.between(C.linkW),newLinkW:T.between(C.newLinkW),vulnW:T.between(C.vulnW),temp:T.between(C.temp),
           known:{h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)},   /* những tường mình đã thấy (kể cả của mình) */
           lastD:null};                                               /* đường của mình ngay sau nước đi trước → biết bị làm chậm bao nhiêu */
  }

  /* Tường đối thủ đặt kể từ lượt trước của mình */
  function fresh(P){
    const out=[];
    for(const o of['h','v'])for(let i=0;i<WN*WN;i++)if(S.ws[o][i]&&!P.known[o][i])out.push({o,r:(i/WN)|0,c:i%WN});
    return out;
  }

  /* Đường của p sau khi thực hiện act (không làm thay đổi S) */
  function distAfter(p,act){
    if(act.move)return dist(p,{r:act.move[0],c:act.move[1]});
    const w=act.wall;setW(w.o,w.r,w.c,1);const d=dist(p,S.pl[p]);setW(w.o,w.r,w.c,0);return d;
  }

  /* Ghi nhớ trạng thái rồi trả act */
  function finish(P,p,act){
    P.known.h.set(S.ws.h);P.known.v.set(S.ws.v);
    if(act.wall)P.known[act.wall.o][act.wall.r*WN+act.wall.c]=1;
    P.lastD=distAfter(p,act);
    return act;
  }

  AIs.register({
    id:'defender',
    name:'Mr. Nhây Nhưa',
    desc:'Phòng thủ: giữ tường, đợi đối thủ ra đòn rồi phản công, đi quân khó chặn',

    decide(p){
      const C=CFG.AI.defender,op=1-p;
      if(!mem[p]||S.ply<2)mem[p]=roll();     /* ván mới → tính cách mới */
      const P=mem[p];

      const win=T.winNow(p);if(win)return win;
      const newW=fresh(P);
      const stop=T.block(p);if(stop)return finish(P,p,stop);

      const myD=dist(p,S.pl[p]),opD=dist(op,S.pl[op]);
      const slowed=P.lastD===null?0:Math.max(0,myD-P.lastD);   /* đối thủ vừa làm mình chậm bao nhiêu bước */
      const counter=newW.length>0&&!T.chance(C.feint);
      const behind=myD>opD,danger=opD<=P.danger,safe=S.left[op]===0;

      /* ----- 1) Có nên đặt tường, và tường phải đáng giá bao nhiêu? (need=0: không đặt) ----- */
      let need=0,why='';
      if(counter){need=Math.max(1,P.counterNeed-(slowed>0?1:0));why='counter';}   /* bị làm chậm thì cay cú hơn */
      if(behind){need=need?Math.min(need,2):2;why=why||'behind';}
      if(danger){need=1;why='danger';}
      if(safe){need=need?Math.min(need,2):2;why=why||'safe';}
      const spare=S.left[p]-((behind||danger||safe)?0:P.reserve);  /* khoản dự trữ chỉ đụng tới khi thật sự cần */

      if(need>0&&spare>0){
        const cands=T.walls(p).filter(w=>w.opGain>0).map(w=>{
          const hit=newW.some(x=>T.connected(x,{o:w.o,r:w.r,c:w.c}));
          return{o:w.o,r:w.r,c:w.c,hit,v:w.opGain-1.5*w.myLoss+P.linkW*w.links+(hit?P.newLinkW:0)};
        }).filter(w=>w.v>=need).sort((a,b)=>b.v-a.v);
        if(cands.length){
          /* Cá tính "trả đũa": đang phản công thì ưu tiên tường mọc ngay cạnh tường đối thủ vừa đặt (dựa vào hàng rào của họ), nếu có */
          const pool=why==='counter'&&cands.some(x=>x.hit)?cands.filter(x=>x.hit):cands;
          const w=T.softPick(pool.slice(0,3),x=>x.v,P.temp);
          return finish(P,p,{wall:{o:w.o,r:w.r,c:w.c},why});   /* why: chỉ để thống kê/gỡ lỗi */
        }
      }

      /* ----- 2) Đi quân thông minh: ngắn nhất, rồi né chỗ dễ bị chặn ----- */
      const st=T.steps(p),min=Math.min(...st.map(x=>x.d)),old=S.pl[p];
      const cand=st.filter(x=>x.d<=min+1);
      for(const x of cand){
        S.pl[p]={r:x.m[0],c:x.m[1]};
        x.v=-4*x.d-P.vulnW*T.harm(p)+.05*(HALF-Math.abs(x.m[1]-HALF));   /* chút ưu tiên đứng giữa: nhiều đường hơn */
        S.pl[p]=old;
      }
      const m=T.softPick(cand,x=>x.v,P.temp*.5).m;
      return finish(P,p,{move:m});
    }
  });
})();
