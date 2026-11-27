'use strict';
/* [VIEW/PAWNS] Quân cờ dạng nhân vật: thân Lathe + mặt + tai + chân. Dùng chung geometry/texture cho cả hai bên.
   Mỗi lần đi, mọi thông số (tốc độ, độ cong đường đi, điểm đáp, hướng mặt, độ lắc) được random lại.

   Hàng chờ s.q của mỗi quân gồm các đoạn chuyển động chạy lần lượt (đoạn sau chỉ bắt đầu khi đoạn trước XONG):
     {k:'walk',r,c}                  đi/nhảy tới ô (mặc định khi chỉ có {r,c})
     {k:'slide',path:[[r,c],…]}      trượt băng: path[0] là ô băng quân đang đứng; ngã (ngửa/sấp/nghiêng, ngẫu nhiên) → trượt lần lượt qua từng ô (xoay/lăn/lắc, ngẫu nhiên) → nằm im → ngồi dậy rồi đứng lên ở ô cuối
     {k:'launch',from:[r,c],to:[r,c]}  bị bẫy hất: tấm bẫy bật tung, quân bay vòng cung, lộn tiếp đất, nhún rồi NGÃ + nằm im + đứng dậy (begin tự xếp thêm một đoạn slide rỗng land:true ngay sau)
     {k:'chest',cell:[r,c],gift}     mở rương: quân KHỰNG LẠI ở ô kề (chưa bước vào), quay mặt về rương; rương mở nắp, quà nổi lên (Marks.pop) và quân nhún mừng; hết CFG.CHEST.wait giây thì đoạn walk kế tiếp mới bước vào ô (rương lúc đó đã biến mất)
     {k:'hide'} / {k:'show'}           ẩn / hiện mesh ngay (chạy liền, không tốn khung hình): quân đi bộ tới bụi cỏ bằng đoạn walk thường rồi mới ẩn, quân lộ ra thì hiện ngay rồi đi tiếp
     {k:'blink',from,to,wait?}       dịch chuyển cổng: nén người → xoáy tít bay lên, co thành tia sáng biến mất; tia nối hai cổng; rơi xoáy xuống cổng kia, nhún khi đáp. wait = chỉ số quân kia: đợi nó đứng yên hẳn mới bắt đầu

   Độ LÚN khi đứng trên ô nước nằm riêng ở nhóm s.sk (cha của s.fl, con của s.g) và chỉ phụ thuộc vị trí + độ cao hiện tại của quân, KHÔNG phụ thuộc đoạn
   animation nào đang chạy → mọi animation (đi, nhảy, ngã, trượt, ăn mừng, dịch chuyển) nối với nhau đều liền mạch, không đoạn nào phải biết tới nước.
   Pawns.script(i,segs,final) nạp một chuỗi đoạn (final = ô cuối cùng, để vòng update không tự thêm đoạn đi thẳng). Không có script thì quân tự đi tới S.pl như cũ. */
