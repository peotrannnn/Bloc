# Bloc

Game cờ 3D chạy trên trình duyệt (biến thể Quoridor), giao diện tiếng Việt. Đấu với máy, máy đấu máy; chế độ online đang được lên kế hoạch.

## Chạy thử

- Mở thẳng `index.html` trong trình duyệt (cần mạng để tải three.js), hoặc chạy một server tĩnh: `python3 -m http.server 8000` rồi vào <http://localhost:8000>.
- Phím tắt: `Q` đi quân · `W` đặt tường · `R` xoay tường · `E` đổi góc nhìn · `T` bật/tắt đánh giá · `C` chat (online) · `P` ván mới · `Space` tạm dừng (máy đấu máy) · `Esc` về menu · mũi tên để đi quân / dời tường.

## Cấu trúc

| Thư mục / file | Vai trò |
|---|---|
| `js/core.js` | **Lõi luật** thuần logic (ruleset + trạng thái), dùng chung cho client, AI và sau này là server |
| `js/blocker-plan.js`, `js/blocker-pick.js` | Lịch + cách chọn ô của người chặn đường (thuần logic, server dùng chung; chỉ Hỗn Loạn) |
| `js/rules.js` | Lớp mỏng nối lõi luật với trạng thái `S` của client (giữ tên hàm cũ cho AI/giao diện) |
| `js/ai/` | Các AI (mỗi file một AI, đăng ký qua `registry.js`), worker chạy AI nặng |
| `js/view/` | Phần 3D: bàn cờ, quân, tường, camera, pháo bông; `terrain.js` dựng đá thấp/cao (`Terrain.heightAt`), `pawns.js` leo/nhảy theo độ cao |
| `js/tooltip.js` | Khung mô tả khi rê chuột (thay `title` mặc định): đặt `data-tip` / `data-tn` / `data-tk` lên phần tử |
| `js/sfx.js` | **Âm thanh** (WebAudio, tổng hợp, không cần file): hover/click, bước chân theo mặt đất, trượt băng, bẫy lò xo, cổng, rương, tường, người chặn đường, pháo bông, môi trường theo biome |
| `js/app.js`, `ui.js`, `menu.js`, `input.js` | Điều phối ván, giao diện, menu, chuột/phím |
| `js/chat.js`, `css/chat.css`, `server/src/chat.js` | Chat trong ván online (phím `C`) + chống spam phía server |
| `server/` | Server online (Cloudflare Worker + Durable Object), xem `server/README.md` |
| `tools/` | Công cụ chạy bằng Node (xem dưới) |

## Công cụ (Node, không cần cài gói)

```
node tools/core-test.js                       # kiểm thử lõi luật
node tools/items-test.js                      # kiểm thử rương và vật phẩm của lõi luật (kèm hàng trăm ván ngẫu nhiên kiểm các bất biến)
node tools/view-test.js                       # kiểm thử logic hoạt ảnh Hỗn Loạn phía client (không cần trình duyệt)
node tools/blocker-balance-test.js            # cân bằng người chặn đường: chỉ nhắm bên dẫn xa, lợi thế càng lớn càng sát + đứng lâu, rời sớm khi hết dẫn
node tools/blocker-test.js                    # kiểm thử sự kiện người chặn đường: chọn ô, đường chạy, tạm dừng hai bên, camera, mọi AI né người chặn
node tools/chaos-client-test.mjs              # client thật ↔ server thật: so sánh trạng thái sau MỖI tin (kể cả túi đồ, chủ tường, rương, quân leo đá)
node tools/stone-surface-test.js              # mặt đá thật (độ cao quân/ô gợi ý đứng trên đá) khớp hình học khối đá
node tools/lowstone-test.js                   # đá thấp/đá cao: tham chiếu độc lập (BFS riêng), bảng tường, nhảy qua đối thủ, chống kẹt, property test (~3,2 triệu kiểm tra, gồm luật cổng)
node tools/golden-test.js                     # Classic và Hỗn Loạn không đá thấp phải trùng bản cũ (--write CHỈ khi chủ dự án đồng ý đổi luật)
node tools/mapgen-test.js                     # kiểm thử sinh map (kể cả đá thấp) và đối chiếu BFS mapgen ↔ Core
node server/test/items-room.mjs               # kiểm thử vật phẩm ở phía server (không cần Cloudflare)
node server/test/blocker-room.mjs             # kiểm thử người chặn đường ở phía server (lịch, chọn ô, gửi cho cả hai, nối lại, đấu lại) và chứng minh Classic không có người chặn
node tools/tournament.js attacker defender 200   # đấu thử hai AI;  --all để đấu vòng tròn
node server/test/room-logic.mjs               # kiểm thử server (không cần Cloudflare)
node tools/profile.js                         # đo "dấu vân tay" lối chơi của từng AI
node tools/build-worker.js                    # PHẢI chạy lại sau khi sửa config/util/state/core/rules/ai/tools/biet
```

