'use strict';
/* [CHAT] Chat trong ván online. Phím C (hoặc nút 💬 ở thanh trên) mở/đóng; Enter gửi; Esc đóng.
   Giao diện: ô nằm trong #board góc dưới phải, màu theo biome (css/chat.css), làm theo ô Hướng dẫn. Không chặn bàn cờ.
   Khi ô đóng: tin mới nổi lên vài giây ở góc + số tin chưa đọc trên nút 💬.
   AN TOÀN / KHÔNG QUÁ TẢI (server mới là người quyết định, xem server/src/chat.js; ở đây chỉ là lớp thân thiện bên ngoài):
     · mọi chữ hiện bằng textContent (không bao giờ innerHTML) nên không chèn được HTML/script;
     · giới hạn 120 ký tự; gửi cách nhau ≥ 0,8 giây; server báo chatRejected{rate|dup|muted,wait} thì khóa ô nhập đúng thời gian đó và đếm ngược;
     · nút chuông "tắt tiếng đối thủ" (chỉ ở máy bạn); lịch sử giữ tối đa 80 dòng trong bộ nhớ, không lưu ở đâu cả.
   Server → client: chat{by,name,text,id} · chatRejected{reason,wait}. App.netIn chuyển thẳng hai tin này vào đây (không xếp hàng theo sự kiện).
   Không dùng ở ván offline: nút 💬 ẩn, phím C không làm gì. */
