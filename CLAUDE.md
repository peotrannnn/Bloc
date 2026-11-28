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
node tools/net-events-test.js   # mọi loại tin server gửi phải được menu.js đăng ký (chat từng bị bỏ vì thiếu)
node tools/wallwhy-test.js       # lý do tường bị từ chối (Core.wallWhy) + bảng chữ WALL_WHY (~530k kiểm tra)
node tools/dumb-test.js          # mọi AI (nhất là Bé Khờ) không được đặt tường bịt kín đường về đích (~380k kiểm tra)
node tools/chaos-client-test.mjs # client thật ↔ server thật
python3 tools/chat-ui-test.py   # giao diện chat + thanh nút (Chromium headless; CHROME=đường-dẫn nếu cần)
node server/test/chat.mjs       # chat + chống spam server
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

## Tiến trình: MÀN KHỞI ĐỘNG + TÊN NGƯỜI CHƠI + ONLINE (phiên này, theo yêu cầu chủ dự án)

Yêu cầu gốc: (1) trước menu có màn **preload** (tải three.js, dựng sẵn âm thanh/cảnh) và cho **nhập tên** (không đăng nhập; sau này mở rộng được), bấm vào là mở khóa âm thanh luôn; (2) trong ván, thanh trạng thái hiện **tên người** thay vì "Lượt đối thủ"; (3) màn Chơi online: góc cửa sổ hiện **số người online toàn server**; (4) "Ghép nhanh" mở **cửa sổ danh sách phòng** đang chờ (tên chủ phòng, chế độ, bản đồ) để bấm chọn thay vì ghép bừa.

Quyết định thiết kế (đừng tự đổi):
- Tên chỉ là chuỗi do client gửi trong `hello{name}`; **server làm sạch** (`server/src/names.js`: ≤16 ký tự, bỏ ký tự điều khiển và `< > & " \``). Không đổi luật ⇒ **không tăng `Core.PROTO`**, không đụng `core.js`, không cần `build-worker`. Trường mới `opp` (tên đối thủ) có trong `welcome/started/state`.
- Số online = số WebSocket "có mặt" giữ ở Durable Object `Lobby` (`GET /presence`, Hibernation + auto-response `ping`/`pong`). Mỗi tab một kết nối, mở từ lúc qua màn khởi động.
- Danh sách phòng: `POST /rooms {mode?,biome?}` → Lobby `/list` (hàm thuần `list()` trong `lobby-logic.js`). Lobby giờ lưu thêm `name` chủ phòng.

Đã xong (server): names.js, lobby-logic (name + list), lobby.js (presence + /list), index.js (/rooms, /presence), room-logic.js (names, opp), room.js. Test: `node server/test/names.mjs` (mới, 22 ca, đã thêm vào `npm test` của server) + toàn bộ test server cũ vẫn đạt.
Đã xong (client): `online-client.js` (getName/setName/randomName, `name` trong hello, `Online.rooms`, `Online.presence` tự nối lại, ẩn khi tab ẩn, bỏ cuộc sau 5 lần lỗi liền nên server cũ không bị spam); `index.html` (`scBoot`, `scQuick`, `#onCount`, `#homeName`, nút `mRename`); `css/online.css`; `app.js` (`App.prepare(step)` tách khỏi `App.start`, `S.net.oppName`); `menu.js` (`boot/enter/rename`, `showQuick/refreshRooms/paintRooms`, `paintOnline`, `from:'quick'` để lỗi vào phòng quay về danh sách); `ui.js` ("Lượt của <tên>", "<tên> đang đi…", "<tên> rớt mạng", tên ở dòng info, đã thoát HTML).
Luồng: mở trang → `scBoot` (tự `Sfx.prepare`, `BgAudio.prepare`, `App.prepare`: three.js + dựng cảnh, trong lúc người chơi gõ tên; Enter khi chưa tải xong thì tự vào lúc xong; three.js lỗi mạng vẫn cho vào menu, ván sẽ thử tải lại) → `scHome`. Cử chỉ gõ/bấm ở `scBoot` là lần tương tác đầu nên âm thanh mở khóa từ đây.
Kiểm thử: test giao diện bằng Chromium headless (playwright) nằm NGOÀI repo ở phiên này (`tools/ui-test.mjs` của phiên, giả lập server bằng route + WebSocket giả; three.js bị chặn nên chỉ đi đường lỗi tải): 22 ca khởi động/đổi tên/online/danh sách phòng/thoát HTML đều đạt. Đã chạy lại: chaos-client-test, view-test (260), blocker-test (88), toàn bộ test server. Không đụng core/mapgen ⇒ các test luật không đổi.

