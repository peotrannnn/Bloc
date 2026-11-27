'use strict';
/* [VIEW/WEATHER] Hiệu ứng thời tiết / không khí theo biome (chỉ Hỗn Loạn). THUẦN HÌNH ẢNH:
   - không đọc/ghi trạng thái ván, không cần đồng bộ online; mỗi máy tự random riêng (Math.random).
   - không nằm trong raycast (input.js chỉ raycast quân cờ), không đổ bóng, không đụng Stage.shadowDirty.
   - luôn nằm ở lớp trong suốt, mờ, thưa: ô, mũi tên gợi ý và quân vẫn đọc rõ. Hiệu ứng KHÔNG tụ quanh bụi cỏ (kẻo lộ chỗ quân bị che).
   Cách dựng (cùng kiểu fireworks.js): mỗi lớp là MỘT THREE.Points + ShaderMaterial; vị trí hạt tính hoàn toàn trong vertex shader từ uTime
   nên CPU chỉ gán vài uniform mỗi khung hình. Chỉ có 3 "ô" (slot) dùng chung MỘT shader, tạo sẵn một lần lúc Stage.init và nằm trong cảnh
   → Stage.prewarm()/renderer.compile biên dịch trước, không giật lúc vào ván. Đổi biome chỉ đổi uniform + drawRange, không tạo/huỷ vật liệu.
   LỊCH NGẪU NHIÊN: mỗi lớp tự bật/tắt (mờ dần vào/ra), mỗi lần bật có độ dày ngẫu nhiên. Biome có "gió giật" (tuyết, sa mạc, núi, rừng, cỏ)
   thì thêm các cơn gió giật ngẫu nhiên: hạt bị thổi mạnh hơn và cỏ rạp theo (Terrain.setGust).
   Kèm "tông ánh sáng" theo biome (CFG.GRADE) và hiệu ứng làm tối/sáng nhẹ lúc mưa/sương (mood). Bộ lọc màu + vignette nằm trong css/style.css (body[data-biome]).
   Chỉnh nhanh: CFG.WEATHER.on (tắt hết) · CFG.WEATHER.amount (nhân mật độ, 0.5 cho máy yếu) · bảng DEFS bên dưới (mỗi biome một danh sách lớp). */
