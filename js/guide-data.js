'use strict';
/* [GUIDE-DATA] Nội dung cửa sổ Hướng dẫn (nhóm 'Cách chơi' hiện ở cả Classic; các nhóm khác chỉ ở Hỗn Loạn). Chỉ là DỮ LIỆU, không đụng DOM / 3D nên test được bằng Node (tools/guide-test.js).
   Chữ luật ở đây phải khớp js/core.js (đầu file) và CFG.ITEMS: sửa luật thì sửa cả chỗ này.

   Mỗi mục:  id · grp (nhóm ở cột trái) · name · sum (một câu tóm tắt) · lines[] (cách hoạt động) · note[] (lưu ý, tùy chọn)
             item: tên món trong CFG.ITEMS (mục vật phẩm: hiện biểu tượng của game thay cho ảnh dựng)
             vars[]: các biến thể, mỗi biến thể = {label, cap, shot}
   shot = bản mô tả cảnh để js/guide-shots.js dựng ẢNH THẬT bằng chính Terrain/Stage của game (không có ảnh vẽ tay):
             biome  bảng màu + hình dạng cỏ (khóa của Terrain.biomes)      cells [[hàng,cột,mã ô],…] các ô đặc biệt trên nền gỗ thường
             look   [hàng,cột] ô camera nhìn vào (mặc định giữa bàn)       dist/pitch/yaw  camera (mặc định ở guide-shots.js)
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

GUIDE.groups=['Cách chơi','Hỗn Loạn','Ô địa hình','Vật phẩm','Sự kiện'];
GUIDE.basicGroups=['Cách chơi'];   /* nhóm hiện ở CẢ Classic; các nhóm còn lại chỉ có ở Hỗn Loạn */