**Phiên hoàn thiện (sau đó):** ô `#onCount` đã chuyển lên GÓC THANH TIÊU ĐỀ (chỉ hiện ở màn Online / Ghép nhanh, `Menu.paintOnline`, bỏ `.onhead`/`#qCount`); `Online.getName` có dự phòng trong bộ nhớ khi localStorage bị chặn (trước đó tên rỗng gửi cho server); Esc ở màn đổi tên trả ô nhập về tên đã lưu; thêm `server/test/lobby-do.mjs` (Lobby với Cloudflare giả: đếm online khi vào/đóng/lỗi, `/list` có tên + lọc, `/quick`), đã vào `npm test`; README có mục mới. UI headless 12 ca đạt.
**Đã sửa lỗi quân lơ lửng trên đá (từng làm `view-test` chập chờn ~16-30%):** nguyên nhân là `Pawns.start` tính độ cao đích `s.ty` ở TÂM ô, trong khi quân đáp lệch tâm (`landJitter`) và mặt đá gồ ghề ±.1; vì `y=max(nội suy, s.gy)` nên chỗ đá thấp hơn tâm ô thì quân lơ lửng tới ~4,7 cm (và đứng yên như vậy luôn, `settle` không chỉnh y). Sửa: `floorY(r,c,x,z)` nhận chỗ đứng thật, `start` tính `s.ty` sau khi bốc độ lệch, cuối ăn mừng cũng dùng vị trí thật. Kết quả: 0/40 lần lỗi, độ lơ lửng đo được 0,0000. Không đổi số lần gọi `rand`, không đụng luật.
**`tools/guide-test.js` đã sửa (270/270):** 5 ca đỏ là do test đòi đúng chữ ("nước", "10 tường", "ít nhất 2 tường") trong khi hướng dẫn viết "lượt", "10 bức tường", "ít nhất 2 bức tường"; số liệu trong hướng dẫn đều khớp lõi. Test giờ kiểm SỐ LIỆU (lấy từ `RS.blockerPlan`, `RS.walls`) và chấp nhận cả hai cách viết; `guide-data.js` KHÔNG đổi. Lưu ý: `first` và `gap` đang cùng [20,30] nên test không phân biệt được hai câu đó; ngưỡng găng (≥2) không có trong `RS` nên còn viết cứng 2 trong test.

**CHƯA kiểm được (cần chủ dự án / phiên sau):**
- Chưa chạy trên Cloudflare thật hay `wrangler dev` (không có mạng ở phiên này): `Lobby.presence()` dùng `WebSocketPair`, `acceptWebSocket`, `setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'))`, `webSocketClose` của Durable Object. Chạy `cd server && wrangler dev`, mở hai tab với `?server=http://localhost:8787` rồi xem số online đổi 1→2→1 khi đóng tab, và danh sách phòng hiện tên chủ phòng.
- Chưa xem đường thành công của preload (three.js thật) bằng mắt: cần mở trang có mạng, xem thanh tiến độ chạy tới 100% rồi vào ván ngay không còn màn tải dài. Nếu `App.prepare` ở màn khởi động làm trang đứng hình lâu trên máy yếu thì cân nhắc chia nhỏ thêm bước.

**Triển khai: deploy SERVER TRƯỚC** (`cd server && wrangler deploy`), rồi mới đẩy client lên GitHub Pages. Server mới vẫn nhận client cũ (không gửi `name` thì tên rỗng). Client mới với server cũ: ô online tự ẩn, danh sách phòng báo lỗi mạng nhưng "Vô bừa" vẫn chạy.

Việc có thể làm tiếp (chưa làm, cần chủ dự án quyết): tài khoản thật thay `Online.getName`; phòng riêng tư có mật khẩu; lọc danh sách theo "phòng có thể vào"; hiện số phòng đang chơi.

## Tiến trình: CHAT TRONG VÁN (phím C) + GỌN THANH NÚT (phiên 2026-11-28)

Yêu cầu: (1) chat trong ván online, bấm C mở ô chat làm theo ô Hướng dẫn, màu theo biome, có chống spam / an toàn mạng / không quá tải server; (2) thanh nút dưới quá nhiều: gom lại, đưa nút phụ thành nút nhỏ ở thanh trên.