## Hỗn Loạn: rương và vật phẩm

Luật nằm trong `js/core.js` (phần chú thích đầu file là bản đầy đủ). Tóm tắt:

- Quân kết thúc nước **đi** trên ô rương (bước vào, nhảy qua đối thủ đáp xuống, hoặc trượt băng dừng đúng ô) thì rương mở rồi biến mất; dịch chuyển cổng / bẫy hất không mở rương. Quà bốc ngẫu nhiên ở server: cục gạch 30% · giày 20% · búa 20% · găng 15% · cuốc chim 15%.
- **Cục gạch** +1 tường ngay (không chiếm túi). Các món còn lại vào túi (tối đa 2; đầy thì bỏ món cũ nhất). Túi đồ công khai cho cả hai bên. Bấm món trong thanh thông tin, hoặc phím `1` / `2`.
- **Giày**: miễn phí, không tốn lượt; sau hành động kế tiếp bạn có thêm một lượt **chỉ được đi quân**.
- **Găng**: cướp 1 tường của đối thủ (khi họ còn ≥ 2). **Búa**: tháo một tường của đối thủ và trả lại cho họ. **Cuốc chim**: phá hẳn một tường của đối thủ, khe đó bị chiếm vĩnh viễn. **Búa miễn phí, không tốn lượt** (như giày): tháo tường, trả lại cho đối thủ, rồi bạn vẫn được đi quân hoặc đặt tường ngay trong lượt đó (không dùng được trong lượt thêm của giày). Găng và cuốc chim tốn một lượt; búa / cuốc chim chọn tường bằng chuột (hoặc mũi tên + `Enter`, `Esc` để hủy).
- Hoạt ảnh: quân khựng lại ở ô kề, rương mở nắp, quà nổi lên rồi rương biến mất, quân mới bước vào ô (`Pawns` đoạn `chest`, `Terrain.openChest`, `Marks.pop`).

## Hỗn Loạn: đá thấp và đá cao (biome núi)

Chi tiết và lý do thiết kế: `docs/PLAN-da-thap-da-cao.md`; bảng luật đầy đủ ở đầu `js/core.js` (mục "Độ cao").

