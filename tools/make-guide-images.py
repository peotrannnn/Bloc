#!/usr/bin/env python3
"""Chụp ảnh Hướng dẫn: mở tools/guide-capture.html bằng Chromium (Playwright), lưu mỗi ảnh vào img/guide/.
   python3 tools/make-guide-images.py
Cần three.js r128: đặt file tools/three.min.js (nếu có sẽ dùng bản này, không cần mạng) hoặc để trình duyệt tải từ CDN.
Cần: pip install playwright && playwright install chromium. Trang phải chạy qua http (file:// chặn một số thứ), script tự bật server tạm."""
import base64, os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
out = os.path.join(root, 'img', 'guide')
os.makedirs(out, exist_ok=True)
local3 = os.path.join(root, 'tools', 'three.min.js')

H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
H.log_message = lambda *a, **k: None
srv = socketserver.TCPServer(('127.0.0.1', 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
port = srv.server_address[1]

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1200, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    if os.path.exists(local3):
        pg.route('**/three.min.js', lambda r: r.fulfill(path=local3, content_type='application/javascript'))
    pg.goto(f'http://127.0.0.1:{port}/tools/guide-capture.html')
    pg.wait_for_function("document.body.dataset.done", timeout=120000)
    if pg.evaluate("document.body.dataset.done") != '1':
        print('Không tải được three.js: đặt tools/three.min.js hoặc bật mạng'); sys.exit(1)
    shots = pg.evaluate("window.__shots")
    for name, url in shots.items():
        with open(os.path.join(out, name), 'wb') as f:
            f.write(base64.b64decode(url.split(',')[1]))
        print('ok', name)
    b.close()
    if errs:
        print('LỖI:', errs); sys.exit(1)
