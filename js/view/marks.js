'use strict';
/* [VIEW/MARKS] Dấu hiệu nổi trên các ô đặc biệt của chế độ Hỗn Loạn. KHÔNG phải Badges (nhãn chất lượng nước đi): cơ chế riêng, đơn giản hơn.
     • Dấu bền: sprite chỉ gồm một ký hiệu (không có nền tròn) đứng yên trên một ô cho tới khi bị gỡ:
         'x'    chữ X đỏ   — cổng bị chặn (cổng kia đang có người đứng)
         'ok'   dấu tick xanh — bẫy đang đóng (đạp lên an toàn)
         'ban'  dấu cấm đỏ (vòng tròn gạch chéo) — quân đang lún cát, sắp mất lượt
         'warn' dấu "!" đỏ — bẫy đang bật (kết thúc lượt trên ô này là bị hất đi)
         'arrow' mũi tên cam chỉ xuống / 'n:3' số cam — "thấy lần cuối": đối thủ vừa chui vào bụi cỏ này (mũi tên), rồi số lượt nó đã đi kể từ đó (1…5, 'n:5+')
       Marks.set([{key,kind,x,z,y}]) mô tả TOÀN BỘ dấu cần có: key mới → phóng ra (easeOutBack) + hiện dần; key biến mất → mờ dần rồi gỡ; cùng key đổi kind → phóng lại.
     • Tia sáng nối hai cổng lúc dịch chuyển: Marks.beam(x1,z1,x2,z2,dur) — lõi trắng + quầng xanh cộng sáng, nhấp nháy, hiện nhanh / giữ / tắt dần.
   Mọi vật liệu và texture dùng lại (cache), update() không cấp phát bộ nhớ. */
