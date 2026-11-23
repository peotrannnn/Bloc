'use strict';
/* [APP] Điều phối ván cờ + vòng lặp vẽ. File này nạp cuối cùng và khởi động mọi thứ. */
const App={
  ready:false,timer:0,aiTok:0,cfg:null,rw:0,rh:0,
  pend:null,   /* chờ phím thứ hai để chọn ô chéo: {dr,dc,t} = hướng tới quân đối thủ + thời điểm bấm */

  /* ----- Điều phối ván cờ ----- */
  newGame(){
    clearTimeout(this.timer);
    /* Chọn phe: cfg.swap thì bốc thăm ngẫu nhiên, người chơi có thể cầm Đen (máy đi trước) */
    const net=this.cfg.net,a=net?[null,null]:this.cfg.ai;   /* online: cfg.net={conn,you,snap}; phe do server bốc thăm nên không swap */
    S.ai=!net&&this.cfg.swap&&Math.random()<.5?[a[1],a[0]]:a.slice();
    S.me=net?net.you:S.ai.indexOf(null);
    S.view=S.me>=0?S.me:(Math.random()<.5?0:1);   /* người chơi: nhìn từ phe mình; máy đấu máy: ngẫu nhiên */
    S.pl=[{r:N-1,c:HALF},{r:0,c:HALF}];
    S.ws={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};
    S.left=[CFG.WALLS,CFG.WALLS];
    S.turn=0;S.mode='move';S.orient='h';S.over=false;S.draw=false;S.hov=null;S.ply=0;S.paused=false;
    S.winner=-1;S.net=net?{conn:net.conn,wait:false,oppOnline:true,lost:null}:null;
    if(net)this.loadSnap(net.snap);
    Walls.clear();Badges.clear();Review.reset();Fireworks.stop();Pawns.reset();Camera.snapHome();Stage.invalidate(true);
    this.refresh();this.schedule();
    if(net){this.netReady=true;this.netFlush();}   /* xử lý các tin của server đến trong lúc đang tải three.js */
  },

  putWall(o,r,c){setW(o,r,c,1);S.left[S.turn]--;Walls.add(o,r,c,S.turn);},

  /* Áp một nước đi vào bàn cờ rồi chuyển lượt. a = {move:[r,c]} hoặc {wall:{o,r,c}} */
  play(a){
    if(a.wall)this.putWall(a.wall.o,a.wall.r,a.wall.c);else S.pl[S.turn]={r:a.move[0],c:a.move[1]};
    this.endTurn();
  },
  /* Người chơi vừa chọn một nước. Với máy: áp ngay. Online: chỉ GỬI lên server; bàn cờ chỉ đổi khi server phát lại 'applied' (server là trọng tài) */
  commit(a){
    if(S.net){S.net.wait=true;S.net.conn.action(S.ply,a);this.refresh();return;}
    this.play(a);
  },

  /* ----- Đấu online: nhận tin từ server (Menu.onNet chuyển tới đây khi ván đã bắt đầu) ----- */
  netReady:false,netQ:[],
  loadSnap(snap){   /* chỉ lấy phần cần thiết; ván mới nên bàn cờ còn trống */
    const st=R.fromSnapshot(snap);
    S.pl=st.pl;S.left=st.left;S.turn=st.turn;S.ply=st.ply;
  },
  netFlush(){const q=this.netQ;this.netQ=[];for(const [t,m] of q)this.netIn(t,m);},
  netLost(msg){if(!S.net||S.over)return;S.net.lost=msg;S.over=true;S.winner=-1;this.refresh();},
  netIn(t,m){
    if(!this.netReady){this.netQ.push([t,m]);return;}
    if(!S.net)return;
    switch(t){
      case'applied':
        if(S.over)return;
        if(m.seq!==S.ply){this.netLost('Mất đồng bộ với server. Hãy thoát và vào lại phòng.');return;}
        S.net.wait=false;this.play(m.action);return;
      case'rejected':
        S.net.wait=false;
        if(m.reason==='seq'||m.reason==='turn')this.netLost('Mất đồng bộ với server. Hãy thoát và vào lại phòng.');
        else this.refresh();
        return;
      case'over':   /* thắng bằng đích đã tự tính ở endTurn; đây là các trường hợp khác (đối thủ đầu hàng...) */
        if(S.over)return;
        S.over=true;S.winner=m.winner;
        if(m.winner>=0){Fireworks.play(S.pl[m.winner]);Pawns.win(m.winner);Camera.follow(m.winner,true);}
        this.refresh();return;
      case'opponentStatus':S.net.oppOnline=m.online;UI.render();return;
      case'replaced':this.netLost('Phòng này vừa được mở ở tab khác.');return;
      case'close':if(!S.over)this.netLost('Mất kết nối với server.');return;
    }
  },

  endTurn(){
    /* chấm nhãn nước vừa đi (lúc này S là thế SAU nước đi, chưa đổi lượt); đang tắt đánh giá thì bỏ qua, đỡ tốn máy */
    if(S.analysis){const rv=Review.judge();if(rv)Badges.show(rv);}else Review.skip();
    S.ply++;
    if(S.pl[S.turn].r===goalRow(S.turn)){S.over=true;S.winner=S.turn;Fireworks.play(S.pl[S.turn]);Pawns.win(S.turn);Camera.follow(S.turn,true);this.refresh();return;}   /* thắng: pháo bông + camera khóa theo quân thắng */
    if(allAI()&&S.ply>=CFG.MAX_PLY){S.over=S.draw=true;this.refresh();return;}
    S.turn=1-S.turn;S.mode='move';S.hov=null;Review.snap();this.refresh();this.schedule();
  },

  setMode(m){
    if(!humanTurn())return;if(m==='wall'&&S.left[S.turn]===0)return;
    S.mode=m;
    /* Vào chế độ tường: tường "ma" nằm ở khe gần con trỏ nhất; chưa có chuột trên bàn thì ở giữa bàn */
    if(m==='wall')S.hov=Input.slotAtPointer()||S.hov||{r:(WN-1)>>1,c:(WN-1)>>1};
    this.refresh();
  },
  rotateWall(){if(S.mode==='wall'&&humanTurn()){S.orient=S.orient==='h'?'v':'h';this.refresh();}},

  /* ----- Máy đi ----- */
  /* aiTok tăng mỗi lần schedule()/rời ván: kết quả AI trả về muộn (ván mới, tạm dừng, về menu) thì bị bỏ */
  schedule(){
    clearTimeout(this.timer);this.aiTok++;
    if(isAI(S.turn)&&!S.paused&&!S.over){
      const ai=AIs.get(S.ai[S.turn]);
      if(ai.worker)AIWorker.decide(ai.id,S.turn);   /* AI nặng: bắt đầu nghĩ NGAY ở luồng nền, song song với khoảng chờ S.delay (không cộng dồn) */
      this.timer=setTimeout(()=>this.aiStep(),S.delay);
    }
  },
  async aiStep(){
    if(!isAI(S.turn)||S.paused||S.over)return;
    const p=S.turn,tok=this.aiTok,ai=AIs.get(S.ai[p]);
    let a=ai.worker?await AIWorker.decide(ai.id,p):null;
    if(tok!==this.aiTok)return;                   /* trong lúc chờ đã đổi ván / tạm dừng / về menu */
    if(!a)a=ai.decide(p);                         /* AI nhẹ, hoặc worker không dùng được: tính ngay trên luồng chính */
    if(a.wall)this.putWall(a.wall.o,a.wall.r,a.wall.c);else S.pl[S.turn]={r:a.move[0],c:a.move[1]};
    this.endTurn();
  },

  /* ----- Đồng bộ giao diện và cảnh 3D với trạng thái ----- */
  refresh(){
    this.pend=null;
    UI.render();UI.renderBar();
    Stage.setHints(humanTurn()&&S.mode==='move'?moves(S.turn):[],S.pl[S.turn]);
    this.updateLabels();
    this.updateGhost();
  },
  updateGhost(){
    if(humanTurn()&&S.mode==='wall'&&S.hov){
      const ok=canWall(S.orient,S.hov.r,S.hov.c);
      Walls.showGhost(S.orient,S.hov.r,S.hov.c,ok?CFG.BOARD.ghostOk:CFG.BOARD.ghostBad);
    }else Walls.hideGhost();
    Stage.invalidate();
  },

  /* ----- Kích thước cửa sổ ----- */
  onResize(){
    if(!Stage.ren)return;
    const h=UI.el.host,w=h.clientWidth,ht=h.clientHeight;if(!w||!ht)return;
    if(w===this.rw&&ht===this.rh)return;   /* kích thước không đổi thì khỏi đặt lại canvas (tránh nháy) */
    this.rw=w;this.rh=ht;
    Stage.ren.setSize(w,ht);Camera.resize(w,ht);Stage.invalidate();
  },

  /* ----- Bắt đầu ván từ menu. cfg = {ai:[idTrắng|null, idĐen|null], delay:ms} (null = người chơi) ----- */
  async start(cfg){
    if(cfg.net){this.netReady=false;this.netQ=[];}
    UI.el.ld.hidden=false;UI.lockMenu(true);
    try{
      if(!this.ready){
        UI.progress(10,'Đang tải three.js…');await loadThree();
        UI.progress(50,'Dựng bàn cờ…');await nextFrame();Stage.init(UI.el.host);Walls.init(Stage.scene);Fireworks.init(Stage.scene);
        UI.progress(75,'Tạo quân cờ…');await nextFrame();Pawns.build(Stage.scene);Badges.init(Stage.scene);Input.init(Stage.ren.domElement);
        this.ready=true;
      }
      UI.progress(100,'Sẵn sàng');
    }catch(e){
      UI.progress(0,'Không tải được three.js. Kiểm tra mạng rồi thử lại.');
      UI.lockMenu(false);return;
    }
    this.cfg=cfg;S.delay=cfg.delay;
    /* Đánh giá (thanh khả năng thắng + nhãn): cfg.analysis = {on: mặc định, lock: true thì không cho bật/tắt}.
       Chế độ không khóa thì nhớ lựa chọn lần trước của người chơi; chế độ khóa luôn theo mặc định của nó. */
    const an=cfg.analysis||{},pref=this.analysisPref();
    S.analysisLock=!!an.lock;
    S.analysis=S.analysisLock?!!an.on:(pref!==null?pref:an.on!==false);
    UI.el.menu.hidden=true;UI.lockMenu(false);
    this.onResize();this.newGame();
  },

  cycleView(){Camera.cycle(viewOrder());UI.render();},

  /* ----- Bật/tắt đánh giá (phím T) ----- */
  analysisPref(){try{const v=localStorage.getItem('bloc.analysis');return v===null?null:v==='1';}catch(e){return null;}},
  setAnalysis(on){
    if(S.analysisLock||S.analysis===on)return;
    S.analysis=on;
    try{localStorage.setItem('bloc.analysis',on?'1':'0');}catch(e){}
    if(on){Review.skip();Review.snap();}else Badges.clear();   /* bật lại giữa ván: chấm tiếp từ nước kế tiếp; tắt: xóa nhãn đang hiện */
    this.refresh();
  },
  toggleAnalysis(){this.setAnalysis(!S.analysis);},
  toMenu(){
    if(S.net){   /* rời ván online: đang chơi thì tính là đầu hàng */
      if(!S.over&&!confirm('Rời ván online sẽ bị xử thua. Thoát?'))return;
      if(!S.over)S.net.conn.resign();
      Menu.leaveRoom();S.net=null;
    }
    clearTimeout(this.timer);this.aiTok++;Menu.show('scHome');
  },

  /* ----- Phím tắt (dùng ev.code nên đúng cả khi bật bộ gõ tiếng Việt) -----
     Q đi quân · W đặt tường · R xoay tường · E đổi góc nhìn · T bật/tắt đánh giá · P ván mới · Space tạm dừng (máy đấu máy) · Esc về menu */
  onKey(ev){
    if(ev.repeat||ev.ctrlKey||ev.metaKey||ev.altKey)return;
    const k=ev.code;
    if(!UI.el.menu.hidden){if(k==='Escape')Menu.back();return;}   /* đang ở menu: chỉ Esc có tác dụng */
    if(k==='KeyQ')this.setMode('move');
    else if(k==='KeyW')this.setMode('wall');
    else if(k==='KeyR')this.rotateWall();
    else if(k==='KeyE')this.cycleView();
    else if(k==='KeyT')this.toggleAnalysis();
    else if(k==='KeyP'){if(!S.net)this.newGame();}   /* online: đấu lại sẽ làm ở Giai đoạn 5 */
    else if(k==='Space'){if(!allAI()||S.over)return;S.paused=!S.paused;this.refresh();this.schedule();}   /* máy đấu máy: tạm dừng / tiếp tục */
    else if(k==='Escape')this.toMenu();
    else if(k.startsWith('Arrow')){if(!(S.mode==='wall'?this.arrowWall(k):this.arrowMove(k)))return;}
    else if(k==='Enter'||k==='NumpadEnter'){if(!this.confirmWall())return;}
    else return;
    ev.preventDefault();
  },

  /* Hướng [dr,dc] trên bàn ứng với phím mũi tên k, tính theo hướng nhìn của camera:
     ↑ là hướng đi vào trong bàn trên màn hình nên đúng cả khi bạn cầm Đen hoặc đã xoay camera. */
  arrowDir(k){
    const y=Camera.ty,fx=-Math.sin(y),fz=-Math.cos(y),rx=Math.cos(y),rz=-Math.sin(y);   /* "lên" và "phải" của màn hình trên mặt bàn (x,z) */
    const v=k==='ArrowUp'?[fx,fz]:k==='ArrowDown'?[-fx,-fz]:k==='ArrowRight'?[rx,rz]:[-rx,-rz];
    return Math.abs(v[0])>Math.abs(v[1])?[0,Math.sign(v[0])]:[Math.sign(v[1]),0];   /* x ứng với cột, z ứng với hàng */
  },

  /* Tên phím (Up/Down/Left/Right) ứng với hướng [dr,dc] trên bàn, theo góc nhìn hiện tại của camera */
  keyName(dr,dc){
    for(const k of['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){const d=this.arrowDir(k);if(d[0]===dr&&d[1]===dc)return k.slice(5);}
    return null;
  },

  /* Nhãn chữ cạnh mũi tên ở các nước đặc biệt (nhảy thẳng qua đối thủ, nhảy chéo): cho biết phải bấm phím nào.
     Phụ thuộc góc nhìn nên được tính lại khi camera xoay sang hướng khác (xem vòng lặp vẽ). */
  updateLabels(){
    const out=[];
    if(S.pl&&humanTurn()&&S.mode==='move'){
      const a=S.pl[S.turn],o=S.pl[1-S.turn],dr=o.r-a.r,dc=o.c-a.c;
      if(Math.abs(dr)+Math.abs(dc)===1){   /* đối thủ đứng sát mình */
        const legal=moves(S.turn),fwd=this.keyName(dr,dc);
        if(legal.some(m=>m[0]===o.r+dr&&m[1]===o.c+dc))out.push({r:o.r+dr,c:o.c+dc,t:fwd});
        else{
          const diag=legal.filter(m=>Math.abs(m[0]-a.r)===1&&Math.abs(m[1]-a.c)===1);
          for(const m of diag){
            const side=this.keyName(m[0]-o.r,m[1]-o.c);
            out.push({r:m[0],c:m[1],t:this.pend?side:diag.length===1?fwd:fwd+' + '+side});   /* đang chờ phím thứ hai thì chỉ hiện phím còn lại */
          }
        }
      }
    }
    this.sig=this.arrowDir('ArrowUp')+'|'+this.arrowDir('ArrowRight');
    Stage.setLabels(out);
  },

  /* Chế độ tường: mũi tên dời tường "ma" sang khe kế bên (chuột di chuyển sang khe khác thì chuột được ưu tiên) */
  arrowWall(k){
    if(!humanTurn()||S.mode!=='wall')return false;
    const [dr,dc]=this.arrowDir(k),h=S.hov||Input.slotAtPointer()||{r:(WN-1)>>1,c:(WN-1)>>1};
    S.hov={r:wallIdx(h.r+dr),c:wallIdx(h.c+dc)};
    this.updateGhost();
    return true;
  },

  /* Enter: đặt tường "ma" xuống nếu hợp lệ (khi tường đỏ thì không làm gì) */
  confirmWall(){
    if(!humanTurn()||S.mode!=='wall'||!S.hov)return false;
    if(canWall(S.orient,S.hov.r,S.hov.c)){const w={o:S.orient,r:S.hov.r,c:S.hov.c};S.hov=null;this.commit({wall:w});}
    return true;
  },

  /* Phím mũi tên ở chế độ đi quân: đi một ô theo hướng nhìn trên MÀN HÌNH (↑ là hướng đi vào trong bàn
     theo camera hiện tại, nên đúng cả khi bạn cầm Đen hoặc đã xoay camera). Thứ tự xử lý:
       1. Ô kế bên đi được → đi.   2. Đối thủ đứng ngay đó và nhảy thẳng được → nhảy qua.
       3. Đối thủ bị tường chắn sau lưng → chỉ còn ô chéo (hai bên đối thủ):
          · bấm mũi tên hướng TỚI đối thủ: có một ô chéo thì đi luôn; có hai thì chờ bấm thêm ← / → để chọn bên;
          · hoặc bấm thẳng mũi tên sang bên đó nếu ô kế bên mình không đi được (bị tường chắn). */
  arrowMove(k){
    if(!humanTurn()||S.mode!=='move')return false;
    const [dr,dc]=this.arrowDir(k);
    const a=S.pl[S.turn],o=S.pl[1-S.turn],legal=moves(S.turn),has=(r,c)=>legal.some(m=>m[0]===r&&m[1]===c);
    const go=(r,c)=>{this.commit({move:[r,c]});return true;};
    /* Đang chờ phím chọn bên cho nước chéo (hết hạn sau 2,5 giây) */
    const pd=this.pend;this.pend=null;
    if(pd){Stage.setHints(legal,a);this.updateLabels();}   /* bỏ làm nổi ô chéo (nếu đi được thì ván đã chuyển lượt, refresh lo tiếp) */
    if(pd&&performance.now()-pd.t<2500&&dr*pd.dr+dc*pd.dc===0){
      const r=o.r+dr,c=o.c+dc;if(has(r,c))return go(r,c);
    }
    let r=a.r+dr,c=a.c+dc;
    if(has(r,c))return go(r,c);                        /* 1. đi thường */
    if(has(a.r+2*dr,a.c+2*dc))return go(a.r+2*dr,a.c+2*dc);   /* 2. nhảy thẳng qua đối thủ */
    /* 3. các ô chéo đi được: nằm ngay cạnh đối thủ đang đứng sát mình */
    const diag=legal.filter(m=>Math.abs(m[0]-a.r)===1&&Math.abs(m[1]-a.c)===1);
    if(!diag.length)return true;
    if(o.r===a.r+dr&&o.c===a.c+dc){                    /* bấm hướng tới đối thủ */
      if(diag.length===1)return go(diag[0][0],diag[0][1]);
      this.pend={dr,dc,t:performance.now()};
      clearTimeout(this.pendTimer);this.pendTimer=setTimeout(()=>{if(this.pend)this.refresh();},2500);   /* hết hạn: trả hint/nhãn về như cũ */
      Stage.setHints(legal.map(m=>[m[0],m[1],diag.includes(m)?1:.3]),a);   /* làm nổi hai ô chéo cho dễ chọn */
      this.updateLabels();
      return true;
    }
    const d=diag.find(m=>(dr!==0&&m[0]-a.r===dr)||(dc!==0&&m[1]-a.c===dc));   /* bấm sang bên có ô chéo mà ô kế bên bị chắn */
    if(d)return go(d[0],d[1]);
    return true;
  },

  /* ----- Gắn sự kiện ----- */
  bind(){
    const e=UI.el;
    e.bMove.onclick=()=>this.setMode('move');
    e.bWall.onclick=()=>this.setMode('wall');
    e.bRot.onclick=()=>this.rotateWall();
    e.bPause.onclick=()=>{S.paused=!S.paused;this.refresh();this.schedule();};
    e.bReset.onclick=()=>this.ready&&!S.net&&this.newGame();
    e.bView.onclick=()=>this.cycleView();
    e.bEval.onclick=()=>this.toggleAnalysis();
    e.bMenu.onclick=()=>this.toMenu();
    addEventListener('keydown',ev=>this.onKey(ev));
    addEventListener('keyup',ev=>{if(ev.code==='Space'&&UI.el.menu.hidden&&allAI())ev.preventDefault();});   /* nút đang focus không tự "click" lần nữa khi nhả Space */
    addEventListener('resize',()=>this.onResize());
    new ResizeObserver(()=>this.onResize()).observe(e.host);
  },

  /* ----- Vòng lặp: chỉ vẽ khi có thay đổi hoặc vật đang chuyển động ----- */
  frame:(function(){
    let last=0;
    return function loop(now){
      requestAnimationFrame(loop);
      const dt=Math.min(.05,(now-last)/1000||.016);last=now;
      if(!App.ready||!Stage.need||!UI.el.menu.hidden)return;
      const cb=Camera.update(dt),pb=Pawns.update(dt),wb=Walls.update(dt),hb=Stage.updateHints(dt),fb=Fireworks.update(dt),bb=Badges.update(dt),gb=Walls.pulse(dt);
      if(cb||pb||wb||hb||fb||bb||gb)Stage.need=3;
      if(cb&&App.sig!==App.arrowDir('ArrowUp')+'|'+App.arrowDir('ArrowRight'))App.updateLabels();   /* camera xoay sang hướng khác: đổi tên phím trên nhãn */
      if(pb||wb)Stage.shadowDirty=true;
      Stage.need--;Stage.render();
    };
  })()
};

UI.init();Menu.init();App.bind();requestAnimationFrame(App.frame);

