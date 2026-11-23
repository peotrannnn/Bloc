'use strict';
/* [STATE] Trạng thái ván cờ (một object duy nhất: S) + vài hàm hỏi nhanh về "ai đang chơi". */
const S={
  pl:null,          /* vị trí hai quân: [{r,c},{r,c}] */
  ws:null,          /* tường đã đặt: {h:Uint8Array(WN*WN), v:...} */
  left:null,        /* số tường còn lại của mỗi bên */
  turn:0,mode:'move',orient:'h',
  over:false,draw:false,ply:0,
  hov:null,         /* ô tường đang rê chuột {r,c} */
  ai:[null,null],   /* mỗi bên do ai điều khiển: null = người, chuỗi = id của AI trong AIs */
  me:-1,            /* bên của người chơi (0 = Trắng, 1 = Đen); -1 nếu máy đấu máy */
  view:0,           /* camera mặc định nhìn từ phía nào: phe của người chơi, hoặc ngẫu nhiên khi máy đấu máy */
  paused:false,delay:400,
  analysis:true,    /* đang hiện thanh khả năng thắng + nhãn nước đi? (phím T). Tắt thì không tính gì cả: khỏi tốn máy */
  analysisLock:false/* true: chế độ này không cho bật/tắt (vd đấu online: giữ tắt để không ai nhờ engine hỗ trợ) */,
  winner:-1,        /* bên thắng khi ván kết thúc (0/1), -1 nếu chưa có hoặc hòa */
  net:null          /* đấu online: {conn,wait,oppOnline,lost}; null nếu chơi với máy. wait = đã gửi nước đi, đang chờ server xác nhận */
};

const isAI=p=>S.ai[p]!==null;                 /* bên p do máy điều khiển? */
const allAI=()=>isAI(0)&&isAI(1);             /* máy đấu máy */
const humanTurn=()=>!S.over&&!isAI(S.turn)&&(!S.net||(S.turn===S.me&&!S.net.wait));   /* đến lượt người bấm chuột? Online: chỉ lượt của mình và khi không còn nước đang chờ server */

/* Phím E xoay vòng: quân mình → quân kia → mặc định. Máy đấu máy thì Trắng → Đen → mặc định. */
const viewOrder=()=>S.me<0?[0,1]:[S.me,1-S.me];
/* Camera mặc định nhìn từ phía nào (chọn lúc bắt đầu ván, xem App.newGame) */
const homeSide=()=>S.view;