const Chat=(function(){
  const MAX_LOG=80,MAX_LEN=120,MIN_GAP=800,FEED_MS=7000,FEED_MAX=3;
  let log=[],unread=0,isOpen=false,muted=false,lockUntil=0,lockWhy='',lastSend=0,tick=0,built=false;
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
  const on=()=>typeof S!=='undefined'&&!!S.net;                                  /* chỉ có chat khi đang ở ván online */
  const live=()=>on()&&!S.net.lost&&!S.net.offline;
  const hhmm=()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};

  /* ----- Vẽ ----- */
  function line(m){
    const d=el('div','chm '+(m.sys?'sys':m.mine?'mine':'opp'));
    if(m.sys){d.textContent=m.text;return d;}
    d.appendChild(el('span','cht',m.at));
    d.appendChild(el('span','chn',(m.sym?m.sym+' ':'')+(m.name||(m.mine?'Bạn':'Đối thủ'))));
    d.appendChild(document.createTextNode(m.text));                              /* textContent: chữ thuần */
    return d;
  }
  function paintLog(){
    const L=$('chLog'),stick=L.scrollHeight-L.scrollTop-L.clientHeight<40;
    L.textContent='';for(const m of log)L.appendChild(line(m));
    if(stick||isOpen)L.scrollTop=L.scrollHeight;
  }
  function badge(){
    const b=$('chBadge');b.hidden=!unread;b.textContent=unread>9?'9+':unread;
    $('bChat').classList.toggle('new',unread>0);
  }
  function feed(m){                                                              /* thông báo nổi khi ô đóng */
    const f=$('chFeed'),d=el('div','chf');
    d.appendChild(el('b','',(m.sym?m.sym+' ':'')+(m.name||'Đối thủ')+':'));d.appendChild(document.createTextNode(m.text));
    f.appendChild(d);while(f.children.length>FEED_MAX)f.firstChild.remove();
    setTimeout(()=>{d.classList.add('out');setTimeout(()=>d.remove(),600);},FEED_MS);
  }
  function push(m){log.push(m);if(log.length>MAX_LOG)log.shift();if(isOpen)paintLog();}
  const sys=t=>push({sys:true,text:t});

  /* ----- Trạng thái ô nhập: khóa khi bị server giới hạn / mất kết nối ----- */
  function note(t,bad){const n=$('chNote');n.hidden=!t;n.innerHTML=Icons.text(t||'');n.classList.toggle('bad',!!bad);}
  function paintInput(){
    const inp=$('chIn'),go=$('chGo'),left=Math.max(0,Math.ceil((lockUntil-Date.now())/1000));
    const off=!live();
    inp.disabled=off;go.disabled=off||left>0;
    inp.placeholder=off?'Mất kết nối…':'Nhắn cho '+(UI.oppName?UI.oppName():'đối thủ')+', Enter để gửi';
    if(left>0)note((lockWhy==='muted'?'[[volume-x]] Bạn bị cấm chat '+left+'s vì gửi quá nhiều':'[[hourglass]] Gửi chậm lại chút ('+left+'s)'),lockWhy==='muted');
    else if(note.on)note('');
    note.on=left>0;
    if(left<=0&&tick){clearInterval(tick);tick=0;}
  }
  function lock(ms,why){
    lockUntil=Date.now()+ms;lockWhy=why;paintInput();
    if(!tick)tick=setInterval(paintInput,500);
  }

  /* ----- Nhận tin từ server (App.netIn) ----- */
  function recv(t,m){
    if(!on())return;
    if(t==='chatRejected'){
      if(m.reason==='muted'){lock(Math.min(m.wait||30000,10*60e3),'muted');sys('Bạn gửi quá nhiều tin nên bị cấm chat tạm thời.');}
      else if(m.reason==='dup')note('Bạn vừa gửi tin giống hệt rồi',false),setTimeout(()=>{if(!lockUntil||Date.now()>=lockUntil)note('');},2500);
      else lock(Math.min(m.wait||2000,15000),'rate');
      return;
    }
    if(t!=='chat'||typeof m.text!=='string')return;
    const mine=m.by===S.me;
    if(!mine&&muted)return;                                                      /* đã tắt tiếng đối thủ */
    const msg={mine,name:String(m.name||'').slice(0,16),sym:(CFG.PLAYERS[m.by]||{}).sym||'',text:m.text.slice(0,MAX_LEN),at:hhmm()};
    push(msg);
    if(mine)return;
    if(isOpen)Sfx.play('ui:tickTarget',{v:.7});
    else{unread++;badge();feed(msg);Sfx.play('ui:tickTarget',{v:.9});}
  }

  /* ----- Gửi ----- */
  function send(){
    const inp=$('chIn'),txt=inp.value.replace(/\s+/g,' ').trim();
    if(!txt||!live())return;
    const now=Date.now();
    if(now<lockUntil){paintInput();return;}
    if(now-lastSend<MIN_GAP){lock(MIN_GAP-(now-lastSend)+50,'rate');return;}    /* chặn từ máy mình trước, đỡ tốn một lượt gửi lên server */
    lastSend=now;
    S.net.conn.chat(txt.slice(0,MAX_LEN));
    inp.value='';
  }

  /* ----- Mở / đóng ----- */
  function open(){
    if(isOpen||!on())return;
    isOpen=true;unread=0;badge();$('chFeed').textContent='';
    $('ch').hidden=false;
    const w=$('ch').querySelector('.win');w.classList.remove('pop');void w.offsetWidth;w.classList.add('pop');
    $('bChat').setAttribute('aria-pressed','true');
    Tip.hide();paintLog();paintInput();$('chLog').scrollTop=$('chLog').scrollHeight;
    Sfx.play('ui:open');
    if(!$('chIn').disabled)$('chIn').focus({preventScroll:true});
  }
  function close(silent){
    if(!isOpen)return;
    isOpen=false;$('ch').hidden=true;$('bChat').setAttribute('aria-pressed','false');
    if(!silent)Sfx.play('ui:close');
    if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();   /* trả phím về cho game (Q/W/R... hoạt động lại) */
  }
  const toggle=()=>isOpen?close():open();
  /* Gọi từ UI.render mỗi lần giao diện đổi: hiện/ẩn nút theo online, cập nhật khóa khi mất/được nối lại */
  function sync(){
    const b=$('bChat');if(!b)return;
    b.hidden=!on();
    if(!on()){if(isOpen)close(true);return;}
    if(isOpen)paintInput();
  }
  /* Chuyển về menu / rời phòng: xóa sạch (lịch sử không lưu) */
  function reset(){
    close(true);log=[];unread=0;lockUntil=0;lastSend=0;muted=false;clearInterval(tick);tick=0;
    if(built){$('chLog').textContent='';$('chFeed').textContent='';$('chIn').value='';note('');$('chMute').setAttribute('aria-pressed','false');$('chMute').innerHTML=Icons.svg('bell');badge();}
  }

  function init(){
    built=true;
    $('bChat').onclick=toggle;$('chX').onclick=()=>close();
    $('chForm').addEventListener('submit',ev=>{ev.preventDefault();send();});
    $('chMute').onclick=()=>{
      muted=!muted;$('chMute').setAttribute('aria-pressed',muted);$('chMute').innerHTML=Icons.svg(muted?'bell-off':'bell');
      sys(muted?'Đã tắt tiếng đối thủ (chỉ trên máy bạn).':'Đã bật lại tin nhắn của đối thủ.');
      $('chMute').dataset.tn=muted?'Bật lại tin nhắn':'Tắt tiếng đối thủ';
    };
    /* Gõ chữ: phím KHÔNG được lọt ra game (Q/W/R/E/T/I/O/P/C/Space... đều là chữ ở đây). Enter gửi (form lo), Esc đóng chat. */
    $('chIn').addEventListener('keydown',ev=>{
      ev.stopPropagation();
      if(ev.code==='Escape'){close();ev.preventDefault();}
    });
    $('chIn').addEventListener('keyup',ev=>ev.stopPropagation());
  }
  init();

  return{open,close,toggle,sync,recv,reset,get isOpen(){return isOpen;},get typing(){return isOpen&&document.activeElement===$('chIn');}};
})();
