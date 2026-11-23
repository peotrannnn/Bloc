'use strict';
/* [VIEW/FIREWORKS] Pháo bông ăn mừng tại ô quân thắng.
   Tối ưu: tất cả hạt nằm trong MỘT THREE.Points + một ShaderMaterial. Vị trí hạt tính hoàn toàn trong vertex shader
   từ vận tốc ban đầu và thời gian (uTime), nên CPU chỉ cập nhật đúng một số mỗi khung hình. Hình dạng hạt
   (tròn, thoi, sao, tim, tam giác, vòng) vẽ bằng công thức trong fragment shader, không cần ảnh/texture. */
const Fireworks={
  pts:null,mat:null,geo:null,A:null,count:0,t:0,total:0,active:false,

  VERT:[
    'uniform float uTime,uScale,uDrag,uGrav;',
    'attribute vec3 aVel,aLife,aColor;',        /* aLife = (giờ bắt đầu, thời gian sống, pha nhấp nháy) */
    'attribute float aShape,aSize;',
    'varying vec3 vCol;varying float vA,vShape;',
    'void main(){',
    '  vCol=aColor;vShape=aShape;vA=0.;',
    '  float t=uTime-aLife.x;',
    '  if(t<0.||t>aLife.y){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}',   /* chưa nổ hoặc đã tắt: đẩy ra ngoài màn hình */
    '  float u=t/aLife.y;',
    '  vec3 p=position+aVel*(1.-exp(-uDrag*t))/uDrag;',    /* bung nhanh rồi chậm dần vì cản gió */
    '  p.y-=.5*uGrav*t*t;',
    '  vec4 mv=modelViewMatrix*vec4(p,1.);',
    '  gl_Position=projectionMatrix*mv;',
    '  gl_PointSize=aSize*uScale/-mv.z*min(1.,t*14.)*(1.-.45*u);',   /* nở ra nhanh, nhỏ dần */
    '  vA=pow(1.-u,1.3)*(.7+.3*sin(t*28.+aLife.z));',                /* mờ dần + nhấp nháy */
    '}'
  ].join('\n'),

  FRAG:[
    'varying vec3 vCol;varying float vA,vShape;',
    'void main(){',
    '  vec2 p=gl_PointCoord*2.-1.;p.y=-p.y;',
    '  float r=length(p);int s=int(vShape+.5);bool ok=false;',
    '  if(s==0)ok=r<1.;',                                         /* tròn */
    '  else if(s==1)ok=abs(p.x)+abs(p.y)<1.;',                    /* thoi */
    '  else if(s==2){',                                           /* sao 5 cánh */
    '    float k=1.2566,a=atan(p.y,p.x)-1.5708;',
    '    float m=abs(mod(a,k)-k*.5)/(k*.5);',
    '    ok=r<mix(.38,1.,m);',
    '  }else if(s==3){',                                          /* tim */
    '    vec2 q=vec2(p.x*1.15,p.y*1.15+.25);',
    '    float m=q.x*q.x+q.y*q.y-1.;',
    '    ok=m*m*m-q.x*q.x*q.y*q.y*q.y<0.;',
    '  }else if(s==4)ok=p.y>-.8&&abs(p.x)<(.9-p.y)*.55;',         /* tam giác */
    '  else ok=r<1.&&r>.55;',                                     /* vòng */
    '  if(!ok)discard;',
    '  gl_FragColor=vec4(mix(vCol,vec3(1.),.3*(1.-r)),vA);',      /* lõi sáng hơn một chút */
    '}'
  ].join('\n'),

  init(scene){
    const F=CFG.FX,n=this.count=F.bursts*F.per;
    const g=this.geo=new THREE.BufferGeometry();
    this.A={};
    for(const[k,size]of[['position',3],['aVel',3],['aLife',3],['aColor',3],['aShape',1],['aSize',1]]){
      this.A[k]=new THREE.BufferAttribute(new Float32Array(n*size),size);
      this.A[k].setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(k,this.A[k]);
    }
    this.mat=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uScale:{value:1},uDrag:{value:F.drag},uGrav:{value:F.gravity}},
      vertexShader:this.VERT,fragmentShader:this.FRAG,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
    });
    this.pts=new THREE.Points(g,this.mat);
    this.pts.frustumCulled=false;this.pts.visible=false;this.pts.renderOrder=10;
    scene.add(this.pts);
  },

  /* Bắn pháo bông quanh ô của quân thắng p = {r,c} */
  play(p){
    const F=CFG.FX,A=this.A,col=new THREE.Color();
    const cx=cellX(p.c),cz=cellZ(p.r);
    let i=0,maxEnd=0;
    for(let b=0;b<F.bursts;b++){
      const start=F.wait+(b+rand(0,.6))/F.bursts*F.span;                       /* các đợt nổ rải đều, hơi lệch nhịp */
      const ox=cx+rand(-F.spread,F.spread),oy=TOP+rand(F.height[0],F.height[1]),oz=cz+rand(-F.spread,F.spread);
      const base=rand(F.speed[0],F.speed[1]),main=Math.floor(rand(0,6));        /* mỗi đợt có một hình chủ đạo + vài hình lẫn */
      const cols=[pick1(F.palette),pick1(F.palette),pick1(F.palette)];
      for(let k=0;k<F.per;k++,i++){
        const u=rand(-1,1),th=rand(0,TAU),s=Math.sqrt(1-u*u),sp=base*rand(.55,1);
        const life=rand(F.life[0],F.life[1]),st=start+rand(0,.06);
        A.position.setXYZ(i,ox,oy,oz);
        A.aVel.setXYZ(i,s*Math.cos(th)*sp,u*sp,s*Math.sin(th)*sp);
        A.aLife.setXYZ(i,st,life,rand(0,TAU));
        col.setHex(pick1(cols));A.aColor.setXYZ(i,col.r,col.g,col.b);
        A.aShape.setX(i,Math.random()<.6?main:Math.floor(rand(0,6)));
        A.aSize.setX(i,rand(F.size[0],F.size[1]));
        maxEnd=Math.max(maxEnd,st+life);
      }
    }
    for(const k in A)A[k].needsUpdate=true;
    this.total=maxEnd+.1;this.t=0;this.active=true;this.pts.visible=true;
    this.mat.uniforms.uTime.value=0;
    Stage.invalidate();
  },

  stop(){
    if(!this.pts)return;
    this.active=false;this.pts.visible=false;Stage.invalidate();
  },

  /* Trả về true nếu còn đang chạy (cần vẽ tiếp) */
  update(dt){
    if(!this.active)return false;
    this.t+=dt;
    if(this.t>=this.total){this.active=false;this.pts.visible=false;return true;}   /* khung hình cuối để xoá hạt khỏi màn hình */
    const u=this.mat.uniforms;
    u.uTime.value=this.t;
    u.uScale.value=Stage.ren.domElement.height/(2*Math.tan(Stage.cam.fov*Math.PI/360));   /* đổi kích thước thế giới → pixel */
    return true;
  }
};
