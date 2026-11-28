'use strict';
/* [AI/DUMB] "Bé Khờ":
   ---------------------------------------------------------------
   Luật chơi của bé rất đơn giản, chỉ 3 câu:
   1. Thỉnh thoảng mới đặt tường — và đặt ĐẠI một tường ngẫu nhiên
      (khi người chơi đã gần đích + còn tường + hên).
   2. Đa số (60%) thì đi về phía đích.
   3. Còn lại (40%) thì đi loạn xì ngầu.

   Vì sao vẫn có thể thắng:
   - 60% đi đúng đường → vẫn tiến về đích đều đặn.
   - Người chơi nếu lơ là / đi sai thì vẫn bị bé về trước.

   Vì sao dễ thắng:
   - 40% đi loạn → tự phá đường mình, đi vòng, đi lùi.
   - Đặt tường ngẫu nhiên → có khi chặn chính mình, có khi vô dụng.
   ---------------------------------------------------------------
*/
AIs.register({
  id:  'dumb',
  name:'Bé khờ',
  desc:'Khờ ~ (chưa có bồ)',

  decide(p){
    const op  = 1 - p;
    const opD = dist(op, S.pl[op]);   // đối thủ cách đích bao xa

    // (1) Hiếm khi đặt tường: khi đối thủ đã sát đích + còn tường + 20% hên
    if(S.left[p] > 0 && opD <= 3 && Math.random() < 0.2){
      const walls = [];
      for(const o of ['h','v'])
        for(let r = 0; r < WN; r++)
          for(let c = 0; c < WN; c++)
            if(wallFree(o, r, c)) walls.push({ o, r, c });
      // đặt ĐẠI, không suy nghĩ — nhưng vẫn phải đúng luật: wallFree chỉ kiểm "ô còn trống",
      // còn canWall mới kiểm "không bịt kín đường về đích của MỘT bên nào". Trước đây bé chỉ dùng
      // wallFree nên có thể dựng vòng tường kín nhốt cả hai quân → hết đường thắng.
      // Bốc ngẫu nhiên từng tường, gặp tường bất hợp lệ thì bỏ và bốc tiếp (chỉ tốn BFS cho vài tường).
      while(walls.length){
        const w = walls.splice(Math.floor(Math.random() * walls.length), 1)[0];
        if(canWall(w.o, w.r, w.c)) return { wall: w };
      }
      // hết tường hợp lệ → rơi xuống đi quân bình thường
    }

    // (2) 60%: đi về ô gần đích nhất (hoà thì random — vẫn ngơ ngác)
    if(Math.random() < 0.6){
      const sc  = moves(p).map(m => ({ m, d: dist(p, { r:m[0], c:m[1] }) }));
      const min = Math.min(...sc.map(x => x.d));
      return { move: pick1(sc.filter(x => x.d === min)).m };
    }

    // (3) 40%: đi loạn
    return { move: pick1(moves(p)) };
  }
});