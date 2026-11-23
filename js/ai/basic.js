'use strict';
/* [AI/BASIC] "Cơ bản": đơn giản nhưng biết vài điều cần thiết, KHÔNG nhìn trước nhiều nước. Thứ tự ưu tiên:
   1. Về đích được ngay thì về.
   2. Đối thủ sắp về đích (nước sau là tới) thì đặt tường chặn nếu có thể.
   3. Đặt tường khi bị dẫn đường, hoặc khi đối thủ còn <= DANGER bước tới đích. Chỉ đặt tường "có lời" (đối thủ chậm thêm
      nhiều hơn mình ít nhất NEED bước, mình không chậm quá 1 bước), chọn tường lời nhất. Xác suất đặt mỗi lượt = BLOCK.
   4. Đi ô gần đích nhất, ưu tiên đi thẳng tắp theo cột đang đứng; thỉnh thoảng (SLIP) đi bừa một nước.
   Chỉnh độ mạnh: giảm SLIP / tăng BLOCK / tăng DANGER thì mạnh lên. Lấn Ép / Nhây Nhưa (ai/attacker.js, defender.js) vẫn mạnh hơn. */
const SLIP=.08,BLOCK=.7,DANGER=3,NEED=1;

AIs.register({
  id:'basic',
  name:'Cơ bản',
  desc:'Đi đường ngắn nhất, biết chặn khi bị dẫn hoặc đối thủ sắp về đích, thỉnh thoảng đi sai',

  decide(p){
    const op=1-p,myD=dist(p,S.pl[p]),opD=dist(op,S.pl[op]);

    const win=AITools.winNow(p);if(win)return win;                       // 1
    const stop=AITools.block(p);if(stop)return stop;                     // 2

    if(S.left[p]>0&&(opD<myD||opD<=DANGER)&&Math.random()<BLOCK){        // 3
      const cand=AITools.walls(p).filter(w=>w.myLoss<=1&&w.opGain-w.myLoss>=NEED);
      if(cand.length){
        const best=Math.max(...cand.map(w=>w.opGain-w.myLoss));
        const top=cand.filter(w=>w.opGain-w.myLoss===best);
        const w=pick1(top);return{wall:{o:w.o,r:w.r,c:w.c}};
      }
    }

    const mv=moves(p);                                                    // 4
    if(Math.random()<SLIP)return{move:pick1(mv)};
    const sc=mv.map(m=>({m,d:dist(p,{r:m[0],c:m[1]})})),min=Math.min(...sc.map(x=>x.d)),cur=S.pl[p];
    /* Cá tính "chạy thẳng tắp": các nước ngắn nhất như nhau thì giữ nguyên cột đang đứng (khỏi ngoằn ngoèo), bị chắn mới tạt sang cột gần giữa bàn */
    const best=sc.filter(x=>x.d===min).sort((a,b)=>(a.m[1]!==cur.c)-(b.m[1]!==cur.c)||Math.abs(a.m[1]-HALF)-Math.abs(b.m[1]-HALF));
    return{move:best[0].m};
  }
});
