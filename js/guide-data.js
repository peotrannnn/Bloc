'use strict';
/* [GUIDE-DATA] Nội dung cửa sổ Hướng dẫn (nhóm 'Cách chơi' hiện ở cả Classic; các nhóm khác chỉ ở Hỗn Loạn). Chỉ là DỮ LIỆU, không đụng DOM / 3D nên test được bằng Node (tools/guide-test.js).
   Chữ luật ở đây phải khớp js/core.js (đầu file) và CFG.ITEMS: sửa luật thì sửa cả chỗ này.

   Mỗi mục:  id · grp (nhóm ở cột trái) · ic (biểu tượng ở danh mục) · name · sum (một câu tóm tắt) · lines[] (ý chính, NGẮN; **chữ đậm** bằng hai dấu sao) · note[] (mẹo, tùy chọn)
             item: tên món trong CFG.ITEMS (mục vật phẩm: hiện biểu tượng của game thay cho ảnh dựng)
             vars[]: các biến thể, mỗi biến thể = {label, cap, shot}
   Mỗi biến thể có img = tên file ảnh trong img/guide/ (chụp sẵn một lần, MỖI ẢNH MỘT Ô, góc nhìn khối Minecraft) và
   shot = bản mô tả cảnh để chụp ảnh đó bằng chính Terrain/Stage của game: mở tools/guide-capture.html (hoặc chạy tools/make-guide-images.py) để chụp lại khi đổi đồ họa.
   Cảnh: (không có ảnh vẽ tay)
             biome  bảng màu + hình dạng cỏ (khóa của Terrain.biomes)      cells [[hàng,cột,mã ô],…] các ô đặc biệt trên nền gỗ thường
             look   [hàng,cột] ô camera nhìn vào (mặc định giữa bàn)       dist/pitch/yaw/fov/ty  camera (mặc định isometric ở guide-shots.js)
             vi     0|1|2 kiểu khối đá mong muốn ở ô look (nguyên / sứt nhẹ / sứt sâu)
             trap   0|2 bẫy đóng / bật      block [[r,c],…] cổng đang bị chặn (đỏ) */
const GUIDE={
  /* mã ô giống core.js / mapgen.js */
  T:{STONE:1,GRASS:2,ICE:3,TRAP:4,CHEST:5,GATE:6,WATER:7,SAND:8,LOW:9},

  /* Hình vuông k×k quanh ô (4,4) cùng một mã ô */
  patch(v,k){const o=[],a=4-((k-1)>>1);for(let r=a;r<a+k;r++)for(let c=a;c<a+k;c++)o.push([r,c,v]);return o;},

  /* Tên biome ở cột "biome" của bản đồ (menu.js biomeNames) → khóa Terrain.biomes. 'balanced' dùng bảng màu đồng cỏ như app.js */
  terrBiome(b){return b==='balanced'||!b?'meadow':b;}
};

GUIDE.groups=['Cách chơi','Ô địa hình','Vật phẩm','Sự kiện'];
GUIDE.basicGroups=['Cách chơi'];   /* nhóm hiện ở CẢ Classic; các nhóm còn lại chỉ có ở Hỗn Loạn */

/* Ảnh một ô: ô (4,4) nằm giữa bàn, camera chéo 45° kiểu khối Minecraft */
const one=(img,cap,code,extra)=>({label:cap,cap,img,shot:Object.assign({biome:'meadow',cells:code==null?[]:[[4,4,code]],look:[4,4]},extra||{})});