- **Độ cao:** ô thường = bậc 0 · **đá thấp** (mã 9, cao 0,35) = bậc 1 · **đá cao** (mã 1, cao 0,7) = bậc 2. Đá thấp chỉ sinh ở biome núi, 1-3 ô ở "chân" mỗi cụm đá cao (tối đa 6 ô cả bàn) và chỉ ở 5 hàng giữa.
- **Đi bước:** giữa hai ô kề cạnh chênh tối đa 1 bậc. Thường ↔ thấp ↔ cao đi được, **thường ↔ cao thì không** (muốn lên đá cao phải leo qua đá thấp). Leo lên/xuống không tốn thêm nhịp: vẫn một nước đi = một lượt.
- **Tường xét từng cạnh:** cạnh giữa hai ô **đều là đá** (cao–cao, thấp–thấp, thấp–cao) thì tường **không chặn** (tường vẫn đặt được và vẫn tính vào số tường; tường chìm trong đá cao, nhô 0,15 trên đá thấp nên quân "nhảy qua tường" giữa hai đá thấp). Cạnh có ít nhất một ô thường: tường chặn như bình thường. Một tường phủ 2 cạnh thì mỗi cạnh tự xét.
- **Nhảy qua đối thủ (A qua B tới C):** hợp lệ khi A→B và B→C đi được **và** |bậc A − bậc C| ≤ 1; nếu không thì được né sang bên (cũng phải thỏa chênh ≤ 1).
- **Hiệu ứng khác:** ô đá không có rương/bẫy/cổng/nước/cát/cỏ/băng. Băng chỉ trượt trên ô thường (không trượt lên đá). Bẫy hất, cổng, người chặn đường chỉ ở ô thường. **Bẫy chỉ hất quân về ô xuất phát còn đường về đích** (sửa lỗi cũ: trước đây có thể hất vào túi kín). **Cổng dịch chuyển:** chỉ dịch chuyển khi cổng đích còn đường về đích của quân đó (bị tường bịt kín thì quân đứng nguyên và phải đi bộ vòng qua bờ kia); tường **không được** làm cả hai cổng cùng mất đường về đích của cả hai bên (một cổng bị bịt thì được).
- **Chống kẹt:** `canWall` từ chối tường làm MỘT BÊN (kể cả quân đang đứng trên núi) mất đường về đích, nên không ai bị nhốt trên núi. Giao diện báo "Không được nhốt người chơi trên núi" / "Đá quá cao, hãy leo từ đá thấp". Trường hợp **chấp nhận được**: đối thủ đứng đúng ô đá thấp là lối xuống duy nhất của quân trên đá cao thì quân đó tạm thời chỉ đặt được tường (không kẹt vĩnh viễn: đối thủ phải đi/đặt tường, hết thì phải rời ô; `maxPly` = 300).
- **Hoạt ảnh:** đi bộ · leo lên (nhấc chân, nén rồi duỗi, tiếng cọ đá) · leo xuống (nhún nhẹ) · nhảy qua tường (đá thấp–đá thấp có tường, cung thấp, không lộn) · nhảy qua đối thủ (cung đủ cao để không xuyên quân đứng trên đá). Kiểu bước được phân loại bằng `R.stepInfo` **lúc xếp vào hàng chờ** (`Pawns.script/update`), không đổi giao thức mạng.
- **Triển khai:** client và server import cùng `core.js`/`mapgen.js` nên phải **deploy cùng lúc**; để chặn lệch phiên bản có **số phiên bản giao thức** `Core.PROTO` (hiện là 3): client gửi `v` trong `hello`, server đối chiếu và gửi lại `v` trong `welcome`; lệch thì báo "Game vừa được cập nhật, hãy tải lại trang" (server đóng 4005). **Tăng `PROTO` mỗi khi `core.js`/`mapgen.js` đổi luật hay map.** Client cũ (trước PROTO) không gửi `v` nên bị từ chối ngay.
- **Xem hình:** `tools/view-terrain.html` (3D, chọn biome núi; nút "Gợi ý" thử ô gợi ý trên mặt đá) và `tools/view-mountain.html` / `tools/mapgen-view.html` (sơ đồ 2D, đá thấp màu xám sáng) bằng `python3 -m http.server` trong thư mục dự án.

## Chế độ Classic = Quoridor truyền thống

Classic chỉ có đi quân và đặt tường như luật gốc: **không** ô cỏ / đá / băng / bẫy / cổng / nước / cát, **không** rương, **không** vật phẩm, **không** người chặn đường. Mọi thứ đặc biệt chỉ có ở **Hỗn Loạn** (online). Ván offline (đấu máy, máy đấu máy) luôn là Classic. Ở lõi luật, ruleset `classic` không có địa hình, túi đồ hay `blockerPlan`; client (`App.blockerEvent/blockerLeave`, phím `B`) và server (`RoomLogic.blockerStep`) đều chỉ chạy khi chế độ là Hỗn Loạn. Có test riêng: `tools/blocker-test.js` (mục "Classic không có người chặn") và `server/test/blocker-room.mjs` (mục 5).

