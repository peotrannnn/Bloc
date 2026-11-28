'use strict';
/* [GUIDE] Cửa sổ Hướng dẫn: cách chơi (cả Classic lẫn Hỗn Loạn); riêng Hỗn Loạn có thêm từng loại ô, vật phẩm, sự kiện kèm ảnh.
   Mở/đóng: phím I (bấm lần nữa để đóng), nút "Hướng dẫn" ở thanh dưới, nút X, hoặc Esc. Classic chỉ hiện nhóm GUIDE.basicGroups.
   Màu nền + chữ đúng màu biome đang chơi (css/guide.css dùng cùng biến màu --bg/--pn/--g của body[data-biome]).
   Nội dung: js/guide-data.js (dữ liệu thuần). Ảnh: dựng THẬT bằng đồ họa của game trong iframe ẩn guide-shots.html (xem js/guide-shots.js),
   lần đầu mở mới dựng, mỗi ảnh chỉ dựng một lần rồi nhớ lại. Vật phẩm dùng đúng biểu tượng CFG.ITEMS của game. */
const Guide=(function(){
  const E=GUIDE.entries;
  const cache=new Map();        /* khóa 'idMục:số biến thể' → data URL đã dựng; 'x' = dựng lỗi */
  const waiting=[];             /* hàng chờ dựng: [{key,spec}], mục đang xem được đẩy lên đầu */
  let frame=null,ready=false,busy=null,deadFrame=false,timer=0,cur=0,vi=0,isOpen=false,builtFor=null;

  const keyOf=(e,i)=>e.id+':'+i;
  /* Mục đang hiện: Hỗn Loạn thấy tất cả, Classic chỉ thấy nhóm cơ bản (chỉ số trong E) */
  const chaos=()=>typeof S!=='undefined'&&!!S.chaos;
  const shown=()=>{const l=[];E.forEach((e,i)=>{if(chaos()||GUIDE.basicGroups.includes(e.grp))l.push(i);});return l;};
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};

  /* ----- Dựng ảnh bằng iframe ẩn ----- */
  function ensureFrame(){
    if(frame||deadFrame)return;
    frame=document.createElement('iframe');
    frame.src='guide-shots.html';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    frame.style.cssText='position:fixed;left:-9999px;top:0;width:720px;height:450px;border:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(frame);ready=false;
    clearTimeout(timer);timer=setTimeout(()=>{if(!ready)fail();},20000);   /* không tải được three.js / trang phụ */
  }
  function fail(){
    deadFrame=true;ready=false;busy=null;clearTimeout(timer);
    if(frame){frame.remove();frame=null;}
    for(const w of waiting)if(!cache.has(w.key))cache.set(w.key,'x');
    waiting.length=0;paint();
  }
  function pump(){
    if(!frame||!ready||busy)return;
    const w=waiting.shift();
    if(!w){   /* hết việc: gỡ iframe cho nhẹ máy (ảnh đã nằm trong cache) */
      if(frame){frame.remove();frame=null;ready=false;}clearTimeout(timer);return;
    }
    if(cache.has(w.key))return pump();
    busy=w.key;frame.contentWindow.postMessage({t:'shot',key:w.key,spec:w.spec},'*');
    clearTimeout(timer);timer=setTimeout(()=>{if(busy){cache.set(busy,'x');busy=null;paint();pump();}},12000);
  }
  addEventListener('message',ev=>{
    const m=ev.data;if(!frame||ev.source!==frame.contentWindow||!m)return;
    if(m.t==='ready'){ready=true;clearTimeout(timer);pump();}
    else if(m.t==='fail')fail();
    else if(m.t==='img'||m.t==='err'){
      cache.set(m.key,m.t==='img'?m.url:'x');if(busy===m.key)busy=null;
      paint();pump();
    }
  });
  /* Xếp toàn bộ ảnh còn thiếu vào hàng chờ, ảnh của mục đang xem lên đầu */
  function queueAll(){
    const vis=shown(),order=[E[cur],...vis.filter(i=>i!==cur).map(i=>E[i])],list=[];
    for(const e of order)(e.vars||[]).forEach((v,i)=>{const k=keyOf(e,i);if(!cache.has(k)&&!list.some(x=>x.key===k))list.push({key:k,spec:v.shot});});
    waiting.length=0;waiting.push(...list);
    if(list.length||busy){ensureFrame();pump();}
  }

  /* ----- Giao diện ----- */
  function nav(){
    const n=$('gdNav');n.textContent='';
    const vis=shown();
    for(const g of GUIDE.groups){
      if(!vis.some(i=>E[i].grp===g))continue;
      n.appendChild(el('div','gdg',g));
      E.forEach((e,i)=>{
        if(e.grp!==g||!vis.includes(i))return;
        const b=el('button','gdi');b.type='button';b.dataset.i=i;
        if(e.item&&CFG.ITEMS[e.item])b.appendChild(el('span','gde',CFG.ITEMS[e.item].icon));
        b.appendChild(document.createTextNode(e.name));
        b.onclick=()=>select(i);n.appendChild(b);
      });
    }
  }

  /* Biến thể mặc định: cùng biome với bản đồ đang chơi nếu có (vd cỏ rừng khi đang chơi rừng) */
  function defaultVar(e){
    const b=GUIDE.terrBiome(typeof S!=='undefined'&&S.mapInfo?S.mapInfo.biome:null);
    const i=(e.vars||[]).findIndex(v=>v.shot.biome===b);return i<0?0:i;
  }
  function select(i,v){
    const vis=shown();cur=vis.includes(i)?i:vis[0];vi=v==null?defaultVar(E[cur]):v;
    for(const b of $('gdNav').querySelectorAll('.gdi'))b.setAttribute('aria-pressed',+b.dataset.i===cur);
    render();queueAll();
    const on=$('gdNav').querySelector('.gdi[aria-pressed="true"]');if(on&&on.scrollIntoView)on.scrollIntoView({block:'nearest',inline:'nearest'});
  }

  /* Khung hình (ảnh dựng, biểu tượng vật phẩm, hoặc chữ chờ/lỗi) */
  function picture(e){
    const box=el('div','gdpic');
    if(e.item){const it=CFG.ITEMS[e.item];box.classList.add('em');box.appendChild(el('div','gdemoji',it.icon));return box;}
    if(!e.vars||!e.vars.length){box.hidden=true;return box;}
    const k=keyOf(e,vi),u=cache.get(k);
    if(u&&u!=='x'){const im=el('img');im.alt=e.name+' - '+e.vars[vi].label;im.src=u;im.draggable=false;box.appendChild(im);}
    else if(u==='x')box.appendChild(el('div','gdph','Không dựng được ảnh minh họa (cần mạng để tải đồ họa 3D). Phần chữ bên dưới vẫn đầy đủ.'));
    else box.appendChild(el('div','gdph gdwait','Đang dựng hình từ đồ họa của game…'));
    return box;
  }

  function render(){
    const e=E[cur],m=$('gdMain');m.textContent='';m.scrollTop=0;
    m.appendChild(picture(e));
    if(e.vars&&e.vars.length>1){
      const row=el('div','gdvar');row.setAttribute('role','group');row.setAttribute('aria-label','Biến thể');
      e.vars.forEach((v,i)=>{const b=el('button','',v.label);b.type='button';b.setAttribute('aria-pressed',i===vi);b.onclick=()=>{vi=i;render();};row.appendChild(b);});
      m.appendChild(row);
    }
    if(e.vars&&e.vars[vi]&&e.vars[vi].cap)m.appendChild(el('div','gdcap',e.vars[vi].cap));
    m.appendChild(el('h2','',e.name));
    m.appendChild(el('p','gdsum',e.sum));
    const ul=el('ul');for(const t of e.lines)ul.appendChild(el('li','',t));m.appendChild(ul);
    if(e.note&&e.note.length){const n=el('div','gdnote');for(const t of e.note)n.appendChild(el('p','',t));m.appendChild(n);}
  }
  /* Ảnh vừa dựng xong: chỉ vẽ lại khung ảnh nếu nó thuộc mục/biến thể đang xem (không giật chữ đang đọc) */
  function paint(){
    if(!isOpen)return;
    const e=E[cur];if(!e.vars||!e.vars.length)return;
    const old=$('gdMain').querySelector('.gdpic');if(!old)return;
    const nw=picture(e);old.replaceWith(nw);
  }

  /* ----- Mở / đóng ----- */
  function open(){
    if(isOpen||typeof S==='undefined')return;
    if(builtFor!==chaos()){nav();builtFor=chaos();if(!shown().includes(cur))cur=shown()[0];}   /* đổi Classic ↔ Hỗn Loạn thì dựng lại danh mục */
    isOpen=true;Tip.hide();
    const g=$('gd'),ft=document.querySelector('footer');
    g.style.paddingBottom=(ft?ft.offsetHeight:0)+14+'px';   /* thanh nút dưới vẫn nằm trên cửa sổ để bấm lại nút Hướng dẫn mà đóng */
    g.hidden=false;document.body.classList.add('gdopen');
    const w=g.querySelector('.win');w.classList.remove('pop');void w.offsetWidth;w.classList.add('pop');
    $('bGuide').setAttribute('aria-pressed','true');
    Sfx.play('ui:open');
    select(cur);   /* biến thể mặc định theo biome đang chơi */
    const on=$('gdNav').querySelector('.gdi[aria-pressed="true"]');if(on)on.focus({preventScroll:true});
  }
  /* silent=true: đóng không phát tiếng (thoát ván, đổi sang Classic) */
  function close(silent){
    if(!isOpen)return;
    isOpen=false;$('gd').hidden=true;document.body.classList.remove('gdopen');
    $('bGuide').setAttribute('aria-pressed','false');
    if(!silent)Sfx.play('ui:close');
    if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();   /* nút vừa bấm không giữ focus (Space/Enter không bấm lại) */
  }
  const toggle=()=>isOpen?close():open();

  /* Phím khi cửa sổ đang mở (App.onKey chuyển hết phím vào đây, game không nhận gì): I / Esc đóng, ↑ ↓ đổi mục, ← → đổi biến thể */
  function onKey(ev){
    const k=ev.code;
    if(k==='KeyI'||k==='Escape'){close();ev.preventDefault();}
    else if(k==='ArrowDown'||k==='ArrowUp'){const vis=shown(),at=vis.indexOf(cur);select(vis[Math.max(0,Math.min(vis.length-1,at+(k==='ArrowDown'?1:-1)))]);const b=$('gdNav').querySelector('.gdi[aria-pressed="true"]');if(b)b.focus({preventScroll:true});ev.preventDefault();}
    else if(k==='ArrowRight'||k==='ArrowLeft'){
      const n=(E[cur].vars||[]).length;if(n>1){vi=(vi+(k==='ArrowRight'?1:n-1))%n;render();}
      ev.preventDefault();
    }
  }

  function init(){
    $('gdX').onclick=()=>close();
    $('bGuide').onclick=toggle;
    $('gd').addEventListener('mousedown',ev=>{if(ev.target===$('gd'))close();});   /* bấm ra ngoài cửa sổ = đóng */
  }
  init();

  return{open:()=>open(),close,toggle,onKey,get isOpen(){return isOpen;}};
})();