const Weather=(function(){
  const MAXP=1100,NSLOT=3;

  /* ---------- Mô tả các lớp theo biome ----------
     mode   0 = hạt trôi/rơi trong hộp rồi lặp lại · 1 = bay lượn quanh điểm nhà (đom đóm, bướm) · 2 = gợn nước trên ô nước (dựng từ terr)
     shape  0 chấm mềm · 1 vệt (mưa, gió) · 2 lá/cánh hoa xoay · 3 đốm sáng · 4 mảng sương mềm · 5 vòng gợn · 6 bướm
     box    kích thước hộp chứa hạt [x,y,z], ymin = độ cao đáy hộp (mặt ô ở y≈.1)
     vel    vận tốc nền · gustV = vận tốc thêm ×g (g = cường độ cơn gió giật 0..1) · sway = lắc ngang (mode 1: bán kính bay)
     size   [nhỏ,lớn] theo đơn vị thế giới (vệt: chiều dài) · alpha = độ đục tối đa · thick = bề dày vệt (px)
     center [bán kính,hệ số]: hạt trong bán kính này quanh tâm bàn chỉ còn "hệ số" độ đục (sương không che bàn) · near = mờ dần khi sát camera
     sched  bật/tắt ngẫu nhiên: on/off = số giây ở lại mỗi trạng thái · fade = giây mờ vào/ra · dens = độ dày ngẫu nhiên mỗi lần bật · p0 = xác suất lúc đầu ván đang bật
     follow chạy theo lớp khác (cùng bật/tắt, cùng độ dày) · gust:{base,gain} độ đục = base + gain·g · mood = chỉnh cường độ đèn khi lớp đang hiện */
  const DEFS={
    river:{layers:[
      {name:'rain',mode:0,shape:1,count:340,box:[17,10,17],ymin:0,vel:[-2.4,-24,1],size:[1.3,3.6],colA:0xb8d0e2,colB:0xdceaf4,alpha:.42,thick:.9,near:3,far:26,vary:true,
        sched:{on:[14,34],off:[14,34],fade:[3,5],dens:[.3,.8],p0:.6},mood:{sun:-.2,hemi:-.08}},
      {name:'ripple',mode:2,shape:5,size:[.08,.3],colA:0xdcecf6,colB:0xffffff,alpha:.45,rate:.8,follow:'rain',near:2},
      {name:'mist',mode:0,shape:4,count:26,box:[18,1.2,18],ymin:.15,vel:[.25,0,.12],sway:1.2,size:[2.2,4],colA:0xdff0f4,colB:0xcfe4ea,alpha:.1,center:[3.2,.35],near:5,depth:false,
        sched:{on:[20,50],off:[15,40],fade:[5,8],dens:[.6,1],p0:.5},mood:{hemi:.04}}
    ]},
    snow:{gust:{every:[6,16],dur:[3,5.5],peak:[.7,1]},grass:1.4,layers:[
      {name:'flakes',mode:0,shape:0,count:750,box:[17,9,17],ymin:0,vel:[-.6,-1.5,.3],gustV:[-5,0,1.5],sway:.7,size:[.07,.16],colA:0xffffff,colB:0xe6f3ff,alpha:.85,near:2,
        sched:{on:[25,60],off:[12,30],fade:[3,5],dens:[.4,1],p0:.6},mood:{sun:-.05}},
      {name:'wind',mode:0,shape:1,count:170,box:[18,3.2,18],ymin:.1,vel:[-1.5,-.1,.4],gustV:[-13,0,3],size:[1.8,3.4],colA:0xf4faff,colB:0xffffff,alpha:.38,thick:1.3,near:2.5,
        gust:{base:0,gain:1},sched:{on:[30,70],off:[10,25],fade:[1.5,2],dens:[.6,1],p0:.8}}
    ]},
    mountain:{gust:{every:[14,30],dur:[8,12],peak:[.7,1]},layers:[
      {name:'fog',mode:0,shape:4,count:44,box:[20,1.6,20],ymin:.1,vel:[.35,0,.15],gustV:[2.2,0,.9],sway:1.5,size:[2.4,4.4],colA:0xe0e6ee,colB:0xbcc6d4,alpha:.17,center:[3.3,.35],near:6,depth:false,
        sched:{on:[30,70],off:[15,40],fade:[6,9],dens:[.5,1],p0:.7},mood:{sun:-.1,hemi:.06}},
      {name:'veil',mode:0,shape:4,count:22,box:[22,.9,22],ymin:.05,vel:[1,0,.4],gustV:[4,0,1.6],sway:.8,size:[3.6,6],colA:0xeceff5,colB:0xd0d8e4,alpha:.1,center:[4,.3],near:7,depth:false,
        gust:{base:0,gain:1},sched:{on:[40,90],off:[10,30],fade:[4,6],dens:[.7,1],p0:.8}}
    ]},
    desert:{gust:{every:[7,18],dur:[3,6],peak:[.7,1]},grass:1.2,layers:[
      {name:'grains',mode:0,shape:1,count:720,box:[18,2.4,18],ymin:.05,vel:[-5.5,-.1,1.2],gustV:[-9,0,2],size:[.7,1.5],colA:0xe8c88a,colB:0xf5dcaa,alpha:.6,thick:1.4,near:2,
        gust:{base:.35,gain:.65},sched:{on:[25,60],off:[15,40],fade:[3,5],dens:[.45,1],p0:.65}},
      {name:'haze',mode:0,shape:4,count:30,box:[20,1.4,20],ymin:.1,vel:[-1.3,0,.3],gustV:[-5,0,1],sway:.8,size:[2.2,4.2],colA:0xdcb87c,colB:0xc9a064,alpha:.11,center:[3.3,.4],near:6,depth:false,
        follow:'grains',gust:{base:.25,gain:.75},mood:{sun:-.05,hemi:.04}}
    ]},
    forest:{gust:{every:[10,24],dur:[3,5],peak:[.4,.8]},grass:.6,layers:[
      {name:'leaves',mode:0,shape:2,count:120,box:[16,8,16],ymin:0,vel:[-.35,-.8,.2],gustV:[-2.5,0,.8],sway:1.1,size:[.16,.28],colA:0x6fae3a,colB:0xd8b640,alpha:.92,spin:1.4,width:.55,flap:3.2,near:2,
        sched:{on:[20,45],off:[18,40],fade:[3,5],dens:[.3,1],p0:.6}},
      {name:'motes',mode:1,shape:3,count:34,box:[14,1.8,14],ymin:.35,sway:.9,size:[.22,.4],colA:0xf6f2a0,colB:0xc8ff9a,alpha:.85,flick:.9,add:true,near:1.5,
        sched:{on:[25,55],off:[20,45],fade:[4,6],dens:[.5,1],p0:.5},mood:{sun:-.08,hemi:-.02}}
    ]},
    meadow:{gust:{every:[9,22],dur:[3,5],peak:[.4,.8]},grass:.6,layers:[
      {name:'petals',mode:0,shape:2,count:90,box:[16,7,16],ymin:0,vel:[-.5,-.55,.25],gustV:[-2,0,.6],sway:1.4,size:[.12,.2],colA:0xffffff,colB:0xffb3c8,alpha:.9,spin:1,width:.85,flap:2.4,near:2,
        sched:{on:[25,55],off:[15,35],fade:[3,5],dens:[.3,1],p0:.6}},
      {name:'butterflies',mode:1,shape:6,count:5,box:[13,1.8,13],ymin:.5,sway:2.2,size:[.46,.66],colA:0xffa63d,colB:0x6fb7ff,alpha:1,flap:12,near:1.5,
        sched:{on:[30,70],off:[20,50],fade:[2,3],dens:[.5,1],p0:.5}}
    ]}
  };

  /* ---------- Shader (dùng chung cho mọi lớp) ---------- */
  const VERT=[
    'uniform float uTime,uScale,uMaxPx,uAspect,uAlpha,uDensity,uMode,uSway,uYmin,uNear,uSpin,uFlap,uFlick,uRate,uFar,uVar;',
    'uniform vec3 uBox,uVel,uWind,uDrift,uColA,uColB;',
    'uniform vec2 uSize,uCenter;',
    'attribute vec4 aS,aT;',                         /* hai bộ số ngẫu nhiên cố định của mỗi hạt */
    'varying vec4 vCol;varying vec2 vDir;varying float vPx,vAng,vFlap,vSeed;',
    'float edge(float x,float k){return smoothstep(0.,k,x)*(1.-smoothstep(1.-k,1.,x));}',
    'void main(){',
    '  vCol=vec4(0.);vDir=vec2(1.,0.);vPx=1.;vAng=0.;vFlap=1.;vSeed=aS.x;',
    '  gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;',
    '  if(aS.w>uDensity||uAlpha<.002)return;',        /* hạt vượt độ dày hiện tại: bỏ */
    '  float t=uTime,sz=mix(uSize.x,uSize.y,aT.w),fade=1.;',
    '  vec3 p,v;',
    '  if(uMode<.5){',                                 /* rơi/trôi trong hộp, ra khỏi hộp thì lặp lại ở phía đối diện */
    '    float sp=.75+aT.x*.5,wk=.6+aT.y*.8;',
    '    v=uVel*sp+uWind*wk;',
    '    vec3 q=vec3(aS.x,aS.y,aS.z)*uBox+uVel*sp*t+uDrift*wk;',
    '    q.x+=sin(t*(.5+aT.z)+aT.w*6.283)*uSway;',
    '    q.z+=cos(t*(.45+aT.y)+aT.x*6.283)*uSway;',
    '    q=mod(q,uBox);',
    '    vec3 n=q/uBox;',
    '    fade=edge(n.x,.12)*edge(n.z,.12)*edge(n.y,.1);',   /* mờ ở mép hộp để không thấy hạt "nhảy" */
    '    p=vec3(q.x-uBox.x*.5,q.y+uYmin,q.z-uBox.z*.5);',
    '  }else if(uMode<1.5){',                          /* bay lượn kiểu Lissajous quanh một điểm */
    '    float w1=.18+aT.x*.3,w2=.16+aT.y*.3,w3=.5+aT.z*.7,ph1=aT.w*6.283,ph2=aT.z*6.283+1.,ph3=aS.x*40.;',
    '    vec3 h=vec3((aS.x-.5)*uBox.x,uYmin+aS.y*uBox.y,(aS.z-.5)*uBox.z);',
    '    p=h+vec3(sin(w1*t+ph1)*uSway,sin(w3*t+ph3)*.18,cos(w2*t+ph2)*uSway);',
    '    v=vec3(cos(w1*t+ph1)*w1*uSway,0.,-sin(w2*t+ph2)*w2*uSway);',
    '  }else{',                                         /* gợn nước: vòng nở ra rồi tan tại điểm cố định */
    '    float u=fract(t*uRate*(.7+aT.x*.6)+aS.x);',
    '    p=position;sz=mix(uSize.x,uSize.y,u);',
    '    fade=pow(1.-u,1.5)*smoothstep(0.,.08,u);v=vec3(1.,0.,0.);',
    '  }',
    '  vec4 mv=modelViewMatrix*vec4(p,1.);',
    '  float dist=-mv.z;',
    '  if(dist<.2)return;',
    '  vec4 c1=projectionMatrix*mv;',
    '  vec4 c2=projectionMatrix*(modelViewMatrix*vec4(p+v*.05,1.));',
    '  vec2 d=c2.xy/c2.w-c1.xy/c1.w;d.x*=uAspect;',   /* hướng chuyển động trên màn hình (cho vệt và bướm) */
    '  float dl=length(d);vDir=dl>1e-6?d/dl:vec2(1.,0.);',
    '  fade*=smoothstep(uNear*.4,uNear,dist);',
    '  if(uFar>0.)fade*=1.-smoothstep(uFar*.5,uFar,dist);',   /* xa thì mờ: có chiều sâu */
    '  fade*=mix(1.,.3+.7*aT.y,uVar);',                          /* mỗi hạt một độ sáng */
    '  fade*=mix(uCenter.y,1.,smoothstep(uCenter.x,uCenter.x+2.5,length(p.xz)));',   /* quanh tâm bàn mờ hơn: sương không che quân/ô */
    '  float flick=.5+.5*sin(t*(1.6+aT.z*2.4)+aS.x*60.);',
    '  fade*=mix(1.,smoothstep(.1,.9,flick),uFlick);',
    '  float px=sz*uScale/dist;',
    '  vPx=min(px,uMaxPx);',
    '  gl_PointSize=max(vPx,1.5);',
    '  gl_Position=c1;',
    '  vCol=vec4(mix(uColA,uColB,aT.z),uAlpha*fade);',
    '  vAng=t*uSpin*(.4+aT.z*1.2)+aS.y*6.283;',
    '  vFlap=abs(cos(t*uFlap*(.7+aT.x*.6)+aS.x*30.));',
    '}'
  ].join('\n');

  const FRAG=[
    'uniform float uShape,uSquash,uThick,uWidth,uTime;',
    'varying vec4 vCol;varying vec2 vDir;varying float vPx,vAng,vFlap,vSeed;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
    'void main(){',
    '  vec2 q=gl_PointCoord*2.-1.;q.y=-q.y;',
    '  float a=0.;vec3 col=vCol.rgb;float r=length(q);',
    '  if(uShape<.5){',                                 /* chấm mềm (bông tuyết) */
    '    a=1.-smoothstep(.0,1.,r);a=a*a*1.4;',
    '  }else if(uShape<1.5){',                          /* vệt có đuôi mờ (mưa, gió) */
    '    float al=dot(q,vDir),pe=dot(q,vec2(-vDir.y,vDir.x));',
    '    float w=uThick/max(vPx,1.);',
    '    a=(1.-smoothstep(.6,1.,abs(al)))*(1.-smoothstep(w*.3,w,abs(pe)));',
    '    a*=.3+.7*smoothstep(-1.,1.,al);',
    '  }else if(uShape<2.5){',                          /* lá / cánh hoa: elip xoay, hẹp lại khi "lật" */
    '    float c=cos(vAng),sn=sin(vAng);',
    '    vec2 p=vec2(c*q.x+sn*q.y,-sn*q.x+c*q.y);',
    '    p.y/=max(.16,uWidth*(.3+.7*vFlap));',
    '    float e=dot(p,p);a=1.-smoothstep(.7,1.,e);',
    '    col*=1.-.22*(1.-smoothstep(0.,.1,abs(p.y)));',
    '  }else if(uShape<3.5){',                          /* đốm sáng (đom đóm) */
    '    a=min(exp(-r*r*6.)+.5*exp(-r*r*38.),1.)*(1.-smoothstep(.8,1.,r));',
    '  }else if(uShape<4.5){',                          /* mảng sương mềm, viền nhoè theo noise */
    '    vec2 w=q*1.7+vSeed*40.+vec2(uTime*.035,-uTime*.022);',
    '    float n=vnoise(w)*.5+vnoise(w*2.3+7.)*.3+vnoise(w*5.1-3.+uTime*.03)*.2;',   /* viền tơi như làn khói, hình dạng đổi chậm */
    '    a=1.-smoothstep(.04,.95,r*(.62+.75*n));a*=a;',
    '  }else if(uShape<5.5){',                          /* vòng gợn nước (bẹp theo góc nhìn) */
    '    float rr=length(vec2(q.x,q.y/uSquash)),w=max(.07,2./vPx);',
    '    a=(1.-smoothstep(0.,w,abs(rr-.75)))*(1.-smoothstep(.95,1.05,rr));',
    '  }else{',                                         /* bướm: thân + hai cặp cánh, vỗ theo vFlap */
    '    vec2 p=vec2(dot(q,vDir),dot(q,vec2(-vDir.y,vDir.x)));',
    '    float f=.25+.75*vFlap,y=abs(p.y);',
    '    float w1=length(vec2((p.x-.12)/.38,(y-.36*f)/(.3*f+.04)));',
    '    float w2=length(vec2((p.x+.22)/.27,(y-.28*f)/(.22*f+.04)));',
    '    float wm=min(w1,w2),wing=1.-smoothstep(.85,1.,wm);',
    '    float body=(1.-smoothstep(.04,.09,abs(p.y)))*(1.-smoothstep(.45,.6,abs(p.x)));',
    '    a=max(wing,body);',
    '    col*=mix(.65,1.,1.-smoothstep(.25,1.,wm));',
    '    col=mix(col,vec3(.12,.1,.08),body);',
    '  }',
    '  a*=vCol.a;',
    '  if(a<.004)discard;',
    '  gl_FragColor=vec4(col,a);',
    '}'
  ].join('\n');

  const rr=(a,b)=>a+Math.random()*(b-a);
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;

  let ready=false,slots=[],layers=[],def=null,biome=null,base=null,t=0,maxPx=256,lastBusy=false,
      gust={g:0,on:false,u:0,dur:1,peak:1,wait:0},lastGrass=-1,lastMood=[0,0],grassK=0;

  function mkSlot(stage){
    const geo=new THREE.BufferGeometry(),pos=new Float32Array(MAXP*3),aS=new Float32Array(MAXP*4),aT=new Float32Array(MAXP*4);
    for(let i=0;i<MAXP*4;i++){aS[i]=Math.random();aT[i]=Math.random();}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('aS',new THREE.BufferAttribute(aS,4));
    geo.setAttribute('aT',new THREE.BufferAttribute(aT,4));
    const V=()=>new THREE.Vector3(),C=()=>new THREE.Color();
    const mat=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uScale:{value:1},uMaxPx:{value:256},uAspect:{value:1},uAlpha:{value:0},uDensity:{value:1},uMode:{value:0},uSway:{value:0},uYmin:{value:0},uNear:{value:2},
        uSpin:{value:0},uFlap:{value:0},uFlick:{value:0},uRate:{value:1},uFar:{value:0},uVar:{value:0},uBox:{value:new THREE.Vector3(10,5,10)},uVel:{value:V()},uWind:{value:V()},uDrift:{value:V()},
        uColA:{value:C()},uColB:{value:C()},uSize:{value:new THREE.Vector2(.1,.2)},uCenter:{value:new THREE.Vector2(0,1)},
        uShape:{value:0},uSquash:{value:.7},uThick:{value:1.2},uWidth:{value:.5}},
      vertexShader:VERT,fragmentShader:FRAG,transparent:true,depthWrite:false});
    const pts=new THREE.Points(geo,mat);
    pts.frustumCulled=false;pts.visible=false;pts.renderOrder=6;
    pts.raycast=function(){};   /* không bao giờ chặn click */
    stage.scene.add(pts);
    return{pts,mat,geo,u:mat.uniforms};
  }

  function init(stage){
    if(ready||typeof THREE==='undefined')return;
    try{
      for(let i=0;i<NSLOT;i++)slots.push(mkSlot(stage));
      const gl=stage.ren.getContext(),rg=gl&&gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      maxPx=Math.min(rg&&rg[1]?rg[1]:256,480);
      ready=true;
    }catch(e){ready=false;}
  }

  function enabled(){
    const W=CFG.WEATHER;
    if(!W||W.on===false)return false;
    try{if(typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches)return false;}catch(e){}
    return true;
  }

  /* ---------- Tông ánh sáng theo biome (CFG.GRADE) + chỉnh nhẹ theo thời tiết ---------- */
  function lights(ms,mh){
    const L=Stage.L;if(!L||!base)return;
    L.hemi.intensity=base.hemi[2]*(1+mh);L.sun.intensity=base.sun[1]*(1+ms);L.fill.intensity=base.fill[1];
    lastMood[0]=ms;lastMood[1]=mh;
  }
  function grade(b){
    const L=Stage.L;if(!L)return;
    const G=CFG.GRADE,use=!(CFG.WEATHER&&CFG.WEATHER.grade===false),g=use&&b&&G&&G[b]?G[b]:CFG.LIGHT;
    base={hemi:g.hemi,sun:g.sun,fill:g.fill};
    L.hemi.color.setHex(g.hemi[0]);L.hemi.groundColor.setHex(g.hemi[1]);L.sun.color.setHex(g.sun[0]);L.fill.color.setHex(g.fill[0]);
    lights(0,0);
  }

  /* ---------- Cấu hình một lớp vào một slot ---------- */
  function schedInit(L){
    const s=L.def.sched;if(!s){L.a=1;L.target=1;L.timer=1e9;L.dens=1;return;}
    L.dens=rr(s.dens[0],s.dens[1]);
    if(Math.random()<s.p0){L.target=1;L.a=0;L.timer=rr(s.on[0],s.on[1])*rr(.4,1);}
    else{L.target=0;L.a=0;L.timer=rr(s.off[0],s.off[1])*rr(.15,.6);}
  }
  function setup(d,slot,terr){
    const u=slot.u;
    u.uMode.value=d.mode;u.uShape.value=d.shape;
    u.uBox.value.set(...(d.box||[10,5,10]));u.uYmin.value=d.ymin||0;
    u.uVel.value.set(...(d.vel||[0,0,0]));u.uSway.value=d.sway||0;
    u.uSize.value.set(d.size[0],d.size[1]);
    u.uColA.value.setHex(d.colA);u.uColB.value.setHex(d.colB);
    u.uCenter.value.set(...(d.center||[0,1]));u.uNear.value=d.near||2;
    u.uFar.value=d.far||0;u.uVar.value=d.vary?1:0;u.uSpin.value=d.spin||0;u.uFlap.value=d.flap||0;u.uFlick.value=d.flick||0;u.uRate.value=d.rate||1;u.uWidth.value=d.width||.5;
    u.uDrift.value.set(0,0,0);u.uWind.value.set(0,0,0);u.uAlpha.value=0;
    slot.mat.blending=d.add?THREE.AdditiveBlending:THREE.NormalBlending;
    slot.mat.depthTest=d.depth!==false;   /* sương/bụi: tắt depth test → không còn đường cắt phẳng khi chạm bề mặt */
    let n=d.count||0;
    if(d.mode===2){   /* gợn nước: vài vòng ngẫu nhiên trong mỗi ô nước */
      const W=(typeof Core!=='undefined'&&Core.TERR&&Core.TERR.WATER)||7,P=slot.geo.attributes.position.array;n=0;
      if(terr)for(let r=0;r<N&&n<MAXP-6;r++)for(let c=0;c<N;c++){
        if(terr[r*N+c]!==W)continue;
        for(let k=0;k<6;k++){P[n*3]=cellX(c)+rr(-.42,.42)*CFG.CELL;P[n*3+1]=TOP+.02;P[n*3+2]=cellZ(r)+rr(-.42,.42)*CFG.CELL;n++;}
      }
      slot.geo.attributes.position.needsUpdate=true;
    }
    slot.geo.setDrawRange(0,Math.min(n,MAXP));
    slot.pts.visible=false;
  }

  function set(b,terr){
    if(!ready&&typeof Stage!=='undefined'&&Stage.scene)init(Stage);
    b=b==='balanced'?'meadow':b;
    layers=[];def=null;biome=b||null;gust.g=0;gust.on=false;lastBusy=false;
    for(const s of slots)s.pts.visible=false;
    if(typeof Terrain!=='undefined'&&lastGrass>0&&Terrain.setGust){Terrain.setGust(0);}
    lastGrass=-1;
    if(!ready){return;}
    grade(b);
    if(!b||!enabled()||!DEFS[b])return;
    def=DEFS[b];grassK=def.grass||0;
    def.layers.forEach((d,i)=>{
      if(i>=NSLOT)return;
      const L={def:d,slot:slots[i],a:0,target:0,timer:0,dens:1,s:0,vis:false,ws:0};
      setup(d,slots[i],terr);schedInit(L);layers.push(L);
    });
    if(def.gust)gust.wait=rr(2,def.gust.every[1]*.6);
    Stage.invalidate();
  }

  /* Gọi mỗi khung hình (vòng lặp app.js). Trả true khi còn chuyển động (để vòng lặp tiếp tục vẽ). */
  function update(dt){
    if(!ready||!layers.length)return false;
    dt=Math.min(dt,.05);t+=dt;
    /* gió giật ngẫu nhiên: chuông sin² trong dur giây, đỉnh = peak */
    const G=def.gust;
    if(G){
      if(gust.on){
        gust.u+=dt/gust.dur;
        if(gust.u>=1){gust.on=false;gust.g=0;gust.wait=rr(G.every[0],G.every[1]);}
        else{const s=Math.sin(Math.PI*gust.u);gust.g=gust.peak*s*s;}
      }else{
        gust.wait-=dt;
        if(gust.wait<=0){gust.on=true;gust.u=0;gust.dur=rr(G.dur[0],G.dur[1]);gust.peak=rr(G.peak[0],G.peak[1]);}
      }
    }
    const g=gust.g,cam=Stage.cam,ren=Stage.ren;
    const scale=ren.domElement.height/(2*Math.tan(cam.fov*Math.PI/360)),pr=ren.getPixelRatio();
    const sq=clamp(Math.sin((typeof Camera!=='undefined'&&Camera.p)||.8),.3,1);
    let busy=false,ms=0,mh=0;
    for(const L of layers){
      const d=L.def;
      if(d.follow){const f=layers.find(x=>x.def.name===d.follow);L.s=f?f.s:0;L.dens=f?f.dens:1;}
      else if(d.sched){
        const s=d.sched;L.timer-=dt;
        if(L.timer<=0){
          if(L.target){L.target=0;L.timer=rr(s.off[0],s.off[1]);}
          else{L.target=1;L.timer=rr(s.on[0],s.on[1]);L.dens=rr(s.dens[0],s.dens[1]);}
        }
        const fd=L.target?s.fade[0]:s.fade[1],step=dt/fd;
        L.a=L.target?Math.min(1,L.a+step):Math.max(0,L.a-step);
        L.s=L.a*L.a*(3-2*L.a);   /* mờ vào/ra mượt */
      }else L.s=1;
      const gk=d.gust?d.gust.base+d.gust.gain*g:1,alpha=L.s*gk*(d.alpha===undefined?1:d.alpha);
      const vis=alpha>.003;
      if(vis!==L.vis){L.vis=vis;L.slot.pts.visible=vis;}
      if(!vis)continue;
      busy=true;
      const u=L.slot.u,gv=d.gustV;
      u.uTime.value=t;u.uScale.value=scale;u.uMaxPx.value=maxPx;u.uAspect.value=cam.aspect;u.uSquash.value=sq;u.uThick.value=(d.thick||1.2)*pr;
      u.uAlpha.value=alpha;u.uDensity.value=clamp(L.dens*((CFG.WEATHER&&CFG.WEATHER.amount)||1),0,1);
      if(gv){   /* gió giật đẩy hạt: vận tốc tức thời (hướng vệt) + độ dịch tích luỹ (vị trí) */
        u.uWind.value.set(gv[0]*g,gv[1]*g,gv[2]*g);u.uDrift.value.x+=gv[0]*g*dt;u.uDrift.value.y+=gv[1]*g*dt;u.uDrift.value.z+=gv[2]*g*dt;}
      if(d.mood){ms+=(d.mood.sun||0)*L.s*L.dens;mh+=(d.mood.hemi||0)*L.s*L.dens;}
    }
    if(Math.abs(ms-lastMood[0])>1e-4||Math.abs(mh-lastMood[1])>1e-4)lights(ms,mh);
    /* cỏ rạp theo gió giật (chỉ gọi khi đổi) */
    if(grassK>0&&typeof Terrain!=='undefined'&&Terrain.setGust){
      const k=Math.round(g*grassK*100)/100;
      if(k!==lastGrass){lastGrass=k;Terrain.setGust(k);busy=true;}
    }
    const out=busy||lastBusy;lastBusy=busy;
    return out;
  }

  return{init,set,update,DEFS,get layers(){return layers;},get gust(){return gust;}};
})();
