'use strict';
/* [UI] Thanh trạng thái, nút điều khiển trong ván, thanh tiến trình tải. (Menu chính nằm ở menu.js) */
const UI={
  el:{},

  init(){
    for(const id of['evalbar','evW','evBt','evWt','status','info','host','menu','ld','bar','msg','bMove','bWall','bRot','bPause','bView','bEval','bReset','bMenu'])this.el[id]=$(id);
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

  /* Dòng trạng thái theo chế độ chơi */
  statusText(){
    const nm=this.label(S.turn);
    if(S.net){   /* đấu online */
      if(S.net.lost)return S.net.lost;
      if(S.over){
        if(S.draw)return 'Hòa sau '+S.ply+' nước';
        if(S.winner===S.me&&S.net.reason==='timeout')return 'Đối thủ mất kết nối quá lâu · bạn thắng!';
        if(S.winner===S.me&&S.net.reason==='resign')return 'Đối thủ đầu hàng · bạn thắng!';
        if(S.winner>=0&&S.winner!==S.me&&S.net.reason==='timeout')return 'Bạn mất kết nối quá lâu · bạn thua';
        if(S.winner===S.me&&S.net.reason==='turn')return 'Đối thủ hết giờ · bạn thắng!';
        if(S.winner>=0&&S.winner!==S.me&&S.net.reason==='turn')return 'Bạn hết giờ · bạn thua';
        return S.winner<0?'Ván kết thúc':S.winner===S.me?'Bạn thắng!':'Đối thủ thắng';
      }
      if(S.net.offline)return 'Mất kết nối · đang nối lại…';
      const off=S.net.oppOnline===false?' · đối thủ đang mất kết nối':'';
      const tl=S.net.deadline?Math.max(0,Math.ceil((S.net.deadline-Date.now())/1000)):0,clk=tl?' · còn '+tl+'s':'';   /* đồng hồ lượt */
      if(S.turn!==S.me)return 'Đến lượt đối thủ'+clk+off;
      if(S.net.wait)return 'Đang gửi nước đi…'+off;
      return 'Lượt của bạn'+clk+(S.mode==='wall'?' · đặt tường '+(S.orient==='h'?'ngang':'dọc'):' · chọn ô để đi')+off;
    }
    if(S.over){
      if(S.draw)return 'Hòa sau '+S.ply+' nước';
      if(allAI())return 'Chúc mừng! '+nm+' thắng';
      return isAI(S.turn)?'Máy thắng':'Bạn thắng!';
    }
    if(allAI())return 'Nước '+(S.ply+1)+' · '+nm+' · '+AIs.get(S.ai[S.turn]).name+(S.paused?' · Tạm dừng':'');
    if(isAI(S.turn))return 'Máy đang nghĩ…';
    return 'Lượt của bạn'+(S.mode==='wall'?' · đặt tường '+(S.orient==='h'?'ngang':'dọc'):' · chọn ô để đi');
  },

  /* Vẽ lại chữ và nút theo trạng thái S */
  render(){
    const e=this.el,P=CFG.PLAYERS,auto=allAI(),mine=humanTurn();
    e.status.textContent=this.statusText();
    e.info.innerHTML=P.map((p,i)=>'<b>'+this.label(i)+'</b>: '+
      (S.net?(i===S.me?'Bạn':'Đối thủ'):isAI(i)?AIs.get(S.ai[i]).name:'Bạn')+' · '+S.left[i]+' tường').join('  |  ');
    e.bMove.hidden=e.bWall.hidden=e.bRot.hidden=auto;
    e.bPause.hidden=!auto;e.bPause.textContent=(S.paused?'Tiếp tục':'Tạm dừng')+' (Space)';e.bPause.disabled=S.over;
    e.bMove.setAttribute('aria-pressed',S.mode==='move');
    e.bWall.setAttribute('aria-pressed',S.mode==='wall');
    e.bMove.disabled=!mine;
    e.bWall.disabled=!mine||S.left[S.turn]===0;
    e.bRot.disabled=!mine||S.mode!=='wall';
    e.bView.textContent=Camera.fol>=0?'Theo '+this.label(Camera.fol)+' (E)':'Góc nhìn (E)';
    e.evalbar.hidden=!S.analysis;                              /* thanh khả năng thắng chỉ hiện khi bật đánh giá */
    if(S.net){   /* online: nút này là "Đấu lại", chỉ hiện khi ván đã xong */
      const rm=S.net.rematch;
      e.bReset.hidden=!S.over||!!S.net.lost;
      e.bReset.disabled=rm.me;
      e.bReset.textContent=rm.me?'Đang chờ đối thủ…':rm.opp?'Đối thủ muốn đấu lại · bấm để đồng ý':'Đấu lại (P)';
    }else{e.bReset.hidden=false;e.bReset.disabled=false;e.bReset.textContent='Ván mới (P)';}
    e.bEval.hidden=S.analysisLock;e.bEval.setAttribute('aria-pressed',S.analysis);   /* chế độ khóa (online): ẩn luôn nút */
  }
};

