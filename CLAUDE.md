# CLAUDE.md — Bloc

Game cờ 3D chạy trên trình duyệt (biến thể Quoridor 9×9), giao diện tiếng Việt. Chế độ **Classic** (luật gốc) và **Hỗn Loạn** (địa hình + vật phẩm, chỉ online). Client tĩnh (GitHub Pages) + server Cloudflare Worker/Durable Object.
Đọc `README.md` trước; đầu `js/core.js` là bản đầy đủ của luật. Kế hoạch tính năng đang làm: `docs/PLAN-da-thap-da-cao.md`.

## Quy ước bắt buộc

- Chú thích code và thông báo cho người chơi bằng **tiếng Việt**. File nào cũng bắt đầu `'use strict';`, phong cách hiện có (hàm ngắn, chú thích giải thích *vì sao*).
- **Lõi luật là MỘT bản duy nhất** (`js/core.js`), dùng chung client, AI worker và server. Thuần logic: không DOM, không 3D, không biến toàn cục (`S`, `N`, `CFG`), **không `Math.random`** (dùng `rnd(st)` của lõi, hoặc PRNG có seed trong `mapgen.js`). Cùng trạng thái + cùng hành động ⇒ cùng kết quả ở mọi nơi.
- `js/mapgen.js` cũng thuần logic và có seed: cùng seed ⇒ cùng map trên mọi máy.
- Classic không được đổi hành vi. Mọi thứ liên quan địa hình chỉ chạy khi `st.terr` tồn tại (Hỗn Loạn). Đường chạy Classic của `blk`/`moves`/`dist` phải giữ nhanh (AI gọi rất nhiều).
- **Lời nhắn khi tường bị từ chối là việc của lõi, không đoán ở giao diện:** lý do do `Core.wallWhy` trả (cùng một phép đo với `canWall`, không thể lệch), chữ nằm ở MỘT bảng `WALL_WHY` đầu `js/input.js`. Thêm lý do mới = thêm mã ở `wallWhy` + một dòng ở `WALL_WHY` + một ca ở `tools/wallwhy-test.js`. Đừng viết lại điều kiện từ chối ở `input.js`.
- **Tooltip:** không dùng thuộc tính `title` mặc định của trình duyệt. Mô tả đặt bằng `data-tip` (+ `data-tn` tên, `data-tk` phím) và do `js/tooltip.js` vẽ (CSS ở cuối `css/style.css`, màu theo biome của phần tử). `title` cũ vẫn chạy: tự được chuyển thành `data-tip` khi rê chuột.
- Không thêm thư viện. Không commit `server/.wrangler/`, token, khóa API (repo công khai). Thư mục `audio` không nằm trong zip, đừng tạo.
- Sau khi sửa `config/util/state/core/rules/ai/tools/biet`: chạy lại `node tools/build-worker.js` (sinh `js/ai/worker-src.js`, đừng sửa tay).
- Server import thẳng `../../js/core.js`, `mapgen.js`: sửa các file này nghĩa là phải deploy client và server **cùng lúc**. Đã có **số phiên bản giao thức** `Core.PROTO` (core.js, hiện là 3): client gửi `v` trong `hello`, server từ chối (đóng 4005, `error{reason:'version'}`) nếu lệch. **Tăng `PROTO` mỗi khi luật hay map đổi theo cách làm hai bên tính khác nhau**, và nhớ test server phải gửi `v` (xem `HELLO_V` trong server/test).

## Lệnh kiểm thử (Node, không cần cài gói)

