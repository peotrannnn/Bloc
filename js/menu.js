'use strict';
/* [MENU] Menu chính: mỗi màn hình là một "cửa sổ" riêng (tên ở thanh tiêu đề, nút X để quay về menu chính). Danh sách AI lấy từ AIs (ai/registry.js),
   nên thêm AI mới là menu tự cập nhật. Menu chỉ thu thập lựa chọn rồi gọi App.start(cfg). */
const Menu={
  screens:['scBoot','scHome','scPve','scEve','scOnline','scQuick','scWait'],
  titles:{scBoot:'Bloc',scHome:'Bloc - menu',scQuick:'Bloc - Ghép nhanh',scPve:'Bloc - Chơi với máy',scEve:'Bloc - Cá cược',scOnline:'Bloc - Chơi online',scWait:'Bloc - Phòng chờ'},   /* tên cửa sổ theo màn hình */
  pveId:null,   /* AI đang chọn làm đối thủ ở chế độ đấu với máy */
  /* Bản đồ của chế độ Hỗn Loạn (khóa trùng với server/src/codes.js BIOMES; 'random' = server bốc ngẫu nhiên mỗi ván) */
  biomeNames:{random:'Ngẫu nhiên',balanced:'Cân bằng',forest:'Rừng',mountain:'Núi',snow:'Tuyết',river:'Sông',desert:'Sa mạc'},

  init(){
    this.pveId=AIs.defaultId();
    this.fillPve();
    for(const id of['eveA','eveB']){
      const sel=$(id);
      for(const a of AIs.list)sel.add(new Option(a.name,a.id));
      sel.value=AIs.defaultId();
    }
    for(const k in this.biomeNames)$('onBiome').add(new Option(this.biomeNames[k],k));
    $('onBiome').value='random';
    $('onMode').onchange=()=>this.syncMode();
    $('mOnline').onclick=()=>{this.err('');this.showOnline();};
    $('onResume').onclick=()=>{const c=Online.lastRoom();if(c)this.joinRoom(c);};
    $('winX').onclick=()=>this.back();   /* nút X: từ màn hình con về menu chính (đang ở phòng chờ thì rời phòng) */
    $('onCreate').onclick=()=>this.createRoom();
    $('onJoin').onclick=()=>this.joinByCode();
    $('onQuick').onclick=()=>this.showQuick();   /* mở cửa sổ danh sách phòng; muốn ghép bừa thì bấm "Vô bừa" trong đó */
    $('qAuto').onclick=()=>this.quickJoin();
    $('qMode').onchange=()=>{$('qBiomeRow').hidden=$('qMode').value==='classic';this.refreshRooms();};
    $('qBiome').onchange=()=>this.refreshRooms();
    for(const k in this.biomeNames)$('qBiome').add(new Option(k==='random'?'Ngẫu nhiên (server bốc)':this.biomeNames[k],k));
    $('qBiome').add(new Option('Tất cả','all'),0);
    $('mRename').onclick=()=>this.rename();
    this.boot();
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
      b.textContent=a.name;if(a.desc){b.dataset.tn=a.name;b.dataset.tip=a.desc;}b.setAttribute('role','radio');
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
    if(!$('scQuick').hidden){this.showOnline();return;}
    if(!$('scBoot').hidden){if(this.booted){$('bName').value=Online.getName();this.show('scHome');}return;}   /* chưa qua màn khởi động thì Esc không bỏ qua được */
    if($('scHome').hidden)this.show('scHome');
  },

  /* ----- Màn khởi động: tải sẵn (three.js, cảnh 3D, âm thanh) trong lúc người chơi nhập tên -----
     Tên lưu ở localStorage (Online.getName/setName), gửi cho server trong hello; để trống thì tự đặt "Khách1234". Cử chỉ ở đây (gõ tên, bấm nút) là lần
     tương tác đầu tiên nên sfx.js/audio.js tự mở khóa âm thanh (xem bindUI / gesture); từ menu trở đi có tiếng ngay mà không cần bấm thêm. */
  booted:false,pendingGo:false,
  boot(){
    const inp=$('bName'),go=$('bootGo'),msg=$('bootMsg'),bar=$('bootBar').firstElementChild;
    inp.value=Online.getName()||Online.randomName();
    this.show('scBoot');
    inp.onkeydown=e=>{if(e.key!=='Enter')return;if(go.disabled){this.pendingGo=true;msg.textContent='Sẽ vào ngay khi tải xong…';}else this.enter();};
    go.onclick=()=>this.enter();
    const prog=(p,t)=>{bar.style.width=p+'%';msg.className='bootmsg';msg.textContent=t;return Loading.paint();};
    const ready=(ok,text)=>{
      bar.style.width='100%';msg.textContent=text;msg.className='bootmsg'+(ok?'':' bad');
      go.disabled=false;
      if(this.pendingGo&&$('scBoot').hidden===false)this.enter();
      else if(!inp.matches(':focus')&&!this.booted)go.focus();
    };
    (async()=>{
      try{
        await prog(4,'Chuẩn bị âm thanh…');
        try{Sfx.prepare();}catch(e){}
        try{if(typeof BgAudio!=='undefined')BgAudio.prepare();}catch(e){}
        await App.prepare(prog);
        ready(true,'Sẵn sàng');
      }catch(e){
        ready(false,'Không tải được thư viện 3D. Kiểm tra mạng, vẫn vào menu được (sẽ thử tải lại khi vào ván).');
      }
    })();
  },
  /* Qua màn khởi động (hoặc xong việc đổi tên): lưu tên, về menu chính, mở kết nối "có mặt" nếu chưa mở */
  enter(){
    const inp=$('bName');let n=Online.setName(inp.value);
    if(!n){n=Online.randomName();Online.setName(n);}
    inp.value=n;this.pendingGo=false;
    const h=$('homeName');h.textContent='Xin chào, ';const b=document.createElement('b');b.textContent=n;h.appendChild(b);
    if(!this.booted){this.booted=true;$('bootGo').textContent='Xong';this.presence=Online.presence(n=>{this.online=n;this.paintOnline();});}
    this.show('scHome');
  },
  rename(){this.show('scBoot');const i=$('bName');i.focus();i.select();},
  /* Số người online (null = chưa biết / server chưa hỗ trợ: ẩn ô) */
  online:null,
  paintOnline(){
    const el=$('onCount'),n=this.online,here=!$('scOnline').hidden||!$('scQuick').hidden;   /* ô nằm ở góc thanh tiêu đề, chỉ hiện ở màn Online và Ghép nhanh */
    el.hidden=n==null||!here;
    if(n!=null)el.querySelector('span').textContent=n+' online';
  },

  /* ----- Ghép nhanh: cửa sổ danh sách phòng công khai đang chờ, tự làm mới mỗi 3 giây -----
     Bộ lọc mặc định theo chế độ đang chọn ở màn Online (bản đồ: tất cả). Bấm một phòng = vào thẳng phòng đó. */
  from:null,rq:0,rtimer:0,
  qErr(t){const e=$('qErr');e.textContent=t||'';e.hidden=!t;},
  showQuick(){
    this.qErr('');this.from=null;
    $('qMode').value=$('onMode').value;$('qBiome').value='all';$('qBiomeRow').hidden=$('qMode').value==='classic';
    $('qList').textContent='';$('qEmpty').hidden=true;
    this.show('scQuick');
    this.refreshRooms();
    clearInterval(this.rtimer);this.rtimer=setInterval(()=>{if(!document.hidden&&!$('scQuick').hidden)this.refreshRooms();},3000);
  },
  stopRooms(){clearInterval(this.rtimer);this.rtimer=0;this.rq++;},
  async refreshRooms(){
    const my=++this.rq;
    try{
      const mode=$('qMode').value,rs=await Online.rooms({mode,biome:mode==='classic'?'all':$('qBiome').value});
      if(my!==this.rq||$('scQuick').hidden)return;
      this.qErr('');this.paintRooms(rs);
    }catch(e){
      if(my!==this.rq||$('scQuick').hidden)return;
      this.qErr(/429/.test(e.message)?'Làm mới quá nhanh, đợi vài giây…':'Không tải được danh sách phòng. Kiểm tra mạng rồi thử lại.');
    }
  },
  ageText(ms){const s=Math.floor(ms/1000);return s<10?'vừa tạo':s<60?s+' giây':s<3600?Math.floor(s/60)+' phút':'hơn 1 giờ';},
  paintRooms(rs){
    const box=$('qList');box.textContent='';
    for(const r of rs){
      const b=document.createElement('button');b.type='button';b.setAttribute('role','listitem');b.dataset.code=r.code;
      const n=document.createElement('span'),a=document.createElement('span'),t=document.createElement('span');
      n.className='rn';n.textContent=r.name||'Người chơi ẩn danh';a.className='ra';a.textContent=this.ageText(r.age);t.className='rt';t.textContent=this.modeText(r.mode,r.biome);
      b.append(n,a,t);
      b.onclick=()=>{this.qErr('');this.joinRoom(r.code,false,'quick');};
      box.appendChild(b);
    }
    $('qEmpty').hidden=rs.length>0;
  },

  /* ----- Đấu online (Classic / Hỗn Loạn): tạo phòng hoặc vào bằng mã ----- */
  conn:null,started:false,quick:false,tries:0,mode:'classic',biome:null,
  /* Lựa chọn trên màn hình online: Hỗn Loạn thì có thêm bản đồ; Classic không gửi biome */
  onlineOpts(){const mode=$('onMode').value==='chaos'?'chaos':'classic';return{mode,biome:mode==='chaos'?$('onBiome').value:undefined};},
  syncMode(){const chaos=$('onMode').value==='chaos';$('onBiomeRow').hidden=!chaos;$('onSub').textContent='Online · '+(chaos?'Hỗn Loạn':'Classic');},
  /* Dòng mô tả phòng ở màn hình chờ: chế độ do SERVER quyết định (vào bằng mã thì lấy theo phòng, không theo lựa chọn của người vào) */
  modeText(mode,biome){return mode==='chaos'?'Hỗn Loạn · '+(this.biomeNames[biome]||this.biomeNames.random):'Classic';},
  showOnline(){this.from=null;const c=Online.lastRoom(),b=$('onResume');b.hidden=!c;if(c)b.textContent='Vào lại '+c;this.show('scOnline');},
  err(t){const e=$('onErr');e.textContent=t||'';e.hidden=!t;},
  async createRoom(){
    this.err('');
    const btn=$('onCreate');btn.disabled=true;
    try{
      const r=await Online.createRoom({...this.onlineOpts(),visibility:$('onVis').value});
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
      const o=this.onlineOpts(),r=await Online.quick(o.mode,o.biome);
      this.joinRoom(r.code,true);
    }catch(e){this.show('scOnline');this.err(/429/.test(e.message)?'Bạn thao tác quá nhanh, đợi vài giây rồi thử lại.':'Không tìm được phòng. Kiểm tra mạng rồi thử lại.');}
    finally{btn.disabled=false;}
  },
  joinRoom(code,quick,from){
    this.leaveRoom();this.quick=!!quick;this.from=from||null;
    const conn=Online.join(code);this.conn=conn;this.started=false;this.mode='classic';this.biome=null;$('waitMode').textContent='';
    for(const t of['welcome','started','applied','state','rejected','over','opponentStatus','full','replaced','error','close'])
      conn.on(t,m=>{if(this.conn===conn)this.onNet(t,m);});   /* tin của kết nối cũ (đã rời) thì bỏ */
    $('waitCode').textContent=code;$('waitMsg').textContent='Đang kết nối…';
    this.show('scWait');
  },
  leaveRoom(){if(this.conn){const c=this.conn;this.conn=null;c.close();}},
  cancelWait(){const q=this.from==='quick';this.leaveRoom();if(q)this.showQuick();else this.showOnline();},
  /* Lỗi lúc vào phòng: vào từ danh sách thì quay lại danh sách (phòng vừa đầy là chuyện thường), còn lại về màn Online */
  fail(msg){
    if(/hết hạn|không tồn tại/.test(msg))Online.setLastRoom(null);
    const q=this.from==='quick';this.leaveRoom();
    if(q){this.showQuick();this.qErr(msg);}else{this.showOnline();this.err(msg);}
  },
  /* Tin từ server: trước khi ván bắt đầu thì lo màn hình chờ, sau đó chuyển hết cho App */
  onNet(t,m){
    if(t==='welcome'&&!this.started){
      this.mode=m.mode==='chaos'?'chaos':'classic';this.biome=m.biome||null;$('waitMode').textContent=this.modeText(this.mode,this.biome);
      $('waitMsg').textContent=m.started?'Đang vào…':m.players<2?(this.quick?'Đang tìm…':'Chờ đối thủ · gửi mã cho bạn'):'Đủ người · chia phe…';
      return;
    }
    if((t==='started'||t==='state')&&!this.started){           /* started: ván mới; state: vào lại ván đang chơi (tải lại trang / bấm "Vào lại phòng") */
      this.started=true;
      this.conn.autoReconnect(true);Online.setLastRoom(this.conn.code);
      App.start({net:{conn:this.conn,you:m.you,oppName:m.opp||'',snap:m.snapshot,turnLeft:m.turnLeft,state:t==='state'?m:null,mode:this.mode,map:m.map||null},delay:0,analysis:{on:false,lock:true}});   /* online: tắt và khóa đánh giá */
      return;
    }
    if(!this.started){
      if(t==='full')this.fail('Phòng đã đủ người.');
      else if(t==='error'&&m.reason==='noroom'&&this.quick&&this.tries<2){this.tries++;this.leaveRoom();this.quickJoin(true);}   /* phòng trong danh sách vừa hết hạn: xin phòng khác */
      else if(t==='error')this.fail(m.reason==='noroom'?'Mã phòng không tồn tại hoặc đã hết hạn.':m.reason==='version'?'Game vừa được cập nhật. Hãy tải lại trang (Ctrl+F5) rồi thử lại.':'Lỗi kết nối. Thử lại nhé.');
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
    $('winX').hidden=name==='scHome'||name==='scBoot';
    if(name!=='scQuick')this.stopRooms();
    this.paintOnline();
    const w=document.querySelector('#menu .win');w.classList.remove('pop');void w.offsetWidth;w.classList.add('pop');
    UI.el.ld.hidden=true;UI.el.menu.hidden=false;Sfx.play('ui:open',{v:.6});
  }
};

