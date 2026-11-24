'use strict';
/* [MENU] Menu chính: mỗi màn hình là một "cửa sổ" riêng (tên ở thanh tiêu đề, nút X để quay về menu chính). Danh sách AI lấy từ AIs (ai/registry.js),
   nên thêm AI mới là menu tự cập nhật. Menu chỉ thu thập lựa chọn rồi gọi App.start(cfg). */
const Menu={
  screens:['scHome','scPve','scEve','scOnline','scWait'],
  titles:{scHome:'Bloc - menu',scPve:'Bloc - Chơi với máy',scEve:'Bloc - Cá cược',scOnline:'Bloc - Chơi online',scWait:'Bloc - Phòng chờ'},   /* tên cửa sổ theo màn hình */
  pveId:null,   /* AI đang chọn làm đối thủ ở chế độ đấu với máy */

  init(){
    this.pveId=AIs.defaultId();
    this.fillPve();
    for(const id of['eveA','eveB']){
      const sel=$(id);
      for(const a of AIs.list)sel.add(new Option(a.name,a.id));
      sel.value=AIs.defaultId();
    }
    $('mOnline').onclick=()=>{this.err('');this.showOnline();};
    $('onResume').onclick=()=>{const c=Online.lastRoom();if(c)this.joinRoom(c);};
    $('winX').onclick=()=>this.back();   /* nút X: từ màn hình con về menu chính (đang ở phòng chờ thì rời phòng) */
    $('onCreate').onclick=()=>this.createRoom();
    $('onJoin').onclick=()=>this.joinByCode();
    $('onQuick').onclick=()=>this.quickJoin();
    $('onCode').onkeydown=e=>{if(e.key==='Enter')this.joinByCode();};
    $('waitCopy').onclick=()=>{
      const b=$('waitCopy'),code=$('waitCode').textContent;
      try{navigator.clipboard.writeText(code).then(()=>{b.textContent='Đã chép';setTimeout(()=>{b.textContent='Chép mã';},1500);});}catch(e){}
    };
    $('mPve').onclick=()=>this.show('scPve');
    $('mEve').onclick=()=>this.show('scEve');
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

  /* Nút X hoặc phím Esc: từ màn hình con quay về màn hình chính */
  back(){
    if(!$('scWait').hidden){this.cancelWait();return;}
    if($('scHome').hidden)this.show('scHome');
  },

  /* ----- Đấu online (Classic): tạo phòng hoặc vào bằng mã ----- */
  conn:null,started:false,quick:false,tries:0,
  showOnline(){const c=Online.lastRoom(),b=$('onResume');b.hidden=!c;if(c)b.textContent='Vào lại '+c;this.show('scOnline');},
  err(t){const e=$('onErr');e.textContent=t||'';e.hidden=!t;},
  async createRoom(){
    this.err('');
    const btn=$('onCreate');btn.disabled=true;
    try{
      const r=await Online.createRoom({mode:'classic',visibility:$('onVis').value});
      this.joinRoom(r.code);
    }catch(e){this.err(/429/.test(e.message)?'Bạn thao tác quá nhanh, đợi vài giây rồi thử lại.':'Không tạo được phòng. Kiểm tra mạng rồi thử lại.');}
    finally{btn.disabled=false;}
  },
  joinByCode(){
    this.err('');
    const code=Online.normalizeCode($('onCode').value);
    if(!code){this.err('Mã phòng gồm 6 ký tự (chữ và số, không có 0, O, 1, I).');return;}
    this.joinRoom(code);
  },
  /* Vào tự động: server chọn phòng công khai đang chờ lâu nhất (hoặc tạo phòng mới). Nếu phòng vừa hết hạn thì thử lại tối đa 2 lần. */
  async quickJoin(retry){
    if(!retry){this.err('');this.tries=0;}
    const btn=$('onQuick');btn.disabled=true;
    try{
      const r=await Online.quick('classic');
      this.joinRoom(r.code,true);
    }catch(e){this.show('scOnline');this.err(/429/.test(e.message)?'Bạn thao tác quá nhanh, đợi vài giây rồi thử lại.':'Không tìm được phòng. Kiểm tra mạng rồi thử lại.');}
    finally{btn.disabled=false;}
  },
  joinRoom(code,quick){
    this.leaveRoom();this.quick=!!quick;
    const conn=Online.join(code);this.conn=conn;this.started=false;
    for(const t of['welcome','started','applied','state','rejected','over','opponentStatus','full','replaced','error','close'])
      conn.on(t,m=>{if(this.conn===conn)this.onNet(t,m);});   /* tin của kết nối cũ (đã rời) thì bỏ */
    $('waitCode').textContent=code;$('waitMsg').textContent='Đang kết nối…';
    this.show('scWait');
  },
  leaveRoom(){if(this.conn){const c=this.conn;this.conn=null;c.close();}},
  cancelWait(){this.leaveRoom();this.showOnline();},
  fail(msg){if(/hết hạn|không tồn tại/.test(msg))Online.setLastRoom(null);this.leaveRoom();this.showOnline();this.err(msg);},
  /* Tin từ server: trước khi ván bắt đầu thì lo màn hình chờ, sau đó chuyển hết cho App */
  onNet(t,m){
    if(t==='welcome'&&!this.started){
      $('waitMsg').textContent=m.started?'Đang vào…':m.players<2?(this.quick?'Đang tìm…':'Chờ đối thủ · gửi mã cho bạn'):'Đủ người · chia phe…';
      return;
    }
    if((t==='started'||t==='state')&&!this.started){           /* started: ván mới; state: vào lại ván đang chơi (tải lại trang / bấm "Vào lại phòng") */
      this.started=true;
      this.conn.autoReconnect(true);Online.setLastRoom(this.conn.code);
      App.start({net:{conn:this.conn,you:m.you,snap:m.snapshot,turnLeft:m.turnLeft,state:t==='state'?m:null},delay:0,analysis:{on:false,lock:true}});   /* online: tắt và khóa đánh giá */
      return;
    }
    if(!this.started){
      if(t==='full')this.fail('Phòng đã đủ người.');
      else if(t==='error'&&m.reason==='noroom'&&this.quick&&this.tries<2){this.tries++;this.leaveRoom();this.quickJoin(true);}   /* phòng trong danh sách vừa hết hạn: xin phòng khác */
      else if(t==='error')this.fail(m.reason==='noroom'?'Mã phòng không tồn tại hoặc đã hết hạn.':'Lỗi kết nối. Thử lại nhé.');
      else if(t==='replaced')this.fail('Phòng này vừa được mở ở tab khác.');
      else if(t==='close')this.fail('Mất kết nối với server. Kiểm tra mạng rồi thử lại.');
      return;
    }
    App.netIn(t,m);
  },

  /* Hiện menu ở màn hình name: đổi tên cửa sổ, menu chính không có nút X, cửa sổ "bật lên" mỗi lần chuyển màn hình */
  show(name){
    for(const s of this.screens)$(s).hidden=s!==name;
    $('winTitle').textContent=this.titles[name]||'Bloc';
    $('winX').hidden=name==='scHome';
    const w=document.querySelector('#menu .win');w.classList.remove('pop');void w.offsetWidth;w.classList.add('pop');
    UI.el.ld.hidden=true;UI.el.menu.hidden=false;
  }
};