```
node tools/core-test.js          # lõi luật (~250k kiểm tra)
node tools/items-test.js         # rương, vật phẩm, ván ngẫu nhiên kiểm bất biến
node tools/mapgen-test.js        # mapgen, đối chiếu BFS mapgen ↔ Core
node tools/view-test.js          # logic hoạt ảnh phía client, không cần trình duyệt
node tools/blocker-test.js       # người chặn đường
node tools/wallwhy-test.js       # lý do tường bị từ chối (Core.wallWhy) + bảng chữ WALL_WHY (~530k kiểm tra)
node tools/dumb-test.js          # mọi AI (nhất là Bé Khờ) không được đặt tường bịt kín đường về đích (~380k kiểm tra)
node tools/chaos-client-test.mjs # client thật ↔ server thật
node server/test/room-logic.mjs ; node server/test/items-room.mjs ; node server/test/blocker-room.mjs ; node server/test/chaos-room.mjs
node tools/lowstone-test.js      # đá thấp/cao: tham chiếu độc lập + property test (~2,3 triệu kiểm tra)
node tools/stone-surface-test.js # mặt đá THẬT (Terrain.surfaceAt) khớp hình học khối đá (650 kiểm tra)
node tools/golden-test.js        # Classic / Hỗn Loạn không đá thấp phải trùng bản cũ (--write chỉ khi chủ dự án đồng ý đổi luật)
node tools/build-worker.js
```
Búa đã đổi thành MIỄN PHÍ (như giày; `PROTO`=3, golden đã ghi lại: 37/400 ván đổi, đều là ván có dùng búa, 0 ván không dùng búa đổi). Mốc hiện tại (sau P9/P10): core 252867, items 741461, mapgen 96487, view 260 (206 + 54 ca ăn mừng trên đá), blocker 88, lowstone 3233486, stone-surface 650, golden 400/400 (ghi lại lần 2 vì luật cổng mới: 3/400 ván đổi, đều do cổng), chaos-client đạt (kèm kiểm có ván núi đá thấp mà quân thật sự leo lên đá) đều đạt (mốc cũ trước đá thấp: core 251866, items 727117, mapgen 81330, blocker 84; core/items tăng vì bẫy hất đã sửa làm đổi dãy ván ngẫu nhiên). **Không được làm giảm số kiểm tra hay xóa test để cho qua.**
Xem hình: `tools/view-terrain.html` là bản **3D** (chọn biome núi; cần mạng để tải three.js), `tools/view-mountain.html` và `tools/mapgen-view.html` chỉ là sơ đồ 2D của map; mở bằng `python3 -m http.server`.

## Tính năng đang làm: ĐÁ THẤP / ĐÁ CAO (chỉ biome núi)

Chi tiết và lý do ở `docs/PLAN-da-thap-da-cao.md`. Tóm tắt luật đã chốt (đừng tự đổi; gặp điểm mơ hồ thì ghi vào mục "Câu hỏi mở" của plan và hỏi người dùng):

**Độ cao:** ô thường (mọi mã khác) = 0 · đá thấp (mã mới `TERR.LOW = 9`) = 1, cao 0,35 · đá cao (mã `STONE = 1`, đá hiện có) = 2, cao 0,7. Đá thấp chỉ sinh ở biome `mountain`.

**Đi bước:** chỉ đi giữa hai ô kề (4 hướng) có chênh độ cao ≤ 1. Thường↔thấp, thấp↔cao được; thường↔cao KHÔNG. Leo lên/xuống **không tốn thêm nhịp** (một nước đi vẫn là một lượt). Luật đối xứng: lên bằng đường nào xuống được bằng đường đó.

**Tường, xét TỪNG CẠNH ô:** cạnh giữa hai ô **đều là đá** (cao–cao, thấp–thấp, thấp–cao) thì tường **không chặn** (tường vẫn đặt được, vẫn tính vào số tường). Cạnh có ít nhất một ô thường thì tường chặn như bình thường. Một tường phủ 2 cạnh: mỗi cạnh tự xét riêng, phần chìa ra trên đá không làm mất tác dụng của phần chắn hai ô thường.

**Nhảy qua đối thủ (A qua B tới C):** hợp lệ khi A→B, B→C đều bước được VÀ |độ cao A − độ cao C| ≤ 1 (không đi thường→cao trong một nước). Nhảy thẳng bị chặn vì độ cao thì coi như bị tường chặn: cho bước né sang bên (cũng phải thỏa A→B, B→S, |A−S| ≤ 1).

**Hiệu ứng khác:** ô đá không có rương/bẫy/cổng/nước/cát/cỏ/băng. Băng chỉ trượt trên ô thường (không trượt lên đá). Bẫy hất, cổng, người chặn đường chỉ ở ô thường. Hàng 0,1,7,8 luôn là ô thường.

**Cổng dịch chuyển (luật mới, chủ dự án đồng ý):** chỉ dịch chuyển khi cổng đích còn đường về đích của quân đó (`dist(st,p,cổng đích)<NOPATH`, cả lúc bước vào lẫn lúc `gateRelease`); đích bị bịt thì quân đứng nguyên, phải đi bộ vòng. `canWall`/`wallDists` từ chối tường làm CẢ HAI cổng mất đường về đích của cả hai bên (`gateAlive`); một cổng bị bịt thì được. Cổng đã chết sẵn trước khi đặt tường thì không phạt tường khác.

