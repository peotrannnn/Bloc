'use strict';
/* [VIEW/PAWNS] Quân cờ dạng nhân vật: thân Lathe + mặt + tai + chân. Dùng chung geometry/texture cho cả hai bên.
   Mỗi lần đi, mọi thông số (tốc độ, độ cong đường đi, điểm đáp, hướng mặt, độ lắc) được random lại. */
const Pawns={
  list:[],

  /* Máy đấu máy chạy nhanh thì quân cũng đi nhanh theo */
  moveDur(){return allAI()?Math.min(.8,S.delay*.0009):.8;},

  bodyGeo(){
    const {R,H}=CFG.PAWN,pts=[new THREE.Vector2(0,0),new THREE.Vector2(R*.7,0)];
    for(let i=0;i<=12;i++){const a=i/12*Math.PI/2;pts.push(new THREE.Vector2(R*.7+Math.sin(a)*R*.3,(1-Math.cos(a))*.08));}
    pts.push(new THREE.Vector2(R,H));
    for(let i=0;i<=16;i++){const a=i/16*Math.PI/2;pts.push(new THREE.Vector2(Math.cos(a)*R,H+Math.sin(a)*R));}
    const g=new THREE.LatheGeometry(pts,64);
    g.scale(1,1,.6);g.computeVertexNormals();g.computeBoundingBox();
    return g;
  },

  /* Mặt vẽ trên canvas. Vùng mặt vắt qua mép UV nên vẽ hai lần (đầu và cuối texture). */
  faceTex(bg,fg){
    const S2=512,cv=document.createElement('canvas');cv.width=cv.height=S2;
    const g=cv.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,S2,S2);
    g.fillStyle=g.strokeStyle=fg;g.lineWidth=6;g.lineCap='round';
    for(const x of[.91*S2,-.09*S2]){
      g.save();g.translate(x,(1-.77)*S2);g.scale(.18*S2/256,.34*S2/256);
      g.beginPath();g.arc(90,120,12,0,TAU);g.fill();
      g.beginPath();g.arc(166,120,12,0,TAU);g.fill();
      g.beginPath();g.arc(128,155,24,Math.PI*.25,Math.PI*.75);g.stroke();
      g.restore();
    }
    return new THREE.CanvasTexture(cv);
  },

  build(scene){
    const {R,H,scale,pivot,roughness}=CFG.PAWN;
    const bg=this.bodyGeo(),cy=(bg.boundingBox.max.y+bg.boundingBox.min.y)/2;
    const earG=new THREE.ConeGeometry(.08,.12,3),legG=new THREE.CylinderGeometry(.025,.025,.35,16);
    this.feet=pivot-.3*scale;   /* khoảng cách từ trục xoay xuống bàn chân */
    this.list=CFG.PLAYERS.map((pc,i)=>{
      const matOpts={color:pc.body,roughness,metalness:.001};
      const mat=new THREE.MeshStandardMaterial(matOpts),bodyMat=new THREE.MeshStandardMaterial(matOpts);
      const tex=this.faceTex(pc.faceBg,pc.faceFg);
      if(pc.glow){bodyMat.emissive.setHex(0xffffff);bodyMat.emissiveMap=tex;}else bodyMat.map=tex;
      const m=new THREE.Group(),legs=[];
      const body=new THREE.Mesh(bg,bodyMat);body.position.y=-cy+.5;m.add(body);
      for(const d of[-1,1]){
        const ear=new THREE.Mesh(earG,mat);
        ear.rotation.x=Math.PI/3;ear.position.set(d*.16,.5+H+R-cy,.1);m.add(ear);
        const leg=new THREE.Mesh(legG,mat),pv=new THREE.Group();
        leg.position.y=-.175;pv.add(leg);pv.position.set(d*.18,-cy+.5,0);m.add(pv);legs.push(pv);
      }
      m.traverse(o=>{if(o.isMesh)o.castShadow=true;});
      m.scale.setScalar(scale);m.position.y=.3*scale-pivot;   /* bàn chân chạm mặt ô */
      const fl=new THREE.Group();fl.position.y=pivot;fl.add(m);   /* trục xoay ở giữa thân: để lộn và nghiêng */
      const g=new THREE.Group();g.add(fl);
      const y0=i===0?Math.PI:0;g.rotation.y=y0;   /* hai bên quay mặt về nhau (mặt nằm ở phía +z) */
      scene.add(g);
      return{g,fl,legs,y0,r:-1,c:-1,t:1,yaw:y0,tyaw:y0,
        fx:0,fy:0,fz:0,dx:0,dz:0,px:0,pz:0,lat:0,dur:.8,cyc:1.5,ez:1,sway:0,roll:0,air:1,fyaw:0,jump:false,win:false,cel:null,q:[],lr:-1,lc:-1};   /* q = hàng chờ các ô sẽ đi tới; lr,lc = ô mới nhất đã thấy trong S.pl */
    });
  },

  /* Đặt lại hai quân về ô xuất phát (ván mới) */
  reset(){
    for(let i=0;i<2;i++){
      const s=this.list[i],p=S.pl[i];
      s.g.position.set(cellX(p.c),TOP,cellZ(p.r));
      s.r=s.lr=p.r;s.c=s.lc=p.c;s.q.length=0;s.t=1;s.jump=false;s.win=false;s.cel=null;
      s.yaw=s.tyaw=s.y0;s.g.rotation.y=s.y0;s.g.scale.set(1,1,1);
      this.settle(s);
    }
  },

  /* Về tư thế đứng yên */
  settle(s){
    s.legs[0].rotation.x=s.legs[1].rotation.x=0;
    s.fl.rotation.set(0,0,0);s.fl.position.set(0,CFG.PAWN.pivot,0);   /* cả độ cao: ván mới bấm giữa lúc ăn mừng "trồng cây chuối" (fl.position.y hạ thấp) từng làm quân lún xuống sàn cả ván */
  },

  /* Bắt đầu một lần di chuyển tới ô mới: random mọi thứ một lần ở đây, các khung hình sau chỉ tính toán */
  start(s,p){
    const g=s.g,cfg=CFG.PAWN;
    s.r=p.r;s.c=p.c;
    s.fx=g.position.x;s.fy=g.position.y;s.fz=g.position.z;
    const dx=cellX(p.c)+rand(-cfg.landJitter,cfg.landJitter)-s.fx;   /* đáp lệch tâm ô một chút */
    const dz=cellZ(p.r)+rand(-cfg.landJitter,cfg.landJitter)-s.fz;
    const dl=Math.hypot(dx,dz),len=dl/CFG.PITCH;
    s.dx=dx;s.dz=dz;s.px=-dz/dl;s.pz=dx/dl;                           /* vector vuông góc để uốn cong quỹ đạo */
    s.lat=rsign()*rand(.06,.18)*Math.min(len,2);                        /* độ cong: mỗi lần một hướng, một độ lớn */
    s.jump=len>1.9;                                                     /* nhảy qua đầu đối thủ (đi 2 ô) */
    s.t=0;
    s.dur=s.jump?this.moveDur()*1.4*rand(.9,1.15):this.moveDur()*clamp(len,1,2)*rand(.85,1.2);
    if(s.q.length)s.dur*=.6;                                            /* còn nước chờ phía sau thì đi nhanh hơn để bắt kịp */
    s.cyc=1.5*Math.max(1,len)*rand(.9,1.15);                            /* nhịp chân */
    s.ez=rand(.45,1);                                                   /* 0 = đi đều, 1 = chậm đầu chậm cuối */
    s.sway=cfg.sway*rand(.8,1.2);
    s.roll=rand(-.35,.35);s.air=rand(.85,1.25);                         /* chỉ dùng khi nhảy */
    s.fyaw=Math.atan2(dx,dz)+rand(-cfg.yawJitter,cfg.yawJitter);        /* hướng mặt lúc đáp không vuông góc */
  },

  /* Một bước animation. Không cấp phát bộ nhớ. */
  step(s,dt){
    const g=s.g,fl=s.fl,PI=Math.PI,cfg=CFG.PAWN;
    s.t=Math.min(1,s.t+dt/s.dur);
    const u=s.jump?clamp((s.t-.2)/.8,0,1):s.t;                          /* nhảy: 20% đầu nén người lấy lực */
    const e=u+(smooth(u)-u)*s.ez,sn=Math.sin(PI*e);
    g.position.x=s.fx+s.dx*e+s.px*s.lat*sn;                             /* đường đi cong nhẹ thay vì thẳng tắp */
    g.position.z=s.fz+s.dz*e+s.pz*s.lat*sn;
    let y=s.fy+(TOP-s.fy)*e;
    const cs=Math.cos(PI*e)*PI*s.lat;                                   /* mặt quay theo tiếp tuyến đường cong nên hơi xéo */
    s.tyaw=s.t>=1?s.fyaw:Math.atan2(s.dx+s.px*cs,s.dz+s.pz*cs);
    if(s.jump){   /* bay theo cung parabol, lộn một vòng, hơi nghiêng ngang */
      y+=Math.sin(PI*u)*s.air;
      const f=clamp((u-.1)/.8,0,1);
      fl.rotation.x=TAU*smooth(f);
      fl.rotation.z=s.roll*Math.sin(PI*f);
      const w=Math.min(1,s.t/.2),q=s.t<.2?1-.3*smooth(w):s.t<.3?.7+3*(s.t-.2):1;   /* nén thấp 30% rồi búng lên */
      g.scale.set(1+(1-q)*.4,q,1+(1-q)*.4);
    }else{        /* đi bộ: lắc nghiêng sang hai bên theo nhịp bước, bàn chân hơi bám đất, nhún lên xuống */
      const ph=u*s.cyc*TAU,th=s.sway*Math.sin(ph)*sn;
      fl.rotation.z=th;
      fl.position.x=-this.feet*Math.sin(th)*cfg.plant;
      y+=Math.abs(Math.sin(ph))*cfg.bob*sn;
    }
    g.position.y=y;
    const a=Math.sin(PI*u)*Math.sin(u*s.cyc*TAU)*PI/4;                  /* chân đung đưa tối đa 45°, về 0 lúc đứng yên */
    s.legs[0].rotation.x=a;s.legs[1].rotation.x=-a;
  },

  /* ----- Ăn mừng khi chạm ô đích. Bốc thăm một trong 4 kiểu (CFG.CELEB). Không đụng tới g.rotation.y / s.yaw
     (camera lia theo s.yaw nên đổi nó sẽ làm camera xoay theo): mọi xoay nằm ở nhánh con fl. Cuối mỗi kiểu
     đều trả về đúng tư thế đứng yên, và không cấp phát bộ nhớ trong lúc chạy. ----- */
  win(i){this.list[i].win=true;},   /* gọi khi quân i về đích; ăn mừng bắt đầu khi nó đáp xuống xong */

  celStart(s){
    const C=CFG.CELEB,p=s.g.position,dx=p.x-cellX(s.c),dz=p.z-cellZ(s.r),kind=C.force||pick1(C.kinds),dir=rsign(),a0=Math.atan2(dz,dx);
    s.win=false;
    s.cel={kind,t:0,dur:C.dur[kind],dir,a0,r0:Math.hypot(dx,dz),off:0,last:0,exit:null};
    if(kind==='run'){const th0=dir>0?-a0:Math.PI-a0;s.cel.off=angDiff(th0,s.yaw)-th0;}   /* hướng mặt khi chạy, quy về liên tục so với s.yaw */
  },

  celStep(s,dt){
    const c=s.cel,C=CFG.CELEB,g=s.g,fl=s.fl,L0=s.legs[0],L1=s.legs[1],PI=Math.PI,pv=CFG.PAWN.pivot;
    c.t=Math.min(c.dur,c.t+dt);const t=c.t,u=t/c.dur;
    fl.rotation.set(0,0,0);fl.position.set(0,pv,0);g.scale.set(1,1,1);L0.rotation.set(0,0,0);L1.rotation.set(0,0,0);g.position.y=TOP;   /* về tư thế gốc rồi mỗi kiểu tự thêm phần của mình */
    let a=0;
    switch(c.kind){
      case 'flip':{   /* nén xuống, búng lên, lộn một vòng, đáp: cùng kiểu với cú nhảy qua đầu đối thủ */
        const uu=clamp((u-.2)/.8,0,1),w=Math.min(1,u/.2);
        g.position.y=TOP+Math.sin(PI*uu)*C.flip.air;
        fl.rotation.x=TAU*smooth(clamp((uu-.1)/.8,0,1));
        const q=u<.2?1-.3*smooth(w):u<.3?.7+3*(u-.2):1;
        g.scale.set(1+(1-q)*.4,q,1+(1-q)*.4);
        a=Math.sin(PI*uu)*Math.sin(uu*3*TAU)*PI/4;L0.rotation.x=a;L1.rotation.x=-a;break;}
      case 'hiphop':{   /* trồng cây chuối: lộn ngược đầu chúi xuống, xoay tròn, hai chân chỉa lên trời đung đưa */
        const H=C.hiphop,e=smooth(clamp(t/.35,0,1))*smooth(clamp((c.dur-t)/.35,0,1));   /* vào/ra tư thế */
        fl.rotation.x=PI*e;fl.rotation.y=TAU*H.turns*smooth(u);                          /* tổng số vòng nguyên nên cuối không bị giật */
        fl.position.y=pv-H.drop*e+Math.sin(t*14)*.02*e;
        a=Math.sin(t*H.swing)*H.legAmp*e;L0.rotation.x=a;L1.rotation.x=-a;break;}
      case 'bounce':{   /* nảy cà tưng: bẹp xuống lúc chạm đất, vươn dài lúc lên cao, hơi nghiêng qua lại */
        const B=C.bounce,ph=u*B.hops,f=ph-Math.floor(ph),env=smooth(clamp(t/.2,0,1))*smooth(clamp((c.dur-t)/.4,0,1));
        g.position.y=TOP+4*f*(1-f)*B.h*env;
        const q=1-B.squash*(1-clamp(Math.min(f,1-f)/.12,0,1))*env+.1*Math.sin(PI*f)*env;
        g.scale.set(1+(1-q)*.4,q,1+(1-q)*.4);
        fl.rotation.z=.12*Math.sin(ph*TAU)*env;
        a=Math.sin(ph*TAU)*PI/4*env;L0.rotation.x=a;L1.rotation.x=-a;break;}
      case 'run':{   /* chạy nhanh quanh tâm ô, mặt hướng theo đường chạy, nghiêng vào trong; cuối thu về giữa ô */
        const R=C.run,inn=smooth(clamp(t/.4,0,1)),out=smooth(clamp((c.dur-t)/.45,0,1));
        const ang=c.a0+c.dir*TAU*R.laps*(u+(smooth(u)-u)*.5),rad=(c.r0+(R.radius-c.r0)*inn)*out;
        g.position.x=cellX(s.c)+rad*Math.cos(ang);g.position.z=cellZ(s.r)+rad*Math.sin(ang);
        if(out>=1){c.last=(c.dir>0?-ang:PI-ang)+c.off;c.last*=inn;fl.rotation.y=c.last;}
        else{if(c.exit===null)c.exit=angDiff(c.last,0);fl.rotation.y=c.exit*out;}       /* ra: quay mặt về hướng ban đầu theo đường ngắn nhất */
        fl.rotation.z=R.lean*c.dir*inn*out;
        const ph=t*R.cadence;a=Math.sin(ph)*PI/4;L0.rotation.x=a;L1.rotation.x=-a;
        g.position.y=TOP+Math.abs(Math.sin(ph))*.05*inn*out;break;}
    }
    if(t>=c.dur){   /* xong: trả về tư thế đứng yên */
      s.cel=null;g.position.y=TOP;g.scale.set(1,1,1);fl.rotation.set(0,0,0);fl.position.set(0,pv,0);L0.rotation.set(0,0,0);L1.rotation.set(0,0,0);
    }
  },

  /* Trả về true nếu còn đang chuyển động (cần vẽ tiếp) */
  update(dt){
    let busy=false;
    for(let i=0;i<2;i++){
      const s=this.list[i],p=S.pl[i];
      /* Nước mới vào hàng chờ; chỉ bắt đầu đi khi nước trước ĐÃ ĐÁP XUỐNG XONG (không cắt ngang giữa lúc đang nhảy/lộn) */
      if(s.lr!==p.r||s.lc!==p.c){s.lr=p.r;s.lc=p.c;s.q.push({r:p.r,c:p.c});}
      if(s.t>=1&&s.q.length){this.settle(s);s.g.scale.set(1,1,1);this.start(s,s.q.shift());}
      if(s.t<1){this.step(s,dt);busy=true;}
      else if(s.cel){this.celStep(s,dt);busy=true;}
      else if(s.win){this.celStart(s);busy=true;}   /* đã đáp xuống ô đích: bắt đầu ăn mừng */
      else if(s.legs[0].rotation.x!==0||s.fl.rotation.x!==0||s.fl.rotation.y!==0||s.fl.rotation.z!==0||s.fl.position.x!==0||s.fl.position.y!==CFG.PAWN.pivot)this.settle(s);
      const d=angDiff(s.tyaw,s.yaw);
      if(Math.abs(d)>.002){s.yaw+=d*(1-Math.exp(-dt*7));s.g.rotation.y=s.yaw;busy=true;}
    }
    return busy;
  }
};
