'use strict';
/* [RULES] Lớp mỏng nối luật chơi (js/core.js) với trạng thái toàn cục S của client.
   Giữ nguyên tên hàm cũ (goalRow, W, setW, inb, blk, moves, dist, wallFree, wallDists, canWall, D) để AI, eval, review, giao diện
   không phải sửa gì; mọi quy tắc nằm trong core.js. Muốn đổi luật/thêm chế độ: sửa core.js hoặc thêm ruleset, KHÔNG sửa ở đây.
   RS = ruleset đang dùng của client (hiện là Classic, cỡ bàn và số tường lấy từ CFG). */
const RS=Core.ruleset('classic',{N:CFG.N,walls:CFG.WALLS,maxPly:CFG.MAX_PLY});
const R=Core.make(RS);
const D=R.D;
const goalRow=R.goalRow;
const W=(o,r,c)=>R.W(S,o,r,c);
const setW=(o,r,c,v)=>R.setW(S,o,r,c,v);
const inb=R.inb;
const blk=(r,c,dr,dc)=>R.blk(S,r,c,dr,dc);
const moves=p=>R.moves(S,p);
const dist=(p,s)=>R.dist(S,p,s);
const wallFree=(o,r,c)=>R.wallFree(S,o,r,c);
const wallDists=(o,r,c)=>R.wallDists(S,o,r,c);
const canWall=(o,r,c)=>R.canWall(S,o,r,c);