GUIDE.entries=[
  {id:'how',grp:'Cách chơi',ic:'🎯',name:'Cách chơi',
   sum:'Đi tới hàng đối diện trước đối thủ là thắng.',
   lines:[
     'Mỗi lượt chọn **một** việc: **đi quân** một ô (lên, xuống, trái, phải) hoặc **đặt một tường**.',
     'Đối thủ đứng ngay trước mặt thì **nhảy qua đầu họ**. Có tường phía sau họ thì bước né sang bên.'],
   note:['Phím I (hoặc nút Hướng dẫn) bật / tắt cửa sổ này. ↑ ↓ đổi mục. Phím tắt: Q đi quân · W đặt tường · R xoay tường · E đổi góc nhìn · T đánh giá · O cài đặt · P ván mới · Esc về menu. Mũi tên đi quân hoặc dời tường, Enter để đặt.']},

  {id:'pawn',grp:'Cách chơi',ic:'♟️',name:'Quân cờ',
   sum:'Mỗi bên một quân, hai bên đứng đối mặt nhau.',
   lines:[
     '**Trắng** đi trước, **Đen** đi sau.',
     'Quân nào chạm hàng cuối phía đối diện **trước** là thắng.'],
   vars:[
     one('pawn-trang.png','Trắng',null,{pawn:0,dist:6.8,ty:.3}),
     one('pawn-den.png','Đen',null,{pawn:1,dist:6.8,ty:.3})]},

  {id:'wall',grp:'Cách chơi',ic:'🧱',name:'Đặt tường',
   sum:'Tường chặn đường đối thủ, nhưng không được nhốt kín ai.',
   lines:[
     'Bấm **Tường (W)**, rê chuột tới khe giữa các ô rồi bấm. **R** để xoay ngang / dọc.',
     'Mỗi bên có **10 tường**, mỗi tường dài **hai ô**.',
     'Không được cắt ngang tường khác, không được bịt kín đường về đích của **bất kỳ ai** (kể cả bạn). Chỗ nào bị cấm, game báo lý do.']},

  {id:'floor',grp:'Ô địa hình',ic:'🟫',name:'Ô thường',
   sum:'Ô gỗ bình thường, không có hiệu ứng.',
   lines:[
     'Đi, nhảy và đặt tường y như luật gốc.',
     'Hai hàng đầu và hai hàng cuối của bàn **luôn** là ô thường.'],
   vars:[one('floor.png','Ô gỗ',null)]},

  {id:'grass',grp:'Ô địa hình',ic:'🌿',name:'Cỏ',
   sum:'Quân đứng trong cỏ thì đối thủ không nhìn thấy.',
   lines:[
     'Chỉ **ẩn mình**, không chặn đường hay làm chậm.',
     'Lộ ra nếu đối thủ cũng đứng trong cỏ và ở trong **8 ô** quanh bạn.',
     'Quân đối thủ chui vào cỏ: ô đó hiện **mũi tên cam** kèm số lượt họ đã đi từ lúc biến mất.'],
   note:['Cỏ trông khác theo bản đồ nhưng luật y hệt.'],
   vars:[one('grass.png','Cỏ',2)]},

  {id:'ice',grp:'Ô địa hình',ic:'🧊',name:'Băng',
   sum:'Bước vào là trượt đi một đoạn, không điều khiển được.',
   lines:[
     'Trượt sang một ô kề **ngẫu nhiên** (không quay lại ô vừa đứng), rơi vào băng nữa thì trượt tiếp.',
     'Dừng khi tới ô không phải băng, hết đường, chạm hàng đích (thắng luôn) hoặc sau **40 lần** trượt.',
     'Tường, đá, quân cờ và Người chặn đường đều chắn đường trượt. Ô dừng cuối vẫn chạy hiệu ứng của nó.'],
   note:['Băng không trượt lên đá.'],
   vars:[one('ice.png','Băng',3)]},

  {id:'trap',grp:'Ô địa hình',ic:'🪤',name:'Bẫy',
   sum:'Bẫy lò xo: bật lên đúng lúc bạn đứng trên là bị hất về nhà.',
   lines:[
     'Chạy theo số nước đi: **đóng 2 lượt**, **bật 1 lượt**, rồi lặp lại.',
     'Kết thúc lượt của bạn trên bẫy **đang bật** là bị bắn về một ô ngẫu nhiên ở hàng xuất phát.',
     'Tick **xanh ✓** = đóng, an toàn. Dấu **! đỏ** + khung sáng = đang bật.',
     'Đứng sẵn trên bẫy lúc nó bật vào lượt đối thủ thì vẫn an toàn.'],
   vars:[
     one('trap-dong.png','Đang đóng',4,{trap:0}),
     one('trap-bat.png','Đang bật',4,{trap:2})]},

  {id:'chest',grp:'Ô địa hình',ic:'🎁',name:'Rương',
   sum:'Kết thúc nước đi trên rương là mở ra một món quà.',
   lines:[
     'Rương mở xong là biến mất. Quà ngẫu nhiên: Gạch 30% · Giày 20% · Búa 20% · Găng tay 15% · Cuốc chim 15%.',
     'Gạch cộng tường ngay. Món khác vào túi (**tối đa 2 món**), túi đầy thì món cũ nhất bị bỏ.',
     'Bị cổng hay bẫy hất tới ô rương thì rương **không** mở.'],
   vars:[one('chest.png','Rương',5)]},

  {id:'gate',grp:'Ô địa hình',ic:'🌀',name:'Cổng dịch chuyển',
   sum:'Hai cổng là một cặp: bước vào cổng này, ra ở cổng kia.',
   lines:[
     'Bàn có đúng **2 cổng**. Cổng kia đang có người đứng thì bạn chờ trên cổng (hiện **X đỏ**) tới khi họ rời đi.',
     'Cổng kia bị tường bịt, không còn đường về đích cho bạn, thì **không** dịch chuyển: phải đi bộ vòng.',
     'Game không cho đặt tường làm cả hai cổng cùng mất đường về đích.'],
   vars:[one('gate.png','Cổng',6)]},

  {id:'water',grp:'Ô địa hình',ic:'💧',name:'Nước',
   sum:'Bước xuống nước là đứng yên một lượt.',
   lines:[
     'Lượt kế tiếp bạn **không đi quân được**, chỉ đặt tường (hết tường thì mất lượt).',
     'Chỉ lần bước **xuống** mới bị. Đã đứng sẵn trên nước thì lượt sau đi bình thường.',
     'Giữa hai ô nước (hoặc nước và cát) kề nhau không đặt được tường.'],
   vars:[one('water.png','Nước',7)]},

  {id:'sand',grp:'Ô địa hình',ic:'🏜️',name:'Cát',
   sum:'Kết thúc nước đi trên cát có thể bị lún mất lượt.',
   lines:[
     'Kết thúc nước đi trên cát có **25%** bị lún.',
     'Quân lún mất trọn lượt kế tiếp: không đi, không đặt tường, không dùng đồ. Giày cũng không cứu được.',
     'Bị cổng hay bẫy hất xuống cát thì không lún. Giữa hai ô cát (hoặc cát và nước) kề nhau không đặt được tường.'],
   vars:[one('sand.png','Cát',8,{biome:'desert'})]},

  {id:'stone',grp:'Ô địa hình',ic:'🪨',name:'Đá cao',
   sum:'Khối đá cao bằng quân cờ, bậc 2 trong luật độ cao.',
   lines:[
     'Ô thường **bậc 0**, đá thấp **bậc 1**, đá cao **bậc 2**. Chỉ bước giữa hai ô kề chênh tối đa **1 bậc**.',
     'Từ ô thường **không leo thẳng** lên đá cao được: nó chắn đường như tường, trừ khi có đá thấp làm bậc thang.',
     'Leo lên xuống không tốn thêm lượt. Tường tính theo từng **cạnh**: cạnh giữa hai ô đều là đá thì tường không chặn (vẫn đặt được, vẫn mất 1 tường).'],
   note:['Trên đá không có rương, bẫy, cổng, nước, cát, cỏ, băng.'],
   vars:[one('stone.png','Đá cao',1,{biome:'mountain',vi:0})]},

  {id:'low',grp:'Ô địa hình',ic:'🪜',name:'Đá thấp',
   sum:'Bậc thang giữa mặt bàn và đá cao. Chỉ có ở bản đồ Núi.',
   lines:[
     'Cao bằng nửa đá cao (**bậc 1**): từ ô thường leo lên được, rồi leo tiếp lên đá cao.',
     'Lên đường nào thì xuống được đường đó. Hai đá thấp kề nhau mà có tường ở giữa thì quân **nhảy qua tường**.',
     'Game không cho đặt tường nhốt kín đường về đích của ai, kể cả quân đang đứng trên núi.'],
   vars:[one('low.png','Đá thấp',9,{biome:'mountain',vi:0})]},

  /* Vật phẩm: hình là biểu tượng THẬT của game (CFG.ITEMS[item].icon, cùng biểu tượng trên túi đồ và lúc quà nổi lên khỏi rương) */
  {id:'brick',grp:'Vật phẩm',name:'Cục gạch',item:'brick',
   sum:'Cộng ngay 1 tường.',
   lines:[
     'Cộng **1 tường** vào kho, không chiếm chỗ trong túi.',
     'Hay rơi nhất: 30% mỗi lần mở rương.']},

  {id:'boots',grp:'Vật phẩm',name:'Đôi giày',item:'boots',
   sum:'Thêm một lượt chỉ để đi quân. Miễn phí.',
   lines:[
     'Sau hành động kế tiếp (đi hoặc đặt tường), bạn được thêm **một lượt chỉ để đi quân**.',
     'Không dùng được khi đang có giày chờ hoặc đang trong lượt thêm.',
     'Mất lượt thêm nếu lúc đó bạn đứng yên (vừa lội xuống nước), hết nước đi, hoặc bị lún cát.'],
   note:['Dùng bằng phím 1 / 2 theo vị trí món trong túi, hoặc bấm biểu tượng phía trên.']},

  {id:'glove',grp:'Vật phẩm',name:'Găng tay',item:'glove',
   sum:'Cướp 1 tường của đối thủ. Tốn một lượt.',
   lines:[
     'Lấy **1 tường** từ kho đối thủ sang kho bạn.',
     'Chỉ dùng được khi đối thủ còn **ít nhất 2 tường**.']},

  {id:'hammer',grp:'Vật phẩm',name:'Búa',item:'hammer',
   sum:'Tháo một tường của đối thủ, trả lại cho họ. Miễn phí.',
   lines:[
     'Họ nhận lại tường đó, khe đó đặt lại được. Dùng xong bạn vẫn còn lượt. Không dùng được trong lượt thêm của giày.',
     'Chọn tường: rê chuột gần tường đối thủ cho **sáng cam** rồi bấm. Cảm ứng: chạm chọn, chạm lần nữa xác nhận. Bàn phím: mũi tên chọn, Enter xác nhận, Esc hủy.']},

  {id:'pick',grp:'Vật phẩm',name:'Cuốc chim',item:'pick',
   sum:'Phá hẳn một tường của đối thủ. Tốn một lượt.',
   lines:[
     'Tường bị phá **không** trả lại cho họ. Khe đó bị chiếm vĩnh viễn: không ai xây lại được, không còn chắn đường.',
     'Cách chọn tường giống Búa.']},

  {id:'blocker',grp:'Sự kiện',ic:'👷',name:'Người chặn đường',
   sum:'Nhân vật vàng bay xuống đứng chặn chỗ hiểm nhất trên bàn.',
   lines:[
     'Xuất hiện lần đầu sau khoảng 20 đến 30 nước, rồi cứ cách 20 đến 30 nước lại quay lại.',
     'Bay xuống ô cản đường nhất. Ô bị chiếm coi như khối đá: không ai bước vào hay nhảy qua được.',
     'Đứng 5 đến 7 nước rồi chạy ra mép bàn nhảy xuống. Online thì server quyết định, hai bên thấy giống nhau.'],
   vars:[one('blocker.png','Người chặn đường',null,{blocker:true,dist:6.8,ty:.3})]}
];

if(typeof module!=='undefined')module.exports=GUIDE;
