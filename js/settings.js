'use strict';
/* Cài đặt tập trung: một hộp thoại dùng chung ở menu và trong ván. */
const Settings=(function(){
  const rows=[['master','Âm lượng tổng'],['sfx','Hiệu ứng'],['amb','Âm thanh môi trường'],['music','Nhạc nền']];
  let el=null;
  const values=()=>({master:Sfx.st.master,sfx:Sfx.st.sfx,amb:Sfx.st.amb,music:Sfx.st.music,mute:!Sfx.on});
  function paint(){
    if(!el)return;const v=values();
    for(const [k] of rows){const r=el.querySelector('#st_'+k),o=r.nextElementSibling,p=Math.round(v[k]*100);r.value=p;o.textContent=p+'%';}
    el.querySelector('#st_mute').checked=v.mute;el.classList.toggle('mt',v.mute);
  }
  function build(){
    el=document.createElement('div');el.id='st';el.hidden=true;
    el.innerHTML='<div class="win" role="dialog" aria-modal="true" aria-labelledby="stT"><div class="tb"><span id="stT">Cài đặt</span><button id="stX" class="wx" aria-label="Đóng" title="Đóng (Esc)">X</button></div><div class="wb"><div class="sub">Âm thanh</div>'+rows.map(([k,t])=>'<label class="srow"><span>'+t+'</span><input type="range" id="st_'+k+'" min="0" max="100" step="1"><output>0%</output></label>').join('')+'<label class="schk"><input type="checkbox" id="st_mute"><span>Tắt toàn bộ âm thanh</span></label><div class="cfb"><button id="stReset">Mặc định</button><button id="stOk" class="p">Xong</button></div></div></div>';
    document.body.appendChild(el);
    for(const [k] of rows){const r=el.querySelector('#st_'+k);r.oninput=()=>{Sfx.set(k,+r.value/100);if(k==='music'&&typeof BgAudio!=='undefined'){}paint();};r.onchange=()=>Sfx.play('ui:tick');}
    el.querySelector('#st_mute').onchange=e=>{Sfx.unlock();Sfx.setOn(!e.target.checked);paint();};
    el.querySelector('#stReset').onclick=()=>{Sfx.setOn(true);Sfx.set('master',.8);Sfx.set('sfx',1);Sfx.set('amb',.7);Sfx.set('music',.6);paint();};
    el.querySelector('#stX').onclick=el.querySelector('#stOk').onclick=close;
    el.addEventListener('pointerdown',e=>{if(e.target===el)close();});
    paint();
  }
  function open(){if(!el)build();el.hidden=false;const w=el.querySelector('.win');w.classList.remove('pop');void w.offsetWidth;w.classList.add('pop');el.querySelector('#st_master').focus();}
  function close(){if(el)el.hidden=true;}
  for(const id of ['mSet','bSet']){const b=document.getElementById(id);if(b)b.addEventListener('click',open);}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&el&&!el.hidden){e.preventDefault();e.stopImmediatePropagation();close();return;}if((e.key==='o'||e.key==='O')&&!e.repeat&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)){e.preventDefault();e.stopImmediatePropagation();el&&!el.hidden?close():open();}});
  Sfx.onChange(paint);
  return{open,close,toggle:()=>el&&!el.hidden?close():open(),isOpen:()=>!!el&&!el.hidden};
})();
