import sys,threading,http.server,socketserver,functools,json
from playwright.sync_api import sync_playwright
ROOT='/home/claude/work'
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT)
class Q(H.func):
    def log_message(self,*a):pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=ROOT));port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
bad=0
def ck(ok,m):
    global bad
    print('  ✓' if ok else '  ✗',m)
    if not ok: bad+=1
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':700})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1') else r.abort())
    pg.goto(f'http://127.0.0.1:{port}/index.html');pg.wait_for_timeout(800)
    # giả lập đang trong ván online (không cần three.js)
    pg.evaluate("""()=>{
      window.sent=[];
      $('menu').hidden=true;
      S.net={conn:{chat:t=>sent.push(t),sync(){},resign(){}},oppName:'Bình',wait:false,offline:false,oppOnline:true,lost:null,reason:null,deadline:0,rematch:{me:false,opp:false}};
      S.me=0;S.chaos=false;S.left=[10,10];S.turn=0;S.ply=0;S.mode='move';S.over=false;S.analysisLock=true;S.analysis=false;
      UI.theme('forest');Chat.sync();
    }""")
    ck(pg.evaluate("!$('bChat').hidden"),'online: nút chat hiện')
    pg.keyboard.press('c');pg.wait_for_timeout(200)
    ck(pg.evaluate("Chat.isOpen&&!$('ch').hidden"),'phím C mở ô chat')
    ck(pg.evaluate("document.activeElement.id==='chIn'"),'ô nhập được focus')
    pg.keyboard.type('qwert ioc p')   # các phím tắt game phải KHÔNG kích hoạt
    ck(pg.evaluate("$('chIn').value==='qwert ioc p'&&S.mode==='move'&&!Guide.isOpen&&Chat.isOpen"),'gõ chữ trùng phím tắt (q w r t i o c p) không lọt ra game')
    pg.fill('#chIn','chào bạn');pg.keyboard.press('Enter');pg.wait_for_timeout(100)
    ck(pg.evaluate("sent.length===1&&sent[0]==='chào bạn'&&$('chIn').value===''"),'Enter gửi đúng nội dung và xóa ô nhập')
    pg.fill('#chIn','nhanh quá');pg.keyboard.press('Enter');pg.wait_for_timeout(50)
    ck(pg.evaluate("sent.length===1"),'gửi lần 2 sát nhau bị chặn ở client (≥0,8s)')
    pg.evaluate("App.netIn('chat',{by:0,name:'Tôi',text:'chào bạn',id:1})")
    pg.evaluate("App.netIn('chat',{by:1,name:'Bình',text:'<img src=x onerror=window.__xss=1> <b>đậm</b>',id:2})")
    pg.wait_for_timeout(100)
    ck(pg.evaluate("!window.__xss&&$('chLog').querySelectorAll('img,b').length===0&&$('chLog').textContent.includes('<img src=x')"),'chống XSS: tin chứa HTML hiển thị thành chữ thuần')
    ck(pg.evaluate("$('chLog').querySelectorAll('.chm').length===2&&$('chLog').querySelector('.chm.mine')&&$('chLog').querySelector('.chm.opp')"),'tin của mình / đối thủ phân biệt')
    pg.screenshot(path='/home/claude/tests/chat-open-forest.png')
    pg.evaluate("App.netIn('chatRejected',{reason:'rate',wait:3000})");pg.wait_for_timeout(100)
    ck(pg.evaluate("$('chGo').disabled&&!$('chNote').hidden&&$('chNote').textContent.includes('chậm')"),'server báo rate → khóa nút Gửi + đếm ngược')
    pg.evaluate("App.netIn('chatRejected',{reason:'muted',wait:30000})");pg.wait_for_timeout(100)
    ck(pg.evaluate("$('chNote').classList.contains('bad')&&$('chNote').textContent.includes('cấm')"),'server báo muted → thông báo bị cấm')
    pg.screenshot(path='/home/claude/tests/chat-muted.png')
    pg.keyboard.press('Escape');pg.wait_for_timeout(100)
    ck(pg.evaluate("!Chat.isOpen&&$('ch').hidden"),'Esc đóng ô chat (không thoát ván)')
    ck(pg.evaluate("$('cf').hidden"),'Esc lần này không hiện hỏi thoát game')
    pg.evaluate("App.netIn('chat',{by:1,name:'Bình',text:'tin lúc chat đóng',id:3})");pg.wait_for_timeout(150)
    ck(pg.evaluate("!$('chBadge').hidden&&$('chBadge').textContent==='1'&&$('chFeed').children.length===1"),'chat đóng: tin mới hiện nổi + số chưa đọc trên nút')
    pg.screenshot(path='/home/claude/tests/chat-feed.png')
    pg.click('#bChat');pg.wait_for_timeout(100)
    ck(pg.evaluate("Chat.isOpen&&$('chBadge').hidden"),'bấm nút chat mở lại, xóa số chưa đọc')
    pg.click('#chMute');pg.evaluate("App.netIn('chat',{by:1,name:'Bình',text:'ẩn đi',id:4})")
    ck(pg.evaluate("!$('chLog').textContent.includes('ẩn đi')"),'tắt tiếng đối thủ: tin mới bị ẩn')
    pg.click('#chX');pg.evaluate("S.net.offline=true;UI.render()")
    pg.keyboard.press('c');pg.wait_for_timeout(100)
    ck(pg.evaluate("$('chIn').disabled"),'mất kết nối: ô nhập bị khóa')
    pg.evaluate("S.net.offline=false;UI.render();Chat.close(true)")
    # offline
    pg.evaluate("Chat.reset();S.net=null;UI.render()")
    pg.keyboard.press('c');pg.wait_for_timeout(100)
    ck(pg.evaluate("$('bChat').hidden&&!Chat.isOpen"),'ván offline: nút ẩn, phím C không mở')
    # thanh nút
    pg.evaluate("UI.theme('desert');S.net=null;UI.render()")
    pg.screenshot(path='/home/claude/tests/bars-desert.png')
    n=pg.evaluate("[...document.querySelectorAll('footer button')].filter(b=>b.offsetParent).length")
    ck(n<=5,f'thanh dưới chỉ còn {n} nút (trước: 10)')
    ck(pg.evaluate("[...document.querySelectorAll('#tools button')].every(b=>['bChat','bEval'].includes(b.id)||b.offsetParent)"),'thanh trên có đủ nút phụ')
    # hướng dẫn: mở bằng nút trên, đóng lại bằng nút trên
    pg.evaluate("UI.theme('forest')")
    pg.click('#bGuide');pg.wait_for_timeout(200)
    ck(pg.evaluate("Guide.isOpen"),'nút sách ở thanh trên mở Hướng dẫn')
    pg.screenshot(path='/home/claude/tests/guide-open.png')
    pg.click('#bGuide');pg.wait_for_timeout(200)
    ck(pg.evaluate("!Guide.isOpen"),'bấm lại nút sách (vẫn nổi trên cửa sổ) đóng được')
    pg.set_viewport_size({'width':390,'height':760});pg.evaluate("S.net={conn:{chat(){}},oppName:'B',offline:false,lost:null,rematch:{me:false,opp:false}};UI.render();Chat.open()")
    pg.screenshot(path='/home/claude/tests/chat-mobile.png')
    ck(not errs,'không có lỗi JS: '+str(errs[:3]))
    b.close()
print('LỖI',bad) if bad else print('ĐẠT');sys.exit(1 if bad else 0)
