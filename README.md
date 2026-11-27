# Bloc

Game cờ 3D chạy trên trình duyệt (biến thể Quoridor), giao diện tiếng Việt. Đấu với máy, máy đấu máy; chế độ online đang được lên kế hoạch.

## Chạy thử

- Mở thẳng `index.html` trong trình duyệt (cần mạng để tải three.js), hoặc chạy một server tĩnh: `python3 -m http.server 8000` rồi vào <http://localhost:8000>.
- Phím tắt: `Q` đi quân · `W` đặt tường · `R` xoay tường · `E` đổi góc nhìn · `T` bật/tắt đánh giá · `P` ván mới · `Space` tạm dừng (máy đấu máy) · `Esc` về menu · mũi tên để đi quân / dời tường.

## Cấu trúc

| Thư mục / file | Vai trò |
|---|---|
| `js/core.js` | **Lõi luật** thuần logic (ruleset + trạng thái), dùng chung cho client, AI và sau này là server |
| `js/blocker-plan.js`, `js/blocker-pick.js` | Lịch + cách chọn ô của người chặn đường (thuần logic, server dùng chung; chỉ Hỗn Loạn) |
| `js/rules.js` | Lớp mỏng nối lõi luật với trạng thái `S` của client (giữ tên hàm cũ cho AI/giao diện) |
| `js/ai/` | Các AI (mỗi file một AI, đăng ký qua `registry.js`), worker chạy AI nặng |
| `js/view/` | Phần 3D: bàn cờ, quân, tường, camera, pháo bông |
| `js/app.js`, `ui.js`, `menu.js`, `input.js` | Điều phối ván, giao diện, menu, chuột/phím |
| `server/` | Server online (Cloudflare Worker + Durable Object), xem `server/README.md` |
| `tools/` | Công cụ chạy bằng Node (xem dưới) |

## Công cụ (Node, không cần cài gói)

```
node tools/core-test.js                       # kiểm thử lõi luật
node tools/items-test.js                      # kiểm thử rương và vật phẩm của lõi luật (kèm hàng trăm ván ngẫu nhiên kiểm các bất biến)
node tools/view-test.js                       # kiểm thử logic hoạt ảnh Hỗn Loạn phía client (không cần trình duyệt)
node tools/blocker-test.js                    # kiểm thử sự kiện người chặn đường: chọn ô, đường chạy, tạm dừng hai bên, camera, mọi AI né người chặn
node tools/chaos-client-test.mjs              # client thật ↔ server thật: so sánh trạng thái sau MỖI tin (kể cả túi đồ, chủ tường, rương)
node server/test/items-room.mjs               # kiểm thử vật phẩm ở phía server (không cần Cloudflare)
node server/test/blocker-room.mjs             # kiểm thử người chặn đường ở phía server (lịch, chọn ô, gửi cho cả hai, nối lại, đấu lại) và chứng minh Classic không có người chặn
node tools/tournament.js attacker defender 200   # đấu thử hai AI;  --all để đấu vòng tròn
node server/test/room-logic.test.mjs          # kiểm thử server (không cần Cloudflare)
node tools/profile.js                         # đo "dấu vân tay" lối chơi của từng AI
node tools/build-worker.js                    # PHẢI chạy lại sau khi sửa config/util/state/core/rules/ai/tools/biet
```

## Hỗn Loạn: rương và vật phẩm

Luật nằm trong `js/core.js` (phần chú thích đầu file là bản đầy đủ). Tóm tắt:

- Quân kết thúc nước **đi** trên ô rương (bước vào, nhảy qua đối thủ đáp xuống, hoặc trượt băng dừng đúng ô) thì rương mở rồi biến mất; dịch chuyển cổng / bẫy hất không mở rương. Quà bốc ngẫu nhiên ở server: cục gạch 30% · giày 20% · búa 20% · găng 15% · cuốc chim 15%.
- **Cục gạch** +1 tường ngay (không chiếm túi). Các món còn lại vào túi (tối đa 2; đầy thì bỏ món cũ nhất). Túi đồ công khai cho cả hai bên. Bấm món trong thanh thông tin, hoặc phím `1` / `2`.
- **Giày**: miễn phí, không tốn lượt; sau hành động kế tiếp bạn có thêm một lượt **chỉ được đi quân**.
- **Găng**: cướp 1 tường của đối thủ (khi họ còn ≥ 2). **Búa**: tháo một tường của đối thủ và trả lại cho họ. **Cuốc chim**: phá hẳn một tường của đối thủ, khe đó bị chiếm vĩnh viễn. Cả ba tốn một lượt; búa / cuốc chim chọn tường bằng chuột (hoặc mũi tên + `Enter`, `Esc` để hủy).
- Hoạt ảnh: quân khựng lại ở ô kề, rương mở nắp, quà nổi lên rồi rương biến mất, quân mới bước vào ô (`Pawns` đoạn `chest`, `Terrain.openChest`, `Marks.pop`).

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

## Triển khai GitHub Pages

Repo phải công khai (gói Free). Settings → Pages → Build and deployment → *Deploy from a branch* → nhánh `main`, thư mục `/ (root)`. Trang sẽ ở `https://<tên-tài-khoản>.github.io/<tên-repo>/`.
**Không commit bí mật** (token, khóa API) vì repo công khai.

## Lộ trình online (tóm tắt)

Server là trọng tài (Cloudflare Workers + Durable Objects, mỗi phòng một Durable Object), client chỉ gửi hành động; luật dùng chung `js/core.js`. Giai đoạn 1 (tách lõi game) và Giai đoạn 2 (server một phòng, trong `server/`) đã có code; Giai đoạn 2 còn chờ deploy và thử với server thật.
