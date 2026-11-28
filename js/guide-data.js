'use strict';
/* [GUIDE-DATA] Nội dung cửa sổ Hướng dẫn (nhóm 'Cách chơi' hiện ở cả Classic; các nhóm khác chỉ ở Hỗn Loạn). Chỉ là DỮ LIỆU, không đụng DOM / 3D nên test được bằng Node (tools/guide-test.js).
   Chữ luật ở đây phải khớp js/core.js (đầu file) và CFG.ITEMS: sửa luật thì sửa cả chỗ này.

   Mỗi mục:  id · grp (nhóm ở cột trái) · name · sum (một câu tóm tắt) · lines[] (ý chính, NGẮN; **chữ đậm** bằng hai dấu sao) · note[] (mẹo, tùy chọn)
             item: tên món trong CFG.ITEMS (mục vật phẩm: hiện biểu tượng của game thay cho ảnh dựng)
             vars[]: các biến thể, mỗi biến thể = {label, cap, shot}
   Mỗi biến thể có img = tên file ảnh trong img/guide/ (chụp sẵn một lần, MỖI ẢNH MỘT Ô, góc nhìn khối Minecraft) và
   shot = bản mô tả cảnh để chụp ảnh đó bằng chính Terrain/Stage của game: mở tools/guide-capture.html (hoặc chạy tools/make-guide-images.py) để chụp lại khi đổi phần đồ họa.
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
  {id:'how',grp:'Cách chơi',name:'Cách chơi',
   sum:'Đi tới hàng bên kia trước đối thủ là thắng.',
   lines:[
     'Mỗi lượt chọn **một** việc: **đi quân** một ô (lên, xuống, trái, phải) hoặc **đặt một bức tường**.',
     'Đối thủ đứng ngay trước mặt thì **nhảy qua đầu họ**. Nếu phía sau họ có tường thì bước né qua một bên.'],
   note:['Bấm phím I (hoặc nút Hướng dẫn) để bật / tắt cửa sổ này. Dùng ↑ ↓ để đổi mục. Phím tắt: Q đi quân · W đặt tường · R xoay tường · E đổi góc nhìn · T đánh giá · C chat (chỉ online) · O cài đặt · P ván mới · Esc về menu. Dùng phím mũi tên để đi quân hoặc dời tường, Enter để đặt.']},

  {id:'pawn',grp:'Cách chơi',name:'Quân cờ',
   sum:'Mỗi bên có một quân, hai quân đứng đối mặt nhau.',
   lines:[
     '**Trắng** đi trước, **Đen** đi sau.',
     'Bên nào đưa quân tới hàng cuối phía đối diện **trước** thì thắng.'],
   vars:[
     one('pawn-trang.png','Trắng',null,{pawn:0,dist:6.8,ty:.3}),
     one('pawn-den.png','Đen',null,{pawn:1,dist:6.8,ty:.3})]},

  {id:'wall',grp:'Cách chơi',name:'Đặt tường',
   sum:'Tường dùng để chặn đường đối thủ, nhưng không được nhốt kín đường đi của bất kỳ bên nào.',
   lines:[
     'Bấm **Tường (W)**, rê chuột tới khe giữa các ô rồi bấm để đặt. Bấm **R** để xoay tường ngang / dọc.',
     'Mỗi bên có **10 bức tường**, mỗi bức dài **hai ô**.',
     'Không được đặt chồng/cắt ngang tường khác, cũng không được bịt kín đường về đích của **bất kỳ bên nào** (kể cả bạn).']},

  {id:'floor',grp:'Ô địa hình',name:'Ô thường',
   sum:'Ô gỗ bình thường, không có hiệu ứng gì đặc biệt.',
   lines:[
     'Đi quân, nhảy và đặt tường giống như luật gốc.',
     'Hai hàng đầu và hai hàng cuối bàn **luôn** là ô thường.'],
   vars:[one('floor.png','Ô gỗ',null)]},

  {id:'grass',grp:'Ô địa hình',name:'Cỏ',
   sum:'Quân đứng trong cỏ thì đối thủ sẽ không thấy.',
   lines:[
     'Cỏ chỉ giúp **ẩn mình**, không chặn đường hay làm chậm.',
     'Quân sẽ bị lộ nếu đối thủ cũng đứng trong cỏ và ở trong phạm vi **8 ô**.',
     'Khi quân đối thủ đi vô cỏ, ô đó sẽ hiện **mũi tên cam** kèm số lượt họ đã đi kể từ lúc biến mất.'],
   note:['Cỏ có thể nhìn khác nhau tùy bản đồ, nhưng luật chơi vẫn y chang.'],
   vars:[one('grass.png','Cỏ',2)]},

  {id:'ice',grp:'Ô địa hình',name:'Băng',
   sum:'Bước vô là quân sẽ trượt đi một đoạn, mình không điều khiển được.',
   lines:[
     'Quân trượt sang một ô kế bên **ngẫu nhiên** (không quay lại ô vừa đứng). Nếu trượt vô ô băng khác thì tiếp tục trượt.',
     'Quân dừng lại khi tới ô không phải băng, hết đường trượt, chạm hàng đích (thắng luôn) hoặc trượt đủ **40 lần**.',
     'Tường, đá, quân cờ và Người chặn đường đều có thể chặn đường trượt. Ô cuối cùng quân dừng lại vẫn kích hoạt hiệu ứng của ô đó.'],
   note:['Băng không làm quân trượt lên đá.'],
   vars:[one('ice.png','Băng',3)]},

  {id:'trap',grp:'Ô địa hình',name:'Bẫy',
   sum:'Bẫy lò xo: nếu bẫy bật lên đúng lúc bạn đang đứng trên đó, quân sẽ bị hất về nhà.',
   lines:[
     'Bẫy hoạt động theo số lượt: **đóng 2 lượt**, **bật 1 lượt**, rồi lặp lại.',
     'Nếu kết thúc lượt trên cái bẫy **đang bật**, quân sẽ bị bắn về một ô ngẫu nhiên ở hàng xuất phát.',
     'Dấu **tick xanh ✓** = bẫy đang đóng, an toàn. Dấu **! đỏ** + khung sáng = bẫy đang bật.',
     'Nếu bạn đã đứng sẵn trên bẫy và nó bật trong lượt của đối thủ thì vẫn an toàn.'],
   vars:[
     one('trap-dong.png','Đang đóng',4,{trap:0}),
     one('trap-bat.png','Đang bật',4,{trap:2})]},

  {id:'chest',grp:'Ô địa hình',name:'Rương',
   sum:'Đi xong lượt trên rương là rương mở ra và nhận được một món quà.',
   lines:[
     'Rương mở xong sẽ biến mất. Quà nhận được là ngẫu nhiên: Gạch 30% · Giày 20% · Búa 20% · Găng tay 15% · Cuốc chim 15%.',
     'Gạch được cộng thẳng vô kho tường. Những món còn lại được đưa vô túi (**tối đa 2 món**); nếu túi đầy thì món cũ nhất sẽ bị bỏ.',
     'Nếu bị cổng dịch chuyển hoặc bẫy hất tới ô rương thì rương **không** mở.'],
   vars:[one('chest.png','Rương',5)]},

  {id:'gate',grp:'Ô địa hình',name:'Cổng dịch chuyển',
   sum:'Hai cổng đi thành một cặp: bước vô cổng này thì sẽ đi ra ở cổng còn lại.',
   lines:[
     'Trên bàn có đúng **2 cổng**. Nếu cổng bên kia đang có người đứng, bạn phải chờ ngay trên cổng của mình (hiện **X đỏ**) tới khi người đó đi khỏi.',
     'Nếu cổng bên kia bị tường chặn và bạn không còn đường tới đích, cổng sẽ **không** dịch chuyển bạn; phải đi đường vòng.',
     'Game không cho đặt tường khiến cả hai cổng đều mất đường đi tới đích.'],
   vars:[one('gate.png','Cổng',6)]},

  {id:'water',grp:'Ô địa hình',name:'Nước',
   sum:'Bước xuống nước là phải đứng yên một lượt.',
   lines:[
     'Ở lượt kế tiếp, bạn **không thể đi quân**, chỉ có thể đặt tường (nếu hết tường thì mất lượt).',
     'Chỉ khi bước **xuống** ô nước mới bị hiệu ứng. Nếu đã đứng sẵn trên nước thì lượt sau vẫn đi bình thường.',
     'Không đặt được tường ở giữa hai ô nước (hoặc giữa ô nước và ô cát) nằm kế nhau.'],
   vars:[one('water.png','Nước',7)]},

  {id:'sand',grp:'Ô địa hình',name:'Cát',
   sum:'Đi xong lượt trên cát thì có thể bị lún và mất lượt.',
   lines:[
     'Có **25%** khả năng bị lún nếu kết thúc lượt trên ô cát.',
     'Nếu bị lún, quân sẽ mất nguyên lượt kế tiếp: không đi quân, không đặt tường, cũng không xài vật phẩm được. Có giày cũng không cứu được.',
     'Nếu bị cổng hoặc bẫy hất xuống ô cát thì sẽ không bị lún. Không đặt được tường giữa hai ô cát (hoặc giữa ô cát và ô nước) nằm kế nhau.'],
   vars:[one('sand.png','Cát',8,{biome:'desert'})]},

  {id:'stone',grp:'Ô địa hình',name:'Đá cao',
   sum:'Khối đá cao ngang quân cờ, có độ cao **bậc 2**.',
   lines:[
     'Ô thường là **bậc 0**, đá thấp là **bậc 1**, đá cao là **bậc 2**. Chỉ được bước giữa hai ô kế nhau có độ cao chênh tối đa **1 bậc**.',
     'Từ ô thường thì **không leo thẳng** lên đá cao được. Khối đá cao sẽ chặn đường như tường, trừ khi có đá thấp làm bậc thang.',
     'Leo lên hoặc xuống không tốn thêm lượt. Tường được tính theo từng **cạnh**: nếu hai ô ở hai bên đều là đá thì tường không chặn được (vẫn đặt được và vẫn tốn 1 tường).'],
   note:['Trên đá sẽ không có rương, bẫy, cổng, nước, cát, cỏ hay băng.'],
   vars:[one('stone.png','Đá cao',1,{biome:'mountain',vi:0})]},

  {id:'low',grp:'Ô địa hình',name:'Đá thấp',
   sum:'Đây là bậc thang nối mặt bàn với đá cao, chỉ có trong bản đồ Núi.',
   lines:[
     'Đá thấp cao bằng nửa đá cao (**bậc 1**): có thể leo từ ô thường lên đây, rồi leo tiếp lên đá cao.',
     'Đi lên bằng đường nào thì cũng có thể đi xuống bằng đường đó. Nếu giữa hai ô đá thấp kế nhau có tường, quân vẫn **nhảy qua tường** được.',
     'Game không cho đặt tường bịt kín đường tới đích của bất kỳ bên nào, kể cả quân đang đứng trên núi.'],
   vars:[one('low.png','Đá thấp',9,{biome:'mountain',vi:0})]},

  /* Vật phẩm: hình là biểu tượng THẬT của game (CFG.ITEMS[item].icon (tên trong js/icons.js), cùng biểu tượng trên túi đồ và lúc quà nổi lên khỏi rương) */
  {id:'brick',grp:'Vật phẩm',name:'Cục gạch',item:'brick',
   sum:'Được cộng ngay **1 bức tường**.',
   lines:[
     'Cộng **1 bức tường** vô kho, không chiếm chỗ trong túi đồ.',
     'Đây là món dễ nhận nhất: có **30%** cơ hội xuất hiện mỗi lần mở rương.']},

  {id:'boots',grp:'Vật phẩm',name:'Đôi giày',item:'boots',
   sum:'Được thêm một lượt chỉ để đi quân, không tốn lượt.',
   lines:[
     'Sau hành động kế tiếp (đi quân hoặc đặt tường), bạn sẽ có thêm **một lượt chỉ để đi quân**.',
     'Không xài được nếu đang có một đôi giày chờ kích hoạt hoặc đang ở trong lượt thêm.',
     'Bạn sẽ mất lượt thêm nếu lúc đó phải đứng yên (vừa bước xuống nước), không còn nước đi hợp lệ hoặc bị lún cát.'],
   note:['Bấm phím 1 / 2 theo vị trí món trong túi đồ, hoặc bấm vô biểu tượng ở phía trên.']},

  {id:'glove',grp:'Vật phẩm',name:'Găng tay',item:'glove',
   sum:'Lấy 1 bức tường từ đối thủ. Tốn một lượt.',
   lines:[
     'Chuyển **1 bức tường** từ kho của đối thủ qua kho của bạn.',
     'Chỉ xài được khi đối thủ còn **ít nhất 2 bức tường**.']},

  {id:'hammer',grp:'Vật phẩm',name:'Búa',item:'hammer',
   sum:'Tháo một bức tường của đối thủ và trả lại cho họ. Không tốn lượt.',
   lines:[
     'Đối thủ nhận lại bức tường đó, và vị trí đó có thể đặt tường lại. Xài xong bạn vẫn còn lượt. Không xài được trong lượt thêm của giày.',
     'Cách chọn tường: rê chuột tới gần tường của đối thủ, khi tường **sáng cam** thì bấm. Trên màn hình cảm ứng: chạm để chọn, chạm lần nữa để xác nhận. Bàn phím: dùng phím mũi tên để chọn, Enter để xác nhận, Esc để hủy.']},

  {id:'pick',grp:'Vật phẩm',name:'Cuốc chim',item:'pick',
   sum:'Phá hẳn một bức tường của đối thủ. Tốn một lượt.',
   lines:[
     'Bức tường bị phá **sẽ không** được trả lại cho đối thủ. Vị trí đó bị chiếm vĩnh viễn: không ai đặt tường lại được, và chỗ đó không còn chặn đường.',
     'Cách chọn tường giống như khi xài Búa.']},

  {id:'blocker',grp:'Sự kiện',name:'Người chặn đường',
   sum:'Nhân vật màu vàng bay xuống chặn đường người đang dẫn quá xa.',
   lines:[
     'Chỉ xuất hiện (không sớm hơn khoảng 20 đến 30 lượt đi, rồi nghỉ 20 đến 30 lượt mới đến lại) khi một bên đang dẫn đường xa đối thủ từ 3 bước trở lên. Ván cân bằng thì nó không đến.',
     'Chỉ nhắm vào người đang dẫn, ngay trên đường đi của họ. Dẫn càng xa thì nó đáp càng sát người đó; dẫn ít thì nó chặn ở chỗ xa hơn. Ô bị chiếm tính như khối đá: không ai bước vô hay nhảy qua được.',
     'Dẫn càng xa thì đứng càng lâu (từ 3 đến 8 lượt). Nếu lợi thế đã bị kéo về gần bằng nhau thì nó rời đi sớm, vì nó bận đi mua sữa cho con. Khi chơi online, server sẽ quyết định nên cả hai bên đều thấy cùng một kết quả.'],
   vars:[one('blocker.png','Người chặn đường',null,{blocker:true,dist:6.8,ty:.3})]}
];

if(typeof module!=='undefined')module.exports=GUIDE;