const WATER_CODE=(typeof Core!=='undefined'&&Core.TERR&&Core.TERR.WATER)||7;
const SAND_CODE=(typeof Core!=='undefined'&&Core.TERR&&Core.TERR.SAND)||8;
const JUMP_K=1.15,JUMP_F=.8/JUMP_K,JUMP_L=.2+JUMP_F;   /* nhảy: t∈[0,.2] nén lấy lực · [.2,JUMP_L] bay (cùng thời gian thật như trước) · [JUMP_L,1] đáp + nhún */
const landSq=(w,A,e)=>1-A*Math.sin(Math.PI*Math.pow(w,e||.8));   /* hệ số cao khi nhún lúc đáp, w∈[0,1]: ép xuống nhanh rồi bật lại chậm (e=1: đối xứng, êm); =1 ở hai đầu */
const Pawns={
  list:[],
  hasWater:false,wt:null,

  /* Máy đấu máy chạy nhanh thì quân cũng đi nhanh theo */
  /* Âm thanh: chỉ phát cho quân đang HIỆN (quân đối thủ nấp trong cỏ không được lộ chỗ qua tiếng động) */
  aud(s){return s.shown!==false;},
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
      const sk=new THREE.Group();sk.add(fl);   /* sk.position.y = -độ lún trong nước; không animation nào đụng tới nó (xem wade) */
      const g=new THREE.Group();g.add(sk);
      const y0=i===0?Math.PI:0;g.rotation.y=y0;   /* hai bên quay mặt về nhau (mặt nằm ở phía +z) */
      scene.add(g);
      return{g,sk,fl,legs,y0,sink:0,sv:0,sq:.2,r:-1,c:-1,t:1,yaw:y0,tyaw:y0,
        fx:0,fy:0,fz:0,dx:0,dz:0,px:0,pz:0,lat:0,dur:.8,cyc:1.5,ez:1,sway:0,roll:0,air:1,fyaw:0,jump:false,flips:1,an:null,hide:false,fire:null,shown:true,gk:1,win:false,cel:null,q:[],lr:-1,lc:-1};   /* q = hàng chờ các ô sẽ đi tới; lr,lc = ô mới nhất đã thấy trong S.pl */
    });
  },

  /* Đặt lại hai quân về ô xuất phát (ván mới) */
  reset(){for(let i=0;i<2;i++)this.place(i);},
  /* Đặt quân i đứng yên ngay tại S.pl[i], bỏ hàng chờ (ván mới, dựng lại ván, hoặc quân vừa lộ ra từ trong cỏ). Quân bị cỏ che (S.hid) thì ẩn mesh. */
  place(i){
    const s=this.list[i],p=S.pl[i];
    s.g.position.set(cellX(p.c),TOP,cellZ(p.r));
    s.r=s.lr=p.r;s.c=s.lc=p.c;s.q.length=0;s.t=1;s.jump=false;s.win=false;s.cel=null;s.an=null;s.hide=false;s.fire=null;s.shown=!(S.hid&&S.hid[i]);s.gk=s.shown?1:0;
    s.yaw=s.tyaw=s.y0;s.g.rotation.y=s.y0;s.g.scale.set(1,1,1);
    this.settle(s);this.snapSink(s);
    s.g.visible=s.shown&&!s.hide;
    Stage.invalidate(true);
  },

  /* Về tư thế đứng yên */
  settle(s){
    s.legs[0].rotation.x=s.legs[1].rotation.x=0;
    s.fl.rotation.set(0,0,0);s.fl.position.set(0,CFG.PAWN.pivot,0);   /* cả độ cao: ván mới bấm giữa lúc ăn mừng "trồng cây chuối" (fl.position.y hạ thấp) từng làm quân lún xuống sàn cả ván */
  },

  /* Bắt đầu một lần di chuyển tới ô mới: random mọi thứ một lần ở đây, các khung hình sau chỉ tính toán */
  start(s,p,mode){
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
    if(s.q.some(g=>!g.k||g.k==='walk'))s.dur*=.6;                       /* còn NƯỚC ĐI chờ phía sau thì đi nhanh hơn để bắt kịp (đoạn hide/slide/blink xếp sau thì không tính) */
    s.cyc=1.5*Math.max(1,len)*rand(.9,1.15);                            /* nhịp chân */
    s.ez=rand(.45,1);                                                   /* 0 = đi đều, 1 = chậm đầu chậm cuối */
    s.sway=cfg.sway*rand(.8,1.2);
    s.roll=rand(-.35,.35);s.air=rand(.85,1.25);                         /* chỉ dùng khi nhảy */
    s.fyaw=Math.atan2(dx,dz)+rand(-cfg.yawJitter,cfg.yawJitter);        /* hướng mặt lúc đáp không vuông góc */
    s.flips=1;s.sj=0;s.sk2=0;s.lm=mode==='launch';   /* cờ âm thanh: giai đoạn nhảy, số bước chân đã phát, có phải bị bẫy hất */
    if(mode==='launch'){   /* bị bẫy hất: nén người, bay rất cao theo cung lớn, lộn nhiều vòng, rồi đáp (cùng khung với cú nhảy, chỉ khác thông số) */
      const Lc=cfg.launch;
      s.jump=true;s.air=Lc.air*rand(.9,1.1);s.dur=Lc.dur+.1*Math.min(len,8);s.flips=Lc.flips;
      s.roll=rand(-.5,.5);s.ez=rand(.2,.5);s.lat=rsign()*rand(.1,.3);
      s.cyc=4;
    }
    if(s.jump){s.dur*=JUMP_K;const L=cfg.land;s.sq=Math.min(L.max,L.squash+L.per*s.air);}   /* thêm một đoạn cuối để đáp + nhún (thời gian bay giữ nguyên) */
  },

  /* Một bước animation. Không cấp phát bộ nhớ. */
  step(s,dt){
    const g=s.g,fl=s.fl,PI=Math.PI,cfg=CFG.PAWN;
    s.t=Math.min(1,s.t+dt/s.dur);
    if(s.fire&&s.t>=.14){if(typeof Terrain!=='undefined')Terrain.fireTrap(s.fire[0],s.fire[1]);s.fire=null;}   /* bị hất: tấm bẫy bật ngay trước lúc quân rời đất */
    if(Sfx.ok()&&this.aud(s)){
      const px=g.position.x,pz=g.position.z,code=Sfx.codeAt(px,pz);
      if(s.jump){
        if(s.sj<1&&s.t>=.2){s.sj=1;Sfx.play(s.lm?'whoosh':'jump',{x:px,z:pz,v:s.lm?1:.8});}
        if(s.sj<2&&s.t>=JUMP_L){s.sj=2;Sfx.play('land',{x:px,z:pz,v:clamp(.5+s.air*.35,.5,1.2)*(s.lm?1.25:1),mat:Sfx.matName[Sfx.matOf(code)]});}
      }else{
        const k=Math.floor(s.t*s.cyc*2);
        if(k>s.sk2&&s.t<1){s.sk2=k;Sfx.step(code,px,pz,allAI()?.4:.8,1+rand(-.04,.04));}
      }
    }
    const u=s.jump?clamp((s.t-.2)/JUMP_F,0,1):s.t;                      /* nhảy: 20% đầu nén người lấy lực, cuối cùng đáp + nhún */
    const e=u+(smooth(u)-u)*s.ez,sn=Math.sin(PI*e);
    g.position.x=s.fx+s.dx*e+s.px*s.lat*sn;                             /* đường đi cong nhẹ thay vì thẳng tắp */
    g.position.z=s.fz+s.dz*e+s.pz*s.lat*sn;
    let y=s.fy+(TOP-s.fy)*e;
    const cs=Math.cos(PI*e)*PI*s.lat;                                   /* mặt quay theo tiếp tuyến đường cong nên hơi xéo */
    s.tyaw=s.t>=1?s.fyaw:Math.atan2(s.dx+s.px*cs,s.dz+s.pz*cs);
    if(s.jump){   /* bay theo cung parabol, lộn một vòng, hơi nghiêng ngang */
      y+=Math.sin(PI*u)*s.air;
      const f=clamp((u-.1)/.8,0,1);
      fl.rotation.x=TAU*s.flips*smooth(f);
      fl.rotation.z=s.roll*Math.sin(PI*f);
      const w=Math.min(1,s.t/.2),q=s.t<.2?1-.3*smooth(w):s.t<.3?.7+3*(s.t-.2):s.t>JUMP_L?landSq((s.t-JUMP_L)/(1-JUMP_L),s.sq):1;   /* nén thấp 30% rồi búng lên; chạm đất thì nhún xuống rồi bật lại */
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
  win(i){this.list[i].win=true;Sfx.play(S.me<0||i===S.me?'cheer':'lose',{delay:.9,v:1});},   /* gọi khi quân i về đích; ăn mừng bắt đầu khi nó đáp xuống xong */

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
        const uu=clamp((u-.2)/.7,0,1),w=Math.min(1,u/.2);   /* 20% nén · 70% bay · 10% đáp + nhún */
        g.position.y=TOP+Math.sin(PI*uu)*C.flip.air;
        fl.rotation.x=TAU*smooth(clamp((uu-.1)/.8,0,1));
        const q=u<.2?1-.3*smooth(w):u<.3?.7+3*(u-.2):u>.9?landSq((u-.9)/.1,.22):1;
        g.scale.set(1+(1-q)*.4,q,1+(1-q)*.4);
        a=Math.sin(PI*uu)*Math.sin(uu*3*TAU)*PI/4;L0.rotation.x=a;L1.rotation.x=-a;break;}
      case 'hiphop':{   /* trồng cây chuối: lộn ngược đầu chúi xuống, xoay tròn, hai chân chỉa lên trời đung đưa */
        const H=C.hiphop,e=smooth(clamp(t/.35,0,1))*smooth(clamp((c.dur-t)/.35,0,1));   /* vào/ra tư thế */
        fl.rotation.x=PI*e;fl.rotation.y=TAU*H.turns*smooth(u);                          /* tổng số vòng nguyên nên cuối không bị giật */
        fl.position.y=pv-H.drop*e+Math.sin(t*14)*.02*e;
        a=Math.sin(t*H.swing)*H.legAmp*e;L0.rotation.x=a;L1.rotation.x=-a;break;}
      case 'bounce':{   /* nảy cà tưng: bẹp xuống lúc chạm đất, vươn dài lúc lên cao, hơi nghiêng qua lại */
        const B=C.bounce,ph=u*B.hops,f=ph-Math.floor(ph),env=smooth(clamp(t/.2,0,1))*smooth(clamp((c.dur-t)/.4,0,1));
        const hp=Math.floor(ph);if(hp!==c.hp){c.hp=hp;Sfx.play('bounce',{x:g.position.x,z:g.position.z,v:.7*env+.1});}
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

  /* ----- Hàng chờ có kịch bản ----- */
  /* Quân i không còn việc gì: đứng yên hẳn, hết hàng chờ */
  idle(i){const o=this.list[i];return o.t>=1&&!o.an&&!o.q.length&&!o.cel;},
  /* Cả hai quân đã xong mọi chuyển động và đang đứng đúng chỗ S.pl (để hiện dấu hiệu ô đặc biệt sau khi hoạt ảnh kết thúc) */
  quiet(){
    for(let i=0;i<2;i++){const s=this.list[i],p=S.pl[i];if(!this.idle(i)||s.lr!==p.r||s.lc!==p.c)return false;}
    return true;
  },
  /* Nạp một chuỗi đoạn chuyển động cho quân i; final = {r,c} ô cuối cùng (khớp S.pl[i]) */
  script(i,segs,final){
    const s=this.list[i];
    for(const g of segs)s.q.push(g);
    s.lr=final.r;s.lc=final.c;
  },
  /* Bắt đầu một đoạn (quân đang đứng yên hẳn, đã settle) */
  begin(s,seg){
    const k=seg.k||'walk';
    if(k==='slide')this.slipInit(s,seg.path,seg.land);
    else if(k==='hide'||k==='show')this.setShown(s,k==='show');
    else if(k==='blink')this.blinkInit(s,seg);
    else if(k==='chest')this.chestInit(s,seg);
    else if(k==='launch'){   /* tấm bẫy bật lên giữa lúc quân nén người (xem step) */
      this.start(s,{r:seg.to[0],c:seg.to[1]},'launch');s.fire=seg.from;
      const nx=s.q[0];   /* đáp xong thì ngã + đứng dậy như trượt băng; nếu ô đáp là băng (đoạn slide kế tiếp) thì cú ngã của nó đã lo việc đó */
      if(nx&&nx.k==='slide')nx.land=true;else s.q.unshift({k:'slide',path:[seg.to],land:true});
    }
    else this.start(s,seg);
  },
  anStep(s,dt){if(s.an.k==='slip')this.slipStep(s,dt);else if(s.an.k==='chest')this.chestStep(s,dt);else this.blinkStep(s,dt);},

  /* ----- Mở rương: quân đứng yên ở ô kề, quay mặt về rương, chờ rương mở xong (chỉ lấy nhịp; hình ảnh rương do Terrain.openChest lo) ----- */
  chestInit(s,seg){
    const r=seg.cell[0],c=seg.cell[1],cf=CFG.CHEST;
    s.an={k:'chest',t:0,dur:cf.wait,r,c,gift:seg.gift,shown:false};
    s.tyaw=Math.atan2(cellX(c)-s.g.position.x,cellZ(r)-s.g.position.z);   /* nhìn về phía rương */
    if(typeof Terrain!=='undefined')Terrain.openChest(r,c);
  },
  chestStep(s,dt){
    const a=s.an,cf=CFG.CHEST;a.t+=dt;
    if(!a.shown&&a.t>=cf.reveal){a.shown=true;Sfx.gift(a.gift,cellX(a.c),cellZ(a.r));if(typeof Marks!=='undefined')Marks.pop(cellX(a.c),cellZ(a.r),a.gift,cf.popHold);}   /* quà lộ ra */
    const u=a.shown?clamp((a.t-cf.reveal)/.35,0,1):0;
    s.g.position.y=TOP+.14*Math.sin(Math.PI*u);   /* nhún mừng một cái khi thấy quà */
    if(a.t>=a.dur){s.g.position.y=TOP;s.an=null;}
  },

  /* ----- Chui vào / thoát khỏi cỏ: chỉ bật/tắt mesh, không có hoạt ảnh riêng (không vật liệu trong suốt, không biên dịch lại shader).
     Quân đã đi bộ tới bụi cỏ bằng đoạn walk bình thường trước khi bị ẩn, và đi ra khỏi bụi bằng đoạn walk bình thường sau khi hiện ----- */
  setShown(s,on){
    s.shown=on;s.g.visible=on&&!s.hide;
    if(typeof App!=='undefined')App.syncSeen();   /* ẩn → hiện dấu "thấy lần cuối" ở bụi đó; hiện → gỡ dấu */
  },

  /* ----- Ngã + trượt băng. Dùng chung cho: (1) trượt băng (n ô), (2) vừa đáp xuống sau cú bẫy hất (n=0, land=true: không có đà trượt).
     Mỗi lần bốc ngẫu nhiên: kiểu ngã (ngửa / sấp / nghiêng), kiểu trượt (xoay tròn quanh trục đứng / lăn quanh thân / trượt thẳng lắc lư), độ chậm dần,
     độ lệch ngang, điểm dừng lệch tâm ô, thời lượng từng pha, kiểu đứng dậy (chống người lên, ngồi lắc đầu, rồi mới đứng).
     Quân đã bắt đầu trôi ngay trong lúc ngã (vận tốc liền mạch, không "giật" lúc bắt đầu trượt). Hướng nhìn (yaw) do hoạt ảnh tự đặt từng khung. ----- */
  slipInit(s,path,land){
    const L=CFG.PAWN.slip,PI=Math.PI,P=CFG.PAWN,n=path.length-1,V=L.var,j=()=>1+rand(-V,V);
    const pick=w=>{let x=Math.random()*w.reduce((p,q)=>p+q,0),i=0;while(i<w.length-1&&x>=w[i]){x-=w[i];i++;}return i;};
    const pts=[[s.g.position.x,s.g.position.z]];
    for(let i=1;i<=n;i++)pts.push([cellX(path[i][1]),cellZ(path[i][0])]);
    if(n>0){pts[n][0]+=rand(-L.stopJit,L.stopJit);pts[n][1]+=rand(-L.stopJit,L.stopJit);}   /* dừng lệch tâm ô một chút */
    const d=pts[1]||pts[0],T=n>0?Math.atan2(d[0]-pts[0][0],d[1]-pts[0][1]):s.yaw;
    const sty=pick(L.sty),sg=rsign(),mi=n>0?pick([L.mode[0],sty===2?0:L.mode[1],L.mode[2]]):2,mode=['spin','roll','glide'][mi];   /* nằm nghiêng thì không lăn quanh thân */
    const yOff=sty===2&&n>0?-sg*PI/2:0,y0=s.yaw;                        /* nằm nghiêng khi trượt: thân xoay ngang để vẫn trượt theo chiều dài thân */
    const pw=n>0?2+(rand(L.power[0],L.power[1])-L.power[0])*.3:2;   /* ma sát: số mũ phải ≥ 2, nếu < 2 thì gia tốc cuối đường vọt lên vô hạn → quân khựng đột ngột lúc dừng (≥ 2: giảm tốc êm tới 0) */
    const tF=(land?L.landFall:L.fall)*j(),tS=n*L.hop*j(),tRest=L.rest*(1+rand(-V,V*2)),tU=L.rise*j();
    s.an={k:'slip',t:0,n,pts,mode,style:['back','belly','side'][sty],
      tF,tG:tF+tS,tR:tF+tS+tRest,tE:tF+tS+tRest+tU,
      rl:sty===0?-PI/2:sty===1?PI/2:0,zl:sty===2?sg*PI/2:0,ly:sty===2?P.lieYSide:P.lieY,   /* góc nghiêng khi nằm hẳn + độ cao tâm thân */
      y0,yLie:y0+angDiff(T+yOff,y0),pw,
      dir:rsign(),turns:mode==='spin'?rand(.45,1)*1.15*(tF+tS)*(1.7/pw):mode==='roll'?1+(n>1&&Math.random()<.4?1:0):0,   /* xoay: số vòng thực (tỉ lệ với thời gian trượt để tốc độ quay không quá nhanh); lăn: số vòng NGUYÊN (về đúng tư thế khi dừng) */
      drift:n>0?rsign()*rand(.3,1)*L.drift:0,kick:rand(.8,1.3)*rsign(),wob:rand(7,11),
      sit:rand(.4,.6),hold:rand(.2,.3),shake:rsign()*rand(.12,.22),turnEnd:rand(-.5,.5),land:!!land,
      sp:n>0?this.slipCurve(pts):null};   /* sp: đường trượt đã bo tròn góc (xem slipCurve) */
    s.r=path[n][0];s.c=path[n][1];
  },
  /* Đường trượt mượt: thay vì gấp khúc cứng tại tâm mỗi ô băng (đổi hướng đột ngột → quân bị "giật" khi quẹo), mỗi góc được bo tròn bằng một
     đường Bézier bậc 2 nối trung điểm hai cạnh (hướng đổi dần, gia tốc ngang hữu hạn; quân vẫn đi trong lòng ô, chỉ cắt góc nhẹ).
     Trả về các điểm lấy mẫu kèm độ dài tích lũy (cum) và hướng tiếp tuyến (tx,tz) để slipStep đi theo ĐỘ DÀI CUNG (tốc độ đều qua mọi ô)
     và đặt độ lệch ngang vuông góc với đường cong (liền mạch ở mọi góc). Chỉ tính một lần lúc bắt đầu. */
  slipCurve(pts){
    const n=pts.length-1,R=.5,S=12,P=[pts[0]];
    for(let i=1;i<n;i++){
      const a=pts[i-1],b=pts[i],c=pts[i+1];
      const ax=b[0]+(a[0]-b[0])*R,az=b[1]+(a[1]-b[1])*R,cx=b[0]+(c[0]-b[0])*R,cz=b[1]+(c[1]-b[1])*R;
      for(let k=0;k<=S;k++){const u=k/S,v=1-u;P.push([v*v*ax+2*u*v*b[0]+u*u*cx,v*v*az+2*u*v*b[1]+u*u*cz]);}
    }
    P.push(pts[n]);
    const m=P.length,cum=new Array(m),tx=new Array(m),tz=new Array(m);cum[0]=0;
    for(let i=1;i<m;i++)cum[i]=cum[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);
    for(let i=0;i<m;i++){
      const a=P[Math.max(0,i-1)],b=P[Math.min(m-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
      tx[i]=dx/l;tz[i]=dz/l;
    }
    return{P,cum,tx,tz,len:cum[m-1]||1,i:0};
  },
  slipStep(s,dt){
    const a=s.an,g=s.g,fl=s.fl,PI=Math.PI,pv=CFG.PAWN.pivot,pts=a.pts,n=a.n,last=pts[n];
    a.t+=dt;const t=a.t,tF=a.tF,tG=a.tG,tR=a.tR,tE=a.tE;
    let k=1,y=a.ly,la=0,q=1,yaw=a.yLie,ph=0,ry=0;
    if(n>0){const x=clamp(t/tG,0,1);ph=(1-Math.pow(1-x,a.pw))*smooth(Math.min(1,t/tF));}
    if(Sfx.ok()&&this.aud(s)){
      const X=g.position.x,Z=g.position.z;
      if(!a.q0){a.q0=1;Sfx.play('slipFall',{x:X,z:Z,v:a.land?.6:1});}
      if(!a.q1&&t>=tF){a.q1=1;Sfx.play('body',{x:X,z:Z,v:a.land?.9:.7});}
      if(n>0&&t>=tF&&t<tG)Sfx.slide(.15+.85*Math.pow(1-ph,.6));
      else if(!a.q5&&t>=tG){a.q5=1;if(n>0){Sfx.slide(0);Sfx.play('iceTing',{x:X,z:Z});}}
      if(!a.q2&&t>=tR){a.q2=1;Sfx.play('stand',{x:X,z:Z,v:.9});}
    }   /* quãng đường đã trượt (0→1): tăng tốc nhẹ trong lúc ngã, rồi chậm dần như có ma sát; tốc độ liền mạch, về 0 ở cuối */
    if(t<tG){   /* ngã + trượt: vị trí đi dọc đường gấp khúc qua từng ô, lệch ngang nhẹ */
      if(n>0){
      const C=a.sp,d=ph*C.len;
      let i=C.i;while(i<C.P.length-2&&C.cum[i+1]<d)i++;C.i=i;   /* ph chỉ tăng nên con trỏ chỉ đi tới */
      const sl=C.cum[i+1]-C.cum[i],f=sl>1e-9?clamp((d-C.cum[i])/sl,0,1):1,p0=C.P[i],p1=C.P[i+1];
      const tx=C.tx[i]+(C.tx[i+1]-C.tx[i])*f,tz=C.tz[i]+(C.tz[i+1]-C.tz[i])*f,tl=Math.hypot(tx,tz)||1,off=a.drift*Math.sin(PI*ph);
      g.position.x=p0[0]+(p1[0]-p0[0])*f-tz/tl*off;g.position.z=p0[1]+(p1[1]-p0[1])*f+tx/tl*off;
      }else{g.position.x=pts[0][0];g.position.z=pts[0][1];}
      if(a.mode==='roll')ry=a.dir*TAU*a.turns*ph;                          /* lăn quanh thân (số vòng nguyên) */
      else if(a.mode==='spin')yaw+=a.dir*TAU*a.turns*ph;                   /* xoay tròn trên sàn như con quay, chậm dần cùng đà trượt */
      else yaw+=Math.sin(t*a.wob)*.14*(1-ph);                              /* trượt thẳng nhưng lắc lư */
      if(t<tF){   /* ngã: nhanh dần như rơi, chạm sàn thì nảy nhẹ lại; chân tung lên */
        const u=t/tF,v=Math.min(1,u/.85),wb=u>.85?Math.sin(PI*(u-.85)/.15):0;
        k=u<.85?v*v:1-.1*wb;
        y=pv+(a.ly-pv)*k+Math.sin(PI*u)*(a.land?.1:.16)+wb*.04;
        yaw=a.y0+(a.yLie-a.y0)*smooth(u)+(yaw-a.yLie);
        la=Math.sin(u*PI*3)*(1-u)*1.1*a.kick;
      }else la=Math.sin((t-tF)*16)*.25*(1-ph)*(a.kick>0?1:-1);   /* (t-tF): bắt đầu từ 0 nên chân không bị "giật" khi chuyển từ pha ngã sang pha trượt */
    }else if(t<tR){   /* nằm im choáng váng: rung nhẹ, đầu hơi lắc */
      const u=(t-tG)/(tR-tG);
      g.position.x=last[0];g.position.z=last[1];
      if(a.mode==='roll')ry=a.dir*TAU*a.turns;else if(a.mode==='spin')yaw+=a.dir*TAU*a.turns;
      yaw+=Math.sin(u*PI*5)*.1*(1-u);la=Math.sin(u*PI*4)*.15*(1-u);
    }else{            /* đứng dậy: chống người lên ngồi (có lúc nghiêng đầu lắc) → đứng thẳng, hơi quá đà rồi nhún */
      const u=clamp((t-tR)/(tE-tR),0,1),P1=.34,B=P1+a.hold,ks=a.sit,c1=1.70158,c3=c1+1;
      g.position.x=last[0];g.position.z=last[1];
      if(a.mode==='roll')ry=a.dir*TAU*a.turns;else if(a.mode==='spin')yaw+=a.dir*TAU*a.turns;
      let hop=0;
      if(u<P1)k=1-(1-ks)*smooth(u/P1);                                     /* chống người lên đến tư thế ngồi */
      else if(u<B){const w=(u-P1)/(B-P1);k=ks;yaw+=a.shake*Math.sin(2*PI*w)*Math.sin(PI*w);}   /* ngồi sững, lắc đầu: nhân thêm sin(πw) để đầu/cuối cú lắc vận tốc = 0 (không giật) */
      else{
        const v=(u-B)/(1-B),sv=smooth(v),b=1+c3*Math.pow(sv-1,3)+c1*Math.pow(sv-1,2);   /* easeOutBack đặt trên smooth(v): vẫn quá đà nhẹ nhưng bắt đầu từ vận tốc 0, không "bật" đột ngột khỏi tư thế ngồi */
        k=ks*(1-b);hop=Math.sin(PI*v)*.08;yaw+=a.turnEnd*sv;
      }
      y=a.ly+(pv-a.ly)*(1-k)+hop;la=Math.sin(u*PI*3)*.5*(1-u);
      if(u>.85)q=landSq((u-.85)/.15,.12,1);                                  /* nhún nhẹ lúc đứng vững */
    }
    g.position.y=TOP;g.scale.set(1+(1-q)*.4,q,1+(1-q)*.4);
    fl.rotation.set(a.rl*k,ry,a.zl*k);fl.position.set(0,y,0);
    s.yaw=s.tyaw=yaw;g.rotation.y=yaw;
    s.legs[0].rotation.x=la;s.legs[1].rotation.x=-la;
    if(t>=tE){
      s.an=null;s.t=1;s.jump=false;this.settle(s);g.scale.set(1,1,1);g.position.set(last[0],TOP,last[1]);
    }
  },

  /* ----- Dịch chuyển cổng: nén người → xoáy tít bay lên, co thành tia sáng mảnh rồi biến mất ở cổng đi → (tia sáng nối hai cổng) →
     từ trên cao rơi xoáy xuống cổng đến (xoáy chậm dần, thân phình ra từ tia), chạm đất nhún một cái. Không nhấp nháy. Số vòng xoáy nguyên → yaw về đúng như cũ. ----- */
  blinkInit(s,seg){
    const B=CFG.PAWN.blink;
    s.an={k:'blink',t:0,B,to:seg.to,moved:false,y0:s.yaw,dir:rsign(),sq:CFG.PAWN.land.max*.8};
    if(typeof Marks!=='undefined')Marks.beam(cellX(seg.from[1]),cellZ(seg.from[0]),cellX(seg.to[1]),cellZ(seg.to[0]),B.out+B.gap+B.in);
    Sfx.play('gateOut',{x:cellX(seg.from[1]),z:cellZ(seg.from[0])});
    if(typeof Terrain!=='undefined'){Terrain.flashGate(seg.from[0],seg.from[1]);Terrain.flashGate(seg.to[0],seg.to[1]);}
  },
  blinkStep(s,dt){
    const a=s.an,B=a.B,g=s.g,PI=Math.PI,tG=B.out,tI=B.out+B.gap,tE=tI+B.in,turn=a.dir*TAU*B.turns,F=.72,H=B.rise*.45;   /* F: phần đầu của pha hiện ra là đang rơi, phần cuối là đáp + nhún · H: độ cao nhấc lên (thấp hơn trước, quân không bay vút) */
    const c1=1.4,c3=c1+1,back=x=>1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);   /* easeOutBack: phồng quá cỡ một chút rồi về đúng cỡ */
    a.t+=dt;const t=a.t;
    if(!a.q1&&t>=tG){a.q1=1;Sfx.play('beam',{x:(cellX(a.to[1])+g.position.x)/2,z:(cellZ(a.to[0])+g.position.z)/2,v:1});}
    if(!a.q2&&t>=tI){a.q2=1;Sfx.play('gateIn',{x:cellX(a.to[1]),z:cellZ(a.to[0])});}
    if(!a.q3&&t>=tI+F*B.in){a.q3=1;Sfx.play('land',{x:cellX(a.to[1]),z:cellZ(a.to[0]),v:.7});}
    let yaw=a.y0,sxz=1,sy=1,y=TOP,la=0,hide=false;
    if(t<tG){
      const u=t/B.out,c=.2;
      yaw=a.y0+turn*u*u;                                                   /* xoáy nhanh dần */
      if(u<c){const e=smooth(u/c);sy=1-.18*e;sxz=1+.07*e;}                 /* nén người lấy đà */
      else{const v=(u-c)/(1-c),k=1-smooth(v);sy=.82*k;sxz=1.07*k;y=TOP+H*v*v;la=Math.sin(t*26)*.8*v;hide=v>.985;}   /* bị hút vào cổng: xoáy, thu nhỏ ĐỀU về một điểm (không kéo giãn), nhấc nhẹ lên */
    }else if(t<tI){
      if(!a.moved){   /* sang cổng đến (đang vô hình) */
        a.moved=true;s.r=a.to[0];s.c=a.to[1];
      }
      g.position.x=cellX(a.to[1]);g.position.z=cellZ(a.to[0]);
      yaw=a.y0+turn;sxz=sy=0;y=TOP+H;hide=true;
    }else{
      const u=clamp((t-tI)/B.in,0,1),v=clamp(u/F,0,1);
      yaw=a.y0+turn+turn*(1-(1-v)*(1-v));                                  /* xoáy chậm dần */
      if(u<F){const k=back(v);y=TOP+H*(1-v*v);sy=sxz=k;la=Math.sin(t*26)*.8*(1-v);hide=v<.03;}   /* hiện ra từ một điểm: phình đều (quá cỡ nhẹ) trong lúc hạ xuống */
      else{const q=landSq((u-F)/(1-F),a.sq);sy=q;sxz=1+(1-q)*.4;}          /* chạm đất: nhún */
    }
    s.hide=hide;
    g.position.y=y;g.scale.set(sxz,sy,sxz);
    s.yaw=s.tyaw=yaw;g.rotation.y=yaw;
    s.legs[0].rotation.x=la;s.legs[1].rotation.x=-la;
    if(t>=tE){
      s.an=null;s.hide=false;s.t=1;g.scale.set(1,1,1);g.position.set(cellX(a.to[1]),TOP,cellZ(a.to[0]));
      s.yaw=s.tyaw=a.y0;g.rotation.y=a.y0;s.legs[0].rotation.x=s.legs[1].rotation.x=0;
    }
  },

  /* ----- Lún xuống nước. s.sk.position.y = -sink. Mục tiêu lún chỉ tính từ VỊ TRÍ + ĐỘ CAO hiện tại của quân (ô dưới chân là nước và quân đang chạm/gần mặt ô),
     rồi một lò xo hơi dập (có chút nảy "ùm") đuổi theo mục tiêu → liền mạch với mọi animation: đi từ bờ xuống nước thì chìm dần theo bước chân, nhảy qua nước thì không lún
     giữa không trung mà lún lúc đáp, bị hất khỏi nước thì nhô lên. ----- */
  syncWater(){if(this.wt!==S.terr){this.wt=S.terr;this.hasWater=!!S.terr&&(S.terr.indexOf(WATER_CODE)>=0||S.terr.indexOf(SAND_CODE)>=0);}},   /* hasWater = bàn có nước HOẶC cát (cát lún dùng chung lò xo lún này) */   /* đổi bàn thì xét lại có nước không */
  wadeTarget(s){
    s.wp=CFG.PAWN.wade;s.wk=0;
    if(!this.hasWater||!S.terr)return 0;
    const p=s.g.position,c=Math.round(p.x/CFG.PITCH+HALF),r=Math.round(p.z/CFG.PITCH+HALF);
    if(c<0||c>=N||r<0||r>=N)return 0;
    const code=S.terr[r*N+c];s.wk=code;
    /* Bị lún cát (S.sunk của quân này, đang đứng trên ô cát): chìm SÂU hơn nước nhiều, lò xo mềm (CFG.PAWN.sink). Không lún thì cát không làm gì. */
    let W=null;
    if(code===SAND_CODE){s.wp=CFG.PAWN.sink;if(S.sunk&&S.sunk[this.list.indexOf(s)])W=s.wp;}   /* trên cát dùng lò xo mềm cả lúc trồi lên khi hết lún */
    else if(code===WATER_CODE)W=CFG.PAWN.wade;
    if(!W)return 0;
    const air=p.y-TOP;   /* bước đi nhún tối đa .035 < airFull nên không làm lún chớp theo nhịp chân */
    return W.depth*(air<=W.airFull?1:air>=W.airNone?0:1-(air-W.airFull)/(W.airNone-W.airFull));
  },
  snapSink(s){this.syncWater();s.sink=this.wadeTarget(s);s.sv=0;s.wsd=s.sink>.01;if(s.sk)s.sk.position.y=-s.sink;},   /* đặt ngay, không lò xo (ván mới, dựng lại ván) */
  wade(s,dt){
    if(!this.hasWater&&s.sink===0&&s.sv===0)return false;   /* bàn không có nước: không tốn gì */
    const tg=this.wadeTarget(s),W=s.wp,m=Math.max(1,Math.ceil(dt/.008)),h=dt/m;
    if(tg>.01){if(!s.wsd){s.wsd=true;if(this.aud(s))Sfx.play(s.wk===SAND_CODE?'sink':'splash',{x:s.g.position.x,z:s.g.position.z});}}else if(tg===0)s.wsd=false;   /* W: bộ tham số của loại lún đang áp dụng (nước / cát) */
    let x=s.sink,v=s.sv;
    for(let i=0;i<m;i++){v+=((tg-x)*W.k-v*W.damp)*h;x+=v*h;}
    if(x<0){x=0;if(v<0)v=0;}   /* không bao giờ nổi lên khỏi mặt ô */
    const done=Math.abs(tg-x)<.0006&&Math.abs(v)<.004;
    if(done){x=tg;v=0;}
    s.sink=x;s.sv=v;if(s.sk)s.sk.position.y=-x;
    return !done;
  },

  /* Trả về true nếu còn đang chuyển động (cần vẽ tiếp) */
  update(dt){
    let busy=false;
    this.syncWater();
    for(let i=0;i<2;i++){
      const s=this.list[i],p=S.pl[i];
      if(!s.an&&!s.q.length&&s.t>=1&&s.shown===!!(S.hid&&S.hid[i]))s.shown=!S.hid[i];   /* không có hoạt ảnh nào lo: bám theo S.hid (vd dựng lại ván) */
      const vis=s.shown&&!s.hide;if(s.g.visible!==vis){s.g.visible=vis;busy=true;}   /* quân bị cỏ che (Hỗn Loạn): ẩn; S.pl[i] khi đó là vị trí thấy lần cuối nên không có hoạt ảnh */
      /* Nước mới vào hàng chờ; chỉ bắt đầu đi khi nước trước ĐÃ ĐÁP XUỐNG XONG (không cắt ngang giữa lúc đang nhảy/lộn) */
      if(s.lr!==p.r||s.lc!==p.c){s.lr=p.r;s.lc=p.c;s.q.push({r:p.r,c:p.c});}
      while(!s.an&&s.t>=1&&s.q.length){   /* đoạn hide/show xong ngay trong khung này nên vòng lặp lấy tiếp đoạn sau */
        const nx=s.q[0];
        if(nx.wait!==undefined&&!this.idle(nx.wait)){busy=true;break;}   /* wait: đợi quân kia đi xong (dịch chuyển trễ xảy ra SAU khi người chặn đã rời cổng) */
        s.q.shift();this.settle(s);s.g.scale.set(1,1,1);this.begin(s,nx);busy=true;
      }
      const gt=s.shown?1:0;   /* cỏ rạp quanh quân: bán kính tiến dần tới 1 (quân hiện) / 0 (quân ẩn), chỉ đặt lại uniform, không đụng vật liệu */
      if(s.gk!==gt){s.gk=Math.abs(gt-s.gk)<.02?gt:s.gk+(gt-s.gk)*(1-Math.exp(-dt*12));busy=true;if(typeof App!=='undefined')App.syncGrass();}
      if(s.an){this.anStep(s,dt);busy=true;}
      else if(s.t<1){this.step(s,dt);busy=true;}
      else if(s.cel){this.celStep(s,dt);busy=true;}
      else if(s.win){this.celStart(s);busy=true;}   /* đã đáp xuống ô đích: bắt đầu ăn mừng */
      else if(s.legs[0].rotation.x!==0||s.fl.rotation.x!==0||s.fl.rotation.y!==0||s.fl.rotation.z!==0||s.fl.position.x!==0||s.fl.position.y!==CFG.PAWN.pivot)this.settle(s);
      if(this.wade(s,dt))busy=true;   /* lún nước: đứng ngoài mọi animation ở trên (xem wade) */
      const d=angDiff(s.tyaw,s.yaw);
      if(Math.abs(d)>.002){s.yaw+=d*(1-Math.exp(-dt*7));s.g.rotation.y=s.yaw;busy=true;}
    }
    return busy;
  }
};