const Marks={
  scene:null,tex:{},items:[],pops:[],pool:[],beams:[],glowTex:null,   /* pops: quà nổi tạm thời (Marks.pop), tách khỏi items của Marks.set */

  init(scene){
    this.scene=scene;this.items=[];this.pool=[];
    const geo=new THREE.CylinderGeometry(1,1,1,10,1,true);
    this.glowTex=this.glow();
    this.beams=[0,1].map(()=>{
      const g=new THREE.Group(),add=(r,color,op)=>{
        const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
        m.renderOrder=9;m.scale.set(r,1,r);g.add(m);return m;
      };
      const halo=add(.12,CFG.MARK.beamColor),core=add(.035,0xffffff);
      const ends=[1,-1].map(sg=>{   /* hai quầng sáng ở đầu tia (đầu nằm trên trục y cục bộ của nhóm) */
        const s=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTex,color:CFG.MARK.beamColor,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
        s.renderOrder=9;s.scale.setScalar(1.1);g.add(s);return{s,sg};
      });
      g.visible=false;scene.add(g);
      return{g,halo,core,ends,on:false,t:0,dur:1,len:1};
    });
  },

  glow(){
    const S2=64,cv=document.createElement('canvas');cv.width=cv.height=S2;
    const g=cv.getContext('2d'),gr=g.createRadialGradient(S2/2,S2/2,1,S2/2,S2/2,S2/2);
    gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr;g.fillRect(0,0,S2,S2);return new THREE.CanvasTexture(cv);
  },

  /* Ký hiệu trần (không nền), viền tối dày bên dưới để đọc rõ trên mọi màu sàn */
  texture(kind){
    if(this.tex[kind])return this.tex[kind];
    const cv=document.createElement('canvas');cv.width=cv.height=128;
    const g=cv.getContext('2d');g.lineCap=g.lineJoin='round';g.textAlign='center';g.textBaseline='middle';
    const col={x:'#ff3b30',ok:'#2fd45f',warn:'#ff3b30',ban:'#ff3b30'}[kind]||'#ff9d1c';
    const stroke=(path,w)=>{   /* vẽ viền tối rồi tới nét màu */
      g.strokeStyle='rgba(10,10,20,.78)';g.lineWidth=w+14;path();g.stroke();
      g.strokeStyle='#fff';g.lineWidth=w+6;path();g.stroke();
      g.strokeStyle=col;g.lineWidth=w;path();g.stroke();
    };
    g.shadowColor='rgba(0,0,0,.45)';g.shadowBlur=8;g.shadowOffsetY=3;
    if(kind==='ban')stroke(()=>{g.beginPath();g.arc(64,64,40,0,TAU);g.moveTo(36,36);g.lineTo(92,92);},14);   /* dấu cấm: vòng tròn gạch chéo */
    else if(kind==='x')stroke(()=>{g.beginPath();g.moveTo(32,32);g.lineTo(96,96);g.moveTo(96,32);g.lineTo(32,96);},16);
    else if(kind==='ok')stroke(()=>{g.beginPath();g.moveTo(26,68);g.lineTo(54,95);g.lineTo(104,36);},17);
    else if(kind==='arrow')stroke(()=>{g.beginPath();g.moveTo(64,22);g.lineTo(64,96);g.moveTo(34,66);g.lineTo(64,98);g.lineTo(94,66);},16);   /* mũi tên chỉ xuống */
    else if(kind.startsWith('g:')){   /* quà / vật phẩm: huy hiệu tròn tối viền vàng, biểu tượng SVG (Icons.draw) ở giữa (CFG.ITEMS) */
      g.shadowBlur=0;g.shadowOffsetY=0;
      g.beginPath();g.arc(64,64,54,0,TAU);g.fillStyle='rgba(18,18,26,.88)';g.fill();
      g.lineWidth=8;g.strokeStyle='#f0b429';g.stroke();
            const it=CFG.ITEMS[kind.slice(2)];if(it)Icons.draw(g,it.icon,64,64,66,'#fff');else{g.font='bold 62px sans-serif';g.fillStyle='#fff';g.fillText('?',64,70);}
    }
    else if(kind.startsWith('n:')){   /* số lượt (chữ viền tối + viền trắng) */
      const t=kind.slice(2);g.font='bold '+(t.length>1?84:108)+'px "Trebuchet MS",Arial,sans-serif';
      g.lineWidth=18;g.strokeStyle='rgba(10,10,20,.78)';g.strokeText(t,64,70);g.lineWidth=9;g.strokeStyle='#fff';g.strokeText(t,64,70);g.fillStyle=col;g.fillText(t,64,70);
    }
    else{   /* "!": thanh đứng + chấm */
      stroke(()=>{g.beginPath();g.moveTo(64,24);g.lineTo(64,74);},18);
      stroke(()=>{g.beginPath();g.moveTo(64,100);g.lineTo(64,100.1);},22);
    }
    return this.tex[kind]=new THREE.CanvasTexture(cv);
  },

  make(){
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthTest:false,depthWrite:false,opacity:0}));
    sp.renderOrder=10;sp.visible=false;this.scene.add(sp);return sp;   /* depthTest tắt: luôn thấy, không bị quân/cổng che */
  },
  take(){return this.pool.pop()||this.make();},

  /* Làm nóng trước (Stage.prewarm gọi lúc màn hình tải): vẽ sẵn mọi texture dấu/quà/số + tải lên GPU, tạo sẵn sprite trong hồ chứa và gắn map cho chúng
     (shader sprite "có map" biên dịch ngay bây giờ, không phải lúc quà nổi lên khi mở rương). */
  prewarm(ren){
    const kinds=['x','ok','warn','ban','arrow','n:1','n:2','n:3','n:4','n:5','n:5+'].concat(Object.keys(CFG.ITEMS).map(k=>'g:'+k));
    for(const k of kinds){const t=this.texture(k);try{if(ren&&ren.initTexture)ren.initTexture(t);}catch(e){}}
    while(this.pool.length<6)this.pool.push(this.make());
    for(const sp of this.pool)if(!sp.material.map){sp.material.map=this.tex.ok;sp.material.needsUpdate=true;}
  },

  /* Đặt đúng tập dấu mong muốn (xem đầu file). Gọi lại với cùng nội dung thì không làm gì. */
  set(list){
    if(!this.scene)return;
    const want=new Map();for(const e of list)want.set(e.key,e);
    for(const it of this.items)if(!want.has(it.key)&&it.ph!=='out'){it.ph='out';it.t=0;}   /* biến mất: mờ dần */
    for(const e of list){
      let it=this.items.find(x=>x.key===e.key);
      if(it&&it.ph==='out'){it.ph='in';it.t=0;}
      if(!it){
        it={key:e.key,kind:'',sp:this.take(),ph:'in',t:0,a:0};this.items.push(it);
        it.sp.visible=false;
      }
      if(it.kind!==e.kind){   /* mới, hoặc đổi dấu (✓ ⇄ !): vẽ lại và phóng ra từ đầu */
        it.kind=e.kind;it.sp.material.map=this.texture(e.kind);it.sp.material.needsUpdate=true;it.ph='in';it.t=0;
      }
      it.sp.position.set(e.x,e.y,e.z);
    }
    Stage.invalidate();
  },

  /* Biểu tượng quà nổi lên từ ô (x,z) (toạ độ thế giới): bật ra (easeOutBack) và bay lên, lơ lửng `hold` giây rồi mờ dần. Độc lập với Marks.set (không bị syncMarks xoá). */
  pop(x,z,gift,hold){
    if(!this.scene)return;
    const sp=this.take();sp.material.map=this.texture('g:'+gift);sp.material.needsUpdate=true;
    sp.position.set(x,.45,z);sp.visible=true;sp.material.opacity=0;
    this.pops.push({sp,x,z,t:0,hold:hold===undefined?1:hold});
    Stage.invalidate();
  },

  clear(){
    for(const it of this.items){it.sp.visible=false;this.pool.push(it.sp);}
    for(const it of this.pops){it.sp.visible=false;this.pool.push(it.sp);}
    this.pops=[];
    this.items=[];
    for(const b of this.beams){b.on=false;b.g.visible=false;}
    Stage.invalidate();
  },

  /* Tia sáng giữa hai điểm (toạ độ thế giới) kéo dài dur giây */
  beam(x1,z1,x2,z2,dur){
    const b=this.beams.find(k=>!k.on)||this.beams[0],Y=CFG.MARK.beamY,dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz)||1;
    b.on=true;b.t=0;b.dur=dur;b.len=len;
    b.g.position.set((x1+x2)/2,Y,(z1+z2)/2);
    b.g.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx/len,0,dz/len));   /* trục y của nhóm nằm dọc theo tia */
    b.halo.scale.y=b.core.scale.y=len;
    for(const e of b.ends)e.s.position.set(0,e.sg*len/2,0);
    b.g.visible=true;Stage.invalidate();
  },

  /* Trả true nếu còn chuyển động (đang phóng ra/mờ dần/có tia sáng) để vòng lặp vẽ tiếp */
  update(dt){
    let busy=false;const M=CFG.MARK,c1=1.70158,c3=c1+1;
    for(let i=this.items.length-1;i>=0;i--){
      const it=this.items[i],sp=it.sp;
      it.t+=dt;
      if(it.ph==='in'){
        const x=clamp(it.t/M.popIn,0,1),pop=1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);   /* easeOutBack */
        it.a=clamp(x*2.2,0,1);sp.scale.setScalar(M.size*(.4+.6*pop));
        if(x>=1)it.ph='show';
        busy=true;
      }else if(it.ph==='out'){
        const x=clamp(it.t/M.fadeOut,0,1);it.a=1-x;sp.scale.setScalar(M.size*(1-.25*x));
        if(x>=1){sp.visible=false;this.pool.push(sp);this.items.splice(i,1);continue;}
        busy=true;
      }
      sp.material.opacity=it.a;sp.visible=it.a>.003;
    }
    for(let i=this.pops.length-1;i>=0;i--){   /* quà nổi: bay lên + phình ra → giữ → mờ dần */
      const it=this.pops[i],tin=.38,tout=.3;it.t+=dt;busy=true;
      const x=clamp(it.t/tin,0,1),pop=1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);
      const f=it.t>tin+it.hold?clamp((it.t-tin-it.hold)/tout,0,1):0;
      it.sp.position.set(it.x,.45+.95*smooth(x)+.03*Math.sin(it.t*5),it.z);
      it.sp.scale.setScalar(M.size*1.15*(.3+.7*pop)*(1-.2*f));
      it.sp.material.opacity=clamp(x*2.5,0,1)*(1-f);
      if(f>=1){it.sp.visible=false;this.pool.push(it.sp);this.pops.splice(i,1);}
    }
    for(const b of this.beams){
      if(!b.on)continue;
      b.t+=dt;
      if(b.t>=b.dur){b.on=false;b.g.visible=false;continue;}
      busy=true;
      const L=b.dur,up=clamp(b.t/(L*.22),0,1),down=1-clamp((b.t-L*.55)/(L*.45),0,1),a=up*down;
      const fl=.7+.3*Math.random();                                   /* nhấp nháy */
      b.core.material.opacity=a*fl;b.halo.material.opacity=a*.45*(.8+.2*Math.random());
      const w=1+.25*Math.sin(b.t*60);b.core.scale.x=b.core.scale.z=.035*w;b.halo.scale.x=b.halo.scale.z=.12*(1.4-.4*down)*w;   /* hơi phình rồi thon lại */
      for(const e of b.ends)e.s.material.opacity=a*.9;
    }
    return busy;
  }
};