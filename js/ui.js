'use strict';
/* [UI] Thanh trạng thái, nút điều khiển trong ván, thanh tiến trình tải. (Menu chính nằm ở menu.js) */
const UI={
  el:{},

  init(){
    for(const id of['evalbar','evW','evBt','evWt','status','info','host','menu','ld','bar','msg','bMove','bWall','bRot','bPause','bView','bEval','bReset','rmOpp','bMenu'])this.el[id]=$(id);
    $('cfNo').onclick=$('cfX').onclick=()=>this.closeAsk();
    $('cf').addEventListener('mousedown',ev=>{if(ev.target===$('cf'))this.closeAsk();});   /* bấm ra ngoài = hủy */
    $('cfYes').onclick=()=>{const f=this.cfYes;this.closeAsk();if(f)f();};
    this.el.info.addEventListener('click',ev=>{const b=ev.target.closest&&ev.target.closest('[data-use]');if(b&&!b.disabled)App.useItem(b.dataset.use);});   /* bấm món trong túi đồ của mình */
  },

  /* Túi đồ của bên i (Hỗn Loạn): của mình là nút bấm được (phím 1/2), của đối thủ chỉ để xem. Kèm trạng thái giày. */
  bagHtml(i){
    if(!S.chaos||!S.inv)return '';
    const mine=!!S.net&&i===S.me,can=mine&&humanTurn()&&S.bonus[i]!==2;
    let h='';
    S.inv[i].forEach((u,k)=>{
      const it=CFG.ITEMS[u],tip=it.name+': '+it.tip+(mine?' ['+(k+1)+']':'');
      h+=mine?' <button type="button" class="it'+(S.mode==='item'&&S.use===u?' on':'')+'" data-use="'+u+'"'+(can?'':' disabled')+' title="'+tip+'">'+it.icon+'</button>'
              :' <span class="it" title="'+tip+'">'+it.icon+'</span>';
    });
    if(S.bonus[i]===1)h+=' <span class="itn">👟 +1 lượt</span>';
    else if(S.bonus[i]===2)h+=' <span class="itn">👟 chỉ đi quân</span>';
    return h;
  },

  /* Cửa sổ xác nhận: o = {title,msg,yes,no,danger,check}; yes() chạy khi đồng ý. Mặc định focus nút Hủy (Enter không lỡ tay). Esc = hủy (xem App.onKey).
     check() (nếu có) được hỏi mỗi lần render: trả false (vd ván đã kết thúc trong lúc đang hỏi) thì tự đóng. */
  cfOpen:false,cfYes:null,cfCheck:null,
  ask(o,yes){
    $('cfT').textContent=o.title;$('cfM').textContent=o.msg;
    const y=$('cfYes');y.textContent=o.yes||'Đồng ý';y.classList.toggle('dn',!!o.danger);$('cfNo').textContent=o.no||'Hủy';
    this.cfYes=yes;this.cfCheck=o.check||null;this.cfOpen=true;$('cf').hidden=false;Sfx.play('ui:open');
    const w=$('cf').querySelector('.win');w.classList.remove('pop');void w.offsetWidth;w.classList.add('pop');
    $('cfNo').focus();
  },
  closeAsk(){
    this.cfOpen=false;this.cfYes=this.cfCheck=null;$('cf').hidden=true;
    if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();   /* nút vừa bấm không giữ focus (Space/Enter không bấm lại) */
  },

  /* Giao diện theo biome (chỉ Hỗn Loạn): đặt data-biome trên <body> để css/style.css đổi bảng màu vùng chơi. null = giao diện terminal mặc định (Classic, menu).
     'balanced' dùng bảng màu cỏ như Terrain. Biome lạ → không đổi giao diện. */
  THEMES:{meadow:'#4f8f2a',forest:'#2f6a22',river:'#2c7a99',autumn:'#a0561f',desert:'#ecd093',snow:'#e6f2f9',mountain:'#5d6778'},
  theme(biome){
    const b=biome==='balanced'?'meadow':biome,ok=!!(b&&this.THEMES[b]);
    if(ok)document.body.dataset.biome=b;else delete document.body.dataset.biome;
    const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=ok?this.THEMES[b]:'#000000';
  },

  /* Khóa/mở mọi nút trong menu (trừ nút "sắp có") khi đang tải */
  lockMenu(v){
    for(const b of this.el.menu.querySelectorAll('button:not([data-soon])'))b.disabled=v;
  },
  progress(pct,text){this.el.bar.firstElementChild.style.width=pct+'%';this.el.msg.textContent=text;},

  /* Thanh khả năng thắng: chiều cao phần sáng = xác suất Trắng thắng (CSS tự làm mượt chuyển động) */
  renderBar(){
    if(!S.analysis)return;   /* đang tắt đánh giá: khỏi tính xác suất */
    const e=this.el,w=Math.round(Eval.whiteProb()*100);
    e.evW.style.height=w+'%';
    e.evWt.textContent=w;e.evBt.textContent=100-w;
    e.evalbar.title='Trắng '+w+'% · Đen '+(100-w)+'%';
  },

  /* Tên hiển thị của bên p: "Trắng" */
  label(p){return CFG.PLAYERS[p].name;},

  /* ----- Dòng trạng thái: NGẮN, mỗi ý một "thẻ" có màu (css .tg). Mức: good xanh lá · info xanh lam · warn vàng cam · bad đỏ · blink = đỏ nhấp nháy (khẩn cấp) -----
     statusParts() trả mảng phần tử: chuỗi (chữ thường) hoặc [mức, chữ] (thẻ màu). Thêm thông báo mới chỉ cần push vào mảng. */
  tg:(lv,t)=>[lv,t],
  statusParts(){
    const tg=this.tg,nm=this.label(S.turn),P=[];
    if(S.event)return[tg('warn',S.event.k==='leave'?'🚧 Người chặn đường rời đi':'🚧 Người chặn đường xuất hiện!'),tg('dim','tạm dừng')];   /* sự kiện đặc biệt: cả hai bên dừng */
    if(S.net){   /* đấu online */
      const n=S.net;
      if(n.lost)return[tg('bad',n.lost)];
      if(S.over){
        if(S.draw)return[tg('warn','Hòa'),S.ply+' nước'];
        if(S.winner<0)return['Ván kết thúc'];
        const win=S.winner===S.me,why={timeout:win?'đối thủ rớt mạng':'bạn rớt mạng',resign:win?'đối thủ đầu hàng':'bạn đầu hàng',turn:win?'đối thủ hết giờ':'bạn hết giờ'}[n.reason];
        return[win?tg('good','Thắng!'):tg('bad','Thua')].concat(why?[why]:[]);
      }
      if(n.offline)return[tg('blink','Mất kết nối'),'đang nối lại…'];
      const tl=n.deadline?Math.max(0,Math.ceil((n.deadline-Date.now())/1000)):0;
      const clock=tl?tg(tl<=5?'blink':tl<=10?'warn':'dim','⏱ '+tl+'s'):null;   /* đồng hồ lượt: ≤10s vàng, ≤5s đỏ nhấp nháy */
      if(tl&&tl<=10&&S.turn===S.me&&n.lastTick!==tl){n.lastTick=tl;Sfx.play('ui:tick',{v:tl<=5?1.4:.8});}   /* đồng hồ lượt: tick êm, dày dần */
      const off=n.oppOnline===false?tg('bad','đối thủ rớt mạng'):null;
      const hid=S.chaos&&S.hid[1-S.me]?tg('info','🌿 ẩn trong cỏ'):null;
      if(S.turn!==S.me){
        P.push('Lượt đối thủ');if(clock)P.push(clock);if(off)P.push(off);if(hid)P.push(hid);
        if(S.chaos&&S.stuck&&S.stuck[1-S.me]&&!S.hid[1-S.me])P.push(tg('warn','đứng yên'));
        if(S.chaos&&S.sunk&&S.sunk[1-S.me]&&!S.hid[1-S.me])P.push(tg('warn','🚫 lún cát: mất lượt sau'));
        if(S.chaos&&S.bonus&&S.bonus[1-S.me]===2)P.push(tg('warn','👟 lượt thêm'));
        if(n.note&&/^Bạn bị lún/.test(n.note))P.push(tg('warn',n.note));   /* lượt của mình vừa bị bỏ qua: đối thủ đang đi tiếp */
        return P;
      }
      if(S.animLock)return['Đối thủ đang đi…'].concat(off?[off]:[],hid?[hid]:[]);   /* tới lượt mình nhưng quân đối thủ chưa diễn xong (vd trượt băng): chưa cho đi */
      if(n.wait)return[tg('dim','Đang gửi…')].concat(off?[off]:[]);
      P.push(tg('good','Lượt bạn'));if(clock)P.push(clock);
      if(S.chaos&&S.bonus&&S.bonus[S.me]===2)P.push(tg('warn','👟 Lượt thêm'),'chỉ đi quân');
      else if(S.chaos&&S.mode==='item')P.push(tg('info','🔨 Chọn tường để '+(S.use==='pick'?'phá':'tháo')),'Esc: hủy');
      else if(S.chaos&&S.stuck&&S.stuck[S.me])P.push(tg('warn','⚓ Đứng yên'),'đặt tường / dùng đồ'+(S.mode==='wall'?' · '+(S.orient==='h'?'ngang':'dọc'):''));
      else P.push(S.mode==='wall'?'tường '+(S.orient==='h'?'ngang':'dọc'):'chọn ô');
      if(off)P.push(off);if(hid)P.push(hid);
      if(n.note)P.push(tg(/^(Túi đầy|Bạn bị lún|Đối thủ lún)/.test(n.note)?'warn':'bad',n.note));
      return P;
    }
    if(S.over){
      if(S.draw)return[tg('warn','Hòa'),S.ply+' nước'];
      if(allAI())return[tg('good','Chúc mừng!'),nm+' thắng'];
      return[isAI(S.turn)?tg('bad','Máy thắng'):tg('good','Bạn thắng!')];
    }
    if(allAI())return['Nước '+(S.ply+1),nm,AIs.get(S.ai[S.turn]).name].concat(S.paused?[tg('warn','Tạm dừng')]:[]);
    if(isAI(S.turn))return[tg('info','Máy đang nghĩ…')];
    return[tg('good','Lượt bạn'),S.mode==='wall'?'tường '+(S.orient==='h'?'ngang':'dọc'):'chọn ô'];
  },
  /* Vẽ dòng trạng thái (gọi riêng mỗi giây để cập nhật đồng hồ mà không dựng lại các nút ở dòng dưới). Chỉ ghi DOM khi nội dung đổi. */
  renderStatus(){
    const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const P=this.statusParts(),html=P.map(x=>typeof x==='string'?esc(x):'<span class="tg '+x[0]+'">'+esc(x[1])+'</span>').join(' <i>·</i> ');
    if(html===this._sh)return;this._sh=html;
    this.el.status.innerHTML=html;this.el.status.title=P.map(x=>typeof x==='string'?x:x[1]).join(' · ');
  },

  /* Vẽ lại chữ và nút theo trạng thái S */
  render(){
    const e=this.el,P=CFG.PLAYERS,auto=allAI(),mine=humanTurn();
    if(this.cfOpen&&this.cfCheck&&!this.cfCheck())this.closeAsk();
    this.renderStatus();
    e.info.innerHTML=P.map((p,i)=>'<b>'+p.sym+' '+this.label(i)+'</b>: '+
      (S.net?(i===S.me?'Bạn':'Đối thủ'):isAI(i)?AIs.get(S.ai[i]).name:'Bạn')+' · '+S.left[i]+' tường'+this.bagHtml(i)).join('  |  ');
    e.bMove.hidden=e.bWall.hidden=e.bRot.hidden=auto;
    e.bPause.hidden=!auto;e.bPause.textContent=(S.paused?'Tiếp':'Dừng')+' (Space)';e.bPause.disabled=S.over;
    e.bMove.setAttribute('aria-pressed',S.mode==='move');
    e.bWall.setAttribute('aria-pressed',S.mode==='wall');
    e.bMove.disabled=!mine||!!(S.chaos&&S.stuck&&S.stuck[S.turn]);   /* đứng yên: khóa nút Đi */
    e.bWall.disabled=!mine||S.left[S.turn]===0||!!(S.chaos&&S.bonus&&S.bonus[S.turn]===2);   /* lượt thêm của giày: không đặt tường */
    e.bRot.disabled=!mine||S.mode!=='wall';
    e.bView.textContent=Camera.fol>=0?'Theo '+this.label(Camera.fol)+' (E)':'Góc (E)';
    e.evalbar.hidden=!S.analysis;                              /* thanh khả năng thắng chỉ hiện khi bật đánh giá */
    /* Nút P: đang chơi (người vs người online / người vs máy) = "Đầu hàng"; ván xong = "Đấu lại" (online) hoặc "Mới" (offline) */
    const rs=App.canResign();e.bReset.classList.toggle('dn',rs);
    if(S.net){
      const rm=S.net.rematch;
      e.bReset.hidden=!!S.net.lost;
      e.bReset.disabled=rs?false:S.over?rm.me:true;   /* đang chờ nối lại mạng: khóa */
      e.bReset.textContent=rs?'Đầu hàng (P)':S.over?(rm.me?'Chờ đối thủ…':rm.opp?'Đồng ý đấu lại':'Đấu lại (P)'):'Đầu hàng (P)';
      /* Ván xong mà mình chưa bấm: nút Đấu lại sáng + nhấp nháy nhẹ (class rm). Đối thủ đã bấm: hiện thêm nhãn "Đối thủ sẵn sàng" cạnh nút và nháy mạnh hơn (rm2) */
      const want=!!S.over&&!S.net.lost&&!rm.me,opp=!!S.over&&!S.net.lost&&!!rm.opp;
      e.bReset.classList.toggle('rm',want);e.bReset.classList.toggle('rm2',want&&opp);e.rmOpp.hidden=!opp;
    }else{e.bReset.classList.remove('rm','rm2');e.rmOpp.hidden=true;e.bReset.hidden=false;e.bReset.disabled=false;e.bReset.textContent=rs?'Đầu hàng (P)':'Mới (P)';}
    e.bEval.hidden=S.analysisLock;e.bEval.setAttribute('aria-pressed',S.analysis);   /* chế độ khóa (online): ẩn luôn nút */
  }
};

