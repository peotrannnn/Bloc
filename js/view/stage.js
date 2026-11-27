'use strict';
/* [VIEW/STAGE] Renderer + cảnh + bàn cờ. Hai cờ tối ưu:
   - need: số khung hình còn phải vẽ (không có chuyển động thì không vẽ gì).
   - shadowDirty: bản đồ bóng chỉ dựng lại khi có vật chuyển động (xoay camera không cần). */
const Stage={
  ren:null,scene:null,cam:null,cells:[],hints:[],need:0,shadowDirty:true,

  /* Biên dịch TRƯỚC mọi shader của cảnh (kể cả vật đang ẩn: pháo bông, cổng, rương, bẫy, nhãn...). three.js r128 chỉ biên dịch chương trình
     shader lúc vật đó hiện ra lần đầu; trên GPU/driver chậm (nhất là Windows/ANGLE) mỗi lần như vậy làm cả trang đứng 1-5 giây
     (vd: mở rương lần đầu, cổng dịch chuyển lần đầu, pháo bông khi thắng). Gọi lúc đang ở màn hình tải thì người chơi không thấy. */
  warm(){try{this.ren.compile(this.scene,this.cam);}catch(e){}},

  /* Làm nóng TOÀN BỘ đường vẽ trước khi vào ván (gọi lúc màn hình tải đang che): renderer.compile chỉ biên dịch shader của vật liệu như nó đang có;
     nó KHÔNG biết (1) sprite sẽ được gắn texture về sau (quà nổi lên khi mở rương, nhãn, dấu cổng/bẫy: bản shader "có map" chưa từng được biên dịch),
     (2) shader đổ bóng của từng vật, (3) texture chưa tải lên GPU (emoji vật phẩm). Cả ba chỉ phát sinh lúc vẽ thật nên rơi vào đúng lúc mở rương lần đầu
     → khựng 3-5s trên GPU/driver chậm. Cách làm: nạp sẵn texture + sprite có map, rồi vẽ THẬT một khung với mọi vật tạm thời hiện hết (kể cả bản đồ bóng),
     ép GPU xong việc (finish) rồi trả lại trạng thái ẩn/hiện cũ. Khung này không bao giờ tới mắt người chơi: cùng tác vụ, màn hình tải đang phủ kín. */
  prewarm(){
    const sc=this.scene,saved=[];
    try{
      if(typeof Marks!=='undefined')Marks.prewarm(this.ren);
      this.ren.compile(sc,this.cam);
      sc.traverse(o=>{saved.push(o,o.visible);o.visible=true;});
      this.ren.shadowMap.needsUpdate=true;
      this.ren.render(sc,this.cam);
      const gl=this.ren.getContext();if(gl&&gl.finish)gl.finish();
    }catch(e){}
    for(let i=0;i<saved.length;i+=2)saved[i].visible=saved[i+1];
    this.shadowDirty=true;this.invalidate(true);
  },

  invalidate(shadows){this.need=3;if(shadows)this.shadowDirty=true;},

  /* Chế độ Hỗn Loạn: dựng địa hình 3D từ mảng terr (xem view/terrain.js). terr rỗng/null = bàn Classic. */
  setTerrain(terr,seed){if(typeof Terrain!=='undefined')Terrain.build(this,terr,seed);this.invalidate(true);}   /* biên dịch shader do prewarm() lo (App.newGame, sau màn hình tải) */,

  init(host){
    this.scene=new THREE.Scene();
    this.cam=new THREE.PerspectiveCamera(40,1,.1,100);
    const ren=this.ren=new THREE.WebGLRenderer({antialias:true,alpha:true});
    ren.setPixelRatio(Math.min(devicePixelRatio,2));
    ren.shadowMap.enabled=true;ren.shadowMap.type=THREE.PCFSoftShadowMap;
    ren.shadowMap.autoUpdate=false;
    host.appendChild(ren.domElement);
    this.addLights();
    this.addBoard();
    if(typeof Weather!=='undefined')Weather.init(this);   /* tạo sẵn các lớp hạt thời tiết (ẩn) để prewarm biên dịch shader của chúng luôn */
  },

  addLights(){
    const L=CFG.LIGHT,sc=this.scene;
    const hemi=new THREE.HemisphereLight(L.hemi[0],L.hemi[1],L.hemi[2]);sc.add(hemi);
    const sun=new THREE.DirectionalLight(L.sun[0],L.sun[1]);sun.position.set(...L.sunPos);
    sun.castShadow=true;sun.shadow.mapSize.set(L.shadowSize,L.shadowSize);
    const c=sun.shadow.camera;c.left=c.bottom=-8;c.right=c.top=8;c.near=1;c.far=30;c.updateProjectionMatrix();
    sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;
    sc.add(sun);
    const fill=new THREE.DirectionalLight(L.fill[0],L.fill[1]);fill.position.set(...L.fillPos);sc.add(fill);
    this.L={hemi,sun,fill};   /* Weather đổi màu/cường độ đèn theo biome (CFG.GRADE) */
    /* Mặt đất vô hình chỉ để hứng bóng của bàn cờ */
    const gp=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.ShadowMaterial({opacity:CFG.BOARD.shadowOpacity}));
    gp.rotation.x=-Math.PI/2;gp.position.y=-.401;gp.receiveShadow=true;sc.add(gp);
  },

  /* Vân gỗ vẽ trên canvas (hạt giống cố định để mỗi lần mở trông giống nhau) */
  woodTex(base,seed){
    const S2=256,cv=document.createElement('canvas');cv.width=cv.height=S2;
    const g=cv.getContext('2d');g.fillStyle=base;g.fillRect(0,0,S2,S2);
    let s=seed;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647;};
    for(let i=0;i<48;i++){
      const y=rnd()*S2,a=rnd()*.5+.1,amp=rnd()*5+1,fr=rnd()*.03+.01,ph=rnd()*6.28;
      g.strokeStyle=rnd()<.55?'rgba(55,28,10,'+(a*.45)+')':'rgba(255,235,200,'+(a*.3)+')';
      g.lineWidth=rnd()*2.2+.4;
      g.beginPath();
      for(let x=0;x<=S2;x+=8){const yy=y+Math.sin(x*fr+ph)*amp;if(x)g.lineTo(x,yy);else g.moveTo(x,yy);}
      g.stroke();
    }
    const t=new THREE.CanvasTexture(cv);t.anisotropy=this.ren.capabilities.getMaxAnisotropy();return t;
  },

  addBoard(){
    const B=CFG.BOARD,P=CFG.PITCH,C=CFG.CELL,BW=WN*P+C+.5,sc=this.scene;
    /* Khung gỗ tối (cũng là "vữa" nhìn thấy qua khe giữa các ô) */
    const base=new THREE.Mesh(new THREE.BoxGeometry(BW,.4,BW),new THREE.MeshStandardMaterial({color:B.frame,roughness:.6}));
    base.position.y=-.2;base.castShadow=base.receiveShadow=true;sc.add(base);
    /* Dải đích hai đầu: ngà ở hàng 0 (đích của Trắng), đen ở hàng cuối (đích của Đen) */
    const edgeGeo=new THREE.BoxGeometry(BW,.1,.2),ez=HALF*P+C/2+.125;
    B.edge.forEach((col,i)=>{
      const m=new THREE.Mesh(edgeGeo,new THREE.MeshStandardMaterial({color:col,roughness:.4}));
      m.position.set(0,.05,i?ez:-ez);m.receiveShadow=true;sc.add(m);
    });
    /* Sàn gỗ: ô sáng (gỗ thích) và ô tối (gỗ óc chó) xen kẽ như bàn cờ vua */
    const wood=[B.woodLight,B.woodDark].map(v=>v.map(([col,seed])=>this.woodTex(col,seed)));
    const goal=B.goalWood.map(v=>v.map(([col,seed])=>this.woodTex(col,seed)));
    const texAt=(r,c)=>r===goalRow(0)?goal[0][c%2]:r===goalRow(1)?goal[1][c%2]:wood[(r+c)%2===0?1:0][r%2];
    const cg=new THREE.BoxGeometry(C,CFG.CELL_H,C),hg=new THREE.PlaneGeometry(C,C);
    const arrowTex=this.arrowTex(),ag=new THREE.PlaneGeometry(C*B.arrowSize,C*B.arrowSize);
    for(let r=0;r<N;r++){
      this.cells.push([]);this.hints.push([]);
      for(let c=0;c<N;c++){
        const mat=new THREE.MeshStandardMaterial({map:texAt(r,c),roughness:.5,metalness:0});
        const m=new THREE.Mesh(cg,mat);
        m.position.set(cellX(c),0,cellZ(r));m.receiveShadow=true;sc.add(m);this.cells[r].push(m);
        /* Lớp phủ gợi ý: phẳng, không đổ bóng/nhận bóng, mỗi ô một vật liệu riêng để fade độc lập */
        const hm=new THREE.Mesh(hg,new THREE.MeshBasicMaterial({color:B.hint,transparent:true,opacity:0,depthWrite:false,
          polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
        hm.rotation.x=-Math.PI/2;hm.position.set(cellX(c),TOP+.003,cellZ(r));hm.visible=false;hm.renderOrder=1;sc.add(hm);
        /* Mũi tên phím: tấm phẳng trong suốt nằm trên lớp phủ xanh, xoay quanh trục đứng theo hướng đi tới ô này */
        const am=new THREE.Mesh(ag,new THREE.MeshBasicMaterial({map:arrowTex,transparent:true,opacity:0,depthWrite:false,
          polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
        am.rotation.x=-Math.PI/2;am.renderOrder=2;
        const ar=new THREE.Group();ar.position.set(cellX(c),TOP+.006,cellZ(r));ar.visible=false;ar.add(am);sc.add(ar);
        this.hints[r].push({m:hm,ar,am,a:0,t:0});   /* a = độ hiện tại (0..1), t = độ đích */
      }
    }
  },

  /* Nhãn chữ (Up/Down/Left/Right) lơ lửng phía trên ô đi đặc biệt. Chỉ cần tối đa 3 nhãn nên dùng sẵn một bể sprite. */
  labelTex(text){
    this.ltex=this.ltex||{};
    if(this.ltex[text])return this.ltex[text];
    const H=40,f='600 22px system-ui,sans-serif',cv=document.createElement('canvas'),g=cv.getContext('2d');
    g.font=f;cv.width=Math.ceil(g.measureText(text).width)+26;cv.height=H;   /* khung ôm sát chữ */
    g.font=f;g.fillStyle='rgba(12,30,20,.72)';g.beginPath();g.roundRect(0,0,cv.width,H,H/2);g.fill();
    g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';g.fillText(text,cv.width/2,H/2+1);
    const t=new THREE.CanvasTexture(cv);t.aspect=cv.width/H;return this.ltex[text]=t;
  },
  setLabels(list){
    if(!this.labels){
      this.labels=[0,1,2].map(()=>{
        const sp=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthTest:false,depthWrite:false}));
        sp.renderOrder=5;sp.visible=false;this.scene.add(sp);return sp;
      });
    }
    this.labels.forEach((sp,i)=>{
      const l=list[i];sp.visible=!!l;
      if(l){const tx=this.labelTex(l.t);sp.material.map=tx;sp.material.needsUpdate=true;sp.scale.set(CFG.CELL*.22*tx.aspect,CFG.CELL*.22,1);sp.position.set(cellX(l.c),TOP+.2,cellZ(l.r));}
    });
    this.invalidate();
  },

  /* Mũi tên trắng mờ hướng lên (trục -z sau khi tấm được đặt nằm phẳng) */
  arrowTex(){
    const S2=128,cv=document.createElement('canvas');cv.width=cv.height=S2;
    const g=cv.getContext('2d');
    g.beginPath();g.moveTo(64,14);g.lineTo(100,58);g.lineTo(76,58);g.lineTo(76,112);g.lineTo(52,112);g.lineTo(52,58);g.lineTo(28,58);g.closePath();
    g.fillStyle='#fff';g.fill();
    const t=new THREE.CanvasTexture(cv);t.anisotropy=this.ren.capabilities.getMaxAnisotropy();return t;
  },

  /* Đặt các ô đi được: ô trong danh sách fade in, ô còn lại fade out.
     Mỗi phần tử là [hàng, cột] hoặc [hàng, cột, độ đậm 0..1]; `from` = ô quân đang đứng, để xoay mũi tên về phía ô đích
     (ô chéo thì mũi tên chéo). */
  setHints(list,from){
    for(const row of this.hints)for(const h of row)h.t=0;
    for(const[r,c,t]of list){
      const h=this.hints[r][c];h.t=t===undefined?1:t;
      if(from)h.ar.rotation.y=Math.atan2(-(c-from.c),-(r-from.r));
    }
    this.invalidate();
  },

  /* Trượt độ hiện về đích. Trả về true nếu còn đang fade (cần vẽ tiếp). */
  updateHints(dt){
    const k=1-Math.exp(-dt*CFG.BOARD.hintFade),op=CFG.BOARD.hintOpacity;let busy=false;
    for(const row of this.hints)for(const h of row){
      if(h.a===h.t)continue;
      h.a+=(h.t-h.a)*k;
      if(Math.abs(h.t-h.a)<.01)h.a=h.t;else busy=true;
      h.m.material.opacity=h.a*op;h.m.visible=h.a>0;
      h.am.material.opacity=h.a*CFG.BOARD.arrowOpacity;h.ar.visible=h.a>0;
    }
    return busy;
  },

  render(){
    this.ren.shadowMap.needsUpdate=this.shadowDirty;this.shadowDirty=false;
    this.ren.render(this.scene,this.cam);
  }
};