**ĐÃ XONG (server):** `server/src/chat.js` (cleanChat, makeChatGuard, makeFlood, hằng số CHAT), nối vào `room-logic.js` (`case'chat'`, `chat()`, chống dồn dập theo kết nối ở đầu `onMessage`). Test `server/test/chat.mjs` (đã vào `npm test`, 9/9 bộ đạt). Giao thức mới: client→server `chat{text}`; server→cả hai `chat{by,name,text,id}`; từ chối `chatRejected{reason:'rate'|'dup'|'muted',wait?}`; đóng 4008 'flood' nếu dồn dập kéo dài. **Không tăng `Core.PROTO`** (không đổi luật; client cũ/ server cũ chỉ bỏ qua tin lạ).
Chống spam: không ghi storage, không lưu lịch sử; xô token theo ghế (burst 4, 1 tin/3s), cách nhau ≥600ms, chặn tin trùng 15s, vi phạm 4 lần → cấm 30s (gấp đôi mỗi lần, tối đa 10 phút), từ chối chỉ phản hồi ≤1 lần/1,5s (trừ lúc bị cấm luôn báo), 120 ký tự, bỏ ký tự điều khiển/ẩn/bidi, rút chuỗi ký tự lặp; mọi tin của một kết nối qua `makeFlood` (burst 40, 12/s, quá 300 lần liên tục thì đóng).

**ĐÃ XONG (client):**
- `js/chat.js` + `css/chat.css` + khối `#ch`/`#chFeed` trong `index.html` (nằm TRONG `#board` nên ăn đúng biến màu biome, giống ô Hướng dẫn; góc dưới phải, không chặn bàn cờ). Phím **C** (hoặc nút 💬) mở/đóng, Enter gửi, Esc đóng (Esc lần sau mới hỏi thoát ván). Chỉ online (`S.net`): ván offline nút ẩn, phím C không làm gì.
- Ô đóng: tin mới nổi vài giây ở góc (`#chFeed`) + số chưa đọc trên nút 💬. Nút 🔔 tắt tiếng đối thủ (chỉ máy mình). Lịch sử ≤80 dòng trong bộ nhớ, `Chat.reset()` khi về menu; giữ qua "Đấu lại".
- Client chống spam thân thiện: ≥0,8s giữa hai tin, `chatRejected` → khóa nút Gửi + đếm ngược, bị cấm thì báo đỏ. Mọi chữ hiện bằng `textContent` (test XSS đạt). Gõ trong ô nhập thì phím KHÔNG lọt ra game (`stopPropagation` ở `#chIn`).
- `App.netIn` chuyển `chat`/`chatRejected` thẳng vào `Chat.recv` TRƯỚC hàng chờ (không bị trễ theo sự kiện người chặn). `Online.join(...).chat(text)`.
- **Gọn thanh nút:** footer chỉ còn Đi / Tường / Xoay / Dừng (máy đấu máy) / Mới-Đầu hàng (10 nút → 4-5). Các nút phụ thành icon nhỏ ở góc trên phải `#tools`: 🎥 Góc (E) · 📊 Đánh giá (T) · 💬 Chat (C) · 📖 Hướng dẫn (I) · ⚙️ Cài đặt (O) · 🏠 Menu (Esc). Giữ nguyên id nút nên JS cũ chạy; mô tả/phím ở tooltip (`data-tn/tk/tip`). `bView` giờ không đổi chữ: tên "Theo Trắng" nằm ở tooltip, nút sáng khi đang bám quân. Hướng dẫn: header cũng nổi trên cửa sổ (`body.gdopen header`) để bấm lại 📖 mà đóng.
- Test: `node server/test/chat.mjs` (chat/chống spam), `python3 tools/chat-ui-test.py` (Chromium headless, không cần three.js; 22 ca: phím C, gõ chữ không lọt phím tắt, XSS, khóa/cấm, feed, mute, offline, thanh nút, Hướng dẫn). `tools/chaos-client-test.mjs`: đồng hồ giả giờ nhích 0,1s/tin (trước đó chơi cả ván trong 0ms nên dính bộ chống dồn dập mới). Toàn bộ test cũ vẫn đạt (core 252867, items 755544, mapgen 96487, view 260, blocker 88, wallwhy 528276, guide 270, dumb, server 9 bộ). Không đụng `core.js` ⇒ không cần `build-worker`, không đổi `PROTO`.

**Triển khai:** deploy SERVER TRƯỚC (`cd server && wrangler deploy`), rồi client. Client mới + server cũ: nút 💬 hiện nhưng tin gửi bị server bỏ qua (không có phản hồi). Server mới + client cũ: không sao.

**CHƯA kiểm / có thể làm tiếp:** chưa thử trên Cloudflare thật (flood guard dùng `WeakMap` theo kết nối, chat không đụng storage); chưa xem trên điện thoại thật (đã chụp thử 390px, ổn); chưa có lọc từ tục (nếu cần: thêm vào `cleanChat` ở server); chưa có nút "báo cáo"; tên ván hiện icon emoji (phụ thuộc font hệ thống). Chỉnh ngưỡng spam ở một chỗ: hằng số `CHAT` trong `server/src/chat.js`.
