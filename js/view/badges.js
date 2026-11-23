'use strict';
/* [VIEW/BADGES] Nhãn nước đi: một tấm sprite tròn có màu + ký hiệu (kiểu chess.com).
   Nước đi quân: sprite nổi trên đầu quân và đi theo quân. Nước đặt tường: sprite nổi trên bức tường.
   Mỗi nhãn: phóng ra (pop) + fade in → giữ → fade out, gói trong đúng lượt đó. Nhãn mới tới thì nhãn cũ tắt nhanh.
   Chỉ có 2 sprite dùng lại, mỗi nhãn một texture vẽ sẵn (cache) nên không tạo rác trong lúc chơi. */
const Badges={
  scene:null,tex:{},slots:[],

  init(scene){
    this.scene=scene;
    this.slots=[0,1].map(()=>{
      const s=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthTest:false,depthWrite:false,opacity:0}));
      s.visible=false;s.renderOrder=10;scene.add(s);   /* depthTest tắt: luôn hiện rõ, không bị quân/tường che */
      return{s,on:false,t:0,kill:-1,kind:'',who:0,x:0,z:0,dly:0,inT:1,hold:0,outT:1};
    });
  },

  /* Biểu tượng vẽ trong khung 100x100, tâm (50,50), màu trắng */
  icon(g,id){
    if(/^[!?]+$/.test(id)||id==='?!'){
      g.font='bold 62px "Trebuchet MS",Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(id,50,54);return;
    }
    g.lineWidth=11;
    switch(id){
      case 'star':
        g.beginPath();
        for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?13:31;g[i?'lineTo':'moveTo'](50+Math.cos(a)*r,53+Math.sin(a)*r);}
        g.closePath();g.fill();break;
      case 'check':g.beginPath();g.moveTo(28,52);g.lineTo(44,68);g.lineTo(73,35);g.stroke();break;
      case 'x':g.beginPath();g.moveTo(33,33);g.lineTo(67,67);g.moveTo(67,33);g.lineTo(33,67);g.stroke();break;
      case 'sad':     /* emoji mặt khóc (emoji màu của hệ điều hành, không phụ thuộc g.fillStyle) */
        g.font='64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';g.textAlign='center';g.textBaseline='middle';
        g.fillText('\u{1F622}',50,54);break;
      case 'arrow':g.lineWidth=9;g.beginPath();g.moveTo(26,50);g.lineTo(72,50);g.moveTo(54,32);g.lineTo(74,50);g.lineTo(54,68);g.stroke();break;
      case 'eq':g.lineWidth=10;g.beginPath();g.moveTo(30,40);g.lineTo(70,40);g.moveTo(30,60);g.lineTo(70,60);g.stroke();break;
      case 'thumb':   /* ngón cái giơ lên + cổ tay áo */
        g.beginPath();g.moveTo(44,76);g.lineTo(44,50);g.lineTo(54,26);g.quadraticCurveTo(62,24,63,34);g.lineTo(60,46);g.lineTo(74,46);
        g.quadraticCurveTo(80,47,79,54);g.lineTo(76,72);g.quadraticCurveTo(74,78,68,78);g.closePath();g.fill();
        g.fillRect(28,50,12,28);break;
      case 'book':    /* cuốn sách mở, hai trang cách nhau một khe làm gáy */
        g.beginPath();g.moveTo(48,34);g.quadraticCurveTo(36,26,22,30);g.lineTo(22,68);g.quadraticCurveTo(36,64,48,72);g.closePath();g.fill();
        g.beginPath();g.moveTo(52,34);g.quadraticCurveTo(64,26,78,30);g.lineTo(78,68);g.quadraticCurveTo(64,64,52,72);g.closePath();g.fill();
        break;
    }
  },

  /* Texture của một nhãn (vẽ một lần rồi nhớ) */
  texture(key){
    if(this.tex[key])return this.tex[key];
    const def=CFG.REVIEW.labels[key],cv=document.createElement('canvas');cv.width=cv.height=128;
    const g=cv.getContext('2d');
    g.shadowColor='rgba(0,0,0,.4)';g.shadowBlur=8;g.shadowOffsetY=3;
    g.fillStyle=def.color;g.beginPath();g.arc(64,64,48,0,TAU);g.fill();
    g.shadowColor='transparent';
    g.lineWidth=3;g.strokeStyle='rgba(255,255,255,.4)';g.beginPath();g.arc(64,64,46,0,TAU);g.stroke();
    g.save();g.translate(14,14);g.fillStyle=g.strokeStyle='#fff';g.lineCap=g.lineJoin='round';
    this.icon(g,def.icon);g.restore();
    return this.tex[key]=new THREE.CanvasTexture(cv);
  },

  /* Hiện nhãn cho kết quả res của Review.judge() */
  show(res){
    const B=CFG.REVIEW;
    for(const k of this.slots)if(k.on&&k.kill<0)k.kill=k.t;                       /* nhãn cũ tắt nhanh */
    const k=this.slots.find(x=>!x.on)||this.slots.reduce((a,b)=>b.t>a.t?b:a);   /* hết chỗ thì dùng lại cái cũ nhất */
    const L=allAI()?clamp(S.delay/1000,.6,B.life):B.life;                         /* máy đấu máy nhanh: nhãn ngắn lại cho kịp lượt */
    k.on=true;k.t=0;k.kill=-1;k.kind=res.act.type;k.who=res.mover;
    if(k.kind==='wall'){k.x=wallX(res.act.c);k.z=wallZ(res.act.r);}
    k.dly=Math.min(B.dly[k.kind],L*.25);k.inT=Math.min(B.in,L*.2);k.outT=Math.min(B.out,L*.3);
    k.hold=Math.max(0,L-k.dly-k.inT-k.outT);
    k.s.material.map=this.texture(res.key);k.s.material.needsUpdate=true;
    k.s.material.opacity=0;k.s.visible=false;
    Stage.invalidate();
  },

  clear(){for(const k of this.slots){k.on=false;k.s.visible=false;}Stage.invalidate();},

  /* Trả về true nếu còn nhãn đang hiện (cần vẽ tiếp). Không cấp phát bộ nhớ. */
  update(dt){
    let busy=false;const B=CFG.REVIEW;
    for(const k of this.slots){
      if(!k.on)continue;
      k.t+=dt;
      const tt=k.t-k.dly,total=k.inT+k.hold+k.outT,killed=k.kill>=0?clamp((k.t-k.kill)/.18,0,1):0;
      if(tt>=total||killed>=1){k.on=false;k.s.visible=false;continue;}
      busy=true;
      if(tt<0){k.s.visible=false;continue;}
      const x=clamp(tt/k.inT,0,1),c1=1.70158,c3=c1+1;
      const pop=1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);                         /* easeOutBack: phóng quá một chút rồi về đúng cỡ */
      const a=x*clamp(1-(tt-k.inT-k.hold)/k.outT,0,1)*(1-killed);
      const rise=B.rise*smooth(clamp(tt/total,0,1));                              /* trôi nhẹ lên trong suốt vòng đời */
      if(k.kind==='move'){const g=Pawns.list[k.who].g.position;k.s.position.set(g.x,g.y+B.pawnY+rise,g.z);}
      else k.s.position.set(k.x,B.wallY+rise,k.z);
      k.s.scale.setScalar(B.size*(.5+.5*pop));
      k.s.material.opacity=a;k.s.visible=a>.003;
    }
    return busy;
  }
};
