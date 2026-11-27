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
  /* Chế độ Hỗn Loạn (chỉ đấu online; Classic/PvE/EvE luôn để null): địa hình và trạng thái do server gửi, khớp tên trường với core.js */
  chaos:false,      /* ván này là Hỗn Loạn? */
  terr:null,        /* Uint8Array(N*N) mã ô; null = bàn Classic */
  spawn:null,       /* ô xuất phát của hai bên */
  stuck:null,       /* [bool,bool] bên nào đang đứng yên (vừa lội xuống nước) */
  inv:null,         /* túi đồ [[tên…],[tên…]] (công khai cả hai bên; tên: boots/glove/hammer/pick), null nếu không phải Hỗn Loạn */
  bonus:null,       /* [0|1|2,0|1|2]: giày của mỗi bên (1 = đã dùng, sắp có lượt thêm; 2 = đang trong lượt thêm chỉ được đi quân) */
  wo:null,dead:null,/* chủ từng tường ({h,v}: 0 trống, 1 Trắng, 2 Đen) và khe tường bị cuốc chim phá ({h,v}); cùng nghĩa với core.js */
  use:null,tgt:null,/* mode 'item': vật phẩm đang chọn mục tiêu (hammer/pick) và tường đang trỏ tới {o,r,c} */
  bplan:null,       /* lịch người chặn đường (js/blocker-plan.js): {on,at}; chỉ ván offline */
  blocker:-1,       /* chỉ số ô (r*N+c) đang có người chặn đường (view/blocker.js), -1 = chưa có. core.js coi ô đó như đá */
  event:null,       /* sự kiện đặc biệt đang diễn (người chặn đường vào/ra): {k:'blocker'|'leave',ph:'wait'|'go',cell,t0}. Còn sự kiện thì CẢ HAI BÊN tạm dừng: không ai đi được, máy không nghĩ, tin server xếp hàng */
  hid:[false,false],/* quân nào đang bị cỏ che (đối thủ). Khi bị che, S.pl[p] giữ VỊ TRÍ THẤY LẦN CUỐI để BFS không hỏng, còn rules.js moves() coi như không có quân đó */
  last:[null,null], /* thấy lần cuối quân bị cỏ che: {r,c,n} (n = số lượt quân đó đã đi kể từ lúc chui vào cỏ); null = đang thấy */
  mapInfo:null,     /* {biome,seed} của map hiện tại (chỉ để dựng hình) */
  animLock:false,   /* Hỗn Loạn online: quân còn đang diễn hoạt ảnh (trượt băng, bị hất, dịch chuyển, chui/thoát cỏ…) thì CHƯA mở lượt cho người chơi; vòng lặp trong App.frame gỡ khóa khi hai quân đã đứng yên */
  net:null          /* đấu online: {conn,wait,offline,oppOnline,lost,reason}; null nếu chơi với máy. wait = đã gửi nước đi, đang chờ server xác nhận */
};

const isAI=p=>S.ai[p]!==null;                 /* bên p do máy điều khiển? */
const allAI=()=>isAI(0)&&isAI(1);             /* máy đấu máy */
const humanTurn=()=>!S.over&&!S.event&&!isAI(S.turn)&&(!S.net||(S.turn===S.me&&!S.net.wait&&!S.net.offline&&!S.animLock));   /* đến lượt người bấm chuột? Online: chỉ lượt của mình, khi không còn nước đang chờ server và quân đối thủ đã diễn xong hoạt ảnh */

/* Phím E xoay vòng: quân mình → quân kia → mặc định. Máy đấu máy thì Trắng → Đen → mặc định. */
const viewOrder=()=>S.me<0?[0,1]:[S.me,1-S.me];
/* Camera mặc định nhìn từ phía nào (chọn lúc bắt đầu ván, xem App.newGame) */
const homeSide=()=>S.view;