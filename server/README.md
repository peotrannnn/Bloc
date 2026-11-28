# Bloc — server online (Giai đoạn 2: một phòng)

Cloudflare Worker + Durable Object. Mỗi phòng là một Durable Object (tên phòng = mã phòng), nói chuyện với người chơi qua WebSocket.
**Server là trọng tài**: client chỉ gửi hành động, server kiểm bằng đúng `../js/core.js` (cùng một bản luật với trình duyệt) rồi phát lại cho cả hai bên.

## Cấu trúc

| File | Vai trò |
|---|---|
| `src/index.js` | Cửa vào: kiểm tra Origin và mã phòng, chuyển tới Durable Object của phòng |
| `src/room.js` | Lớp mỏng nối Cloudflare (WebSocket Hibernation, storage, alarm) với RoomLogic |
| `src/room-logic.js` | **Toàn bộ quy tắc của phòng** (không phụ thuộc Cloudflare, chạy thử được bằng Node) |
| `test/room-logic.test.mjs` | Test tự động bằng người chơi giả trong bộ nhớ |
| `test/play-online.mjs` | Chơi một ván thật qua WebSocket với server đang chạy |
| `wrangler.toml` | Cấu hình Cloudflare (Durable Object bản SQLite, danh sách Origin được phép) |

## Chạy thử

```
node test/room-logic.test.mjs        # không cần Cloudflare
wrangler login                       # một lần, mở trình duyệt đăng nhập Cloudflare
wrangler dev                         # server chạy ở ws://localhost:8787
node test/play-online.mjs            # (terminal khác, cần Node 22+) đánh một ván thật
wrangler deploy                      # đưa lên Cloudflare: https://bloc-online.<tên-tài-khoản>.workers.dev
node test/play-online.mjs wss://bloc-online.<tên-tài-khoản>.workers.dev   # thử bản đã deploy
```

Kết nối: `wss://.../ws?room=MÃ` (mã 4-8 ký tự chữ/số). Ai mở một mã chưa dùng thì tạo phòng đó; phòng chỉ nhận đúng 2 người.
Danh tính là một token ngẫu nhiên (16-64 ký tự) client tự sinh và lưu trong localStorage; cùng token nối lại sẽ về đúng ghế.

## Giao thức (JSON)

Client → server
- `hello{token,v}` vào phòng / nối lại (`v` = `Core.PROTO`; lệch thì `error{reason:'version',v}` rồi đóng 4005; `welcome` cũng kèm `v`)
- `action{seq, move:[r,c]}` hoặc `action{seq, wall:{o,r,c}}` (`seq` = số nước đã đi = `ply` hiện tại)
- `resign` · `sync` (xin thế cờ hiện tại) · `ping`

Server → client
- `welcome{slot,started,players}` · `started{ruleset,you,snapshot}` (you: 0 = Trắng đi trước, 1 = Đen)
- `state{you,snapshot,over,winner}` (khi nối lại giữa ván hoặc sau `sync`)
- `applied{seq,by,action,ply,turn,over,winner,draw}` — client áp dụng `action` bằng `Core.apply` là đồng bộ
- `rejected{seq,reason,ply}` — reason: `turn` · `seq` · `badmove` · `badwall` · `nowalls` · `format` · `over` · `notstarted` · `notseated`
- `over{winner,reason}` (reason: `goal` · `draw` · `resign`) · `opponentStatus{online}` · `full` · `replaced` · `error{reason}` · `pong`

## Việc đã làm sẵn / chưa làm

Đã có: kiểm luật phía server, hai ghế theo token, nối lại đúng ghế, thay kết nối cũ, phòng sống sót khi Durable Object "ngủ", đầu hàng, kiểm tra Origin, dọn phòng bằng alarm (trống 1 giờ · đang chơi 6 giờ · đã xong 30 phút).

Người chặn đường (CHỈ chế độ Hỗn Loạn): server tự chạy lịch và gửi `fx:{t:'blocker',cell:[r,c]}` / `{t:'blocker',leave:true}` trong `applied`, kèm `blocker` trong snapshot; xem `blockerStep` trong `src/room-logic.js` và `test/blocker-room.mjs`. **Classic là Quoridor truyền thống: không địa hình, không vật phẩm, không người chặn.**

Chưa có (các giai đoạn sau): server cấp mã phòng và phòng công khai/riêng tư (GĐ3), lobby và vào tự động (GĐ4), khoảng chờ nối lại rồi xử thua, đồng hồ lượt, đấu lại (GĐ5), giao diện online trong game.

## Lưu ý chi phí (gói Free) — cần đo thật

Mỗi nước đi ghi một lần vào storage của phòng (khoảng vài chục lần ghi mỗi ván). Gói Free giới hạn số dòng SQLite ghi mỗi ngày, nên số ván/ngày thực tế phụ thuộc vào đây, không chỉ vào số request. Nếu cần, giảm bằng cách gộp ghi (ghi mỗi vài nước, hoặc chỉ ghi khi sắp "ngủ").

## Tên người chơi, số người online, danh sách phòng chờ

- `hello{token,v,name?}`: `name` là tên hiển thị (≤16 ký tự), server làm sạch bằng `src/names.js`. Đối thủ nhận tên qua trường `opp` của `welcome` / `started` / `state`. Không đổi luật nên không tăng `Core.PROTO`.
- `GET /presence` (WebSocket): mỗi tab giữ một kết nối tới Durable Object `Lobby`; server đẩy `{t:'online',n}` khi số kết nối đổi. Client gửi chuỗi `ping` định kỳ, server tự trả `pong` (auto-response, không đánh thức DO).
- `POST /rooms {mode?,biome?}` → `{rooms:[{code,mode,biome,name,age}]}`: phòng công khai đang chờ (cửa sổ "Ghép nhanh"), lọc theo chế độ/bản đồ, tối đa 30, giới hạn riêng theo IP.
- Test: `node test/names.mjs`.