## Người chặn đường (sự kiện đặc biệt, CHỈ Hỗn Loạn)

Nhân vật vàng "Crash Test Dummy" (`js/view/blocker.js`, cấu hình `CFG.BLOCKER`) làm vật cản (`S.blocker`, lõi luật coi như đá). Trong lúc nó diễn, **cả hai bên tạm dừng** (`S.event`: không ai đi được, máy không nghĩ, tin server xếp hàng) và **camera khóa** vào nó (`Camera.lock/unlock`).

- **Vào**: bay từ một điểm ngẫu nhiên trên trời (cách ô đích 6-9, cao 5-7.5), lượn qua điểm treo ngay trên ô rồi hạ thẳng đứng xuống đáp; **lửa phản lực** phun ở hai chân (hai nón cộng sáng + tia lửa `THREE.Points`), đáp xong lửa tắt và bắn tia lửa.
- **Ô được chọn = choke point** (`Blocker.pick`): ô thường chặn vào mà hai bên VẪN còn đường, điểm = số bước hai bên phải đi thêm (+ chút thưởng nếu ô nằm trong hành lang bị tường bịt); bốc ngẫu nhiên trong các ô điểm cao nhất. Ván thoáng không có choke point thì rơi về ô 2-4 bước trước bên đang dẫn.
- **Rời đi**: BFS (tránh tường + hai quân) tới một ô mép bàn rồi chạy ra, tới mép thì **nhảy xuống khỏi bàn** (lộn người, rơi mất). **Không có đường** (bị tường/quân vây kín) thì nén người, bật lửa và **bay vút lên**.
- **Lịch** (`js/blocker-plan.js`, `CFG.BLOCKER.plan`, đơn vị = nước đi; mỗi khoảng là số nguyên ngẫu nhiên trong [min,max]): đầu ván đợi **20-30** nước → xuất hiện → ở lại **5-7** nước → rời đi → trống **20-30** nước → quay lại, lặp mãi. `BlockerPlan` là logic thuần (có `module.exports`) để server dùng lại y nguyên.
- Chỉ chạy khi `S.chaos`. Ván offline là Classic nên **không bao giờ** có người chặn; `CFG.BLOCKER.auto` và phím `B` chỉ có tác dụng khi `S.chaos` (dùng để thử trong test).
- Trong code: `App.blockerEvent(idx?)`, `App.blockerLeave()`.
- **Online: server đã nối.** Server là trọng tài nên tự chạy lịch (`BlockerPlan`, tham số ở ruleset chaos: `blockerPlan` trong `js/core.js`), chọn ô bằng `js/blocker-pick.js` (thuần logic, cùng thuật toán `Blocker.pick`) rồi gửi `fx:{t:'blocker',cell:[r,c]}` (vào) / `{t:'blocker',leave:true}` (rời) trong tin `applied` **cho cả hai bên** (kể cả khi quân bị cỏ che) và đặt `st.blocker` (có trong snapshot, nên nối lại giữa chừng vẫn đúng). Lịch lưu trong bản ghi phòng (`g.bplan`), đặt lại mỗi ván / đấu lại. Mỗi lần vào/rời, đồng hồ lượt được cộng bù 10 giây vì hai bên đứng chờ hoạt ảnh. Client nhận qua `netApplyChaos` / `resync`.

## Màn khởi động, tên người chơi, số online, ghép nhanh

