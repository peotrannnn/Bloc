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
      (isAI(i)?AIs.get(S.ai[i]).name:'Bạn')+' · '+S.left[i]+' tường').join('  |  ');
    e.bMove.hidden=e.bWall.hidden=e.bRot.hidden=auto;
    e.bPause.hidden=!auto;e.bPause.textContent=(S.paused?'Tiếp tục':'Tạm dừng')+' (Space)';e.bPause.disabled=S.over;
    e.bMove.setAttribute('aria-pressed',S.mode==='move');
    e.bWall.setAttribute('aria-pressed',S.mode==='wall');
    e.bMove.disabled=!mine;
    e.bWall.disabled=!mine||S.left[S.turn]===0;
    e.bRot.disabled=!mine||S.mode!=='wall';
    e.bView.textContent=Camera.fol>=0?'Theo '+this.label(Camera.fol)+' (E)':'Góc nhìn (E)';
    e.evalbar.hidden=!S.analysis;                              /* thanh khả năng thắng chỉ hiện khi bật đánh giá */
    e.bEval.hidden=S.analysisLock;e.bEval.setAttribute('aria-pressed',S.analysis);   /* chế độ khóa (online): ẩn luôn nút */
  }
};
