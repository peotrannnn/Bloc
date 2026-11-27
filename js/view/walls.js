'use strict';
/* [VIEW/WALLS] Tường: mỗi tường rơi từ độ cao thấp, mờ dần → rõ hẳn lúc chạm đất, nảy thấp vài lần.
   Độ cao, độ nảy, độ nghiêng, độ xoay random riêng. Độ lệch/xoay về 0 khi chạm đất nên không cắt vào ô cờ. */
const Walls={
  scene:null,geo:null,mats:null,ghostMat:null,ghosts:null,objs:[],drops:[],fades:[],rubbles:[],

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
  add(o,r,c,p,instant){
    const W2=CFG.WALL;
    if(instant){   /* dựng lại bàn (resync): đặt thẳng vào khe, không rơi/mờ dần */
      const q=new THREE.Mesh(this.geo[o],this.mats[p]);
      q.userData={o,r,c,p};q.castShadow=q.receiveShadow=true;
      q.position.set(wallX(c),W2.restY,wallZ(r));
      this.scene.add(q);this.objs.push(q);Stage.invalidate(true);return;
    }
    const mat=this.mats[p].clone();   /* vật liệu riêng để fade độc lập */
    mat.transparent=true;mat.depthWrite=false;mat.opacity=0;
    const m=new THREE.Mesh(this.geo[o],mat);
    m.userData={o,r,c,p};   /* để Walls.remove tìm lại tường theo khe */
    m.castShadow=m.receiveShadow=true;
    m.renderOrder=2;   /* đang mờ dần (trong suốt, không ghi độ sâu): vẽ SAU kính băng/nước (renderOrder 1), nếu không kính phủ lên tường và tường nhìn như bị chìm/lỗi */
    const y0=rand(W2.drop[0],W2.drop[1]);
    const d={m,o,p,bx:wallX(c),bz:wallZ(r),y:y0,y0,vy:-rand(0,1.5),a:0,e:rand(W2.bounce[0],W2.bounce[1]),
      yaw:rand(-.3,.3),pt:rand(-.06,.06),rl:rand(-.1,.1),ox:rand(-.22,.22),oz:rand(-.22,.22),land:false};
    this.scene.add(m);this.objs.push(m);this.drops.push(d);
    this.apply(d);
    Stage.invalidate(true);
  },

  /* Gỡ tường ở khe (o,r,c) bằng vật phẩm: 'hammer' = tường bị nhấc bay lên, xoay, mờ dần (được trả về cho chủ) · 'pick' = tường vỡ vụn, mảnh văng ra rồi nằm lại thành đống đổ nát (khe bị chiếm vĩnh viễn).
     Không có tường ở khe đó (vd ván dựng lại) thì chỉ để lại đống đổ nát (pick). */
  remove(o,r,c,how){
    const i=this.objs.findIndex(m=>m.userData&&m.userData.o===o&&m.userData.r===r&&m.userData.c===c);
    const bx=wallX(c),bz=wallZ(r);
    Sfx.play(how==='pick'?'pick':'hammer',{x:bx,z:bz});
    if(i>=0){
      const m=this.objs[i];this.objs.splice(i,1);
      const di=this.drops.findIndex(d=>d.m===m);if(di>=0)this.drops.splice(di,1);
      const mat=m.material.clone();mat.transparent=true;mat.depthWrite=false;m.material=mat;m.renderOrder=2;
      if(how==='pick'){this.fades.push({m,k:'crumble',t:0,dur:.35,y:m.position.y});this.shatter(o,bx,bz,m.userData.p);}
      else this.fades.push({m,k:'fly',t:0,dur:.7,y:m.position.y,spin:rand(-5,5),vy:rand(4,5.5)});
    }
    if(how==='pick')this.rubble(o,r,c);
    Stage.invalidate(true);
  },
  /* Mảnh vỡ văng ra khi cuốc chim phá tường (rơi theo trọng lực, nảy nhẹ, nằm lại làm đống đổ nát) */
  shatter(o,bx,bz,p){
    if(!this.debrisGeo)this.debrisGeo=new THREE.BoxGeometry(.2,.13,.16);
    const long=o==='h';
    for(let k=0;k<7;k++){
      const m=new THREE.Mesh(this.debrisGeo,this.mats[p]);m.castShadow=true;
      const u=(k/6-.5)*1.5;   /* rải dọc chiều dài tường */
      m.position.set(bx+(long?u:rand(-.08,.08)),CFG.WALL.restY+.1,bz+(long?rand(-.08,.08):u));
      m.rotation.set(rand(0,3),rand(0,3),rand(0,3));
      this.scene.add(m);this.objs.push(m);
      this.fades.push({m,k:'debris',t:0,dur:1.2,vx:(long?u*1.4:0)+rand(-.6,.6),vz:(long?0:u*1.4)+rand(-.6,.6),vy:rand(2,4.2),keep:true,rx:rand(-6,6),rz:rand(-6,6)});
    }
  },
  /* Đống đổ nát vĩnh viễn ở khe (o,r,c): vài mảnh sẫm nằm thấp dọc theo khe (không có hình tường nên không bị nhầm là tường) */
  rubble(o,r,c){
    if(this.rubbles.some(g=>g.userData.o===o&&g.userData.r===r&&g.userData.c===c))return;
    if(!this.rubbleMat){this.rubbleMat=new THREE.MeshStandardMaterial({color:0x5a554e,roughness:.95,metalness:0});this.rubbleGeo=new THREE.BoxGeometry(.16,.07,.12);}
    const g=new THREE.Group();g.userData={o,r,c};g.position.set(wallX(c),CFG.WALL.restY-.2,wallZ(r));
    let sd=(r*131+c*17+(o==='h'?7:3))>>>0;const rr=()=>{sd=(Math.imul(sd,1664525)+1013904223)>>>0;return sd/4294967296;};   /* seed theo khe: mọi máy thấy cùng một đống */
    for(let k=0;k<6;k++){
      const m=new THREE.Mesh(this.rubbleGeo,this.rubbleMat);m.castShadow=m.receiveShadow=true;
      const u=(k/5-.5)*1.3;m.position.set(o==='h'?u:(rr()-.5)*.12,rr()*.05,o==='h'?(rr()-.5)*.12:u);
      m.rotation.set(rr()*.6,rr()*6.28,rr()*.6);m.scale.setScalar(.7+rr()*.7);g.add(m);
    }
    this.scene.add(g);this.rubbles.push(g);Stage.invalidate(true);
  },
  /* Tường của đối thủ đang được chọn làm mục tiêu (búa/cuốc chim): dùng tường "ma" phủ đúng lên tường đó */
  showTarget(o,r,c,color){this.showGhost(o,r,c,color);this.ghosts[o].position.y=CFG.WALL.restY;},

  /* Xoá hết tường (ván mới) */
  clear(){
    for(const m of this.objs){this.scene.remove(m);if(m.material!==this.mats[0]&&m.material!==this.mats[1])m.material.dispose();}
    for(const f of this.fades)if(!this.objs.includes(f.m)){this.scene.remove(f.m);if(f.m.material&&f.m.material!==this.mats[0]&&f.m.material!==this.mats[1])f.m.material.dispose();}
    for(const g of this.rubbles)this.scene.remove(g);
    this.rubbles.length=0;this.fades.length=0;
    this.objs.length=0;this.drops.length=0;
    Stage.invalidate(true);
  },

  /* Đặt vị trí/góc theo trạng thái rơi. Độ lệch/xoay tỉ lệ với độ cao nên bằng 0 khi chạm đất. */
  apply(d){
    const h=Math.min(1,d.y/.6),m=d.m,long=d.o==='h';
    m.position.set(d.bx+d.ox*h,CFG.WALL.restY+d.y+.85*Math.abs(d.pt)+.04*Math.abs(d.rl),d.bz+d.oz*h);   /* nghiêng thì nâng lên để không lún xuống nền */
    m.rotation.set(long?d.rl:d.pt,d.yaw*h,long?d.pt:d.rl);
  },

  /* Hoạt ảnh gỡ tường (xem remove). Trả true nếu còn việc để vẽ tiếp. */
  stepFades(dt){
    const fs=this.fades;if(!fs.length)return false;
    for(let i=fs.length-1;i>=0;i--){
      const f=fs[i],m=f.m;f.t+=dt;const x=Math.min(1,f.t/f.dur);
      if(f.k==='fly'){   /* búa: nhấc bay lên, xoay, mờ dần */
        f.vy-=14*dt;f.y+=f.vy*dt;m.position.y=f.y;m.rotation.y+=f.spin*dt;m.rotation.z+=f.spin*.4*dt;m.material.opacity=1-x;
      }else if(f.k==='crumble'){   /* cuốc chim: tường rung rồi sụp xuống, mờ dần */
        m.position.y=f.y-.25*x*x;m.scale.set(1,1-.7*x,1);m.position.x+=Math.sin(f.t*70)*.012*(1-x);m.material.opacity=1-x*x;
      }else{   /* mảnh vụn: văng, rơi, nảy một cái, nằm lại */
        f.vy-=16*dt;m.position.x+=f.vx*dt;m.position.z+=f.vz*dt;m.position.y+=f.vy*dt;m.rotation.x+=f.rx*dt;m.rotation.z+=f.rz*dt;
        const fl=CFG.WALL.restY-.18;
        if(m.position.y<=fl){m.position.y=fl;if(f.vy<-2){f.vy*=-.3;f.vx*=.5;f.vz*=.5;}else{f.vy=0;f.vx=f.vz=0;f.rx=f.rz=0;}}
        if(f.t>=f.dur){fs.splice(i,1);}
        continue;
      }
      if(x>=1){this.scene.remove(m);m.material.dispose();fs.splice(i,1);}
    }
    Stage.invalidate(true);return fs.length>0;
  },

  /* Trả về true nếu còn tường đang rơi (cần vẽ tiếp) */
  update(dt){
    const fb=this.stepFades(dt);
    const ds=this.drops;if(!ds.length)return fb;
    const W2=CFG.WALL,f=Math.exp(-dt*5),fy=Math.exp(-dt*3.5);
    for(let i=ds.length-1;i>=0;i--){
      const d=ds[i];
      if(!d.land){
        d.vy-=W2.gravity*dt;d.y+=d.vy*dt;
        if(d.y<=0){   /* chạm đất: nảy lại nhỏ hơn; va mạnh thì nghiêng/xoay/lệch nhiều hơn */
          const vi=-d.vy,k=Math.min(1,vi/12)*.1;
          if(vi>.5)Sfx.play('wall',{x:d.bx,z:d.bz,v:clamp(vi/8,.12,1)});
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
        d.m.material.dispose();d.m.material=this.mats[d.p];d.m.renderOrder=0;
        ds.splice(i,1);continue;
      }
      this.apply(d);
    }
    return true;
  }
};
