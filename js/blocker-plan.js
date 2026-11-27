'use strict';
/* [BLOCKER-PLAN] Lịch xuất hiện của người chặn đường. THUẦN LOGIC (không 3D, không S) nên server dùng lại được y nguyên (module.exports ở cuối file).
   Đơn vị là NƯỚC ĐI (ply, mỗi bên đi một nước = 1). Vòng lặp:
     đầu ván đợi `first` nước → xuất hiện → ở lại `stay` nước → rời đi → trống `gap` nước → xuất hiện lại → ...
   Mỗi khoảng là một số nguyên ngẫu nhiên trong [min,max] (gồm cả hai đầu).
   p = {on:bool, at:ply}: on = đang có người chặn; at = tới nước này thì đổi trạng thái. */
const BlockerPlan={
  roll(range,rnd){const a=range[0],b=range[1];return a+Math.floor((rnd||Math.random)()*(b-a+1));},
  /* Ván mới: chưa có người chặn, đợi `first` nước */
  init(plan,rnd,ply){return{on:false,at:(ply||0)+this.roll(plan.first,rnd)};},
  /* Gọi sau mỗi nước đi (ply = số nước đã đi). Trả 'enter' / 'leave' khi tới giờ, ngược lại null.
     Chưa làm được thì cứ gọi lại ở nước sau (at không đổi, ply tăng vẫn >= at). */
  due(p,ply){return ply<p.at?null:p.on?'leave':'enter';},
  /* Báo là sự kiện `what` ('enter' | 'leave') đã THỰC SỰ bắt đầu ở nước ply (cả khi người thử bấm phím B): đặt lại đồng hồ cho khoảng kế tiếp */
  done(p,ply,what,plan,rnd){
    if(what==='enter'){p.on=true;p.at=ply+this.roll(plan.stay,rnd);}
    else{p.on=false;p.at=ply+this.roll(plan.gap,rnd);}
    return p;
  }
};
if(typeof module!=='undefined'&&module.exports)module.exports=BlockerPlan;
