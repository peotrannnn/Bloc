# Bloc

Game cờ 3D chạy trên trình duyệt (biến thể Quoridor), giao diện tiếng Việt. Đấu với máy, máy đấu máy; chế độ online đang được lên kế hoạch.

## Chạy thử

- Mở thẳng `index.html` trong trình duyệt (cần mạng để tải three.js), hoặc chạy một server tĩnh: `python3 -m http.server 8000` rồi vào <http://localhost:8000>.
- Phím tắt: `Q` đi quân · `W` đặt tường · `R` xoay tường · `E` đổi góc nhìn · `T` bật/tắt đánh giá · `P` ván mới · `Space` tạm dừng (máy đấu máy) · `Esc` về menu · mũi tên để đi quân / dời tường.

## Cấu trúc

| Thư mục / file | Vai trò |
|---|---|
| `js/core.js` | **Lõi luật** thuần logic (ruleset + trạng thái), dùng chung cho client, AI và sau này là server |
| `js/rules.js` | Lớp mỏng nối lõi luật với trạng thái `S` của client (giữ tên hàm cũ cho AI/giao diện) |
| `js/ai/` | Các AI (mỗi file một AI, đăng ký qua `registry.js`), worker chạy AI nặng |
| `js/view/` | Phần 3D: bàn cờ, quân, tường, camera, pháo bông |
| `js/app.js`, `ui.js`, `menu.js`, `input.js` | Điều phối ván, giao diện, menu, chuột/phím |
| `server/` | Server online (Cloudflare Worker + Durable Object), xem `server/README.md` |
| `tools/` | Công cụ chạy bằng Node (xem dưới) |

## Công cụ (Node, không cần cài gói)

```
node tools/core-test.js                       # kiểm thử lõi luật
node tools/tournament.js attacker defender 200   # đấu thử hai AI;  --all để đấu vòng tròn
node server/test/room-logic.test.mjs          # kiểm thử server (không cần Cloudflare)
node tools/profile.js                         # đo "dấu vân tay" lối chơi của từng AI
node tools/build-worker.js                    # PHẢI chạy lại sau khi sửa config/util/state/core/rules/ai/tools/biet
```

## Triển khai GitHub Pages

Repo phải công khai (gói Free). Settings → Pages → Build and deployment → *Deploy from a branch* → nhánh `main`, thư mục `/ (root)`. Trang sẽ ở `https://<tên-tài-khoản>.github.io/<tên-repo>/`.
**Không commit bí mật** (token, khóa API) vì repo công khai.

## Lộ trình online (tóm tắt)

Server là trọng tài (Cloudflare Workers + Durable Objects, mỗi phòng một Durable Object), client chỉ gửi hành động; luật dùng chung `js/core.js`. Giai đoạn 1 (tách lõi game) và Giai đoạn 2 (server một phòng, trong `server/`) đã có code; Giai đoạn 2 còn chờ deploy và thử với server thật.
