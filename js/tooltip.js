'use strict';
/* [Tooltip] Khung mô tả đẹp thay cho khung `title` mặc định của trình duyệt (xấu, trễ, không đổi được kiểu).
   Chạy bằng ủy quyền sự kiện trên document nên nút/vật phẩm được dựng lại mỗi lượt (UI.render) vẫn có tooltip, không cần đăng ký từng phần tử.

   Cách đặt mô tả cho một phần tử (menu, thanh nút, túi đồ... đều dùng chung):
     data-tip="nội dung"   nội dung mô tả (xuống dòng bằng \n)
     data-tn="Tên"         dòng tiêu đề đậm phía trên (tùy chọn)
     data-tk="Q"           phím tắt, hiện thành ô phím (tùy chọn)
     title="..."           thuộc tính cũ vẫn dùng được: được chuyển thành data-tip ngay khi rê chuột tới (nên khung mặc định không bao giờ hiện).
                           Đuôi "(Esc)" / "[1]" trong title được tách ra làm ô phím nếu không có data-tk.
   Màu khung lấy theo biến màu của chính phần tử đang trỏ tới (--pn, --g, --g2, --gd, --mut, --gr), nên ván Hỗn Loạn theo biome nào thì khung theo màu biome đó. */
const Tip=(function(){
  const DELAY=300;          /* rê chuột bao lâu thì hiện (ms); đang có khung hiện sẵn mà chuyển sang phần tử khác thì hiện ngay */
  const GAP=10;             /* khoảng cách khung - phần tử */
  const EDGE=8;             /* lề tối thiểu với mép cửa sổ */
  const VARS=['--pn','--g','--g2','--gd','--mut','--gr','--on'];
  let el=null,anchor=null,timer=0,watch=0,touch=false,shown=false;

  /* Phần tử có mô tả gần nhất tính từ t (và gom title → data-tip) */
  function find(t){
    const a=t&&t.closest?t.closest('[data-tip],[title],[data-tn]'):null;
    if(!a)return null;
    if(a.hasAttribute('title')){const v=a.getAttribute('title');a.removeAttribute('title');if(v)a.dataset.tip=v;}
    if(!a.dataset.tip&&!a.dataset.tn)return null;
    /* Dòng trạng thái / thông tin chỉ cần tooltip khi chữ bị cắt "…" */
    if((a.id==='status'||a.id==='info')&&a.scrollWidth<=a.clientWidth+1)return null;
    return a;
  }
  /* Tách {tn, body, key} từ các thuộc tính của phần tử */
  function parse(a){
    let body=a.dataset.tip||'',key=a.dataset.tk||'';
    if(!key){const m=/^([\s\S]*?)\s*[\[(]([^\])(]{1,8})[\])]\s*$/.exec(body);if(m&&m[1]){body=m[1];key=m[2];}}
    return{tn:a.dataset.tn||'',body,key};
  }
  function build(){
    el=document.createElement('div');el.id='tip';el.setAttribute('role','tooltip');
    el.innerHTML='<div class="tnr"><b class="tn"></b><kbd></kbd></div><div class="td"></div>';
    document.body.appendChild(el);
  }
  function fill(a){
    const p=parse(a),q=s=>el.querySelector(s);
    q('.tn').textContent=p.tn;q('kbd').textContent=p.key;q('.td').textContent=p.body;
    q('.tn').hidden=!p.tn;q('kbd').hidden=!p.key;q('.td').hidden=!p.body;
    q('.tnr').hidden=!p.tn&&!p.key;
    el.classList.toggle('solo',!p.tn&&!!p.key);   /* chỉ có mô tả + phím: ô phím nằm cùng dòng cuối */
    const cs=getComputedStyle(a);
    for(const v of VARS){const x=cs.getPropertyValue(v);if(x)el.style.setProperty(v,x);}
  }
  function place(a){
    const r=a.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight;
    el.style.left='0px';el.style.top='0px';
    const w=el.offsetWidth,h=el.offsetHeight;
    let x=Math.max(EDGE,Math.min(r.left+r.width/2-w/2,vw-w-EDGE));
    let y=r.bottom+GAP,side='b';   /* ưu tiên phía dưới; hết chỗ thì lên trên (thanh nút ở đáy màn hình) */
    const ft=a.closest('footer');   /* nút của thanh dưới: luôn hiện phía TRÊN CẢ THANH (không phải trên nút), để khung không đè lên nút nào khác */
    if(ft){const fr=ft.getBoundingClientRect();y=Math.max(EDGE,fr.top-GAP-h);side='t';}
    else if(y+h>vh-EDGE&&r.top-GAP-h>=EDGE){y=r.top-GAP-h;side='t';}
    else if(y+h>vh-EDGE)y=Math.max(EDGE,vh-h-EDGE);
    el.style.left=Math.round(x)+'px';el.style.top=Math.round(y)+'px';
    el.style.setProperty('--ax',Math.round(Math.max(12,Math.min(r.left+r.width/2-x,w-12)))+'px');
    el.dataset.side=side;
  }
  function show(a){
    if(!el)build();
    fill(a);anchor=a;
    const fast=shown;shown=true;
    el.classList.toggle('fast',fast);
    place(a);
    el.classList.add('on');
    clearInterval(watch);watch=setInterval(check,250);
  }
  /* Phần tử biến mất (UI dựng lại) hoặc bị khóa/ẩn thì tắt khung, khỏi treo chữ mồ côi */
  function check(){
    if(!anchor||!anchor.isConnected||anchor.hidden||!anchor.offsetParent&&getComputedStyle(anchor).position!=='fixed')hide();
  }
  function hide(){
    clearTimeout(timer);clearInterval(watch);anchor=null;shown=false;
    if(el)el.classList.remove('on');
  }
  function over(t){
    if(touch)return;
    const a=find(t);
    if(a===anchor){
      if(a&&el&&el.classList.contains('on')){   /* cùng phần tử nhưng chữ có thể vừa đổi (đồng hồ, trạng thái): cập nhật tại chỗ */
        const p=parse(a);if(p.body!==el.querySelector('.td').textContent||p.tn!==el.querySelector('.tn').textContent){fill(a);place(a);}
      }
      return;
    }
    clearTimeout(timer);
    if(!a){anchor=null;if(shown)hide();return;}
    if(shown){anchor=a;show(a);return;}
    anchor=a;timer=setTimeout(()=>{if(anchor===a&&a.isConnected)show(a);},DELAY);
  }

  document.addEventListener('mouseover',e=>over(e.target),true);
  document.addEventListener('mousemove',e=>over(e.target),true);   /* nút dựng lại dưới con trỏ: mouseover không bắn lại, mousemove thì có */
  document.addEventListener('mouseout',e=>{if(!e.relatedTarget)hide();},true);   /* chuột rời cửa sổ */
  document.addEventListener('mousedown',hide,true);
  document.addEventListener('keydown',hide,true);
  document.addEventListener('wheel',hide,{capture:true,passive:true});
  window.addEventListener('blur',hide);
  window.addEventListener('resize',hide);
  document.addEventListener('focusin',e=>{   /* bàn phím: Tab tới nút thì hiện tooltip (không hiện khi vừa bấm chuột) */
    const t=e.target;if(touch||!t.matches||!t.matches(':focus-visible'))return;
    const a=find(t);if(a){clearTimeout(timer);anchor=a;show(a);}
  });
  document.addEventListener('focusout',hide);
  /* Màn hình cảm ứng: chạm sinh ra mouseover giả, bỏ qua (không có hover thật) */
  document.addEventListener('pointerdown',e=>{touch=e.pointerType==='touch';hide();},true);
  document.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')touch=false;},true);

  return{hide};
})();
