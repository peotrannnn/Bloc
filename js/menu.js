'use strict';
/* [MENU] Menu chính: 3 màn hình (scHome / scPve / scEve). Danh sách AI lấy từ AIs (ai/registry.js),
   nên thêm AI mới là menu tự cập nhật. Menu chỉ thu thập lựa chọn rồi gọi App.start(cfg). */
const Menu={
  screens:['scHome','scPve','scEve'],
  pveId:null,   /* AI đang chọn làm đối thủ ở chế độ đấu với máy */

  init(){
    this.pveId=AIs.defaultId();
    this.fillPve();
    for(const id of['eveA','eveB']){
      const sel=$(id);
      for(const a of AIs.list)sel.add(new Option(a.name,a.id));
      sel.value=AIs.defaultId();
    }
    $('mPve').onclick=()=>this.show('scPve');
    $('mEve').onclick=()=>this.show('scEve');
    $('pveBack').onclick=$('eveBack').onclick=()=>this.show('scHome');
    /* swap:true = mỗi ván bốc thăm ngẫu nhiên người chơi cầm Trắng (đi trước) hay Đen.
       analysis = {on: mặc định có hiện thanh khả năng thắng + nhãn nước đi không, lock: true thì không cho bật/tắt bằng phím T}.
       Sau này: đấu online → analysis:{on:false,lock:true} (không ai được nhờ engine); xem lại ván (replay) → analysis:{on:true}. */
    $('pvePlay').onclick=()=>App.start({ai:[null,this.pveId],swap:true,delay:CFG.PVE_DELAY,analysis:{on:true}});
    $('evePlay').onclick=()=>App.start({ai:[$('eveA').value,$('eveB').value],delay:+$('spd').value,analysis:{on:true}});
  },

  /* Danh sách đối thủ dạng nút chọn một */
  fillPve(){
    const box=$('pveList');box.textContent='';
    for(const a of AIs.list){
      const b=document.createElement('button');
      b.textContent=a.name;b.title=a.desc||'';b.setAttribute('role','radio');
      b.onclick=()=>{this.pveId=a.id;this.markPve();};
      b.dataset.id=a.id;box.appendChild(b);
    }
    this.markPve();
  },
  markPve(){
    for(const b of $('pveList').children){
      const on=b.dataset.id===this.pveId;
      b.setAttribute('aria-pressed',on);b.setAttribute('aria-checked',on);
    }
  },

  /* Phím Esc khi đang ở menu: từ màn hình con quay về màn hình chính */
  back(){if($('scHome').hidden)this.show('scHome');},

  /* Hiện menu ở màn hình name */
  show(name){
    for(const s of this.screens)$(s).hidden=s!==name;
    UI.el.ld.hidden=true;UI.el.menu.hidden=false;
  }
};