GUIDE.entries=[
  {id:'how',grp:'Cách chơi',name:'Cách chơi',
   sum:'Đi tới hàng đối diện trước đối thủ là thắng.',
   lines:[
     'Mỗi lượt bạn chọn một trong hai việc: đi quân một ô (lên, xuống, trái, phải) hoặc đặt một tường.',
     'Mục tiêu là chạm tới hàng cuối phía đối diện trước đối thủ. Trắng đi trước.',
     'Đối thủ đứng ngay trước mặt thì nhảy qua đầu họ. Nếu phía sau họ có tường thì bước né sang bên.'],
   note:['Phím tắt: Q đi quân · W đặt tường · R xoay tường · E đổi góc nhìn · T bật/tắt đánh giá · O cài đặt · P ván mới · Esc về menu. Mũi tên để đi quân hoặc dời tường, Enter để đặt.']},

  {id:'wall',grp:'Cách chơi',name:'Đặt tường',
   sum:'Tường chặn đường đối thủ, nhưng không được nhốt kín ai.',
   lines:[
     'Bấm Tường (W), rê chuột tới khe giữa các ô rồi bấm để đặt. R để xoay giữa ngang và dọc.',
     'Mỗi bên có 10 tường, mỗi tường dài hai ô. Hết tường thì chỉ còn đi quân.',
     'Tường không được cắt ngang tường khác và không được bịt kín hẳn đường về đích của bất kỳ ai (kể cả bạn). Chỗ nào bị cấm, game sẽ báo lý do.']},

  {id:'intro',grp:'Hỗn Loạn',name:'Hỗn Loạn là gì?',
   sum:'Quoridor gốc, thêm địa hình, rương và vật phẩm.',
   lines:[
     'Luật gốc vẫn giữ nguyên: ai tới hàng đích trước thì thắng, mỗi bên có 10 tường.',
     'Mỗi bản đồ (rừng, núi, tuyết, sông, sa mạc...) rải ô đặc biệt lên bàn. Hiệu ứng của ô chạy ngay sau nước đi của bạn.',
     'Rương cho vật phẩm. Túi đồ chứa được tối đa 2 món, dùng bằng phím 1 / 2 hoặc bấm biểu tượng ở thanh phía trên.',
     'Thỉnh thoảng Người chặn đường sẽ bay xuống bàn và đứng chắn lối.'],
   note:[
     'Phím I (hoặc nút Hướng dẫn ở dưới) bật / tắt cửa sổ này. ↑ ↓ đổi mục, ← → đổi biến thể.']},

  {id:'floor',grp:'Ô địa hình',name:'Ô thường',
   sum:'Ô gỗ bình thường, không có hiệu ứng.',
   lines:[
     'Đi, nhảy qua đối thủ và đặt tường y như luật gốc.',
     'Hai hàng đầu và hai hàng cuối của bàn luôn là ô thường.',
     'Băng trượt tới, bẫy hất quân về, Người chặn đường đáp xuống: tất cả đều chỉ ở ô thường.'],
   vars:[
     {label:'Ô gỗ tối',cap:'Ô sàn gỗ tối, xen kẽ như bàn cờ.',shot:{biome:'meadow',cells:[],look:[4,4]}},
     {label:'Ô gỗ sáng',cap:'Ô sàn gỗ sáng.',shot:{biome:'meadow',cells:[],look:[4,5]}}]},

  {id:'grass',grp:'Ô địa hình',name:'Cỏ',
   sum:'Quân đứng trong cỏ thì đối thủ không nhìn thấy.',
   lines:[
     'Quân đứng trong cỏ thì đối thủ không nhìn thấy.',
     'Trừ khi đối thủ cũng đang đứng trong cỏ và ở trong 8 ô xung quanh bạn.',
     'Cỏ không chặn đường hay làm chậm gì cả, chỉ để ẩn mình.',
     'Khi quân đối thủ chui vào cỏ, ô đó hiện mũi tên cam kèm số lượt họ đã đi từ lúc biến mất. Đó là chỗ thấy lần cuối.'],
   note:['Cỏ trông khác theo bản đồ nhưng luật y hệt.'],
   vars:[
     {label:'Đồng cỏ',cap:'Cỏ ở bản đồ Cân bằng: nhiều hoa.',shot:{biome:'meadow',patch:[2,3],dist:6.4,pitch:.8}},
     {label:'Rừng',cap:'Cỏ rừng cao gấp đôi, nhiều hoa, thỉnh thoảng có cây tre.',shot:{biome:'forest',patch:[2,3],dist:6.4,pitch:.8}},
     {label:'Sông',cap:'Cỏ ven sông, kèm lau sậy mọc trong nước sát bờ.',shot:{biome:'river',patch:[2,3],dist:6.4,pitch:.8}},
     {label:'Sa mạc',cap:'Cỏ gai thấp, thỉnh thoảng có xương rồng.',shot:{biome:'desert',patch:[2,3],dist:6.4,pitch:.8}},
     {label:'Tuyết',cap:'Cỏ mảnh phủ băng, thỉnh thoảng có cột băng và người tuyết.',shot:{biome:'snow',patch:[2,3],dist:6.4,pitch:.8}},
     {label:'Núi',cap:'Cỏ núi mọc thẳng đứng.',shot:{biome:'mountain',patch:[2,3],dist:6.4,pitch:.8}}]},

  {id:'ice',grp:'Ô địa hình',name:'Băng',
   sum:'Bước vào là trượt đi một đoạn, không điều khiển được.',
   lines:[
     'Bước vào ô băng là trượt ngay sang một ô kề ngẫu nhiên, không quay lại ô vừa đứng.',
     'Rơi vào băng tiếp thì trượt tiếp. Dừng khi tới ô không phải băng, hết đường, chạm hàng đích (thắng luôn) hoặc sau 40 lần trượt.',
     'Tường, đá, đối thủ và Người chặn đường đều chắn đường trượt.',
     'Ô dừng cuối vẫn chạy hiệu ứng của nó: nước, bẫy, cổng, rương, cát đều tính.'],
   note:['Băng không trượt lên đá.'],
   vars:[
     {label:'Một ô băng',cap:'Ô băng xanh trong, bóng, nứt thành mảnh tinh thể.',shot:{biome:'meadow',cells:[[4,4,3]],dist:5}},
     {label:'Mảng băng',cap:'Nhiều ô băng liền nhau: trượt xong có thể rơi tiếp vào băng.',shot:{biome:'snow',patch:[3,3],dist:6.6,pitch:.8}}]},

  {id:'trap',grp:'Ô địa hình',name:'Bẫy',
   sum:'Bẫy lò xo: bật lên đúng lúc bạn đứng trên là bị hất về nhà.',
   lines:[
     'Bẫy chạy theo số nước đi: đóng 2 lượt rồi bật 1 lượt, cứ thế lặp lại.',
     'Kết thúc lượt của bạn (đi tới hoặc đứng yên đặt tường) trên bẫy đang bật là bị bắn về một ô ngẫu nhiên ở hàng xuất phát của mình.',
     'Tick xanh ✓ là bẫy đóng, đạp lên an toàn. Dấu ! đỏ cùng khung phát sáng là bẫy đang bật.',
     'Bẫy chỉ phạt bên vừa kết thúc lượt trên nó. Bạn đứng sẵn trên bẫy lúc nó bật vào lượt đối thủ thì vẫn an toàn.'],
   note:['Bị hất tới nơi đáp thì không chạy thêm hiệu ứng ô nào.'],
   vars:[
     {label:'Đang đóng',cap:'Tấm gỗ nằm thấp trong khung thép: an toàn.',shot:{biome:'meadow',cells:[[4,4,4]],trap:0,dist:5}},
     {label:'Đang bật',cap:'Khung phát sáng đỏ: kết thúc lượt trên ô này là bị hất đi.',shot:{biome:'meadow',cells:[[4,4,4]],trap:2,dist:5}}]},

  {id:'chest',grp:'Ô địa hình',name:'Rương',
   sum:'Kết thúc nước đi trên rương là mở ra một món quà.',
   lines:[
     'Kết thúc nước đi trên ô rương (bước vào, nhảy xuống, hoặc trượt băng dừng đúng ô) là rương mở ra rồi biến mất.',
     'Quà bốc ngẫu nhiên: Gạch 30% · Giày 20% · Búa 20% · Găng tay 15% · Cuốc chim 15%.',
     'Gạch cộng tường ngay. Món khác vào túi (tối đa 2 món); túi đầy thì món cũ nhất bị bỏ.',
     'Bị dịch chuyển cổng hay bẫy hất tới ô rương thì rương không mở.'],
   vars:[
     {label:'Rương',cap:'Rương gỗ viền đen, khóa vàng.',shot:{biome:'meadow',cells:[[4,4,5]],dist:4.6}}]},

  {id:'gate',grp:'Ô địa hình',name:'Cổng dịch chuyển',
   sum:'Hai cổng là một cặp: bước vào cổng này, ra ở cổng kia.',
   lines:[
     'Bàn có đúng 2 cổng. Bước vào một cổng là bạn xuất hiện ở cổng kia.',
     'Cổng kia đang có đối thủ đứng thì bạn chờ trên cổng (hiện chữ X đỏ). Đối thủ vừa rời đi là bạn được dịch chuyển.',
     'Cổng kia bị tường bịt kín, không còn đường về đích cho bạn, thì không dịch chuyển: phải đi bộ vòng.',
     'Game không cho đặt tường làm cả hai cổng cùng mất đường về đích.'],
   vars:[
     {label:'Cặp cổng',cap:'Khung đá đen tím, lõi xoáy xanh / tím.',shot:{biome:'meadow',cells:[[4,3,6],[4,5,6]],dist:5.6}},
     {label:'Cổng bị chặn',cap:'Lõi chuyển đỏ khi cổng kia đang có người đứng.',shot:{biome:'meadow',cells:[[4,3,6],[4,5,6]],block:[[4,5]],dist:5.6}}]},

  {id:'water',grp:'Ô địa hình',name:'Nước',
   sum:'Bước xuống nước là đứng yên một lượt.',
   lines:[
     'Bước xuống nước (kể cả nhảy chéo vào) thì lượt kế tiếp bạn không đi quân được, chỉ đặt tường.',
     'Hết tường hoặc không còn chỗ đặt thì mất luôn lượt đó.',
     'Chỉ lần bước xuống mới bị đứng yên. Đã đứng sẵn trên nước thì lượt sau đi bình thường.',
     'Giữa hai ô nước (hoặc nước và cát) kề nhau không đặt được tường.'],
   vars:[
     {label:'Nước',cap:'Nước xanh sẫm, sóng gợn, trong vừa phải.',shot:{biome:'meadow',patch:[7,3],dist:6.6,pitch:.8}},
     {label:'Sông',cap:'Ở bản đồ Sông có lau sậy mọc sát bờ.',shot:{biome:'river',patch:[7,3],dist:6.6,pitch:.8}}]},

  {id:'sand',grp:'Ô địa hình',name:'Cát',
   sum:'Kết thúc nước đi trên cát có thể bị lún mất lượt.',
   lines:[
     'Kết thúc nước đi trên cát (bước vào, nhảy xuống, hoặc trượt băng dừng đúng ô) có 25% bị lún.',
     'Quân lún mất trọn lượt kế tiếp: không đi, không đặt tường, không dùng đồ. Dấu cấm đỏ nổi trên đầu quân.',
     'Giày không cứu được: lượt thêm của giày bị hủy khi lún.',
     'Bị cổng dịch chuyển hay bẫy hất xuống cát thì không lún. Giữa hai ô cát (hoặc cát và nước) kề nhau cũng không đặt được tường.'],
   vars:[
     {label:'Cát',cap:'Mặt cát nhám, gợn sóng như gió thổi.',shot:{biome:'desert',patch:[8,3],dist:6.6,pitch:.8}},
     {label:'Cát liền nước',cap:'Hai loại này liền nhau thì không đặt được tường ở giữa.',shot:{biome:'meadow',cells:[[4,3,7],[4,4,8],[4,5,8],[3,3,7],[3,4,8],[3,5,8]],look:[3.5,4],dist:6.2,pitch:.8}}]},

  {id:'stone',grp:'Ô địa hình',name:'Đá cao',
   sum:'Khối đá cao bằng quân cờ, bậc 2 trong luật độ cao.',
   lines:[
     'Ô thường là bậc 0, đá thấp bậc 1, đá cao bậc 2. Chỉ đi được giữa hai ô kề nhau chênh tối đa 1 bậc.',
     'Nên từ ô thường không leo thẳng lên đá cao được: nó chắn đường như một bức tường, trừ khi có đá thấp làm bậc thang (bản đồ Núi).',
     'Leo lên hay xuống không tốn thêm lượt.',
     'Tường tính theo từng cạnh: cạnh giữa hai ô đều là đá thì tường không chặn (vẫn đặt được, vẫn mất 1 tường). Có ít nhất một ô thường thì tường chặn như bình thường.',
     'Nhảy qua đối thủ cũng không được đi từ ô thường lên đá cao trong một nước.'],
   note:['Trên đá không có rương, bẫy, cổng, nước, cát, cỏ, băng. Băng không trượt lên đá.'],
   vars:[
     {label:'Nguyên khối',cap:'Khối đá nguyên vẹn.',shot:{biome:'mountain',cells:[[4,4,1]],look:[4,4],vi:0,dist:5.2,pitch:.7}},
     {label:'Sứt nhẹ',cap:'Khối đá sứt góc nhẹ.',shot:{biome:'mountain',cells:[[4,4,1]],look:[4,4],vi:1,dist:5.2,pitch:.7}},
     {label:'Sứt sâu',cap:'Khối đá sứt sâu.',shot:{biome:'mountain',cells:[[4,4,1]],look:[4,4],vi:2,dist:5.2,pitch:.7}},
     {label:'Phủ rêu',cap:'Ở rừng và đồng cỏ, đá phủ rêu xanh.',shot:{biome:'forest',cells:[[4,4,1]],look:[4,4],vi:0,dist:5.2,pitch:.7}},
     {label:'Phủ tuyết',cap:'Ở bản đồ Tuyết, đá phủ trắng.',shot:{biome:'snow',cells:[[4,4,1]],look:[4,4],vi:0,dist:5.2,pitch:.7}}]},

  {id:'low',grp:'Ô địa hình',name:'Đá thấp',
   sum:'Bậc thang giữa mặt bàn và đá cao. Chỉ có ở bản đồ Núi.',
   lines:[
     'Cao bằng nửa đá cao, là bậc 1: từ ô thường leo lên được, rồi leo tiếp lên đá cao.',
     'Ô thường ↔ đá thấp ↔ đá cao đi lại được. Ô thường ↔ đá cao thì không.',
     'Leo không tốn thêm lượt. Lên đường nào thì xuống được đường đó.',
     'Giữa hai ô đá, tường không chặn. Hai đá thấp kề nhau mà có tường ở giữa thì quân nhảy qua tường.',
     'Game không cho đặt tường nhốt kín đường về đích của ai, kể cả quân đang đứng trên núi.'],
   vars:[
     {label:'Nguyên khối',cap:'Đá thấp nguyên khối, sáng và ẩm hơn đá cao một chút.',shot:{biome:'mountain',cells:[[4,4,9]],look:[4,4],vi:0,dist:5.2,pitch:.7}},
     {label:'Sứt nhẹ',cap:'Đá thấp sứt góc nhẹ.',shot:{biome:'mountain',cells:[[4,4,9]],look:[4,4],vi:1,dist:5.2,pitch:.7}},
     {label:'Sứt sâu',cap:'Đá thấp sứt sâu.',shot:{biome:'mountain',cells:[[4,4,9]],look:[4,4],vi:2,dist:5.2,pitch:.7}},
     {label:'Bậc thang',cap:'Ô thường, đá thấp, đá cao: ba bậc để leo núi.',shot:{biome:'mountain',cells:[[4,4,9],[4,5,1]],look:[4,4],dist:6.2,pitch:.55,yaw:.9}}]},

  /* Vật phẩm: hình là biểu tượng THẬT của game (CFG.ITEMS[item].icon, cùng biểu tượng trên túi đồ và lúc quà nổi lên khỏi rương) */
  {id:'brick',grp:'Vật phẩm',name:'Cục gạch',item:'brick',
   sum:'Cộng ngay 1 tường.',
   lines:[
     'Cộng 1 tường vào kho của bạn, không chiếm chỗ trong túi.',
     'Là món hay rơi nhất: 30% mỗi lần mở rương.']},

  {id:'boots',grp:'Vật phẩm',name:'Đôi giày',item:'boots',
   sum:'Thêm một lượt chỉ để đi quân. Miễn phí.',
   lines:[
     'Miễn phí, không tốn lượt. Sau hành động kế tiếp (đi hoặc đặt tường), bạn được thêm MỘT lượt chỉ để đi quân.',
     'Không dùng được khi đang có giày chờ hoặc đang trong lượt thêm.',
     'Mất lượt thêm nếu lúc đó bạn đang đứng yên (vừa lội xuống nước), hết nước đi, hoặc bị lún cát.'],
   note:['Dùng bằng phím 1 / 2 theo vị trí món trong túi, hoặc bấm biểu tượng ở thanh phía trên.']},

  {id:'glove',grp:'Vật phẩm',name:'Găng tay',item:'glove',
   sum:'Cướp 1 tường của đối thủ. Tốn một lượt.',
   lines:[
     'Lấy 1 tường từ kho của đối thủ sang kho bạn.',
     'Chỉ dùng được khi đối thủ còn ít nhất 2 tường.',
     'Tốn một lượt.']},

  {id:'hammer',grp:'Vật phẩm',name:'Búa',item:'hammer',
   sum:'Tháo một tường của đối thủ, trả lại cho họ. Miễn phí.',
   lines:[
     'Tháo một tường do đối thủ đặt. Họ nhận lại tường đó, và khe đó đặt lại được.',
     'Miễn phí: dùng xong bạn vẫn còn lượt để đi quân hoặc đặt tường. Không dùng được trong lượt thêm của giày.',
     'Chọn tường: rê chuột gần tường đối thủ cho nó sáng cam rồi bấm. Cảm ứng: chạm một lần để chọn, chạm lần nữa để xác nhận. Bàn phím: mũi tên chọn, Enter xác nhận, Esc hủy.']},

  {id:'pick',grp:'Vật phẩm',name:'Cuốc chim',item:'pick',
   sum:'Phá hẳn một tường của đối thủ. Tốn một lượt.',
   lines:[
     'Phá hẳn một tường của đối thủ và KHÔNG trả lại cho họ.',
     'Khe đó bị chiếm vĩnh viễn: không ai xây lại được và không còn chắn đường.',
     'Tốn một lượt. Cách chọn tường giống Búa.']},

  {id:'blocker',grp:'Sự kiện',name:'Người chặn đường',
   sum:'Nhân vật vàng bay xuống đứng chặn chỗ hiểm nhất trên bàn.',
   lines:[
     'Khoảng 20 đến 30 nước đầu thì xuất hiện lần đầu, sau đó cứ cách 20 đến 30 nước lại quay lại.',
     'Nhân vật bay từ trên trời xuống đáp vào ô cản đường nhất. Lúc đó hai bên tạm dừng và camera khóa vào nó.',
     'Ô bị chiếm coi như khối đá: không ai bước vào hay nhảy qua được.',
     'Đứng 5 đến 7 nước rồi chạy ra mép bàn nhảy xuống (không có đường thì bay vút lên).',
     'Online thì server quyết định thời điểm, hai bên thấy giống nhau.']}
];

if(typeof module!=='undefined')module.exports=GUIDE;
