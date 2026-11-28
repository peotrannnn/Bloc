'use strict';
/* [AI/THUG] Mr. Lưu Manh — dân chơi hợm hĩnh, chuyên chọc tức.
   ----------------------------------------------------------------
   Vẫn là "đặt tường làm đường đối thủ dài nhất, càng sát mặt càng tốt", nhưng không còn chơi y hệt mỗi ván:
   mỗi ván bốc một "tính cách" (CFG.AI.thug) rồi giữ nguyên cả ván:
     • opening  khoe mẽ: bước lên 0-2 nước trước rồi mới bắt đầu dựng tường
     • swagger  xác suất mỗi lượt đang rảnh tường thì đi dạo một bước cho đối thủ tức (thay vì đặt tiếp)
     • lead     dẫn trước đối thủ chừng này bước thì thôi chọc, chạy về đích luôn (99 = cứ chọc tới hết tường)
     • near     mê sát mặt đến đâu (tường gần quân đối thủ được cộng điểm)
     • headW    thích "chặn đầu" đến đâu: tường chắn đúng 1-2 bước kế tiếp của đối thủ
     • selfW/cap  có chút ý thức không tự nhốt mình: trừ điểm theo số bước mình bị chậm, và bỏ hẳn tường làm mình chậm quá cap bước
     • temp     chọn mềm trong vài tường tốt nhất thay vì luôn lấy tường số 1 → mở đầu mỗi ván một khác
   Luôn đúng: về đích được thì về ngay; đối thủ sắp về đích mà chặn được thì chặn (cocky chứ không ngu).
   Hết tường (hoặc không còn tường đáng đặt) thì đi quân ngắn nhất, ưu tiên áp sát đối thủ cho khó chịu.
   Chỉnh: CFG.AI.thug trong config.js (hoặc thử nhanh: node tools/tournament.js thug basic --set AI.thug.swagger=[0,0]). */
(function(){
  const T=AITools,mem=[null,null];

  function roll(){
    const C=CFG.AI.thug;
    return{opening:T.weighted(C.opening),swagger:T.between(C.swagger),lead:T.weighted(C.lead),
           near:T.between(C.near),headW:T.between(C.headW),selfW:T.between(C.selfW),cap:T.weighted(C.cap),temp:T.between(C.temp),
           moved:0};   /* moved = số nước đi quân mình đã đi (để biết xong màn khoe mẽ chưa) */
  }

  /* Đi quân: ngắn nhất, hoà thì chọn ô sát quân đối thủ (chắn đường, khó chịu) */
  function stroll(P,p){
    const o=S.pl[1-p],st=T.steps(p),min=Math.min(...st.map(x=>x.d));
    const cand=st.filter(x=>x.d===min);
    const m=T.softPick(cand,x=>-.3*(Math.abs(x.m[0]-o.r)+Math.abs(x.m[1]-o.c)),.4).m;
    P.moved++;
    return{move:m};
  }

  AIs.register({
    id:'thug',
    name:'Mr. Lưu Manh',
    desc:'Thằng này láo',

    decide(p){
      const op=1-p,o=S.pl[op];
      if(!mem[p]||S.ply<2)mem[p]=roll();     /* ván mới → tính cách mới */
      const P=mem[p];

      const win=T.winNow(p);if(win)return win;
      const stop=T.block(p);if(stop)return stop;

      if(S.left[p]<=0)return stroll(P,p);
      const myD=dist(p,S.pl[p]),opD=dist(op,o);

      /* ----- Đi quân hay đặt tường? ----- */
      if(P.moved<P.opening)return stroll(P,p);                          /* khoe mẽ: bước lên trước */
      if(myD+P.lead<=opD)return stroll(P,p);                            /* đã dẫn xa: hết trò, chạy về */
      if(myD<=opD+1&&T.chance(P.swagger))return stroll(P,p);            /* đi dạo trêu ngươi (chỉ khi mình không bị bỏ xa) */

      /* ----- Chọn tường: chậm đối thủ nhiều nhất, sát mặt, chặn đầu; tránh tự nhốt mình ----- */
      const head=new Set(T.cutWalls(op).slice(0,4).map(w=>w.o+w.r+','+w.c));   /* tường cắt đúng 1-2 bước kế tiếp của đối thủ */
      const cands=T.walls(p).filter(w=>w.opGain>0&&w.myLoss<=P.cap).map(w=>{
        const near=Math.abs(w.r+.5-o.r)+Math.abs(w.c+.5-o.c);
        return{o:w.o,r:w.r,c:w.c,v:w.opGain-P.selfW*w.myLoss-P.near*near+(head.has(w.o+w.r+','+w.c)?P.headW:0)};
      }).sort((a,b)=>b.v-a.v);
      if(!cands.length)return stroll(P,p);                              /* chẳng còn tường nào đáng đặt */
      const w=T.softPick(cands.slice(0,4),x=>x.v,P.temp);
      return{wall:{o:w.o,r:w.r,c:w.c}};
    }
  });
})();
