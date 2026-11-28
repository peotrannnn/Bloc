'use strict';
/* [GUIDE-DATA] Nội dung cửa sổ Hướng dẫn (chỉ chế độ Hỗn Loạn). Chỉ là DỮ LIỆU, không đụng DOM / 3D nên test được bằng Node (tools/guide-test.js).
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

GUIDE.groups=['Tổng quan','Ô địa hình','Vật phẩm','Sự kiện'];

GUIDE.entries=[
  {id:'intro',grp:'Tổng quan',name:'Hỗn Loạn là gì?',
   sum:'Quoridor gốc, thêm địa hình, rương và vật phẩm.',
   lines:[
     'Luật gốc vẫn giữ nguyên: ai đi tới hàng đích của mình trước thì thắng, mỗi bên có 10 tường, và không được đặt tường bịt kín hẳn đường về đích của bất kỳ ai.',
     'Mỗi bản đồ (rừng, núi, tuyết, sông, sa mạc...) rải các loại ô đặc biệt lên bàn. Chọn mục ở cột bên trái để xem từng loại hoạt động ra sao.',
     'Quân bước vào hoặc kết thúc nước đi trên ô đặc biệt thì hiệu ứng của ô đó chạy ngay sau nước đi.',
     'Rương cho vật phẩm. Túi đồ chứa tối đa 2 món, dùng bằng phím 1 / 2 hoặc bấm biểu tượng ở thanh phía trên.',
     'Ván Hỗn Loạn còn có Người chặn đường thỉnh thoảng đáp xuống bàn.'],
   note:['Phím I (hoặc nút Hướng dẫn phía dưới) bật / tắt cửa sổ này. Phím ↑ ↓ đổi mục, ← → đổi biến thể, Esc để đóng.']},

  {id:'floor',grp:'Ô địa hình',name:'Ô thường',
   sum:'Ô gỗ bình thường, không có hiệu ứng.',
   lines:[
     'Đi, nhảy qua đối thủ và đặt tường đúng như luật Quoridor gốc.',
     'Bốn hàng ở hai đầu bàn (hai hàng mỗi đầu: hàng xuất phát và hàng kế bên) luôn là ô thường.',
     'Chỉ ô thường mới là chỗ băng trượt tới, bẫy hất quân về, và Người chặn đường đáp xuống.'],
   vars:[
     {label:'Ô gỗ tối',cap:'Ô sàn gỗ tối, xen kẽ như bàn cờ.',shot:{biome:'meadow',cells:[],look:[4,4]}},
     {label:'Ô gỗ sáng',cap:'Ô sàn gỗ sáng.',shot:{biome:'meadow',cells:[],look:[4,5]}}]},

  {id:'grass',grp:'Ô địa hình',name:'Cỏ',
   sum:'Quân đứng trong cỏ thì đối thủ không nhìn thấy.',
   lines:[
     'Quân đứng trên cỏ bị che: đối thủ không thấy quân đó trên bàn.',
     'Ngoại lệ: nếu đối thủ cũng đứng trên cỏ và ở trong 8 ô xung quanh quân đó thì vẫn thấy.',
     'Chỉ là luật nhìn thấy. Cỏ không làm chậm, không chặn đường: đi, nhảy, đặt tường bình thường.',
     'Khi quân của đối thủ chui vào bụi cỏ, ô đó hiện mũi tên cam chỉ xuống; sau đó là số lượt họ đã đi kể từ lúc biến mất (1 đến 5+). Đó là chỗ "thấy lần cuối".'],
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
     'Bước vào ô băng thì quân trượt ngay sang một ô kề ngẫu nhiên (không quay lại ô vừa rời).',
     'Không trượt vào chỗ có tường, đá, Người chặn đường hay đối thủ chắn.',
     'Trượt vào ô băng khác thì trượt tiếp. Dừng khi tới ô không phải băng, hết đường, chạm hàng đích (thắng luôn) hoặc sau 40 lần trượt.',
     'Ô dừng cuối cùng vẫn chạy hiệu ứng của nó: nước thì đứng yên, bẫy, cổng, rương, cát đều tính.'],
   note:['Băng không trượt lên đá.'],
   vars:[
     {label:'Một ô băng',cap:'Ô băng xanh trong, bóng, nứt thành mảnh tinh thể.',shot:{biome:'meadow',cells:[[4,4,3]],dist:5}},
     {label:'Mảng băng',cap:'Nhiều ô băng liền nhau: trượt xong có thể rơi tiếp vào băng.',shot:{biome:'snow',patch:[3,3],dist:6.6,pitch:.8}}]},

  {id:'trap',grp:'Ô địa hình',name:'Bẫy',
   sum:'Bẫy lò xo: bật lên đúng lúc bạn đứng trên là bị hất về nhà.',
   lines:[
     'Bẫy chạy theo số nước đi: đóng 2 lượt, rồi bật 1 lượt, cứ thế lặp lại.',
     'Kết thúc lượt của mình (đi tới hoặc đứng yên đặt tường) trên bẫy đang bật thì quân bị bắn về một ô ngẫu nhiên trên hàng xuất phát của mình. Ô đó phải trống và còn đường về đích.',
     'Dấu hiệu: tick xanh ✓ là bẫy đóng, đạp lên an toàn. Dấu ! đỏ cùng khung phát sáng là bẫy đang bật.',
     'Bẫy chỉ phạt bên vừa kết thúc lượt trên nó. Quân đứng trên bẫy lúc nó bật vào lượt của đối thủ vẫn an toàn và còn lượt để bước đi.'],
   note:['Bị hất tới nơi đáp thì không chạy thêm hiệu ứng ô nào.'],
   vars:[
     {label:'Đang đóng',cap:'Tấm gỗ nằm thấp trong khung thép: an toàn.',shot:{biome:'meadow',cells:[[4,4,4]],trap:0,dist:5}},
     {label:'Đang bật',cap:'Khung phát sáng đỏ: kết thúc lượt trên ô này là bị hất đi.',shot:{biome:'meadow',cells:[[4,4,4]],trap:2,dist:5}}]},

  {id:'chest',grp:'Ô địa hình',name:'Rương',
   sum:'Kết thúc nước đi trên rương là mở ra một món quà.',
   lines:[
     'Kết thúc nước ĐI trên ô rương (bước vào, nhảy qua đối thủ rồi đáp xuống, hoặc trượt băng dừng đúng ô) thì rương mở và biến mất, ô trở thành ô thường.',
     'Quà bốc ngẫu nhiên: Gạch 30% · Giày 20% · Búa 20% · Găng tay 15% · Cuốc chim 15%.',
     'Gạch cộng 1 tường ngay, không chiếm chỗ trong túi. Món khác vào túi (tối đa 2 món); túi đầy thì món cũ nhất bị bỏ.',
     'Dịch chuyển cổng hoặc bị bẫy hất tới ô rương thì rương không mở.'],
   vars:[
     {label:'Rương',cap:'Rương gỗ viền đen, khóa vàng.',shot:{biome:'meadow',cells:[[4,4,5]],dist:4.6}}]},

  {id:'gate',grp:'Ô địa hình',name:'Cổng dịch chuyển',
   sum:'Hai cổng là một cặp: bước vào cổng này, ra ở cổng kia.',
   lines:[
     'Bàn có đúng 2 cổng, bước vào một cổng thì quân dịch chuyển sang cổng còn lại.',
     'Nếu cổng kia đang có đối thủ đứng, quân phải chờ trên cổng (cổng kia hiện chữ X đỏ). Ngay khi đối thủ rời đi thì quân được dịch chuyển.',
     'Cổng đích bị tường bịt kín, không còn đường về đích cho quân đó, thì không dịch chuyển: phải đi bộ vòng.',
     'Không được đặt tường làm cả hai cổng cùng mất đường về đích. Dịch chuyển không chạy thêm hiệu ứng ô ở nơi đáp.'],
   vars:[
     {label:'Cặp cổng',cap:'Khung đá đen tím, lõi xoáy xanh / tím.',shot:{biome:'meadow',cells:[[4,3,6],[4,5,6]],dist:5.6}},
     {label:'Cổng bị chặn',cap:'Lõi chuyển đỏ khi cổng kia đang có người đứng.',shot:{biome:'meadow',cells:[[4,3,6],[4,5,6]],block:[[4,5]],dist:5.6}}]},

  {id:'water',grp:'Ô địa hình',name:'Nước',
   sum:'Bước xuống nước là đứng yên một lượt.',
   lines:[
     'Bước vào ô nước (kể cả nhảy chéo vào) thì lượt kế tiếp của bạn không được đi quân, chỉ đặt tường được.',
     'Hết tường hoặc không còn chỗ đặt hợp lệ thì mất luôn lượt đó.',
     'Chỉ bước vào nước MỚI bị đứng yên. Đã đứng sẵn trên nước thì lượt sau đi lại bình thường.',
     'Không đặt được tường giữa hai ô nước (hoặc nước và cát) kề nhau.'],
   vars:[
     {label:'Nước',cap:'Nước xanh sẫm, sóng gợn, trong vừa phải.',shot:{biome:'meadow',patch:[7,3],dist:6.6,pitch:.8}},
     {label:'Sông',cap:'Ở bản đồ Sông có lau sậy mọc sát bờ.',shot:{biome:'river',patch:[7,3],dist:6.6,pitch:.8}}]},

  {id:'sand',grp:'Ô địa hình',name:'Cát',
   sum:'Kết thúc nước đi trên cát có thể bị lún mất lượt.',
   lines:[
     'Kết thúc nước đi trên ô cát (bước vào, nhảy xuống, hoặc trượt băng dừng đúng ô) thì có 25% quân bị lún.',
     'Quân lún bị bỏ qua hoàn toàn lượt kế tiếp: không đi, không đặt tường, không dùng đồ. Dấu cấm đỏ nổi trên đầu quân.',
     'Giày không cứu được: lượt thêm của giày bị hủy khi lún.',
     'Dịch chuyển cổng hoặc bị bẫy hất xuống cát thì không bị lún. Không đặt được tường giữa hai ô cát (hoặc cát và nước) kề nhau.'],
   vars:[
     {label:'Cát',cap:'Mặt cát nhám, gợn sóng như gió thổi.',shot:{biome:'desert',patch:[8,3],dist:6.6,pitch:.8}},
     {label:'Cát liền nước',cap:'Hai loại này liền nhau thì không đặt được tường ở giữa.',shot:{biome:'meadow',cells:[[4,3,7],[4,4,8],[4,5,8],[3,3,7],[3,4,8],[3,5,8]],look:[3.5,4],dist:6.2,pitch:.8}}]},

  {id:'stone',grp:'Ô địa hình',name:'Đá cao',
   sum:'Khối đá cao bằng quân cờ, bậc 2 trong luật độ cao.',
   lines:[
     'Ô thường là bậc 0, đá thấp là bậc 1, đá cao là bậc 2. Chỉ đi được giữa hai ô kề nhau chênh tối đa 1 bậc.',
     'Vì vậy ô thường không leo thẳng lên đá cao được: nó chặn đường như một bức tường, trừ khi có đá thấp làm bậc thang (bản đồ Núi).',
     'Leo lên, xuống đá không tốn thêm lượt.',
     'Cạnh giữa hai ô đều là đá thì tường không chặn (vẫn đặt được, vẫn tính vào số tường). Cạnh có ít nhất một ô thường thì tường chặn như bình thường.',
     'Nhảy qua đối thủ không được đi từ ô thường lên đá cao trong một nước.'],
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
     'Cao bằng nửa đá cao, là bậc 1: leo lên từ ô thường, rồi leo tiếp lên đá cao được.',
     'Ô thường ↔ đá thấp ↔ đá cao đi lại được. Ô thường ↔ đá cao thì không.',
     'Leo không tốn thêm lượt. Lên đường nào thì xuống được đường đó.',
     'Cạnh giữa hai ô đá thì tường không chặn. Hai đá thấp kề nhau mà có tường ở giữa thì quân nhảy qua tường.',
     'Game không cho đặt tường nhốt kín đường về đích của ai, kể cả quân đang đứng trên núi.'],
   vars:[
     {label:'Nguyên khối',cap:'Đá thấp nguyên khối, sáng và ẩm hơn đá cao một chút.',shot:{biome:'mountain',cells:[[4,4,9]],look:[4,4],vi:0,dist:5.2,pitch:.7}},
     {label:'Sứt nhẹ',cap:'Đá thấp sứt góc nhẹ.',shot:{biome:'mountain',cells:[[4,4,9]],look:[4,4],vi:1,dist:5.2,pitch:.7}},
     {label:'Sứt sâu',cap:'Đá thấp sứt sâu.',shot:{biome:'mountain',cells:[[4,4,9]],look:[4,4],vi:2,dist:5.2,pitch:.7}},
     {label:'Bậc thang',cap:'Ô thường, đá thấp, đá cao: ba bậc để leo núi.',shot:{biome:'mountain',cells:[[4,4,9],[4,5,1]],look:[4,4],dist:6.2,pitch:.55,yaw:.9}}]},

  /* Vật phẩm: hình là biểu tượng THẬT của game (CFG.ITEMS[item].icon, cùng biểu tượng trên túi đồ và lúc quà nổi lên khỏi rương) */
  {id:'brick',grp:'Vật phẩm',name:'Cục gạch',item:'brick',
   sum:'+1 tường ngay lập tức.',
   lines:[
     'Cộng ngay 1 tường vào kho của bạn, không chiếm chỗ trong túi.',
     'Là món hay rơi nhất: 30% mỗi lần mở rương.']},

  {id:'boots',grp:'Vật phẩm',name:'Đôi giày',item:'boots',
   sum:'Thêm một lượt, chỉ để đi quân. Miễn phí.',
   lines:[
     'Dùng giày không tốn lượt. Sau hành động kế tiếp của bạn (đi hoặc đặt tường), bạn được thêm MỘT lượt chỉ để đi quân.',
     'Không dùng được khi đang có giày chờ hoặc đang trong lượt thêm.',
     'Mất lượt thêm nếu lúc đó bạn đang đứng yên (vừa lội xuống nước), không còn nước đi, hoặc bị lún cát.'],
   note:['Dùng bằng phím 1 / 2 theo vị trí món trong túi, hoặc bấm biểu tượng ở thanh phía trên.']},

  {id:'glove',grp:'Vật phẩm',name:'Găng tay',item:'glove',
   sum:'Cướp 1 tường của đối thủ. Tốn một lượt.',
   lines:[
     'Lấy 1 tường từ kho của đối thủ sang kho bạn.',
     'Chỉ dùng được khi đối thủ còn ít nhất 2 tường.',
     'Tốn một lượt (dùng xong là chuyển lượt).']},

  {id:'hammer',grp:'Vật phẩm',name:'Búa',item:'hammer',
   sum:'Tháo một tường của đối thủ, trả lại cho họ. Miễn phí.',
   lines:[
     'Chọn một tường do đối thủ đặt và tháo ra. Họ nhận lại tường đó (+1), và khe đó đặt lại được.',
     'Dùng búa không tốn lượt: dùng xong bạn vẫn còn nguyên lượt để đi quân hoặc đặt tường.',
     'Không dùng được trong lượt thêm của giày.',
     'Chọn tường: rê chuột gần tường đối thủ để nó sáng cam, rồi bấm vào tường đang sáng. Trên cảm ứng: chạm lần 1 để chọn, chạm lần 2 để xác nhận. Bàn phím: ← → ↑ ↓ chọn, Enter xác nhận, Esc hủy.']},

  {id:'pick',grp:'Vật phẩm',name:'Cuốc chim',item:'pick',
   sum:'Phá hẳn một tường của đối thủ. Tốn một lượt.',
   lines:[
     'Phá một tường của đối thủ và KHÔNG trả lại cho họ.',
     'Khe đó bị chiếm vĩnh viễn: không ai xây lại được và không còn chắn đường.',
     'Tốn một lượt. Cách chọn tường giống Búa.']},

  {id:'blocker',grp:'Sự kiện',name:'Người chặn đường',
   sum:'Nhân vật vàng bay xuống đứng chặn chỗ hiểm nhất trên bàn.',
   lines:[
     'Đầu ván khoảng 20 đến 30 nước thì xuất hiện lần đầu. Sau đó cứ cách 20 đến 30 nước lại quay lại.',
     'Nhân vật bay từ trên trời xuống, đáp vào ô chặn đường nhiều nhất. Lúc đó cả hai bên tạm dừng và camera khóa vào nhân vật.',
     'Ô bị chiếm coi như một khối đá: không ai đi vào hay nhảy qua được.',
     'Đứng đó 5 đến 7 nước rồi chạy ra mép bàn nhảy xuống (không có đường thì bay vút lên).',
     'Online thì server quyết định thời điểm, hai bên luôn thấy giống nhau.']}
];

if(typeof module!=='undefined')module.exports=GUIDE;
