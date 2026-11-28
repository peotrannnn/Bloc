'use strict';
/* [APP] Điều phối ván cờ + vòng lặp vẽ. File này nạp cuối cùng và khởi động mọi thứ. */
/* [PERF] Bảng đo lag (phím F): fps thật lúc đang vẽ, thời gian CPU mỗi khung, và độ trễ mạng (gửi nước đi → server trả lời).
   Cách đọc: fps thấp mà CPU/khung nhỏ → nghẽn ở GPU (đồ họa); CPU/khung lớn → nghẽn ở JS; fps tốt mà "mạng" cao (>300ms) → lag do mạng/server. */
const Perf={
  on:false,el:null,sent:0,rtt:0,n:0,t0:0,cpu:0,fps:0,cpuAvg:0,
  toggle(){
    this.on=!this.on;
    if(!this.el){const e=this.el=document.createElement('div');e.style.cssText='position:fixed;left:6px;bottom:44px;z-index:99;font:12px/1.4 monospace;color:#0f0;background:rgba(0,0,0,.6);padding:4px 7px;border-radius:4px;pointer-events:none;white-space:pre';document.body.appendChild(e);}
    this.el.hidden=!this.on;this.n=0;this.cpu=0;this.t0=0;
  },
  /* Ghi thời gian một bước nặng (console + bảng F). slow=true: chỉ ghi khi bất thường (khung > 250ms) */
  log:[],
  note(what,ms,slow){
    this.log.push(what+' '+ms.toFixed(0)+'ms');if(this.log.length>5)this.log.shift();
    if(slow||ms>150)console.warn('[bloc] '+what+': '+ms.toFixed(0)+' ms');
  },
  tick(now,cpu){
    if(!this.on)return;
    if(!this.t0)this.t0=now;
    this.n++;this.cpu+=cpu;
    if(now-this.t0>=500){
      this.fps=this.n*1000/(now-this.t0);this.cpuAvg=this.cpu/this.n;this.n=0;this.cpu=0;this.t0=now;
      this.el.textContent='vẽ: '+this.fps.toFixed(0)+' fps · CPU '+this.cpuAvg.toFixed(1)+' ms/khung\nmạng: '+(this.rtt?this.rtt.toFixed(0)+' ms':'—')+(S.net?'':' (offline)')+'\nđộ phân giải x'+(Stage.ren?Stage.ren.getPixelRatio().toFixed(2):'?')+(this.log.length?'\n'+this.log.join(' · '):'');
    }
  }
};

