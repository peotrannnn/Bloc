'use strict';
/* [VIEW/BLOCKER] Người chặn đường: nhân vật vàng "Crash Test Dummy" (model lấy từ game khác, chỉ giữ phần hình: thân Lathe + tai + chân vàng/ủng đen + biểu tượng
   nhấp nháy trước ngực). Dùng lại geometry thân và texture mặt của Pawns nên hình dáng y hệt quân cờ, chỉ khác màu.

   Hoạt ảnh (Blocker.an), chạy lần lượt:
     enter:  fly    bay từ một điểm NGẪU NHIÊN trên trời, lượn qua điểm treo ngay trên ô đích rồi hạ xuống thẳng đứng (đường cong Bézier bậc hai); chúi người theo hướng bay,
                    lửa phản lực phun ở hai chân
             land   chạm đất, lửa tắt, nhún, bắn tia lửa
             arrive khựng lại nhảy một cái, quay mặt về quân gần nhất, biểu tượng bùng sáng → onArrive (App ghi S.blocker ở đây)
             hold   đứng yên cho người chơi nhìn, hết giờ → onDone (App trả quyền chơi + gỡ khóa camera)
     leave:  có đường tới mép bàn (BFS tránh tường + hai quân):  xrun  chạy ra một ô mép bàn → jump  nhảy ra ngoài, lộn người rồi rơi khỏi bàn
             không có đường (bị tường/quân vây kín):              charge  nén người, nhóm lửa → rise  bay vút lên, lửa phản lực
             onGo (App xóa S.blocker) lúc bắt đầu rời ô; onDone khi đã biến mất.
   Camera + tạm dừng hai bên do App lo (App.blockerEvent / eventTick / eventEnd); file này chỉ lo hình và nhịp.
   Model: CÙNG cỡ và cùng hình với quân cờ (Pawns.build), chỉ khác màu vàng + hiệu ứng (lửa phản lực, phát sáng nhấp nháy).
   Blocker.pick() chọn choke point; Blocker.sync() dựng lại theo S.blocker (ván mới, nối lại sau rớt mạng). */
