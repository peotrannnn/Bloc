'use strict';
/* [VIEW/WALLS] Tường: mỗi tường rơi từ độ cao thấp, mờ dần → rõ hẳn lúc chạm đất, nảy thấp vài lần.
   Độ cao, độ nảy, độ nghiêng, độ xoay random riêng. Độ lệch/xoay về 0 khi chạm đất nên không cắt vào ô cờ. */
const Walls={
  scene:null,geo:null,mats:null,ghostMat:null,ghosts:null,objs:[],drops:[],

  init(scene){
    const P=CFG.PITCH,C=CFG.CELL,W2=CFG.WALL,L=P+C-.06,T=P-C-.02;   /* dài 2 ô + khe, hơi ngắn lại; dày nhỏ hơn khe */
    this.scene=scene;
    this.geo={h:new THREE.BoxGeometry(L,W2.height,T),v:new THREE.BoxGeometry(T,W2.height,L)};
    this.mats=CFG.PLAYERS.map(p=>new THREE.MeshStandardMaterial({color:p.body,roughness:W2.roughness,metalness:W2.metalness}));
    this.ghostMat=new THREE.MeshStandardMaterial({color:CFG.BOARD.ghostBad,transparent:true,opacity:.6});
    /* Hai tường "ma" (ngang/dọc) tạo một lần rồi chỉ ẩn/hiện + dời chỗ */
    this.ghosts={};
    for(const o of['h','v']){
      const m=new THREE.Mesh(this.geo[o],this.ghostMat);
      m.visible=false;m.position.y=W2.ghostY;scene.add(m);this.ghosts[o]=m;
    }
  },

  showGhost(o,r,c,color){
    this.ghostMat.color.set(color);this.ghostMat.emissive.set(color);   /* phát sáng cùng màu với tường */
    for(const k in this.ghosts){
      const m=this.ghosts[k];m.visible=k===o;
      if(m.visible)m.position.set(wallX(c),CFG.WALL.ghostY,wallZ(r));
    }
  },
  hideGhost(){for(const k in this.ghosts)this.ghosts[k].visible=false;},

  /* Tường "ma" thở nhẹ: độ sáng phát ra và độ đậm tăng giảm theo sin. Trả về true khi đang hiện (cần vẽ tiếp). */
  pulse(dt){
    if(!this.ghosts.h.visible&&!this.ghosts.v.visible)return false;
    const G=CFG.WALL.ghost;this.pt=(this.pt||0)+dt;
    const k=.5+.5*Math.sin(this.pt*TAU*G.speed);
    this.ghostMat.emissiveIntensity=G.glow[0]+(G.glow[1]-G.glow[0])*k;
    this.ghostMat.opacity=G.alpha[0]+(G.alpha[1]-G.alpha[0])*k;
    return true;
  },

  /* Thả một tường của người p xuống ô (r,c) */
  add(o,r,c,p){
    const W2=CFG.WALL,mat=this.mats[p].clone();   /* vật liệu riêng để fade độc lập */
    mat.transparent=true;mat.depthWrite=false;mat.opacity=0;
    const m=new THREE.Mesh(this.geo[o],mat);
    m.castShadow=m.receiveShadow=true;
    const y0=rand(W2.drop[0],W2.drop[1]);
    const d={m,o,p,bx:wallX(c),bz:wallZ(r),y:y0,y0,vy:-rand(0,1.5),a:0,e:rand(W2.bounce[0],W2.bounce[1]),
      yaw:rand(-.3,.3),pt:rand(-.06,.06),rl:rand(-.1,.1),ox:rand(-.22,.22),oz:rand(-.22,.22),land:false};
    this.scene.add(m);this.objs.push(m);this.drops.push(d);
    this.apply(d);
    Stage.invalidate(true);
  },

  /* Xoá hết tường (ván mới) */
  clear(){
    for(const m of this.objs){this.scene.remove(m);if(m.material!==this.mats[0]&&m.material!==this.mats[1])m.material.dispose();}
    this.objs.length=0;this.drops.length=0;
    Stage.invalidate(true);
  },

  /* Đặt vị trí/góc theo trạng thái rơi. Độ lệch/xoay tỉ lệ với độ cao nên bằng 0 khi chạm đất. */
  apply(d){
    const h=Math.min(1,d.y/.6),m=d.m,long=d.o==='h';
    m.position.set(d.bx+d.ox*h,CFG.WALL.restY+d.y+.85*Math.abs(d.pt)+.04*Math.abs(d.rl),d.bz+d.oz*h);   /* nghiêng thì nâng lên để không lún xuống nền */
    m.rotation.set(long?d.rl:d.pt,d.yaw*h,long?d.pt:d.rl);
  },

  /* Trả về true nếu còn tường đang rơi (cần vẽ tiếp) */
  update(dt){
    const ds=this.drops;if(!ds.length)return false;
    const W2=CFG.WALL,f=Math.exp(-dt*5),fy=Math.exp(-dt*3.5);
    for(let i=ds.length-1;i>=0;i--){
      const d=ds[i];
      if(!d.land){
        d.vy-=W2.gravity*dt;d.y+=d.vy*dt;
        if(d.y<=0){   /* chạm đất: nảy lại nhỏ hơn; va mạnh thì nghiêng/xoay/lệch nhiều hơn */
          const vi=-d.vy,k=Math.min(1,vi/12)*.1;
          d.y=0;d.vy=vi*d.e;
          d.pt+=rand(-1,1)*k*.6;d.rl+=rand(-1,1)*k;d.yaw+=rand(-1,1)*k*1.5;d.ox+=rand(-1,1)*k;d.oz+=rand(-1,1)*k;
          if(d.vy<W2.stopSpeed){d.vy=0;d.land=true;}
        }
        d.a=Math.max(d.a,1-d.y/d.y0);   /* độ rõ chỉ tăng, không bao giờ giảm lại khi nảy */
        d.m.material.opacity=d.a;
      }
      d.pt*=f;d.rl*=f;d.ox*=f;d.oz*=f;d.yaw*=fy;
      if(d.land&&Math.abs(d.pt)+Math.abs(d.rl)<.004){   /* xong: khớp đúng khe, trả về vật liệu đặc dùng chung */
        d.pt=d.rl=0;this.apply(d);
        d.m.material.dispose();d.m.material=this.mats[d.p];
        ds.splice(i,1);continue;
      }
      this.apply(d);
    }
    return true;
  }
};
