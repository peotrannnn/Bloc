'use strict';
/* [VIEW/CAMERA] Camera quỹ đạo quanh một điểm nhìn: y = góc xoay ngang, p = góc nghiêng, d = khoảng cách.
   t* là giá trị đích, v* là quán tính sau khi thả chuột.
   Chế độ bám theo (fol >= 0): điểm nhìn đi theo quân, camera lia ra sau lưng quân (nhìn về phía đích) rồi khóa theo.
   Vẫn kéo chuột để xoay quanh quân và lăn chuột để zoom. */
const Camera={
  y:0,p:CFG.CAM.pitch,d:14,ty:0,tp:CFG.CAM.pitch,td:14,vy:0,vp:0,zoom:1,aspect:1,dragging:false,
  fol:-1,              /* chỉ số quân đang bám theo, -1 = toàn cảnh */
  sub:null,saved:null, /* sub: vật bất kỳ có .g (Group) và .yaw mà camera đang KHÓA vào (người chặn đường, xem lock); saved: góc nhìn cũ để trả lại */
  distOv:0,            /* khoảng cách riêng khi khóa vào sub (0 = dùng theo fol/face) */
  face:false,          /* true: ngoài bám vị trí, camera còn lia ra trước mặt quân (dùng lúc thắng) */
  cx:0,cy:0,cz:0,      /* điểm nhìn hiện tại */
  gx:0,gy:0,gz:0,      /* điểm nhìn đích */

  baseDist(){
    const C=CFG.CAM,d=this.distOv||(this.fol<0?C.dist:this.face?C.faceDist:C.followDist);
    return d/Math.min(1,this.aspect*1.15);
  },

  resize(w,h){
    const cam=Stage.cam;
    this.aspect=w/h;cam.aspect=this.aspect;cam.updateProjectionMatrix();
    this.d=this.td=this.baseDist()*this.zoom;this.place();
  },

  place(){
    const c=Math.cos(this.p)*this.d,cam=Stage.cam;
    cam.position.set(this.cx+Math.sin(this.y)*c,this.cy+Math.sin(this.p)*this.d,this.cz+Math.cos(this.y)*c);
    cam.lookAt(this.cx,this.cy,this.cz);
  },

  /* Kéo chuột: dx, dy tính bằng pixel, dt tính bằng giây */
  orbit(dx,dy,dt){
    if(this.sub)return;   /* đang khóa vào sự kiện: không cho xoay */
    const C=CFG.CAM;
    this.face=false;   /* người dùng tự xoay camera thì thôi tự lia theo mặt quân */
    this.ty-=dx*.006;this.tp=clamp(this.tp+dy*.005,C.minPitch,C.maxPitch);
    this.vy=.7*this.vy+.3*(-dx*.006/dt);this.vp=.7*this.vp+.3*(dy*.005/dt);
    Stage.invalidate();
  },

  zoomBy(deltaY){
    if(this.sub)return;
    this.zoom=clamp(this.zoom*Math.exp(deltaY*.001),CFG.CAM.minZoom,CFG.CAM.maxZoom);
    this.td=this.baseDist()*this.zoom;Stage.invalidate();
  },

  /* Bấm vào quân i: bám theo quân đó; bấm lại đúng quân đó thì về toàn cảnh */
  toggleFollow(i){if(this.sub)return;if(this.fol===i)this.resetView();else this.follow(i);},

  /* face=true: sau khi khóa vị trí, camera còn quay dần ra phía trước mặt quân (xem update) */
  follow(i,face){
    const g=Pawns.list[i].g.position;
    this.fol=i;this.face=!!face;this.zoom=1;
    this.gx=g.x;this.gz=g.z;this.gy=CFG.CAM.followLook;
    this.ty=this.y+angDiff(i===0?0:Math.PI,this.y);   /* ra sau lưng quân, nhìn về phía đích; xoay theo đường ngắn nhất */
    this.tp=face?CFG.CAM.facePitch:CFG.CAM.followPitch;this.td=this.baseDist();
    this.vy=this.vp=0;Stage.invalidate();
  },

  /* Đặt camera ngay vào góc mặc định, không lướt (dùng lúc bắt đầu ván để khỏi thấy màn hình xoay) */
  snapHome(){
    this.sub=null;this.saved=null;this.distOv=0;
    this.fol=-1;this.gx=this.gy=this.gz=this.cx=this.cy=this.cz=0;
    this.y=this.ty=homeSide()===0?0:Math.PI;
    this.p=this.tp=CFG.CAM.pitch;this.zoom=1;
    this.d=this.td=this.baseDist();this.vy=this.vp=0;
    this.place();Stage.invalidate();
  },

  /* Phím E: đi tới quân kế tiếp trong order; hết danh sách thì về toàn cảnh */
  cycle(order){
    if(this.sub)return;
    const n=order.indexOf(this.fol)+1;
    if(n>=order.length)this.resetView();else this.follow(order[n]);
  },

  /* KHÓA camera vào vật o (có o.g.position và o.yaw): điểm nhìn đi theo o, camera lia ra TRƯỚC mặt o (xoay theo o.yaw, giống lúc quân thắng), gần và thấp.
     cfg = {dist,pitch,look}. Trong lúc khóa, xoay/zoom/bấm quân/phím E đều bị chặn (xem orbit, zoomBy, toggleFollow, cycle). Góc nhìn cũ được nhớ để unlock trả lại. */
  lock(o,cfg){
    if(!this.sub)this.saved={fol:this.fol,face:this.face,ty:this.ty,tp:this.tp,zoom:this.zoom};
    this.rate=cfg.rate||null;   /* tốc độ làm mượt riêng lúc khóa (chậm hơn bình thường cho đỡ chóng mặt) */
    this.sub=o;this.fol=-1;this.face=true;this.zoom=1;this.dragging=false;
    this.distOv=cfg.dist;this.td=this.baseDist();this.tp=cfg.pitch;this.gy=cfg.look;
    this.gx=o.g.position.x;this.gz=o.g.position.z;
    this.vy=this.vp=0;Stage.invalidate();
  },
  /* Gỡ khóa: trả đúng góc nhìn trước đó (đang bám quân nào thì bám lại, đang toàn cảnh thì về đúng góc đã xoay) */
  unlock(){
    if(!this.sub)return;
    const v=this.saved;this.sub=null;this.saved=null;this.rate=null;this.distOv=0;this.face=false;
    if(v&&v.fol>=0)this.follow(v.fol,v.face);
    else{
      this.fol=-1;this.gx=this.gy=this.gz=0;this.zoom=v?v.zoom:1;
      this.ty=this.y+angDiff(v?v.ty:this.ty,this.y);this.tp=v?v.tp:CFG.CAM.pitch;this.td=this.baseDist()*this.zoom;
    }
    this.vy=this.vp=0;Stage.invalidate();
  },

  /* Về toàn cảnh bàn cờ, nhìn từ phía quân của người chơi (homeSide) */
  resetView(){
    if(this.sub)return;
    this.fol=-1;this.gx=this.gy=this.gz=0;
    this.ty=this.y+angDiff(homeSide()===0?0:Math.PI,this.y);this.tp=CFG.CAM.pitch;this.zoom=1;
    this.td=this.baseDist();this.vy=this.vp=0;Stage.invalidate();
  },

  /* Trả về true nếu camera còn đang chuyển động */
  update(dt){
    const C=CFG.CAM;
    const tg=this.sub||(this.fol>=0?Pawns.list[this.fol]:null);
    if(tg){
      const s=tg,g=s.g.position;this.gx=g.x;this.gz=g.z;
      /* Mặt quân quay về hướng (sin yaw, cos yaw) trên mặt bàn; camera đứng đúng hướng đó thì nhìn thẳng vào mặt.
         Lấy góc tương đương gần góc hiện tại nhất để không bao giờ quay một vòng dài. s.yaw đã được làm mượt
         sẵn trong Pawns nên không cần thêm bộ lọc nào khác. */
      if(this.face)this.ty=this.y+angDiff(s.yaw,this.y);
    }   /* khóa theo quân */
    if(!this.dragging){   /* quán tính sau khi thả chuột */
      this.ty+=this.vy*dt;this.tp=clamp(this.tp+this.vp*dt,C.minPitch,C.maxPitch);
      const f=Math.exp(-dt*3.5);this.vy*=f;this.vp*=f;
      if(Math.abs(this.vy)<.02)this.vy=0;
      if(Math.abs(this.vp)<.02)this.vp=0;
    }
    const Rt=this.sub&&this.rate,k=1-Math.exp(-dt*(Rt?Rt.ang:12)),kt=1-Math.exp(-dt*(Rt?Rt.pos:5));   /* làm mượt, không phụ thuộc tốc độ khung hình; điểm nhìn lia chậm hơn cho mượt */
    const ky=this.face&&(this.fol>=0||this.sub)?1-Math.exp(-dt*(Rt?Rt.yaw:3)):k;   /* lia ra trước mặt chậm hơn cho nhẹ nhàng */
    this.y+=(this.ty-this.y)*ky;this.p+=(this.tp-this.p)*k;this.d+=(this.td-this.d)*k;
    this.cx+=(this.gx-this.cx)*kt;this.cy+=(this.gy-this.cy)*kt;this.cz+=(this.gz-this.cz)*kt;
    this.place();
    return Math.abs(this.ty-this.y)>5e-4||Math.abs(this.tp-this.p)>5e-4||Math.abs(this.td-this.d)>5e-3||
      Math.abs(this.gx-this.cx)>5e-4||Math.abs(this.gy-this.cy)>5e-4||Math.abs(this.gz-this.cz)>5e-4||this.vy!==0||this.vp!==0;
  }
};