- **Màn khởi động** (`Menu.boot`): mở trang là vào màn nhập tên. Trong lúc người chơi gõ, game tải sẵn three.js, dựng cảnh 3D (`App.prepare`) và chuẩn bị âm thanh (`Sfx.prepare`, `BgAudio.prepare`). Cử chỉ gõ phím / bấm chuột ở đây là lần tương tác đầu nên trình duyệt cho phát tiếng từ menu trở đi, không phải bấm thêm. Mất mạng thì vẫn vào được menu, ván sẽ thử tải lại.
- **Tên**: không đăng nhập. Lưu ở `localStorage` (`Online.getName/setName`; nếu trình duyệt chặn thì giữ trong bộ nhớ trang), gửi trong `hello{name}`, **server làm sạch** (≤16 ký tự). Trong ván online thanh trạng thái hiện "Lượt của <tên đối thủ>". Nút "đổi tên" ở menu chính. Sau này có tài khoản thật chỉ cần thay chỗ lấy tên.
- **Số người online**: ô ở góc thanh tiêu đề của cửa sổ Chơi online và Ghép nhanh. Mỗi tab giữ một WebSocket `/presence` tới Durable Object `Lobby`; tab bị ẩn thì ngắt, quay lại thì nối tiếp; server cũ chưa có `/presence` thì ô tự ẩn.
- **Ghép nhanh**: mở cửa sổ danh sách phòng công khai đang chờ (tên chủ phòng, chế độ, bản đồ, đã chờ bao lâu), lọc theo chế độ / bản đồ, tự làm mới 3 giây. Bấm một phòng để vào; nút "Vô bừa" vẫn để server ghép tự động.
- Test: `node server/test/names.mjs`, `node server/test/lobby-do.mjs` (Lobby với Cloudflare giả).

## Âm thanh

`js/sfx.js` (nạp ngay sau `util.js`). Phím `M` hoặc nút **Âm** ở thanh dưới để tắt/bật; thanh **Âm lượng** / **Môi trường** nằm ở màn hình chính của menu (lưu `localStorage` khóa `bloc.snd`). Trình duyệt chỉ cho phát sau lần chạm/bấm đầu tiên nên engine tự mở khóa ở đó.

- Phát theo **sự kiện hoạt ảnh phía client** (`Pawns`, `Walls`, `Terrain`, `Blocker`, `Input`), không theo tin mạng, nên offline/online dùng chung một đường.
- Gọi: `Sfx.play('tên',{v,x,z,r,mat})` (tên bắt đầu `ui:` vào bus giao diện; `x,z` là toạ độ thế giới để pan theo camera), `Sfx.step(mã_ô,x,z)`, `Sfx.jet(v)` / `Sfx.slide(v)` (vòng lặp liên tục, tự tắt nếu ngừng gọi), `Sfx.setBiome(b)`.
- **Không lộ thông tin**: quân đối thủ nấp trong cỏ KHÔNG phát tiếng (`Pawns.aud(s)` kiểm `s.shown`; mọi chỗ phát tiếng của quân đều phải qua đó).
- Thêm/chỉnh một tiếng: sửa bảng `LIB` trong `sfx.js` (mỗi tiếng là một hàm dựng từ `osc`/`nz`/`chime`). Muốn dùng sample thật cho một tiếng nào đó, thay thân hàm của nó bằng phát `AudioBuffer`.
- Các test `tools/view-test.js`, `tools/blocker-test.js` dùng stub `Sfx` im lặng.

## Triển khai GitHub Pages

Repo phải công khai (gói Free). Settings → Pages → Build and deployment → *Deploy from a branch* → nhánh `main`, thư mục `/ (root)`. Trang sẽ ở `https://<tên-tài-khoản>.github.io/<tên-repo>/`.
**Không commit bí mật** (token, khóa API) vì repo công khai.

## Lộ trình online (tóm tắt)

Server là trọng tài (Cloudflare Workers + Durable Objects, mỗi phòng một Durable Object), client chỉ gửi hành động; luật dùng chung `js/core.js`. Giai đoạn 1 (tách lõi game) và Giai đoạn 2 (server một phòng, trong `server/`) đã có code; Giai đoạn 2 còn chờ deploy và thử với server thật.