**Chống kẹt (phải giữ đúng):** `canWall` từ chối mọi tường làm MỘT BÊN (kể cả quân đang đứng trên núi) mất đường về đích. Vì `dist` dùng cùng `blk` với `moves`, tường nhốt đối thủ trên núi tự động bị từ chối. Đừng viết thêm đường tính khoảng cách nào khác ngoài `blk`.

**Hoạt ảnh:** đi bộ / leo lên / leo xuống / nhảy qua tường (chỉ khi đá thấp–đá thấp CÓ tường trên cạnh) / nhảy qua đối thủ có tính độ cao. Phân loại bằng hàm thuần của Core, quyết định lúc đẩy nước vào hàng chờ (`s.q.push`), không cần đổi giao thức mạng.

### Quy tắc kỹ thuật cho tính năng này

0. **Hai loại độ cao, đừng lẫn:** `Terrain.heightAt(r,c)` là độ cao DANH NGHĨA theo bậc (0 / lowH / stoneH), dùng cho luật và chọn ô bằng chuột. Mặt đá vẽ ra lệch tới ±.1 (sy ngẫu nhiên, nhiễu đỉnh, mép vát, biến thể sứt góc), nên mọi thứ NHÌN THẤY đặt lên đá (quân, ô gợi ý, mũi tên, nhãn) phải dùng `Terrain.topAt/surfaceAt/topMaxAt` (qua `Pawns.floorY/groundY`, `Stage.visualAt`). Sửa `stoneVert`/`stoneGeo` hoặc cách xếp khối đá trong `build()` thì chạy lại `tools/stone-surface-test.js`.

0b. **Quân trên đá:** `Pawns.groundY` lấy mặt đá CAO NHẤT dưới cả vòng chân (tâm + 8 điểm bán kính `FOOT_R` = R·scale·1,2), `step` theo đá dâng NGAY nhưng hạ dần (`GROUND_FALL`); `floorY` cũng dùng vòng đó. Đừng quay lại lấy ba điểm hay độ cao tâm ô.

1. `blk(st,r,c,dr,dc)` là **điểm duy nhất** quyết định "không qua được cạnh này" (tường + chênh độ cao + đá–đá bỏ qua tường). Mọi BFS/nước đi gọi nó. Không rải điều kiện độ cao ra nơi khác ngoại trừ: điều kiện A→C của cú nhảy, và "chỉ ô thường" của băng/người chặn đường.
2. `open(st,r,c)` không còn loại ô đá (đá giờ vào được). Ai cần "ô thường" dùng `R.ground(st,r,c)` (mới: open && độ cao 0): `blocker-pick.js`, `view/blocker.js`, trượt băng.
3. Mapgen: đá thấp là **bước hậu kỳ tùy chọn**, dùng PRNG con (không đụng dãy số ngẫu nhiên cũ), sinh xong phải qua lại kiểm tra cân bằng bằng luật mới; không đạt thì bỏ đá thấp. Map không có đá thấp phải giống hệt trước đây (đá cao không vào được).
4. Mã `9` đi qua `serialize/deserialize/snapshot` bằng chuỗi chữ số: không cần đổi định dạng, nhưng phải test round-trip.
5. Mọi thay đổi luật đi kèm test mới (xem mục Test trong plan). Test tham chiếu phải viết **độc lập** (BFS tự viết trong test), không gọi lại `blk`.

### Định nghĩa "xong"

- Toàn bộ lệnh kiểm thử ở trên đạt, số kiểm tra không giảm; test mới cho đá thấp đạt.
- Classic và map không có đá thấp: kết quả `moves/dist/snapshot` trùng với bản trước (golden test).
- Property test: trên hàng nghìn ván ngẫu nhiên map núi, không có thời điểm nào một quân (không bị người chặn đường chắn) có `dist = NOPATH`.
- Xem tận mắt bằng `tools/view-terrain.html` hoặc chơi thật (cần trình duyệt có mạng): leo, xuống, nhảy tường, nhảy qua đối thủ trên đá, ô gợi ý, bấm chuột chọn ô trên đá. **CHƯA làm được trong phiên tự động (không tải được three.js): chủ dự án cần xem.**
- README (mục luật + cấu trúc) và chú thích đầu `core.js`/`mapgen.js` đã cập nhật; `node tools/build-worker.js` đã chạy.