const App={
  ready:false,busy:false,timer:0,aiTok:0,cfg:null,rw:0,rh:0,   /* busy: màn hình tải đang chạy → vòng lặp không vẽ, phím/nút không có tác dụng */
  pend:null,   /* chờ phím thứ hai để chọn ô chéo: {dr,dc,t} = hướng tới quân đối thủ + thời điểm bấm */

  /* ----- Điều phối ván cờ ----- */
  /* own=true: tự lo màn hình tải (đấu lại trong phòng; ván offline thì không cần vì không có bản đồ nặng). own=false: do App.start lo (vừa vào phòng).
     Chạy ĐỒNG BỘ hoàn toàn khi không hiện màn hình tải (offline), nên các chỗ gọi cũ không cần await. */
  async newGame(own){
    const net0=this.cfg.net,show=own?!!net0:true;
    if(own)this.busy=true;
    if(net0)this.netReady=false;   /* tin của server đến trong lúc đang dựng ván thì xếp hàng (netQ), dựng xong mới xử lý */
    const T0=performance.now(),P=own?[8,30,62,92]:[60,72,86,96];
    try{
      if(own&&show){Loading.show('Đấu lại','Chuẩn bị ván mới…',P[0]);await Loading.paint();}
      this.newGameState();
      if(show)await Loading.step(P[1],'Dựng bản đồ…');
      const T1=performance.now();
      this.newGameBuild();
      Perf.note('dựng bản đồ',performance.now()-T1);
      if(show){
        await Loading.step(P[2],'Biên dịch shader…');
        const T2=performance.now();Stage.prewarm();Perf.note('biên dịch shader',performance.now()-T2);
        await Loading.step(P[3],'Sẵn sàng');
      }
      this.newGameFinish();
    }finally{
      Perf.note('ván mới (tổng)',performance.now()-T0);
      if(own){this.busy=false;if(show)Loading.hide(450);}
      if(net0){this.netReady=true;this.netFlush();}   /* xử lý các tin của server đến trong lúc đang tải */
    }
  },
  /* Bước 1: đặt lại toàn bộ trạng thái ván (nhẹ) */
  newGameState(){
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
    S.winner=-1;S.net=net?{conn:net.conn,wait:false,offline:false,oppOnline:true,lost:null,reason:null,deadline:net.turnLeft?Date.now()+net.turnLeft:0,rematch:{me:false,opp:false}}:null;
    /* Hỗn Loạn: reset mọi trường địa hình trước (PvE/EvE/Classic luôn về trạng thái trống), rồi nạp từ snapshot của server */
    S.animLock=false;S.event=null;S.bplan=BlockerPlan.init(CFG.BLOCKER.plan);S.chaos=!!net&&net.mode==='chaos';S.terr=null;S.spawn=null;S.stuck=null;S.sunk=null;S.blocker=-1;S.hid=[false,false];S.last=[null,null];S.mapInfo=null;
    S.inv=null;S.bonus=null;S.wo=null;S.dead=null;S.use=null;S.tgt=null;
    if(net)this.loadSnap(net.snap);
  },
  /* Bước 2: dựng địa hình 3D + dọn cảnh (nặng nhất) */
  newGameBuild(){
    const net=this.cfg.net;
    Sfx.stopAll();this.buildTerrain(net&&net.map);
    Walls.clear();Badges.clear();Marks.clear();Review.reset();Fireworks.stop();Pawns.reset();if(typeof Blocker!=='undefined')Blocker.clear();Camera.snapHome();Stage.invalidate(true);
    this.syncTerrain(true);   /* sau khi quân về chỗ: dấu cổng/bẫy và tấm bẫy về trạng thái đầu ván NGAY (không nhún, không bóng cũ) */
  },
  /* Bước 3: khởi động ván (sau khi cảnh đã làm nóng) */
  newGameFinish(){
    const net=this.cfg.net;
    this.refresh();this.schedule();
    if(net&&net.state)this.resync(net.state);          /* vào lại ván đang chơi (tải lại trang): dựng bàn cờ từ trạng thái server */
    clearInterval(this.tick);
    if(net)this.tick=setInterval(()=>{if(S.net&&!S.over&&S.net.deadline)UI.renderStatus();},1000);   /* đếm ngược đồng hồ lượt trên thanh trạng thái */
    if(net&&S.net)S.net.deadline=!S.over&&net.turnLeft?Date.now()+net.turnLeft:0;   /* đồng hồ lượt tính lại từ lúc dựng xong, không trừ thời gian tải */
    if(typeof BgAudio!=='undefined')BgAudio.start();   /* nhạc nền: ngắt quãng, tự chờ vài giây cho game dựng xong */
  },

  putWall(o,r,c){setW(o,r,c,1);S.left[S.turn]--;Walls.add(o,r,c,S.turn);},

  /* Áp một nước đi vào bàn cờ rồi chuyển lượt. a = {move:[r,c]} hoặc {wall:{o,r,c}} */
  play(a){
    if(a.wall)this.putWall(a.wall.o,a.wall.r,a.wall.c);else S.pl[S.turn]={r:a.move[0],c:a.move[1]};
    this.endTurn();
  },
  /* Người chơi vừa chọn một nước. Với máy: áp ngay. Online: chỉ GỬI lên server; bàn cờ chỉ đổi khi server phát lại 'applied' (server là trọng tài) */
  commit(a){
    if(S.net){S.net.wait=true;S.net.note='';Perf.sent=performance.now();S.net.conn.action(S.ply,a);this.refresh();return;}
    this.play(a);
  },

  /* Đang chơi một ván có thể đầu hàng? (người vs người online, hoặc người vs máy; máy đấu máy thì không). Online đang mất mạng: chưa gửi được nên chưa cho. */
  canResign(){return this.ready&&!S.over&&!allAI()&&(!S.net||(!S.net.lost&&!S.net.offline));},
  askResign(){
    UI.ask({title:'Đầu hàng',msg:'Bạn sẽ thua ván này.'+(S.net?' Vẫn ở lại phòng, có thể đấu lại.':''),yes:'Đầu hàng',danger:true,check:()=>this.canResign()},()=>this.doResign());
  },
  doResign(){
    if(!this.canResign())return;
    if(S.net){S.net.note='';S.net.conn.resign();return;}   /* server tính thua và phát 'over' cho cả hai (xem netIn); mình vẫn ở trong phòng */
    clearTimeout(this.timer);this.aiTok++;
    S.over=true;S.winner=1-S.me;Fireworks.play(S.pl[S.winner]);Pawns.win(S.winner);Camera.follow(S.winner,true);this.refresh();
  },

  /* Nút P: đang chơi → hỏi đầu hàng. Ván xong: "Ván mới" (offline) / "Đấu lại" (online, gửi một phiếu; đủ phiếu hai bên thì server bắt đầu ván mới) */
  resetOrRematch(){
    if(!this.ready||this.busy)return;
    if(this.canResign()){this.askResign();return;}
    if(!S.net){if(S.over||allAI())this.newGame(true);return;}
    if(S.over&&!S.net.lost&&!S.net.rematch.me){S.net.rematch.me=true;S.net.conn.rematch();UI.render();}
  },

  /* ----- Đấu online: nhận tin từ server (Menu.onNet chuyển tới đây khi ván đã bắt đầu) ----- */
  netReady:false,netQ:[],
  /* Đọc snapshot của server vào S (không đụng tới tường). Hỗn Loạn: pl[đối thủ] có thể là null (bị cỏ che) → giữ vị trí thấy lần cuối (keep) hoặc ô xuất phát,
     đánh dấu S.hid. Trả về st để resync lấy thêm tường. */
  loadSnap(snap,keep){
    const hid=snap.pl.map(p=>!p);
    const sn=hid.some(Boolean)?Object.assign({},snap,{pl:snap.pl.map((p,i)=>p||(keep&&keep[i])||snap.spawn[i])}):snap;
    const st=R.fromSnapshot(sn);
    S.pl=st.pl;S.left=st.left;S.turn=st.turn;S.ply=st.ply;S.hid=hid;
    if(st.terr){S.terr=st.terr;S.spawn=st.spawn;S.stuck=st.stuck;S.sunk=st.sunk;S.blocker=st.blocker;S.inv=st.inv;S.bonus=st.bonus;S.wo=st.wo;S.dead=st.dead;}
    return st;
  },
  /* Dựng địa hình 3D cho ván (Classic: xóa địa hình). map = {biome,seed} do server gửi; 'balanced' dùng bảng màu meadow. */
  buildTerrain(map){
    if(S.chaos&&S.terr&&map){
      S.mapInfo=map;
      if(typeof Terrain!=='undefined')Terrain.setBiome(map.biome==='balanced'?'meadow':map.biome,true);   /* defer: ngay dưới có Stage.setTerrain dựng bản đồ mới, khỏi dựng lại bản cũ */
      Stage.setTerrain(S.terr,map.seed);UI.theme(map.biome);
      Sfx.setBiome(map.biome==='balanced'?'meadow':map.biome);
      if(typeof Weather!=='undefined')Weather.set(map.biome,S.terr);   /* thời tiết + tông ánh sáng theo biome (thuần hình ảnh) */
    }else{Stage.setTerrain(null);UI.theme(null);Sfx.setBiome(null);if(typeof Weather!=='undefined')Weather.set(null);}
    this.syncTerrain();
  },
  /* Cỏ rạp quanh quân nhìn thấy (quân bị che thì KHÔNG rạp, kẻo lộ chỗ). Cổng/bẫy: instant=true thì cập nhật dấu hiệu ngay (đầu ván, dựng lại ván);
     false (sau một nước đi) thì CHỜ hoạt ảnh của hai quân xong mới đổi (vòng lặp gọi syncMarks khi Pawns.quiet()), kẻo dấu nhảy trước khi quân kịp tới ô. */
  syncTerrain(instant){
    if(typeof Terrain==='undefined')return;
    this.syncGrass();
    if(instant!==false&&typeof Blocker!=='undefined')Blocker.sync();   /* người chặn đường đứng đúng ô S.blocker (hoặc ẩn) */
    if(instant!==false){if(S.chaos&&S.terr)Terrain.syncChests(S.terr);this.markWait=false;this.syncMarks(true);}else this.markWait=true;   /* dựng lại: rương đã mở biến mất ngay, không hoạt ảnh */
  },
  /* Cỏ rạp quanh quân. Bán kính rạp nhân theo hệ số gk của quân (Pawns.update đưa gk tiến dần 1 ↔ 0 khi quân hiện / chui vào cỏ), nên cỏ rạp xuống / đứng dậy
     từ từ thay vì bật cái "tách". Quân bị che (gk về 0) thì KHÔNG rạp, kẻo lộ chỗ. */
  syncGrass(){
    if(typeof Terrain==='undefined')return;
    const list=[];
    if(S.chaos&&S.pl)for(let i=0;i<2;i++){
      const s=typeof Pawns!=='undefined'&&Pawns.list&&Pawns.list[i],k=s&&s.gk!==undefined?s.gk:(S.hid[i]?0:1);
      if(k>.001&&S.pl[i])list.push([cellX(S.pl[i].c),cellZ(S.pl[i].r),.38*k]);
    }
    Terrain.setPieces(list);
  },
  /* Các ô cổng/bẫy của ván và cổng nào đang bị chặn (cổng kia có quân nhìn thấy đứng trên đó) */
  specials(){
    const o={gates:[],traps:[],blocked:[]};
    if(!S.chaos||!S.terr)return o;
    for(let i=0;i<N*N;i++){const v=S.terr[i];if(v===Core.TERR.GATE)o.gates.push([(i/N)|0,i%N]);else if(v===Core.TERR.TRAP)o.traps.push([(i/N)|0,i%N]);}
    if(o.gates.length===2){
      const occ=g=>[0,1].some(k=>!S.hid[k]&&S.pl[k].r===g[0]&&S.pl[k].c===g[1]);
      if(occ(o.gates[1]))o.blocked.push(o.gates[0]);
      if(occ(o.gates[0]))o.blocked.push(o.gates[1]);
    }
    return o;
  },
  /* Dấu "thấy lần cuối": mũi tên lúc vừa chui vào, rồi số lượt đã đi (quá 5 thì 5+) */
  seenMarks(){
    const out=[],M=CFG.MARK;
    for(let i=0;i<2;i++){
      const L=S.hid[i]&&S.last&&S.last[i];if(!L)continue;
      out.push({key:'seen'+i,kind:L.n===0?'arrow':'n:'+(L.n>5?'5+':L.n),x:cellX(L.c),z:cellZ(L.r),y:M.seenY});
    }
    return out;
  },
  /* Chỉ cập nhật dấu "thấy lần cuối", không chờ hoạt ảnh xong: Pawns gọi khi quân vừa ẩn đi (đã đi bộ vào bụi cỏ → dấu hiện ở bụi đó) hoặc vừa hiện ra (đã thấy quân → dấu biến mất) */
  syncSeen(){
    if(typeof Terrain==='undefined'||!S.chaos)return;
    Marks.set((this.markBase||[]).concat(this.seenMarks()));
  },
  /* Dấu hiệu theo trạng thái hiện tại: cổng bị chặn → lõi đỏ + chữ X; bẫy → ✓ xanh (đóng) hoặc ! đỏ (đang bật: kết thúc lượt trên ô này là bị hất) */
  syncMarks(instant){
    if(typeof Terrain==='undefined')return;
    const sp=this.specials(),M=CFG.MARK,armed=!!S.chaos&&R.trapOn(S,0),list=[];
    for(const g of sp.blocked)list.push({key:'g'+g[0]+','+g[1],kind:'x',x:cellX(g[1]),z:cellZ(g[0]),y:M.gateY});
    for(const t of sp.traps)list.push({key:'t'+t[0]+','+t[1],kind:armed?'warn':'ok',x:cellX(t[1]),z:cellZ(t[0]),y:M.trapY});
    if(S.chaos&&S.sunk)for(let i=0;i<2;i++){   /* quân đang lún cát: dấu cấm nổi trên đầu (quân bị cỏ che thì không lộ; cát không phải cỏ nên thực tế luôn thấy) */
      if(!S.sunk[i]||S.hid[i]||!S.pl[i])continue;
      list.push({key:'sk'+i,kind:'ban',x:cellX(S.pl[i].c),z:cellZ(S.pl[i].r),y:M.sinkY});
    }
    this.markBase=list.slice();   /* dấu cổng/bẫy hiện hành: syncSeen dùng lại để chỉ đổi dấu "thấy lần cuối" mà không đụng cổng/bẫy */
    Marks.set(list.concat(this.seenMarks()));
    Terrain.setGateBlocked(sp.blocked);
    Terrain.setTraps(armed?2:0,!!instant);
  },
  /* Dựng lại toàn bộ bàn cờ từ trạng thái server: nối lại sau rớt mạng, vào lại ván sau khi tải lại trang, hoặc khi lệch nước.
     m = tin 'state' {snapshot,log,over,winner,reason}. Tường lấy theo nhật ký để đúng màu từng bên (snapshot không ghi chủ tường). */
  resync(m){
    const st=this.loadSnap(m.snapshot,S.pl);
    S.ws=st.ws;S.over=!!st.over;S.draw=!!st.draw;S.winner=st.over?st.winner:-1;
    S.mode='move';S.use=null;S.tgt=null;S.hov=null;S.last=[null,null];S.animLock=false;S.event=null;   /* dựng lại ván: quân đặt thẳng vào chỗ, không còn hoạt ảnh nào để đợi */
    S.net.wait=false;S.net.offline=false;S.net.reason=m.reason||null;
    S.net.deadline=!S.over&&m.turnLeft?Date.now()+m.turnLeft:0;S.net.rematch=m.rematch||{me:false,opp:false};
    Walls.clear();Badges.clear();Marks.clear();Review.reset();Fireworks.stop();Pawns.reset();Camera.snapHome();Stage.invalidate(true);
    if(S.chaos){   /* Hỗn Loạn: tường có thể bị búa/cuốc chim gỡ nên không dựng theo nhật ký; snapshot có sẵn chủ tường (p) và các khe bị phá (dead) */
      for(const w of m.snapshot.walls)Walls.add(w.o,w.r,w.c,w.p||0,true);
      for(const d of m.snapshot.dead||[])Walls.rubble(d.o,d.r,d.c);
    }
    else if(m.log&&m.log.length){for(const e of m.log)if(e.a.wall)Walls.add(e.a.wall.o,e.a.wall.r,e.a.wall.c,e.p,true);}
    else for(const w of m.snapshot.walls)Walls.add(w.o,w.r,w.c,0,true);
    if(S.over&&S.winner>=0){Fireworks.play(S.pl[S.winner]);Pawns.win(S.winner);Camera.follow(S.winner,true);}
    this.syncTerrain(true);this.refresh();
  },
  netFlush(){const q=this.netQ;this.netQ=[];for(const [t,m] of q)this.netIn(t,m);},
  netLost(msg){if(!S.net||S.over)return;S.net.lost=msg;S.over=true;S.winner=-1;this.refresh();},
  netIn(t,m){
    if(!this.netReady||S.event){this.netQ.push([t,m]);return;}   /* đang dựng ván, hoặc đang có sự kiện đặc biệt (cả hai bên dừng): xếp hàng, xử lý khi xong (eventEnd) */
    if(!S.net)return;
    switch(t){
      case'applied':
        if(S.over)return;
        if(m.seq!==S.ply){S.net.conn.sync();return;}   /* lệch nước: xin trạng thái đầy đủ rồi dựng lại */
        if(Perf.sent){Perf.rtt=performance.now()-Perf.sent;Perf.sent=0;}   /* thời gian từ lúc gửi nước đi tới lúc server trả lời */
        S.net.wait=false;S.net.note='';S.net.deadline=!m.over&&m.turnLeft?Date.now()+m.turnLeft:0;
        if(S.chaos)this.netApplyChaos(m);else this.play(m.action);
        return;
      case'rejected':
        S.net.wait=false;
        if(m.reason==='seq'||m.reason==='turn')S.net.conn.sync();
        else{   /* Hỗn Loạn: client không thấy quân bị cỏ che nên có thể đề xuất nước/tường mà server từ chối */
          if(S.chaos)S.net.note={badmove:'Không đi được ô này',badwall:'Tường không hợp lệ',noitem:'Không có vật phẩm',moveonly:'Chỉ được đi quân',
            bootsbusy:'Giày đang chờ',glovefail:'Đối thủ cần ≥2 tường',badtarget:'Không chọn được tường'}[m.reason]||'';
          this.refresh();
        }
        return;
      case'over':   /* thắng bằng đích đã tự tính ở endTurn; đây là các trường hợp khác (đối thủ đầu hàng...) */
        if(S.over)return;
        S.over=true;S.winner=m.winner;S.net.reason=m.reason;S.net.deadline=0;
        if(m.winner>=0){Fireworks.play(S.pl[m.winner]);Pawns.win(m.winner);Camera.follow(m.winner,true);}
        this.refresh();return;
      case'state':this.resync(m);return;
      case'rematchStatus':S.net.rematch={me:m.me,opp:m.opp};UI.render();return;
      case'started':   /* đấu lại: server đã đổi phe và bắt đầu ván mới trong cùng phòng */
        this.cfg.net.you=m.you;this.cfg.net.map=m.map||null;this.cfg.net.snap=m.snapshot;this.cfg.net.turnLeft=m.turnLeft;this.cfg.net.state=null;
        this.newGame(true);return;   /* có màn hình tải riêng; tin đến trong lúc đó xếp hàng (netReady=false) */
      case'reconnecting':S.net.offline=true;this.refresh();return;   /* rớt mạng: khóa thao tác, tự nối lại; nối được thì server gửi 'state' */
      case'opponentStatus':S.net.oppOnline=m.online;UI.render();return;
      case'replaced':this.netLost('Phòng mở ở tab khác');return;
      case'close':if(!S.over)this.netLost('Mất kết nối server');return;
    }
  },

  /* Hỗn Loạn online: server là trọng tài và đã tính kết quả thật (băng trượt, bẫy, cổng, nước, mất lượt), client chỉ chép lại.
     m = applied {by,action,ply,turn,over,winner,draw,pl,left,stuck,skipped?,fx?}. pl[đối thủ]=null nghĩa là quân đó bị cỏ che.
     Bản đầu: quân nhảy thẳng tới ô cuối; fx (slide/launch/gate/stuck) để dành cho hoạt ảnh sau. */
  netApplyChaos(m){
    const a=m.action||{};
    if(m.inv)S.inv=m.inv.map(b=>b.slice());if(m.bonus)S.bonus=m.bonus.slice();   /* túi đồ + giày: công khai, server gửi nguyên trạng thái */
    for(const e of m.fx||[])if(e.t==='chest'&&S.terr)S.terr[e.cell[0]*N+e.cell[1]]=0;   /* rương mở: ô thành ô thường (hình 3D mở nắp + biến mất do đoạn 'chest' của quân lo) */
    if(a.wall){setW(a.wall.o,a.wall.r,a.wall.c,1);if(S.wo)S.wo[a.wall.o][a.wall.r*WN+a.wall.c]=m.by+1;Walls.add(a.wall.o,a.wall.r,a.wall.c,m.by);}
    if(a.item)this.netItem(m,a.item);
    for(let i=0;i<2;i++){
      const was=S.hid[i],p=m.pl[i];
      S.hid[i]=!p;
      if(p){
        S.pl[i]={r:p.r,c:p.c};S.last[i]=null;
        if(was){
          const ex=m.by===i&&a.exit;   /* chính nó bước ra khỏi cỏ (server cho biết bụi cỏ nó thoát ra) */
          if(ex){   /* hiện ngay tại bụi cỏ đó rồi đi bộ ra ô mới bằng đúng cơ chế di chuyển thường (kèm băng/bẫy/cổng nếu có) */
            S.pl[i]={r:ex[0],c:ex[1]};Pawns.place(i);S.pl[i]={r:p.r,c:p.c};
            this.scriptPawn(i,m,a,p);
          }else Pawns.place(i);   /* lộ ra do mình đi tới gần: hiện ngay chỗ nó đang đứng */
          this.syncSeen();        /* thấy lại → gỡ dấu "thấy lần cuối" */
        }
        else this.scriptPawn(i,m,a,p);
      }else if(!was){   /* vừa khuất tầm nhìn: (a) quân đó tự chui vào cỏ trước mắt mình → server gửi a.enter = bụi cỏ nó vào: đi bộ tới đó (đoạn walk thường) rồi mới ẩn;
                           (b) do mình đi (rời xa cỏ...) → ẩn ngay tại chỗ thấy lần cuối */
        const segs=[];
        if(m.by===i&&a.enter){
          S.pl[i]={r:a.enter[0],c:a.enter[1]};
          const sl=(m.fx||[]).find(e=>e.t==='slide'&&e.p===i);   /* trượt băng rồi dừng trong bụi: server gửi kèm đoạn trượt (mọi ô trên đường đi đều thấy được) */
          if(sl)segs.push({k:'walk',r:sl.path[0][0],c:sl.path[0][1]},{k:'slide',path:sl.path});   /* đi bộ vào băng → trượt → tới bụi, rồi mới ẩn (không nhảy thẳng) */
          else segs.push({k:'walk',r:a.enter[0],c:a.enter[1]});
        }
        segs.push({k:'hide'});
        Pawns.script(i,segs,{r:S.pl[i].r,c:S.pl[i].c});
        S.last[i]={r:S.pl[i].r,c:S.pl[i].c,n:0};
      }else if(m.by===i&&S.last[i])S.last[i].n++;   /* vẫn trong cỏ và vừa đi thêm một lượt (không biết đi đâu) */
    }
    S.left=m.left.slice();S.stuck=m.stuck.slice();S.sunk=(m.sunk||[false,false]).slice();S.ply=m.ply;S.turn=m.turn;
    S.mode='move';S.use=null;S.tgt=null;S.hov=null;
    const ss=(m.fx||[]).find(e=>e.t==='sunkskip'&&e.p===S.me);if(ss)S.net.note='Bạn bị lún cát: mất lượt';   /* lượt của mình vừa bị bỏ qua */
    else if((m.fx||[]).some(e=>e.t==='sunkskip'))S.net.note='Đối thủ lún cát: bị mất lượt';
    const dr=(m.fx||[]).find(e=>e.t==='chest'&&e.drop&&e.p===S.me);if(dr)S.net.note='Túi đầy: bỏ '+CFG.ITEMS[dr.drop].name;
    if(a.item&&a.item.use==='hammer'&&m.free&&!m.over&&S.turn===S.me&&m.by===S.me)S.net.note='Búa không tốn lượt: hãy đi quân hoặc đặt tường';   /* búa miễn phí: nhắc là lượt vẫn của mình */
    if(m.over){
      S.over=true;S.draw=!!m.draw;S.winner=m.draw?-1:m.winner;S.net.deadline=0;
      if(S.winner>=0){Fireworks.play(S.pl[S.winner]);Pawns.win(S.winner);Camera.follow(S.winner,true);}
    }
    this.syncTerrain(false);
    /* Quân còn đang diễn (vd đối thủ trượt băng dài): chưa mở lượt cho mình, đợi hết hoạt ảnh (App.frame gỡ khóa). Hạn chót đề phòng kẹt. */
    S.animLock=!S.over&&!Pawns.quiet();this.animDeadline=performance.now()+15000;
    this.refresh();
    /* Server báo người chặn đường (fx {t:'blocker',cell:[r,c]} vào / {t:'blocker',leave:true} rời): bắt đầu sự kiện, chờ hai quân diễn xong (eventTick) */
    for(const e of m.fx||[])if(e.t==='blocker'&&S.chaos&&!S.over){   /* Classic không có người chặn đường: bỏ qua nếu lỡ nhận */if(e.leave)this.blockerLeave();else if(e.cell)this.blockerEvent(e.cell[0]*N+e.cell[1]);}
  },
  /* Dựng kịch bản chuyển động của quân i từ nước đi + hiệu ứng ô server gửi (fx, theo đúng thứ tự xảy ra):
       bước tới ô (walk) → [trượt băng (slide)] → [bẫy hất (launch)] / [dịch chuyển cổng (blink)].
     Dịch chuyển cổng TRỄ (late: quân đang chờ ở cổng, đối thủ vừa rời) thì chờ quân kia đi xong rồi mới blink. final = ô cuối khớp S.pl[i]. */
  scriptPawn(i,m,a,final){
    const segs=[];let end=null;
    if(m.by===i&&a.move){segs.push({k:'walk',r:a.move[0],c:a.move[1]});end=[a.move[0],a.move[1]];}
    for(const e of m.fx||[]){
      if(e.p!==i)continue;
      if(e.t==='slide'){segs.push({k:'slide',path:e.path});end=e.path[e.path.length-1];}
      else if(e.t==='launch'){segs.push({k:'launch',from:e.from,to:e.to});end=e.to;}
      else if(e.t==='gate'){segs.push({k:'blink',from:e.from,to:e.to,wait:e.late?1-i:undefined});end=e.to;}
      else if(e.t==='chest'){   /* rương: quân KHỰNG LẠI ở ô kề, rương mở, quà hiện, rồi mới bước vào ô (rương lúc đó đã biến mất) */
        const cr=e.cell[0],cc=e.cell[1],last=segs[segs.length-1];
        const lc=!last?null:last.k==='walk'?[last.r,last.c]:last.k==='slide'?last.path[last.path.length-1]:null;
        if(lc&&lc[0]===cr&&lc[1]===cc){
          if(last.k==='slide'&&last.path.length>2)last.path=last.path.slice(0,-1);   /* trượt dừng đúng ô rương: chỉ trượt tới ô băng cuối rồi khựng lại */
          else segs.pop();
          segs.push({k:'chest',cell:e.cell,gift:e.gift},{k:'walk',r:cr,c:cc});
        }else segs.push({k:'chest',cell:e.cell,gift:e.gift});
        end=[cr,cc];
      }
    }
    if(!segs.length)return;   /* không có gì để dựng: Pawns tự đi tới S.pl như thường */
    if(!end||end[0]!==final.r||end[1]!==final.c)segs.push({k:'walk',r:final.r,c:final.c});   /* an toàn: kịch bản không khớp kết quả thật thì đi thẳng tới ô thật */
    Pawns.script(i,segs,{r:final.r,c:final.c});
  },

  endTurn(){
    /* chấm nhãn nước vừa đi (lúc này S là thế SAU nước đi, chưa đổi lượt); đang tắt đánh giá thì bỏ qua, đỡ tốn máy */
    if(S.analysis){const rv=Review.judge();if(rv)Badges.show(rv);}else Review.skip();
    S.ply++;
    if(S.pl[S.turn].r===goalRow(S.turn)){S.over=true;S.winner=S.turn;Fireworks.play(S.pl[S.turn]);Pawns.win(S.turn);Camera.follow(S.turn,true);this.refresh();return;}   /* thắng: pháo bông + camera khóa theo quân thắng */
    if(allAI()&&S.ply>=CFG.MAX_PLY){S.over=S.draw=true;this.refresh();return;}
    S.turn=1-S.turn;S.mode='move';S.hov=null;Review.snap();
    if(S.chaos&&CFG.BLOCKER.auto&&!S.net){   /* (offline luôn là Classic nên nhánh này không chạy ngoài lúc thử; online do SERVER chạy lịch) ván offline: người chặn đường xuất hiện / rời đi theo lịch (BlockerPlan); chưa làm được (đang bận...) thì nước sau thử lại. schedule() bên dưới thấy S.event thì không cho máy đi */
      const due=BlockerPlan.due(S.bplan,S.ply);
      if(due==='enter')this.blockerEvent();else if(due==='leave')this.blockerLeave();
    }
    this.refresh();this.schedule();
  },

  /* ----- Sự kiện đặc biệt: người chặn đường (hình + hoạt ảnh ở view/blocker.js) -----
     Trình tự: blockerEvent → S.event 'wait' (từ giây này cả hai bên dừng) → eventTick đợi hai quân diễn xong → khóa camera + người chặn rơi xuống mép, chạy vào ô,
     đứng lại (onArrive: ghi S.blocker) → hết giờ đứng → eventEnd: gỡ khóa camera, mở lại lượt, máy đi tiếp, xử lý tin server đã xếp hàng. Rời đi (blockerLeave) cũng theo trình tự đó. */
  blockerEvent(idx){
    if(!S.chaos||!this.ready||this.busy||S.over||S.event||S.blocker>=0)return false;   /* CHỈ Hỗn Loạn. Classic = Quoridor truyền thống: không người chặn, không địa hình, không vật phẩm */
    if(idx===undefined||idx===null)idx=Blocker.pick();
    if(idx<0)return false;
    this.startEvent({k:'blocker',ph:'wait',cell:idx});
    if(!S.net)BlockerPlan.done(S.bplan,S.ply,'enter',CFG.BLOCKER.plan);   /* kể cả khi người thử bấm B: đồng hồ lịch tính lại từ lúc này */
    return true;
  },
  blockerLeave(){
    if(!S.chaos||!this.ready||this.busy||S.over||S.event||S.blocker<0)return false;
    this.startEvent({k:'leave',ph:'wait',cell:S.blocker});
    if(!S.net)BlockerPlan.done(S.bplan,S.ply,'leave',CFG.BLOCKER.plan);
    return true;
  },
  startEvent(e){
    clearTimeout(this.timer);this.aiTok++;   /* máy đang nghĩ: bỏ kết quả (aiStep thấy aiTok đổi) */
    e.t0=performance.now()+CFG.BLOCKER.delay*1000;Sfx.play('warn');
    S.event=e;S.mode='move';S.hov=null;S.tgt=null;S.use=null;
    this.refresh();Stage.need=3;
  },
  eventTick(){
    const e=S.event;if(!e||e.ph!=='wait')return;
    if(S.animLock||!Pawns.quiet()||performance.now()<e.t0)return;   /* chờ hai quân diễn xong rồi mới vào */
    e.ph='go';
    if(e.k==='leave'){
      Camera.lock(Blocker.s,CFG.BLOCKER.cam);
      Blocker.leave({onGo:()=>{S.blocker=-1;this.refresh();},onDone:()=>this.eventEnd()});
    }else{
      Blocker.enter(e.cell,{onArrive:()=>{S.blocker=e.cell;this.refresh();},onDone:()=>this.eventEnd()});
      Camera.lock(Blocker.s,CFG.BLOCKER.cam);   /* sau enter: người chặn đã đặt ở điểm rơi nên camera nhìn đúng chỗ */
    }
  },
  eventEnd(){
    S.event=null;Camera.unlock();
    Review.skip();Review.snap();   /* thế cờ đã đổi (có/không có người chặn): nước kế tiếp chấm từ thế mới */
    this.refresh();this.schedule();
    if(S.net)this.netFlush();
  },

  /* ----- Vật phẩm (Hỗn Loạn, luật ở core.js) ----- */
  /* Dùng món `use` trong túi mình. Giày (miễn phí) và găng gửi ngay; búa / cuốc chim vào chế độ chọn một tường của đối thủ (bấm lại cùng món: hủy). Server mới là trọng tài. */
  useItem(use){
    if(!use||!S.chaos||!S.inv||!humanTurn()||S.me<0)return;
    const me=S.me,q=1-me,say=t=>{S.net.note=t;this.refresh();};
    if(S.inv[me].indexOf(use)<0)return;
    if(S.bonus[me]===2)return say('Chỉ được đi quân');
    if(use==='boots'){if(S.bonus[me]!==0)return say('Giày đang chờ');this.commit({item:{use}});return;}
    if(use==='glove'){if(S.left[q]<2)return say('Đối thủ còn '+S.left[q]+' tường (cần ≥2)');this.commit({item:{use}});return;}
    if(S.mode==='item'&&S.use===use){S.mode='move';S.use=null;S.tgt=null;this.refresh();return;}
    if(!R.oppWalls(S,me).length)return say('Đối thủ chưa có tường');
    S.mode='item';S.use=use;S.hov=null;S.tgt=Input.targetAtPointer();this.refresh();
  },
  /* Xác nhận dùng búa / cuốc chim lên tường đang trỏ tới */
  confirmItem(){
    if(!humanTurn()||S.mode!=='item'||!S.tgt)return false;
    const a={item:{use:S.use,o:S.tgt.o,r:S.tgt.r,c:S.tgt.c}};S.tgt=null;this.commit(a);return true;
  },
  /* Phím mũi tên: chuyển mục tiêu sang tường kế tiếp / trước đó của đối thủ */
  cycleTarget(k){
    const l=R.oppWalls(S,S.me);if(!l.length)return false;
    let i=S.tgt?l.findIndex(w=>w.o===S.tgt.o&&w.r===S.tgt.r&&w.c===S.tgt.c):-1;
    i=i<0?0:(i+(k==='ArrowRight'||k==='ArrowDown'?1:l.length-1))%l.length;
    S.tgt=l[i];this.updateGhost();return true;
  },
  /* Server báo một vật phẩm đã được dùng (m = applied): cập nhật tường trong S và dựng hiệu ứng. Giày/găng: biểu tượng nổi trên quân (không hiện nếu quân đó đang bị cỏ che, kẻo lộ chỗ). */
  netItem(m,it){
    const by=m.by,idx=it.use==='boots'||it.use==='glove'?-1:it.r*WN+it.c;
    if(idx>=0){
      setW(it.o,it.r,it.c,0);if(S.wo)S.wo[it.o][idx]=0;
      if(it.use==='pick'&&S.dead)S.dead[it.o][idx]=1;
      Walls.remove(it.o,it.r,it.c,it.use);
      Marks.pop(wallX(it.c),wallZ(it.r),it.use,.7);
    }else if(!S.hid[by]&&S.pl[by]){Sfx.play(it.use==='boots'?'zip':'swipe',{x:cellX(S.pl[by].c),z:cellZ(S.pl[by].r)});Marks.pop(cellX(S.pl[by].c),cellZ(S.pl[by].r),it.use,.8);}
  },

  setMode(m){
    if(!humanTurn())return;if(m==='wall'&&S.left[S.turn]===0)return;
    if(m==='move'&&S.stuck&&S.stuck[S.turn])return;   /* đứng yên: không được đi */
    if(m==='wall'&&S.bonus&&S.bonus[S.turn]===2)return;   /* lượt thêm của giày: chỉ được đi quân */
    S.mode=m;S.use=null;S.tgt=null;
    /* Vào chế độ tường: tường "ma" nằm ở khe gần con trỏ nhất; chưa có chuột trên bàn thì ở giữa bàn */
    if(m==='wall')S.hov=Input.slotAtPointer()||S.hov||{r:(WN-1)>>1,c:(WN-1)>>1};
    this.refresh();
  },
  rotateWall(){if(S.mode==='wall'&&humanTurn()){Sfx.play('ui:rot');S.orient=S.orient==='h'?'v':'h';this.refresh();}},

  /* ----- Máy đi ----- */
  /* aiTok tăng mỗi lần schedule()/rời ván: kết quả AI trả về muộn (ván mới, tạm dừng, về menu) thì bị bỏ */
  schedule(){
    clearTimeout(this.timer);this.aiTok++;
    if(isAI(S.turn)&&!S.paused&&!S.over&&!S.event){   /* đang có sự kiện đặc biệt: máy cũng dừng (eventEnd gọi lại schedule) */
      const ai=AIs.get(S.ai[S.turn]);
      if(ai.worker)AIWorker.decide(ai.id,S.turn);   /* AI nặng: bắt đầu nghĩ NGAY ở luồng nền, song song với khoảng chờ S.delay (không cộng dồn) */
      this.timer=setTimeout(()=>this.aiStep(),S.delay);
    }
  },
  async aiStep(){
    if(!isAI(S.turn)||S.paused||S.over||S.event)return;
    const p=S.turn,tok=this.aiTok,ai=AIs.get(S.ai[p]);
    let a=ai.worker?await AIWorker.decide(ai.id,p):null;
    if(tok!==this.aiTok)return;                   /* trong lúc chờ đã đổi ván / tạm dừng / về menu */
    if(!a)a=ai.decide(p);                         /* AI nhẹ, hoặc worker không dùng được: tính ngay trên luồng chính */
    /* Lưới an toàn: chơi với máy ở client không có server làm trọng tài, nên AI nào trả tường bất hợp lệ (bịt kín đường về đích của một bên)
       cũng không được làm hỏng ván — bỏ tường đó, đi quân về phía đích thay vào. */
    if(a.wall&&!canWall(a.wall.o,a.wall.r,a.wall.c)){
      const best=moves(p).map(m=>({m,d:dist(p,{r:m[0],c:m[1]})})).sort((x,y)=>x.d-y.d)[0];
      if(best)a={move:best.m};
    }
    if(a.wall)this.putWall(a.wall.o,a.wall.r,a.wall.c);else S.pl[S.turn]={r:a.move[0],c:a.move[1]};
    this.endTurn();
  },

  /* ----- Đồng bộ giao diện và cảnh 3D với trạng thái ----- */
  refresh(){
    this.pend=null;
    const ht=humanTurn();if(ht&&!this._ht&&!allAI())Sfx.play('ui:turn');this._ht=ht;   /* tới lượt bạn: chuông 2 nốt rất nhẹ */
    /* Chế độ chọn mục tiêu của búa/cuốc chim chỉ có nghĩa khi đang là lượt mình và còn món đó; lượt thêm của giày thì chỉ được đi quân */
    if(S.mode==='item'&&(!humanTurn()||!S.inv||S.inv[S.me].indexOf(S.use)<0||S.bonus[S.me]===2)){S.mode='move';S.use=null;S.tgt=null;}
    if(S.chaos&&S.bonus&&!S.over&&S.turn===S.me&&S.bonus[S.me]===2&&S.mode==='wall'){S.mode='move';S.hov=null;}
    /* Đang đứng yên (vừa lội xuống nước): lượt này chỉ được đặt tường, nên tự chuyển sang chế độ tường */
    if(S.chaos&&S.stuck&&!S.over&&S.turn===S.me&&S.stuck[S.me]&&S.left[S.me]>0&&S.mode==='move'){
      S.mode='wall';S.hov=Input.slotAtPointer()||S.hov||{r:(WN-1)>>1,c:(WN-1)>>1};
    }
    UI.render();UI.renderBar();
    Stage.setHints(humanTurn()&&S.mode==='move'?moves(S.turn):[],S.pl[S.turn]);
    this.updateLabels();
    this.updateGhost();
  },
  updateGhost(){
    if(humanTurn()&&S.mode==='item'){   /* búa / cuốc chim: tường đối thủ đang trỏ tới sáng lên */
      if(S.tgt)Walls.showTarget(S.tgt.o,S.tgt.r,S.tgt.c,CFG.BOARD.ghostItem);else Walls.hideGhost();
      Stage.invalidate();return;
    }
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
    /* setSize xoá khung vẽ: vẽ lại NGAY trong cùng tác vụ (trước khi trình duyệt tô màn hình) thay vì đợi khung kế tiếp, nếu không sẽ chớp 1 khung trống */
    if(this.ready&&UI.el.menu.hidden)Stage.render();
  },

  /* ----- Bắt đầu ván từ menu. cfg = {ai:[idTrắng|null, idĐen|null], delay:ms} (null = người chơi) ----- */
  async start(cfg){
    if(cfg.net){this.netReady=false;this.netQ=[];}
    this.busy=true;UI.lockMenu(true);
    Loading.show(cfg.net?'Vào phòng':'Vào ván',this.ready?'Chuẩn bị ván…':'Đang tải three.js…',4);await Loading.paint();
    try{
      if(!this.ready){
        await Loading.step(10,'Đang tải three.js…');await loadThree();
        await Loading.step(30,'Dựng bàn cờ…');Stage.init(UI.el.host);Walls.init(Stage.scene);Fireworks.init(Stage.scene);
        await Loading.step(48,'Tạo quân cờ…');Pawns.build(Stage.scene);Blocker.build(Stage.scene);Badges.init(Stage.scene);Marks.init(Stage.scene);Input.init(Stage.ren.domElement);
        this.ready=true;
      }
    }catch(e){
      this.busy=false;Loading.hide();
      UI.el.ld.hidden=false;UI.progress(0,'Không tải được three.js. Kiểm tra mạng rồi thử lại.');   /* thông báo lỗi nằm trong menu */
      UI.lockMenu(false);return;
    }
    this.cfg=cfg;S.delay=cfg.delay;
    /* Đánh giá (thanh khả năng thắng + nhãn): cfg.analysis = {on: mặc định, lock: true thì không cho bật/tắt}.
       Chế độ không khóa thì nhớ lựa chọn lần trước của người chơi; chế độ khóa luôn theo mặc định của nó. */
    const an=cfg.analysis||{},pref=this.analysisPref();
    S.analysisLock=!!an.lock;
    S.analysis=S.analysisLock?!!an.on:(pref!==null?pref:an.on!==false);
    UI.el.menu.hidden=true;UI.lockMenu(false);
    try{
      this.onResize();
      await this.newGame(false);   /* màn hình tải vẫn đang phủ: bản đồ + shader dựng xong mới lộ bàn cờ */
    }finally{this.busy=false;Loading.hide(450);}
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
  /* Thoát về menu. Đang chơi dở (online hoặc người vs máy) thì hỏi bằng cửa sổ xác nhận; online mà thoát lúc chưa xong = bị xử thua và rời phòng. */
  toMenu(force){
    const live=!S.over&&!allAI()&&this.ready&&(!S.net||!S.net.lost);
    if(live&&!force){
      UI.ask({title:'Thoát game',msg:S.net?'Rời phòng sẽ bị xử thua.':'Ván hiện tại sẽ mất.',yes:'Thoát',danger:true,check:()=>!S.over},()=>this.toMenu(true));
      return;
    }
    if(S.net){   /* rời ván online: đang chơi thì tính là đầu hàng */
      if(!S.over&&!S.net.lost)S.net.conn.resign();
      Menu.leaveRoom();Online.setLastRoom(null);S.net=null;
    }
    if(typeof BgAudio!=='undefined')BgAudio.stop();
    Guide.close(true);Sfx.stopAll();Sfx.setBiome(null);UI.closeAsk();clearTimeout(this.timer);clearInterval(this.tick);this.aiTok++;S.event=null;UI.theme(null);if(typeof Weather!=='undefined')Weather.set(null);Menu.show('scHome');
  },

  /* ----- Phím tắt (dùng ev.code nên đúng cả khi bật bộ gõ tiếng Việt) -----
     Q đi quân · W đặt tường · R xoay tường · E đổi góc nhìn · T bật/tắt đánh giá · I hướng dẫn (Hỗn Loạn) · O cài đặt · P ván mới · Space tạm dừng (máy đấu máy) · Esc về menu */
  onKey(ev){
    if(ev.repeat||ev.ctrlKey||ev.metaKey||ev.altKey||this.busy)return;
    const k=ev.code;
    if(UI.cfOpen){if(k==='Escape'){UI.closeAsk();ev.preventDefault();}return;}   /* đang hỏi xác nhận: chỉ Esc (hủy); Enter/Space bấm nút đang focus như thường */
    if(!UI.el.menu.hidden){if(k==='Escape')Menu.back();return;}   /* đang ở menu: chỉ Esc có tác dụng */
    if(Guide.isOpen){if(k!=='Tab')Guide.onKey(ev);return;}   /* cửa sổ Hướng dẫn mở: nó nhận hết phím, game không nhận (Tab vẫn đi qua các nút) */
    if(k==='KeyQ')this.setMode('move');
    else if(k==='KeyW')this.setMode('wall');
    else if(k==='KeyR')this.rotateWall();
    else if(k==='KeyE')this.cycleView();
    else if(k==='KeyT')this.toggleAnalysis();
    else if(k==='KeyP')this.resetOrRematch();
    else if(k==='KeyF')Perf.toggle();
    else if(k==='KeyI'){if(!S.chaos)return;Guide.open();}   /* Hướng dẫn (chỉ Hỗn Loạn); đóng bằng I nằm trong Guide.onKey */
    else if(k==='KeyB'){if(!CFG.BLOCKER.key||S.net||!S.chaos)return;   /* online: server mới là trọng tài, client không tự gọi (sẽ lệch luật) */
     if(S.blocker>=0)this.blockerLeave();else this.blockerEvent();}   /* thử: gọi / đuổi người chặn đường */
    else if(k==='Space'){if(!allAI()||S.over)return;S.paused=!S.paused;this.refresh();this.schedule();}   /* máy đấu máy: tạm dừng / tiếp tục */
    else if(k==='Escape'){if(S.mode==='item'){S.mode='move';S.use=null;S.tgt=null;this.refresh();}else this.toMenu();}   /* đang chọn mục tiêu: Esc chỉ hủy việc chọn */
    else if(k==='Digit1'||k==='Digit2'){if(!S.chaos||!S.inv||S.me<0)return;this.useItem(S.inv[S.me][k==='Digit1'?0:1]);}   /* dùng món thứ 1 / 2 trong túi */
    else if(k.startsWith('Arrow')){if(!(S.mode==='wall'?this.arrowWall(k):S.mode==='item'?this.cycleTarget(k):this.arrowMove(k)))return;}
    else if(k==='Enter'||k==='NumpadEnter'){if(!(S.mode==='item'?this.confirmItem():this.confirmWall()))return;}
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
      if(!S.hid[1-S.turn]&&Math.abs(dr)+Math.abs(dc)===1){   /* đối thủ đứng sát mình (bị cỏ che thì không có nhãn nhảy) */
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
    const a=S.pl[S.turn],o=S.hid[1-S.turn]?HIDDEN_POS:S.pl[1-S.turn],legal=moves(S.turn),has=(r,c)=>legal.some(m=>m[0]===r&&m[1]===c);
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
    e.bReset.onclick=()=>this.resetOrRematch();
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
    let last=0,sdt=.016;
    return function loop(now){
      requestAnimationFrame(loop);
      const raw=Math.min(.05,(now-last)/1000||.016);last=now;
      sdt+=(raw-sdt)*.35;   /* làm mượt bước thời gian: mốc thời gian của trình duyệt dao động (16↔33 ms…) làm quân tiến không đều → nhìn như giật; trung bình mượt vẫn giữ đúng tổng thời gian */
      const dt=sdt;
      if((S.animLock||S.event)&&!Stage.need)Stage.need=1;   /* sự kiện đặc biệt cũng cần vòng lặp chạy tiếp (đợi quân đứng yên rồi mới vào) */   /* đang khóa lượt chờ hoạt ảnh: vòng lặp phải chạy tiếp để gỡ khóa */
      if(!App.ready||App.busy||!Stage.need||!UI.el.menu.hidden)return;
      const cb=Camera.update(dt),pb=Pawns.update(dt),wb=Walls.update(dt),hb=Stage.updateHints(dt),fb=Fireworks.update(dt),bb=Badges.update(dt),gb=Walls.pulse(dt),tb=Terrain.update(dt),nb=Blocker.update(dt),wx=typeof Weather!=='undefined'&&Weather.update(dt);
      App.eventTick();
      if(S.animLock&&(S.over||Pawns.quiet()||now>App.animDeadline)){S.animLock=false;App.refresh();}   /* hai quân đã đứng yên: mở lượt (hiện ô đi được, cho bấm) */
      if(App.markWait){Stage.need=3;if(Pawns.quiet()){App.markWait=false;App.syncMarks(false);}}   /* hai quân đã diễn xong: giờ mới đổi dấu cổng/bẫy */
      const mb=Marks.update(dt);
      if(cb||pb||wb||hb||fb||bb||gb||tb||mb||nb||wx)Stage.need=3;
      if(cb&&App.sig!==App.arrowDir('ArrowUp')+'|'+App.arrowDir('ArrowRight'))App.updateLabels();   /* camera xoay sang hướng khác: đổi tên phím trên nhãn */
      if(pb||wb||Terrain.shadowBusy)Stage.shadowDirty=true;   /* tấm bẫy nhún cũng đổi bóng (trước đây không dựng lại → bóng cũ còn mãi) */
      Stage.need--;Stage.render();Perf.tick(now,performance.now()-now);   /* CPU của cả khung: từ lúc trình duyệt gọi tới khi lệnh vẽ đã gửi xong */
      if(performance.now()-now>250)Perf.note('KHUNG CHẬM',performance.now()-now,true);   /* ghi lại khung nặng bất thường để biết khựng nằm ở đâu */
    };
  })()
};

UI.init();Menu.init();App.bind();requestAnimationFrame(App.frame);