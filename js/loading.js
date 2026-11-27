'use strict';
/* [LOADING] Màn hình tải DÙNG CHUNG: phủ kín cửa sổ, chặn chuột/phím, có thanh tiến độ. Dùng khi:
   - vừa vào phòng / vào ván (App.start): tải three.js, dựng cảnh, dựng bản đồ, biên dịch shader;
   - đấu lại (rematch) trong cùng phòng (App.netIn 'started' → App.newGame(true)).
   Việc nặng (dựng địa hình, biên dịch shader) chạy ĐỒNG BỘ nên làm đứng trang vài giây trên GPU/driver chậm; màn hình này cho người chơi thấy
   "đang tải" thay vì nghĩ game bị treo. Mỗi bước phải `await Loading.step(...)` TRƯỚC việc nặng để trình duyệt kịp vẽ thanh tiến độ.
   Hoạt ảnh của ô vuông xoay dùng transform (chạy trên GPU compositor) nên vẫn quay khi JS đang bận.
     Loading.show(tiêuĐề, dòngChữ, %)   hiện ngay (không mờ dần, để chắc chắn vẽ được trước việc nặng)
     await Loading.step(%, dòngChữ)     cập nhật rồi chờ trình duyệt vẽ xong
     await Loading.hide(msTốiThiểu)     ẩn (nếu chưa đủ msTốiThiểu thì chờ cho khỏi chớp) */
const Loading={
  el:null,bar:null,msg:null,title:null,since:0,shown:false,timer:0,
  init(){
    if(this.el)return true;
    this.el=document.getElementById('loading');if(!this.el)return false;
    this.bar=this.el.querySelector('.ldbar b');this.msg=this.el.querySelector('.ldmsg');this.title=this.el.querySelector('.ldtitle');
    return true;
  },
  /* Chờ trình duyệt tô xong khung hiện tại (rAF → tác vụ kế). Tab bị ẩn thì rAF không chạy nên có đồng hồ dự phòng. */
  paint(){
    return new Promise(ok=>{
      let done=false;const go=()=>{if(!done){done=true;ok();}};
      requestAnimationFrame(()=>setTimeout(go,0));setTimeout(go,120);
    });
  },
  show(title,text,pct){
    if(!this.init())return;
    clearTimeout(this.timer);
    this.el.classList.remove('out');this.el.hidden=false;this.shown=true;this.since=performance.now();
    this.title.textContent=title||'Đang tải';this.set(pct||0,text||'');
  },
  set(pct,text){
    if(!this.el)return;
    this.bar.style.width=Math.max(0,Math.min(100,pct))+'%';
    if(text!==undefined)this.msg.textContent=text;
  },
  async step(pct,text){
    if(!this.shown)return;
    this.set(pct,text);
    await this.paint();
  },
  async hide(minMs){
    if(!this.shown)return;
    this.set(100);
    const wait=(minMs||0)-(performance.now()-this.since);
    if(wait>0)await new Promise(r=>setTimeout(r,wait));
    this.shown=false;this.el.classList.add('out');
    this.timer=setTimeout(()=>{if(!this.shown){this.el.hidden=true;this.el.classList.remove('out');}},180);   /* mờ dần rồi mới ẩn hẳn */
  }
};
