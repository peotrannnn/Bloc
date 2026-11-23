'use strict';
/* [INPUT] Chuột, cảm ứng, bàn phím. Bấm nhẹ = đi/đặt tường. Kéo quá 6px = xoay camera.
   Chỉ nhận đi quân/đặt tường khi humanTurn() (đến lượt người, không phải máy). */
const Input={
  ray:null,ndc:null,hit:null,plane:null,
  last:null,   /* vị trí chuột gần nhất trên canvas {x,y}; null nếu chuột đang ở ngoài bàn */

  /* Khe tường gần con trỏ chuột nhất (null nếu chuột không ở trên canvas) */
  slotAtPointer(){
    if(!this.last)return null;
    const p=this.pick({clientX:this.last.x,clientY:this.last.y});
    return p?{r:wallIdx(Math.floor(p.w)),c:wallIdx(Math.floor(p.u))}:null;
  },

  init(cv){
    this.ray=new THREE.Raycaster();this.ndc=new THREE.Vector2();this.hit=new THREE.Vector3();
    this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),-TOP);
    let dn=null;
    cv.addEventListener('pointerdown',e=>{
      dn={x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,lt:e.timeStamp,moved:false};
      Camera.vy=Camera.vp=0;cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointerleave',()=>{this.last=null;});
    cv.addEventListener('pointermove',e=>{
      this.last={x:e.clientX,y:e.clientY};
      if(dn){
        if(!dn.moved&&Math.hypot(e.clientX-dn.x,e.clientY-dn.y)>6)dn.moved=Camera.dragging=true;
        if(dn.moved){
          Camera.orbit(e.clientX-dn.lx,e.clientY-dn.ly,Math.max(.008,(e.timeStamp-dn.lt)/1000));
          dn.lx=e.clientX;dn.ly=e.clientY;dn.lt=e.timeStamp;return;
        }
      }
      if(!humanTurn()||S.mode!=='wall')return;
      const p=this.pick(e);if(!p)return;
      const h={r:wallIdx(Math.floor(p.w)),c:wallIdx(Math.floor(p.u))};
      if(!S.hov||S.hov.r!==h.r||S.hov.c!==h.c){S.hov=h;App.updateGhost();}
    });
    const up=e=>{
      if(!dn)return;
      const m=dn.moved;if(m&&e.timeStamp-dn.lt>80)Camera.vy=Camera.vp=0;
      dn=null;Camera.dragging=false;
      if(!m&&e.type==='pointerup')this.act(e);
    };
    cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
    cv.addEventListener('wheel',e=>{e.preventDefault();Camera.zoomBy(e.deltaY);},{passive:false});
  },

  /* Bắn tia từ vị trí chuột */
  aim(e){
    const b=Stage.ren.domElement.getBoundingClientRect();
    this.ndc.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);
    this.ray.setFromCamera(this.ndc,Stage.cam);
  },

  /* Chỉ số quân bị tia chạm trúng (gần nhất), -1 nếu không trúng quân nào */
  pawnAt(){
    let best=-1,bd=Infinity;
    for(let i=0;i<2;i++){
      const h=this.ray.intersectObject(Pawns.list[i].g,true);
      if(h.length&&h[0].distance<bd){bd=h[0].distance;best=i;}
    }
    return best;
  },

  /* Điểm tia chạm mặt bàn, đơn vị ô: u = cột, w = hàng (số thực) */
  ground(){
    return this.ray.ray.intersectPlane(this.plane,this.hit)?{u:this.hit.x/CFG.PITCH+HALF,w:this.hit.z/CFG.PITCH+HALF}:null;
  },

  pick(e){this.aim(e);return this.ground();},

  act(e){
    this.aim(e);
    const pi=this.pawnAt();   /* bấm trúng quân: bật/tắt camera bám theo, ưu tiên hơn đi quân/đặt tường (dùng được cả khi máy đang chơi) */
    if(pi>=0){Camera.toggleFollow(pi);UI.render();return;}
    if(!humanTurn())return;
    const p=this.ground();if(!p)return;
    if(S.mode==='move'){
      const r=Math.round(p.w),c=Math.round(p.u);
      if(moves(S.turn).some(m=>m[0]===r&&m[1]===c))App.commit({move:[r,c]});
    }else{
      S.hov={r:wallIdx(Math.floor(p.w)),c:wallIdx(Math.floor(p.u))};
      if(canWall(S.orient,S.hov.r,S.hov.c)){const w={o:S.orient,r:S.hov.r,c:S.hov.c};S.hov=null;App.commit({wall:w});}
      else App.updateGhost();
    }
  }
};

