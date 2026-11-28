'use strict';
/* [GUIDE] Cửa sổ Hướng dẫn: cách chơi (cả Classic lẫn Hỗn Loạn); riêng Hỗn Loạn có thêm từng loại ô, vật phẩm, sự kiện kèm ảnh.
   Mở/đóng: phím I (bấm lần nữa để đóng), nút "Hướng dẫn" ở thanh dưới, nút X, hoặc Esc. Classic chỉ hiện nhóm GUIDE.basicGroups.
   Màu nền + chữ đúng màu biome đang chơi (css/guide.css dùng cùng biến màu --bg/--pn/--g của body[data-biome]).
   Nội dung: js/guide-data.js (dữ liệu thuần). Ảnh: file tĩnh img/guide/*.png (mỗi ảnh một ô, góc nhìn khối Minecraft), chụp sẵn bằng đồ họa
   thật của game (tools/guide-capture.html), nên mở Hướng dẫn không còn dựng 3D / không cần mạng. Vật phẩm dùng đúng biểu tượng CFG.ITEMS. */
const Guide=(function(){
  const E=GUIDE.entries,DIR='img/guide/';
  let cur=0,isOpen=false,builtFor=null;

  /* Mục đang hiện: Hỗn Loạn thấy tất cả, Classic chỉ thấy nhóm cơ bản (chỉ số trong E) */
  const chaos=()=>typeof S!=='undefined'&&!!S.chaos;
  const shown=()=>{const l=[];E.forEach((e,i)=>{if(chaos()||GUIDE.basicGroups.includes(e.grp))l.push(i);});return l;};
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
  /* **đậm** → <strong> (dựng bằng DOM, không dùng innerHTML) */
  function rich(node,t){t.split('**').forEach((p,i)=>{if(!p)return;if(i%2){node.appendChild(el('strong','',p));}else node.appendChild(document.createTextNode(p));});return node;}

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
        if(e.item&&CFG.ITEMS[e.item])b.appendChild(el('span','gde',CFG.ITEMS[e.item].icon));   /* chỉ vật phẩm có biểu tượng (biểu tượng thật của game) */
        b.appendChild(document.createTextNode(e.name));
        b.onclick=()=>select(i);n.appendChild(b);
      });
    }
  }

  function select(i){
    const vis=shown();cur=vis.includes(i)?i:vis[0];
    for(const b of $('gdNav').querySelectorAll('.gdi'))b.setAttribute('aria-pressed',+b.dataset.i===cur);
    render();
    const on=$('gdNav').querySelector('.gdi[aria-pressed="true"]');if(on&&on.scrollIntoView)on.scrollIntoView({block:'nearest',inline:'nearest'});
  }

  /* Khung hình: ảnh tĩnh của từng ô (1-2 ảnh cạnh nhau) hoặc biểu tượng vật phẩm; thiếu file ảnh thì ẩn khung */
  function picture(e){
    const box=el('div','gdpic');
    if(e.item){const it=CFG.ITEMS[e.item];box.classList.add('em');box.appendChild(el('div','gdemoji',it.icon));return box;}
    if(!e.vars||!e.vars.length){box.hidden=true;return box;}
    box.classList.add('n'+e.vars.length);
    for(const v of e.vars){
      const f=el('figure','gdfig'),im=el('img');im.alt=e.name+' - '+v.label;im.src=DIR+v.img;im.draggable=false;
      im.onerror=()=>{f.hidden=true;if(!box.querySelector('figure:not([hidden])'))box.hidden=true;};
      f.appendChild(im);f.appendChild(el('figcaption','',v.label));box.appendChild(f);
    }
    return box;
  }

  function render(){
    const e=E[cur],m=$('gdMain');m.textContent='';m.scrollTop=0;
    m.appendChild(picture(e));
    m.appendChild(el('h2','',e.name));
    m.appendChild(rich(el('p','gdsum'),e.sum));
    const ul=el('ul');for(const t of e.lines)ul.appendChild(rich(el('li'),t));m.appendChild(ul);
    if(e.note&&e.note.length){const n=el('div','gdnote');for(const t of e.note)n.appendChild(rich(el('p'),t));m.appendChild(n);}
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
    select(cur);
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

  /* Phím khi cửa sổ đang mở (App.onKey chuyển hết phím vào đây, game không nhận gì): I / Esc đóng, ↑ ↓ đổi mục */
  function onKey(ev){
    const k=ev.code;
    if(k==='KeyI'||k==='Escape'){close();ev.preventDefault();}
    else if(k==='ArrowDown'||k==='ArrowUp'){const vis=shown(),at=vis.indexOf(cur);select(vis[Math.max(0,Math.min(vis.length-1,at+(k==='ArrowDown'?1:-1)))]);const b=$('gdNav').querySelector('.gdi[aria-pressed="true"]');if(b)b.focus({preventScroll:true});ev.preventDefault();}
  }

  function init(){
    $('gdX').onclick=()=>close();
    $('bGuide').onclick=toggle;
    $('gd').addEventListener('mousedown',ev=>{if(ev.target===$('gd'))close();});   /* bấm ra ngoài cửa sổ = đóng */
  }
  init();

  return{open:()=>open(),close,toggle,onKey,get isOpen(){return isOpen;}};
})();