const Blocker={
  s:null,an:null,cb:null,flash:0,bt:0,symMat:null,feet:0,pv:0,
  jt:0,jv:0,   /* lửa phản lực: mức đích (do hoạt ảnh đặt mỗi khung) và mức hiện tại (làm mượt), 0..1 */
  fx:null,     /* tia lửa (hạt) rơi từ chân, dựng trong build */

  /* Biểu tượng tròn: nền vàng, viền đen, hai góc phần tư đen (vẽ y như model gốc) */
  symTex(){
    const cv=document.createElement('canvas');cv.width=cv.height=256;
    const g=cv.getContext('2d'),cx=128,cy=128,r=120;
    g.fillStyle='#FFD700';g.beginPath();g.arc(cx,cy,r,0,TAU);g.fill();
    g.lineWidth=10;g.strokeStyle='#000000';g.stroke();
    g.fillStyle='#000000';
    g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,r,0,Math.PI/2);g.lineTo(cx,cy);g.fill();
    g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,r,Math.PI,Math.PI*1.5);g.lineTo(cx,cy);g.fill();
    return new THREE.CanvasTexture(cv);
  },
  /* Bản đồ phát sáng: chỉ hai góc phần tư VÀNG sáng, phần đen và nền không sáng */
  emisTex(){
    const cv=document.createElement('canvas');cv.width=cv.height=256;
    const g=cv.getContext('2d'),cx=128,cy=128,r=120;
    g.fillStyle='#000000';g.fillRect(0,0,256,256);
    g.fillStyle='#FFFFFF';
    g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,r,Math.PI/2,Math.PI);g.lineTo(cx,cy);g.fill();
    g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,r,Math.PI*1.5,TAU);g.lineTo(cx,cy);g.fill();
    return new THREE.CanvasTexture(cv);
  },

  /* Dựng model một lần (gọi cùng lúc với Pawns.build). Cùng cây nhóm như quân cờ: g (vị trí + hướng) → fl (trục xoay giữa thân) → m (model). Mặt nằm ở +z. */
  build(scene){
    const B=CFG.BLOCKER,P=CFG.PAWN,J=B.jet,sc=P.scale,pv=P.pivot;   /* CÙNG cỡ và cùng trục xoay với quân cờ (Pawns.build): chỉ khác màu + hiệu ứng */
    const bg=Pawns.bodyGeo(),cy=(bg.boundingBox.max.y+bg.boundingBox.min.y)/2;
    const bodyMat=new THREE.MeshStandardMaterial({color:0xffffff,map:Pawns.faceTex(B.color,'#000000'),roughness:P.roughness,metalness:.001});
    const limbMat=new THREE.MeshStandardMaterial({color:B.color,roughness:P.roughness,metalness:.001});
    const bootMat=new THREE.MeshStandardMaterial({color:'#111111',roughness:.8});
    const symbolMat=new THREE.MeshStandardMaterial({
      map:this.symTex(),emissiveMap:this.emisTex(),emissive:B.glowColor,
      emissiveIntensity:0,transparent:true
    });
    this.symMat=symbolMat;this.limbMat=limbMat;
    const m=new THREE.Group(),legs=[];
    const body=new THREE.Mesh(bg,bodyMat);body.position.y=-cy+.5;m.add(body);
    const symbol=new THREE.Mesh(new THREE.CircleGeometry(.15,32),symbolMat);
    symbol.position.set(0,.5*P.H-cy+.5,P.R*.6+.01);symbol.renderOrder=1;m.add(symbol);
    const earG=new THREE.ConeGeometry(.08,.12,3),legG=new THREE.CylinderGeometry(.025,.025,.35,16);   /* y hệt quân cờ */
    for(const d of[-1,1]){
      const ear=new THREE.Mesh(earG,limbMat);ear.rotation.x=Math.PI/3;ear.position.set(d*.16,.5+P.H+P.R-cy,.1);m.add(ear);
      const lg=new THREE.Group();
      const upperLeg=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.175,16),limbMat);
      upperLeg.position.y=-.0875;lg.add(upperLeg);
      const lowerLeg=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.175,16),bootMat);
      lowerLeg.position.y=-.2625;lg.add(lowerLeg);
      lg.position.set(d*.18,-cy+.5,0);m.add(lg);legs.push(lg);
      const fg=this.flame(J,d);lg.userData.flame=fg;lg.add(fg);   /* lửa phản lực mọc từ đáy chân (-.35), mặc định tắt */
    }
    m.traverse(o=>{if(o.isMesh&&!o.userData.jet)o.castShadow=true;});
    m.scale.setScalar(sc);m.position.y=.3*sc-pv;   /* bàn chân chạm mặt ô */
    const fl=new THREE.Group();fl.position.y=pv;fl.add(m);
    const g=new THREE.Group();g.add(fl);g.visible=false;scene.add(g);
    this.pv=pv;this.feet=pv-.3*sc;
    this.s={g,fl,legs,flames:legs.map(l=>l.userData.flame),yaw:0,tyaw:0};
    this.buildFx(scene);
  },

  /* Ngọn lửa phản lực của một chân: hai nón lồng nhau (ngoài cam, lõi vàng trắng), cộng sáng (additive) nên không ăn bóng. Gốc nón nằm ở đáy ủng, mũi chĩa xuống;
     scale.y = chiều dài (đơn vị model). Tắt hẳn (visible=false) khi không bay. */
  flame(J,d){
    const mk=(r,h,col)=>{
      const g=new THREE.ConeGeometry(r,h,12,1,true);g.rotateX(Math.PI);g.translate(0,-h/2,0);   /* gốc ở y=0, mũi ở y=-h */
      const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
      m.userData.jet=true;m.frustumCulled=false;return m;
    };
    const fg=new THREE.Group();fg.position.y=-.35;fg.visible=false;fg.userData.ph=d*1.7;
    fg.add(mk(J.r,1,J.flame));fg.add(mk(J.r*.55,.62,J.core));
    return fg;
  },
  /* Tia lửa: một bể hạt dùng chung (THREE.Points, cộng sáng), phát từ hai chân lúc bay và bắn ra khi đáp. Hạt tắt dần bằng cách tối màu (cộng sáng: đen = vô hình). */
  buildFx(scene){
    const J=CFG.BLOCKER.jet,n=J.max,pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(let i=0;i<n;i++)pos[i*3+1]=-100;
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    const pts=new THREE.Points(geo,new THREE.PointsMaterial({size:J.size,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));
    pts.frustumCulled=false;scene.add(pts);
    this.fx={pts,pos,col,vel:new Float32Array(n*3),life:new Float32Array(n),max:new Float32Array(n),n,head:0,acc:0,alive:0,dirty:false};
  },
  /* Phát một hạt tại (x,y,z) với vận tốc (vx,vy,vz) */
  spark(x,y,z,vx,vy,vz){
    const F=this.fx;if(!F)return;
    Sfx.crackle(x,z);
    const J=CFG.BLOCKER.jet,i=F.head;F.head=(i+1)%F.n;
    F.pos[i*3]=x;F.pos[i*3+1]=y;F.pos[i*3+2]=z;F.vel[i*3]=vx;F.vel[i*3+1]=vy;F.vel[i*3+2]=vz;
    F.life[i]=F.max[i]=J.life[0]+Math.random()*(J.life[1]-J.life[0]);F.dirty=true;
  },
  /* Bắn tia lửa tỏa ra khi chạm đất */
  burst(x,y,z,n){
    for(let i=0;i<n;i++){const a=Math.random()*TAU,v=1+Math.random()*1.6;this.spark(x,y+.03,z,Math.cos(a)*v,.6+Math.random()*1.4,Math.sin(a)*v);}
  },
  /* Cập nhật hạt; trả true nếu còn hạt đang sống (cần vẽ tiếp) */
  stepFx(dt){
    const F=this.fx;if(!F||!F.dirty)return false;
    let alive=0;
    for(let i=0;i<F.n;i++){
      if(F.life[i]<=0)continue;
      F.life[i]-=dt;
      if(F.life[i]<=0){F.pos[i*3+1]=-100;F.col[i*3]=F.col[i*3+1]=F.col[i*3+2]=0;continue;}
      alive++;
      F.vel[i*3+1]-=5*dt;
      F.pos[i*3]+=F.vel[i*3]*dt;F.pos[i*3+1]+=F.vel[i*3+1]*dt;F.pos[i*3+2]+=F.vel[i*3+2]*dt;
      const k=F.life[i]/F.max[i];   /* 1 → 0: vàng sáng → cam → tắt (cộng sáng: tối dần = mờ dần) */
      F.col[i*3]=Math.min(1,k*1.6);F.col[i*3+1]=(.25+.6*k*k)*k;F.col[i*3+2]=.1*k;
    }
    F.alive=alive;F.dirty=alive>0;
    F.pts.geometry.attributes.position.needsUpdate=true;F.pts.geometry.attributes.color.needsUpdate=true;
    return alive>0;
  },
  /* Xóa sạch hạt và tắt lửa (ván mới, dựng lại) */
  resetFx(){
    this.jt=this.jv=0;
    const F=this.fx;if(F){F.life.fill(0);F.alive=0;F.dirty=true;}   /* dirty để khung kế tiếp dọn sạch vị trí/màu */
    if(this.s)for(const f of this.s.flames)f.visible=false;
  },
  /* Áp mức lửa jv lên hai ngọn và phát tia lửa theo mức đó */
  applyJet(dt){
    const J=CFG.BLOCKER.jet,v=this.jv,s=this.s,g=s.g,sc=CFG.PAWN.scale;
    Sfx.jet(v);
    for(const f of s.flames){
      f.visible=v>.03;
      if(f.visible){const k=1+J.flick*(Math.sin(this.bt*47+f.userData.ph)*.6+Math.random()*.5-.25);f.scale.set(.6+.4*v,J.len*v*k,.6+.4*v);}
    }
    const F=this.fx;
    if(F&&J.sparks&&v>.05){
      F.acc+=v*J.rate*dt;
      while(F.acc>=1){
        F.acc--;
        const d=Math.random()<.5?-1:1,yaw=s.yaw,x=g.position.x+Math.cos(yaw)*d*.18*sc,z=g.position.z-Math.sin(yaw)*d*.18*sc;
        this.spark(x,g.position.y+Math.random()*.08,z,(Math.random()-.5)*.7,-1.2-Math.random()*1.6,(Math.random()-.5)*.7);
      }
    }
  },

  /* Về tư thế đứng yên */
  settle(){
    const s=this.s;s.legs[0].rotation.x=s.legs[1].rotation.x=0;
    s.fl.rotation.set(0,0,0);s.fl.position.set(0,this.pv,0);s.g.scale.set(1,1,1);
  },

  /* Hướng mặt khi đứng ở ô idx: nhìn về quân gần nhất */
  faceYaw(idx){
    const r=(idx/N)|0,c=idx%N;let best=null,bd=1e9;
    for(const p of S.pl){const d=Math.abs(p.r-r)+Math.abs(p.c-c);if(d<bd){bd=d;best=p;}}
    return best?Math.atan2(cellX(best.c)-cellX(c),cellZ(best.r)-cellZ(r)):0;
  },

  /* ----- Chọn ô để chặn: CHOKE POINT. Ô hợp lệ = ô thường, không phải hàng đích, không có quân, và sau khi chặn hai bên VẪN còn đường về đích.
     Điểm của ô = số bước đi hai bên phải đi THÊM nếu ô đó bị chặn (cộng cả hai bên) + .25 × số cạnh ô đã bị tường/đá bịt (ô nằm trong hành lang thì chặn càng đau, và để phân hạng khi hòa).
     Chọn ngẫu nhiên trong các ô điểm cao nhất. Ván thoáng (chặn ô nào cũng không làm ai đi thêm) thì rơi về cách cũ: ô nằm 2-4 bước trước bên đang dẫn.
     Trả về chỉ số ô r*N+c, -1 nếu không có chỗ. ----- */
  okCell(r,c){
    if(r<1||r>N-2||c<0||c>=N)return false;   /* hàng đích (0 và N-1) không bị chặn */
    const k=r*N+c;
    if(!R.ground(S,r,c)||S.blocker===k)return false;   /* ô thường: người chặn không bao giờ lên đá */
    if(S.terr&&S.terr[k]!==0)return false;   /* cỏ/băng/bẫy/rương/cổng/nước/cát: để nguyên */
    return !S.pl.some(p=>p.r===r&&p.c===c);
  },
  /* Nếu chặn ô k: số bước hai bên phải đi thêm (cộng lại), hoặc -1 nếu có bên hết đường */
  gainOf(k,d0,d1){
    const keep=S.blocker;S.blocker=k;
    const a=dist(0,S.pl[0]),b=dist(1,S.pl[1]);
    S.blocker=keep;
    if(a>=Core.NOPATH||b>=Core.NOPATH)return -1;
    return (a-d0)+(b-d1);
  },
  /* Số cạnh của ô (r,c) bị bịt: có tường chắn hoặc ô kề không đi vào được (đá...). Mép bàn không tính. */
  closedSides(r,c){
    let n=0;
    for(const[dr,dc]of D){const r2=r+dr,c2=c+dc;if(r2<0||r2>=N||c2<0||c2>=N)continue;if(blk(r,c,dr,dc)||!R.open(S,r2,c2))n++;}
    return n;
  },
  pick(){
    const d0=dist(0,S.pl[0]),d1=dist(1,S.pl[1]);
    let best=-1,top=[];
    for(let r=1;r<N-1;r++)for(let c=0;c<N;c++){
      if(!this.okCell(r,c))continue;
      const k=r*N+c,g=this.gainOf(k,d0,d1);
      if(g<1)continue;   /* g<0: có bên hết đường; g=0: chặn không làm ai chậm, không phải choke point */
      const sc=g+.25*this.closedSides(r,c);
      if(sc>best+1e-9){best=sc;top=[k];}else if(Math.abs(sc-best)<=1e-9)top.push(k);
    }
    if(top.length)return top[(Math.random()*top.length)|0];
    return this.pickOpen(d0,d1);
  },
  /* Ván thoáng, không có choke point: ô nằm 2-4 bước trước bên đang dẫn, không thì ô ngẫu nhiên hợp lệ */
  pickOpen(d0,d1){
    const lead=d0<d1?0:d1<d0?1:S.turn,path=this.pathOf(lead),safe=k=>this.gainOf(k,d0,d1)>=0;
    if(path)for(const i of[2,3,4,1,5,6]){
      if(i>=path.length-1)continue;
      const k=path[i];if(this.okCell((k/N)|0,k%N)&&safe(k))return k;
    }
    const all=[];for(let r=1;r<N-1;r++)for(let c=0;c<N;c++)if(this.okCell(r,c))all.push(r*N+c);
    for(let i=all.length-1;i>0;i--){const j=(Math.random()*(i+1))|0,t=all[i];all[i]=all[j];all[j]=t;}
    for(const k of all)if(safe(k))return k;
    return -1;
  },
  /* Một đường ngắn nhất của người p tới hàng đích (mảng chỉ số ô, kể cả ô đang đứng); null nếu bị chặn kín */
  pathOf(p){
    const goal=goalRow(p),s0=S.pl[p].r*N+S.pl[p].c,par=new Int16Array(N*N).fill(-2),q=[s0];par[s0]=-1;
    for(let h=0;h<q.length;h++){
      const k=q[h],r=(k/N)|0,c=k%N;
      for(const[dr,dc]of D){
        const r2=r+dr,c2=c+dc,k2=r2*N+c2;
        if(!R.open(S,r2,c2)||par[k2]!==-2||blk(r,c,dr,dc))continue;
        par[k2]=k;q.push(k2);
        if(r2===goal){const out=[];for(let x=k2;x!==-1;x=par[x])out.push(x);return out.reverse();}
      }
    }
    return null;
  },
  /* Đường chạy RA KHỎI bàn từ ô idx: BFS tránh đá, tường và hai quân (ô idx là điểm xuất phát nên không cần "mở"). Chọn ngẫu nhiên một ô mép bàn trong số các ô mép
     có đường chạy không dài hơn ô mép gần nhất quá B.exit.near ô. Trả mảng ô từ idx → ô mép (idx đứng ngay ở mép thì có thể chỉ gồm idx); null nếu không tới được mép nào. */
  exitRoute(idx){
    const B=CFG.BLOCKER,par=new Int16Array(N*N).fill(-2),dd=new Int16Array(N*N),occ=new Set(S.pl.map(p=>p.r*N+p.c)),q=[idx];
    par[idx]=-1;
    for(let h=0;h<q.length;h++){
      const k=q[h],r=(k/N)|0,c=k%N;
      for(const[dr,dc]of D){
        const r2=r+dr,c2=c+dc,k2=r2*N+c2;
        if(r2<0||r2>=N||c2<0||c2>=N||!R.ground(S,r2,c2)||par[k2]!==-2||blk(r,c,dr,dc)||occ.has(k2))continue;   /* đường chạy ra mép chỉ qua ô thường (không chạy lên đá thấp) */
        par[k2]=k;dd[k2]=dd[k]+1;q.push(k2);
      }
    }
    const edge=q.filter(k=>{const r=(k/N)|0,c=k%N;return r===0||r===N-1||c===0||c===N-1;});
    if(!edge.length)return null;
    const mn=Math.min(...edge.map(k=>dd[k])),cand=edge.filter(k=>dd[k]<=mn+B.exit.near),end=cand[(Math.random()*cand.length)|0];
    const out=[];for(let k=end;k!==-1;k=par[k])out.push(k);
    return out.reverse();
  },
  /* Hướng nhảy ra ngoài bàn từ ô mép k: vectơ đơn vị (x,z) vuông góc với cạnh bàn; ô góc thì bốc ngẫu nhiên một trong hai cạnh */
  outDir(k){
    const r=(k/N)|0,c=k%N,sg=Math.sign,o=[];
    if(c===0)o.push([sg(cellX(0)-cellX(1)),0]);
    if(c===N-1)o.push([sg(cellX(N-1)-cellX(N-2)),0]);
    if(r===0)o.push([0,sg(cellZ(0)-cellZ(1))]);
    if(r===N-1)o.push([0,sg(cellZ(N-1)-cellZ(N-2))]);
    return o.length?o[(Math.random()*o.length)|0]:[0,1];
  },
  /* Quỹ đạo bay vào: Bézier bậc hai p0 (điểm ngẫu nhiên trên trời) → p1 (điểm treo ngay trên ô) → p2 (mặt ô). Tiếp tuyến cuối thẳng đứng nên hạ xuống thẳng. */
  flyPath(idx){
    const F=CFG.BLOCKER.fly,tx=cellX(idx%N),tz=cellZ((idx/N)|0),ang=Math.random()*TAU;
    const d=F.dist[0]+Math.random()*(F.dist[1]-F.dist[0]),h=F.up[0]+Math.random()*(F.up[1]-F.up[0]);
    return{p0:[tx+Math.cos(ang)*d,TOP+h,tz+Math.sin(ang)*d],p1:[tx,TOP+F.hover,tz],p2:[tx,TOP,tz]};
  },

  /* ----- Vào sân: cbs = {onArrive,onDone} ----- */
  enter(idx,cbs){
    const F=CFG.BLOCKER.fly,s=this.s,fp=this.flyPath(idx),p0=fp.p0,p1=fp.p1,p2=fp.p2;
    const len=Math.hypot(p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]);   /* chặng bay tới điểm treo */
    const yaw0=Math.atan2(p1[0]-p0[0],p1[2]-p0[2]);   /* mặt hướng theo chiều bay */
    this.cb=cbs||{};this.settle();this.resetFx();
    s.g.visible=true;s.yaw=s.tyaw=yaw0;s.g.rotation.y=yaw0;s.g.position.set(p0[0],p0[1],p0[2]);
    this.jv=1;   /* lửa phun ngay từ khung đầu */
    Sfx.play('flyby',{x:p1[0],z:p1[2]});
    const T1=clamp(len/F.speed,F.min,F.max);   /* chặng 1: bay (phanh dần) tới điểm treo trên ô · chặng 2: hạ thẳng xuống thật chậm */
    this.an={k:'fly',t:0,idx,fp,T1,T2:F.descend,T:T1+F.descend};
    Stage.invalidate(true);
  },
  /* ----- Rời đi: cbs = {onGo,onDone}. Có đường ra mép thì chạy rồi nhảy xuống; không có thì bay lên. ----- */
  leave(cbs){
    if(!this.s||!this.s.g.visible){if(cbs&&cbs.onGo)cbs.onGo();if(cbs&&cbs.onDone)cbs.onDone();return;}
    const B=CFG.BLOCKER,s=this.s,cells=S.blocker>=0?this.exitRoute(S.blocker):null;
    this.cb=cbs||{};
    if(cells){
      const pts=cells.map(k=>[cellX(k%N),cellZ((k/N)|0)]),last=cells[cells.length-1],out=this.outDir(last),h=CFG.PITCH*.5,e=pts[pts.length-1];
      pts.push([e[0]+out[0]*h,e[1]+out[1]*h]);   /* thêm điểm ngay mép ngoài ô cuối để đường chạy kết thúc theo hướng nhảy */
      const cur=Pawns.slipCurve(pts);cur.i=cur.i||0;
      this.an={k:'xrun',t:0,cur,T:cur.len/B.speed,out,went:false,spin:rsign()};
    }else{this.an={k:'charge',t:0,went:false,spin:rsign()};Sfx.play('charge',{x:s.g.position.x,z:s.g.position.z});}
    Stage.invalidate(true);
  },
  /* Đặt đứng yên theo S.blocker (ván mới, dựng lại ván, nối lại): có thì hiện ở ô đó, không thì ẩn. Bỏ mọi hoạt ảnh đang dở. */
  sync(){
    const s=this.s;if(!s)return;
    this.an=null;this.cb=null;this.flash=0;this.resetFx();
    if(S.blocker>=0){
      const r=(S.blocker/N)|0,c=S.blocker%N;
      s.g.position.set(cellX(c),TOP,cellZ(r));s.yaw=s.tyaw=this.faceYaw(S.blocker);s.g.rotation.y=s.yaw;this.settle();s.g.visible=true;
    }else s.g.visible=false;
    Stage.invalidate(true);
  },
  clear(){this.an=null;this.cb=null;this.flash=0;this.resetFx();if(this.s)this.s.g.visible=false;},
  /* Biến mất hẳn rồi báo onDone */
  finish(){
    const g=this.s.g;this.an=null;g.visible=false;this.settle();g.position.y=TOP;this.resetFx();
    const f=this.cb&&this.cb.onDone;this.cb=null;if(f)f();
  },
  /* Báo onGo một lần (rời ô: ô trống lại) */
  went(a){if(a.went)return;a.went=true;const f=this.cb&&this.cb.onGo;if(f)f();},

  /* Dáng chạy dùng chung: u = tiến độ 0..1 của đường cong a.cur. Trả u. */
  runPose(a){
    const s=this.s,g=s.g,fl=s.fl,L0=s.legs[0],L1=s.legs[1],B=CFG.BLOCKER,PI=Math.PI;
    const C=a.cur,u=Math.min(1,a.t/a.T),K=.8,e=u+(smooth(u)-u)*K,amp=Math.min(1,clamp(1+(6*u*(1-u)-1)*K,0,1.4)*1.1),d=e*C.len;   /* vào/ra êm, giữa chặng chạy đều */
    let i=C.i;while(i<C.P.length-2&&C.cum[i+1]<d)i++;C.i=i;
    const sl=C.cum[i+1]-C.cum[i],f=sl>1e-9?clamp((d-C.cum[i])/sl,0,1):1,p0=C.P[i],p1=C.P[i+1];
    g.position.x=p0[0]+(p1[0]-p0[0])*f;g.position.z=p0[1]+(p1[1]-p0[1])*f;
    const tx=C.tx[i]+(C.tx[i+1]-C.tx[i])*f,tz=C.tz[i]+(C.tz[i+1]-C.tz[i])*f;
    s.tyaw=s.yaw+angDiff(Math.atan2(tx,tz),s.yaw);   /* quay theo tiếp tuyến đường chạy */
    const ph=d/B.stride*TAU,th=.12*amp*Math.sin(ph),la=Math.sin(ph)*PI/3.2*amp;
    const sk=Math.floor(d/B.stride*2);if(sk!==a.sk){a.sk=sk;Sfx.play('bstep',{x:g.position.x,z:g.position.z,v:.5+.5*amp});}
    fl.rotation.z=th;fl.position.x=-this.feet*Math.sin(th)*CFG.PAWN.plant;fl.rotation.x=B.lean*amp;   /* lắc nghiêng, chân bám đất, chúi tới */
    g.position.y=TOP+Math.abs(Math.sin(ph))*.08*amp;L0.rotation.x=la;L1.rotation.x=-la;
    return u;
  },

  /* ----- Một bước hoạt ảnh ----- */
  stepAn(dt){
    const a=this.an,s=this.s,g=s.g,fl=s.fl,L0=s.legs[0],L1=s.legs[1],B=CFG.BLOCKER,PI=Math.PI;
    a.t+=dt;
    if(a.k==='fly'){
      const F=B.fly,fp=a.fp,u=Math.min(1,a.t/a.T);
      let q;   /* q: 1 = đang lao, 0 = đứng thẳng lúc hạ */
      if(a.t<a.T1){   /* chặng 1: từ điểm xa bay tới điểm treo, phanh dần (ease-out mềm) */
        const u1=a.t/a.T1,e=1-Math.pow(1-u1,2.4);q=Math.pow(1-u1,1.2);
        g.position.set(fp.p0[0]+(fp.p1[0]-fp.p0[0])*e,fp.p0[1]+(fp.p1[1]-fp.p0[1])*e,fp.p0[2]+(fp.p1[2]-fp.p0[2])*e);
      }else{          /* chặng 2: treo trên ô rồi hạ thẳng đứng, chậm lúc bắt đầu và chậm lúc chạm đất */
        const u2=clamp((a.t-a.T1)/a.T2,0,1),e=smooth(u2);q=0;
        g.position.set(fp.p1[0],fp.p1[1]+(fp.p2[1]-fp.p1[1])*e,fp.p1[2]);
      }
      fl.rotation.x=F.lean*q;fl.rotation.z=.05*Math.sin(a.t*3.5)*(.4+q);fl.position.x=0;   /* chúi tới lúc lao, đứng thẳng dần lúc hạ, lắc rất nhẹ */
      const sw=Math.sin(a.t*4.5)*.08;L0.rotation.x=-.3*q+sw;L1.rotation.x=-.3*q-sw;   /* chân xuôi ra sau, đung đưa nhẹ */
      this.jt=1;
      if(u>=1){this.an={k:'land',t:0,idx:a.idx};g.position.set(fp.p2[0],TOP,fp.p2[2]);this.burst(fp.p2[0],TOP,fp.p2[2],18);Sfx.play('clang',{x:fp.p2[0],z:fp.p2[2]});}
    }else if(a.k==='land'){
      const w=clamp(a.t/B.fly.land,0,1),q=landSq(w,.3,1);   /* ép xuống rồi bật lại; lửa đã tắt (jt=0) */
      g.position.y=TOP;fl.rotation.set(0,0,0);fl.position.x=0;L0.rotation.x*=.6;L1.rotation.x*=.6;g.scale.set(1+(1-q)*.4,q,1+(1-q)*.4);
      if(w>=1){g.scale.set(1,1,1);this.arrive(a.idx,0);}
    }else if(a.k==='arrive'){
      const R=B.arrive,u=Math.min(1,a.t/R.dur),H=.65;
      g.position.y=u<H?TOP+Math.sin(PI*u/H)*R.hop:TOP;
      const q=u>H?landSq((u-H)/(1-H),.25,1):1;g.scale.set(1+(1-q)*.4,q,1+(1-q)*.4);
      fl.rotation.x=a.l0*(1-smooth(Math.min(1,u*3)));fl.rotation.z*=.8;fl.position.x*=.8;
      L0.rotation.x*=.7;L1.rotation.x*=.7;
      if(u>=1){this.settle();g.position.y=TOP;this.an={k:'hold',t:0};}
    }else if(a.k==='hold'){
      if(a.t>=B.hold){this.an=null;const f=this.cb&&this.cb.onDone;this.cb=null;if(f)f();}
    }else if(a.k==='xrun'){   /* rời đi: chạy ra mép bàn */
      this.went(a);
      const u=this.runPose(a);
      if(u>=1){   /* tới mép: nhảy ra ngoài */
        const J=B.exit.jump,v=B.speed*J.vx;
        s.tyaw=s.yaw+angDiff(Math.atan2(a.out[0],a.out[1]),s.yaw);fl.rotation.z=0;fl.position.x=0;
        this.an={k:'jump',t:0,vx:a.out[0]*v,vz:a.out[1]*v,vy:J.vy,flip:a.spin};
        Sfx.play('whoosh',{x:g.position.x,z:g.position.z,v:.8});Sfx.play('fall',{x:g.position.x,z:g.position.z,delay:.3});
      }
    }else if(a.k==='jump'){   /* nhảy khỏi bàn: bay theo đường parabol, lộn người, rơi xuống dưới bàn */
      const J=B.exit.jump;
      a.vy-=J.g*dt;g.position.x+=a.vx*dt;g.position.z+=a.vz*dt;g.position.y+=a.vy*dt;
      fl.rotation.x=B.lean+J.flip*a.t;fl.rotation.z=0;
      const la=Math.sin(a.t*16)*.9;L0.rotation.x=la;L1.rotation.x=-la;
      if(g.position.y<TOP-J.fall)this.finish();
    }else if(a.k==='charge'){   /* không có đường: nén người lấy đà, lửa bùng lên */
      const R=B.exit.rise,u=Math.min(1,a.t/R.charge),q=1-.3*smooth(u);
      g.scale.set(1+(1-q)*.4,q,1+(1-q)*.4);this.jt=smooth(u);
      const sh=Math.sin(a.t*60)*.03*u;g.position.x+=0;fl.position.x=sh;   /* rung nhẹ trước khi phóng */
      if(u>=1){this.went(a);this.an={k:'rise',t:0,spin:a.spin};Sfx.play('whoosh',{x:g.position.x,z:g.position.z,v:1.1});}
    }else if(a.k==='rise'){   /* bay vút lên, lửa phản lực */
      const R=B.exit.rise,w=Math.min(1,a.t/.2),q=.7+.3*smooth(w);
      g.scale.set(1+(1-q)*.4,q,1+(1-q)*.4);fl.position.x=0;
      g.position.y=TOP+.5*R.acc*a.t*a.t;fl.rotation.y=a.spin*a.t*2.5;fl.rotation.x=.12;
      const sw=Math.sin(a.t*11)*.12;L0.rotation.x=-.25+sw;L1.rotation.x=-.25-sw;
      this.jt=1;
      if(g.position.y>TOP+R.top)this.finish();
    }
  },
  /* Khựng lại sau khi vào ô; l0 = độ chúi người lúc bắt đầu (0 nếu vừa đáp xuống) */
  arrive(idx,l0){
    const s=this.s;
    s.tyaw=this.faceYaw(idx);this.flash=1;Sfx.play('sym');
    this.an={k:'arrive',t:0,l0:l0||0};
    const f=this.cb&&this.cb.onArrive;if(f)f();
  },

  /* Trả về true nếu còn chuyển động (cần vẽ tiếp): đang diễn, tia lửa còn bay, hoặc đang đứng và biểu tượng còn nhấp nháy */
  update(dt){
    const s=this.s,B=CFG.BLOCKER;
    if(!s)return false;
    let busy=this.stepFx(dt);
    if(!s.g.visible)return busy;
    this.bt+=dt;
    if(B.blinkIdle||this.an||this.flash>.01){
      const k=(Math.sin(this.bt/B.sym.cycle*TAU)+1)*.5;
      this.symMat.emissiveIntensity=k*B.sym.glow+this.flash*B.sym.flash;   /* nhấp nháy + bùng sáng lúc vào ô */
      this.flash*=Math.exp(-dt*3);busy=true;
    }else this.symMat.emissiveIntensity=B.sym.glow*.5;
    this.jt=0;
    if(this.an){this.stepAn(dt);busy=true;Stage.invalidate(true);}   /* đang chạy: bóng đổ phải dựng lại */
    if(!s.g.visible)return busy||this.stepFx(0);   /* finish() vừa ẩn nhân vật */
    this.jv+=(this.jt-this.jv)*(1-Math.exp(-dt*(this.jt>this.jv?30:14)));   /* lửa bật nhanh, tắt êm */
    if(this.jv<.01)this.jv=0;
    this.applyJet(dt);if(this.jv>0)busy=true;
    const d=angDiff(s.tyaw,s.yaw);
    if(Math.abs(d)>.002){s.yaw+=d*(1-Math.exp(-dt*(this.an&&(this.an.k==='xrun')?10:7)));s.g.rotation.y=s.yaw;busy=true;}
    return busy;
  }
};
