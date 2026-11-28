'use strict';
/* [SFX] Âm thanh toàn game, tổng hợp bằng WebAudio (không cần file âm thanh). Thuần "view": không đụng luật, không đồng bộ online.
   Nguyên tắc "ASMR": tiếng trầm, tròn, cắt bớt cao tần, attack mềm, âm lượng nhỏ; mỗi lần phát có biến thể ngẫu nhiên (pitch ±, âm lượng ±)
   để không nhàm tai. Có 4 bus: ui · sfx · amb (môi trường) và master, chỉnh trong menu (Âm thanh) hoặc phím M (tắt/bật).

   API chính (đều tự bỏ qua nếu chưa mở khóa AudioContext / đang tắt tiếng):
     Sfx.play(tên,{v:âm lượng,x,z:vị trí thế giới để pan,r:pitch,mat:chất liệu})   một tiếng
     Sfx.step(mat,x,z,v)  Sfx.jet(v)  Sfx.slide(v)  Sfx.setBiome(b)  Sfx.stopAll()
   QUAN TRỌNG (lộ thông tin): quân đối thủ nấp trong cỏ KHÔNG được phát tiếng. Nơi gọi phải kiểm tra Pawns.aud(s) trước. */
const Sfx=(function(){
  const KEY='bloc.snd';
  const st={on:true,master:.8,sfx:1,amb:.7,music:.6};   /* cài đặt người dùng (lưu localStorage) */
  const subs=[];const emit=()=>{for(const f of subs){try{f();}catch(e){}}};   /* module khác (nhạc nền) đăng ký nghe thay đổi cài đặt */
  let cur=null,ctx=null,master=null,comp=null,bus={},nzW=null,nzB=null,vc=0,wd=null,seen={},amb=null;
  const loops={};   /* các vòng lặp liên tục: jet, slide, gust (gain bám theo giá trị gọi gần nhất; watchdog tự tắt nếu ngừng gọi) */
  const tmp=()=>new THREE.Vector3();
  let pv=null;

  try{const o=JSON.parse(localStorage.getItem(KEY)||'null');if(o)Object.assign(st,o);}catch(e){}
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(st));}catch(e){}};

  const ok=()=>ctx&&ctx.state==='running'&&st.on;
  const now=()=>ctx.currentTime;
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const cl=(x,a,b)=>x<a?a:x>b?b:x;

  /* ---- Khởi tạo ---- */
  function build(){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    ctx=new AC({latencyHint:'interactive'});
    master=ctx.createGain();comp=ctx.createDynamicsCompressor();
    comp.threshold.value=-18;comp.knee.value=24;comp.ratio.value=4;comp.attack.value=.006;comp.release.value=.25;
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=9000;   /* cắt tiếng the thé cho êm tai */
    master.connect(comp);comp.connect(lp);lp.connect(ctx.destination);
    for(const k of['ui','sfx','amb']){bus[k]=ctx.createGain();bus[k].connect(master);}
    /* nhiễu trắng + nhiễu nâu (trầm, mềm) dùng chung, 2 giây */
    const L=ctx.sampleRate*2;
    nzW=ctx.createBuffer(1,L,ctx.sampleRate);nzB=ctx.createBuffer(1,L,ctx.sampleRate);
    const w=nzW.getChannelData(0),b=nzB.getChannelData(0);let l=0;
    for(let i=0;i<L;i++){const x=Math.random()*2-1;w[i]=x;l=(l+.02*x)/1.02;b[i]=l*3.5;}
    applyVol();
    wd=setInterval(watch,120);
    document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden)ctx.suspend();else if(st.on)ctx.resume();});
  }
  function applyVol(){
    if(!ctx)return;const t=now();
    master.gain.setTargetAtTime(st.on?st.master:0,t,.05);
    bus.ui.gain.value=.9;bus.sfx.gain.value=st.sfx;bus.amb.gain.setTargetAtTime(st.amb,t,.1);
  }
  function unlock(){
    if(!ctx)build();
    if(ctx&&ctx.state!=='running')ctx.resume();
    if(ctx&&cur&&!amb)setBiome(cur);   /* biome đã đặt trước khi mở khóa: dựng môi trường bây giờ */
  }

  /* ---- Công cụ dựng tiếng ---- */
  /* Vị trí thế giới → pan -1..1 theo màn hình hiện tại */
  function panOf(x,z){
    if(x===undefined||typeof Stage==='undefined'||!Stage.cam)return 0;
    pv=pv||tmp();pv.set(x,.3,z||0).project(Stage.cam);
    return cl(pv.x*.7,-.8,.8);
  }
  /* Gain + panner nối vào bus; trả về nút để nguồn nối vào */
  function out(b,pan,g){
    const n=ctx.createGain();n.gain.value=g===undefined?1:g;
    if(pan&&ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=pan;n.connect(p);p.connect(bus[b]);}
    else n.connect(bus[b]);
    return n;
  }
  /* Bao âm: 0 → peak (a giây) → ~0 (hết d giây) */
  function env(g,t,a,d,peak){
    g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(peak,t+a);
    g.gain.exponentialRampToValueAtTime(0.0001,t+Math.max(a+.01,d));
  }
  function done(src,t){vc++;src.onended=()=>{vc--;};src.stop(t);}
  /* Dao động: sin/tam giác..., tần số f0→f1 */
  function osc(dest,type,f0,f1,t,dur,peak,a,lpf){
    const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;
    o.frequency.setValueAtTime(f0,t);if(f1&&f1!==f0)o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    env(g,t,a===undefined?.004:a,dur,peak);
    let n=o;
    if(lpf){const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=lpf;o.connect(f);n=f;}
    n.connect(g);g.connect(dest);o.start(t);done(o,t+dur+.05);return o;
  }
  /* Nhiễu có lọc: type bandpass/lowpass/highpass, f0→f1 */
  function nz(dest,type,f0,f1,q,t,dur,peak,a,brown){
    if(vc>40)return;
    const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
    s.buffer=brown?nzB:nzW;s.loop=true;
    f.type=type;f.Q.value=q||.7;f.frequency.setValueAtTime(f0,t);if(f1&&f1!==f0)f.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    env(g,t,a===undefined?.005:a,dur,peak);
    s.connect(f);f.connect(g);g.connect(dest);s.start(t,Math.random()*1.5);done(s,t+dur+.05);return s;
  }
  /* Nốt chuông mềm: nhiều tần số nối tiếp */
  function chime(dest,freqs,gap,dur,peak,type,t0){
    freqs.forEach((f,i)=>{
      const t=t0+i*gap;osc(dest,type||'sine',f,f*.998,t,dur,peak,.006,3500);
      osc(dest,'sine',f*2,f*2,t,dur*.5,peak*.18,.004,5000);
    });
  }
  /* Giới hạn tần suất mỗi loại tiếng */
  function gate(k,ms){const t=performance.now();if(seen[k]&&t-seen[k]<ms)return false;seen[k]=t;return true;}

  /* ---- Thư viện tiếng ---- */
  /* Mỗi hàm: (dest,t,v,o) — dest đã có pan + bus; v = âm lượng 0..1; o.r = hệ số pitch */
  const LIB={
    /* ===== Giao diện ===== */
    hover:(d,t,v,o)=>{osc(d,'sine',1500*o.r,1350*o.r,t,.05,.05*v,.004,4000);},
    click:(d,t,v,o)=>{osc(d,'sine',780*o.r,430*o.r,t,.08,.13*v,.003,3000);nz(d,'bandpass',2600,1800,1.2,t,.025,.07*v,.002);},
    on:(d,t,v,o)=>{osc(d,'sine',520,780,t,.12,.12*v,.004,3500);osc(d,'sine',780,1040,t+.07,.14,.09*v,.004,3500);},
    off:(d,t,v,o)=>{osc(d,'sine',780,520,t,.12,.11*v,.004,3500);osc(d,'sine',520,360,t+.07,.14,.08*v,.004,3500);},
    open:(d,t,v,o)=>{nz(d,'bandpass',400,1400,.8,t,.22,.05*v,.05);osc(d,'sine',420,640,t,.18,.09*v,.01,3000);},
    close:(d,t,v,o)=>{nz(d,'bandpass',1400,400,.8,t,.2,.04*v,.04);osc(d,'sine',640,380,t,.16,.08*v,.01,3000);},
    nope:(d,t,v,o)=>{osc(d,'sine',190,130,t,.1,.12*v,.004,500);},
    tickWall:(d,t,v,o)=>{osc(d,'triangle',560*o.r,430*o.r,t,.05,.07*v,.003,2200);},
    tickBad:(d,t,v,o)=>{osc(d,'sine',210,170,t,.06,.07*v,.003,600);},
    tickTarget:(d,t,v,o)=>{osc(d,'sine',900*o.r,860*o.r,t,.06,.07*v,.004,3000);osc(d,'sine',1350*o.r,1300*o.r,t+.03,.05,.04*v,.004,3500);},
    rot:(d,t,v,o)=>{osc(d,'triangle',330,210,t,.06,.12*v,.002,2200);osc(d,'triangle',440,260,t+.045,.06,.1*v,.002,2200);},
    cam:(d,t,v,o)=>{osc(d,'sine',1100*o.r,900*o.r,t,.07,.06*v,.004,3500);},
    swish:(d,t,v,o)=>{nz(d,'bandpass',900,2200,.7,t,.2,.05*v,.04);},
    turn:(d,t,v,o)=>{chime(d,[660,880],.13,.32,.07*v,'sine',t);},
    tick:(d,t,v,o)=>{osc(d,'sine',1000,930,t,.05,.07*v,.003,3000);},
    good:(d,t,v,o)=>{chime(d,[587,740,880],.08,.3,.06*v,'sine',t);},
    bad:(d,t,v,o)=>{chime(d,[392,330],.11,.3,.05*v,'sine',t);},
    /* ===== Bước chân (v = âm lượng; r = pitch) ===== */
    stepWood:(d,t,v,o)=>{osc(d,'sine',190*o.r,105*o.r,t,.09,.32*v,.003,1500);nz(d,'bandpass',900*o.r,600,1,t,.035,.16*v,.002);},
    stepPlate:(d,t,v,o)=>{osc(d,'triangle',150*o.r,95*o.r,t,.1,.25*v,.003,1400);nz(d,'bandpass',1800,900,2,t,.04,.1*v,.002);},
    stepGrass:(d,t,v,o)=>{nz(d,'bandpass',2300*o.r,1300,.8,t,.13,.2*v,.025,true);nz(d,'highpass',3500,3500,.5,t,.06,.03*v,.02);},
    stepSand:(d,t,v,o)=>{nz(d,'bandpass',2800*o.r,1800,.5,t,.15,.17*v,.02);nz(d,'lowpass',900,500,.5,t,.1,.1*v,.01,true);},
    stepWater:(d,t,v,o)=>{nz(d,'bandpass',700*o.r,350,1.2,t,.22,.2*v,.015);osc(d,'sine',380*o.r,720*o.r,t+.02,.09,.07*v,.01,2000);},
    stepStone:(d,t,v,o)=>{osc(d,'sine',230*o.r,130*o.r,t,.07,.18*v,.002,2500);nz(d,'bandpass',2200,1500,1.5,t,.03,.12*v,.001);},
    /* ===== Nhảy, đáp, trượt ===== */
    jump:(d,t,v,o)=>{nz(d,'bandpass',350,1500,.8,t,.22,.12*v,.04);osc(d,'sine',210,340,t,.1,.06*v,.01,1500);},
    land:(d,t,v,o)=>{osc(d,'sine',130*o.r,62*o.r,t,.18,.5*v,.004,900);nz(d,'bandpass',800,500,.9,t,.05,.18*v,.002);
      if(o.mat==='grass')nz(d,'bandpass',2000,1100,.7,t,.16,.12*v,.02,true);else if(o.mat==='sand')nz(d,'bandpass',2500,1500,.5,t,.2,.12*v,.02);
      else if(o.mat==='water')nz(d,'bandpass',800,300,1,t,.3,.2*v,.01);},
    climb:(d,t,v,o)=>{nz(d,'bandpass',1400,700,1.2,t,.13,.14*v,.02);LIB.stepStone(d,t+.05,v*.9,{r:.9});nz(d,'bandpass',550,320,.8,t+.02,.16,.04*v,.05);},   /* leo lên đá: cọ đá + bước + hơi thở nhẹ */
    hop:(d,t,v,o)=>{LIB.jump(d,t,v*.6,o);},   /* nhảy qua tường giữa hai đá thấp: tiếng nhảy ngắn, nhỏ hơn nhảy qua đối thủ */
    whoosh:(d,t,v,o)=>{nz(d,'bandpass',300,1800,.7,t,.4,.12*v,.1);nz(d,'bandpass',1800,400,.7,t+.25,.35,.07*v,.1);},
    slipFall:(d,t,v,o)=>{osc(d,'sine',900,310,t,.2,.1*v,.01,2500);},
    body:(d,t,v,o)=>{osc(d,'sine',95,48,t,.18,.4*v,.004,500);nz(d,'lowpass',700,400,.6,t,.09,.22*v,.003,true);},
    stand:(d,t,v,o)=>{nz(d,'bandpass',1500,2300,.7,t,.2,.08*v,.04);osc(d,'sine',480,700,t+.05,.09,.07*v,.01,2200);},
    iceTing:(d,t,v,o)=>{chime(d,[1568],.1,.5,.035*v,'sine',t);},
    splash:(d,t,v,o)=>{nz(d,'bandpass',1000,350,.9,t,.4,.3*v,.01);
      for(let i=0;i<3;i++)osc(d,'sine',rnd(280,520),rnd(650,1000),t+.05+i*rnd(.06,.11),.09,.07*v,.01,2500);},
    sink:(d,t,v,o)=>{nz(d,'lowpass',1000,350,.6,t,.7,.3*v,.05,true);osc(d,'sine',130,65,t,.5,.18*v,.02,500);
      for(let i=0;i<4;i++)nz(d,'bandpass',rnd(1800,3000),1500,.6,t+.1+i*.11,.1,.06*v,.02);},
    /* ===== Bẫy lò xo ===== */
    trapArm:(d,t,v,o)=>{osc(d,'square',95,80,t,.14,.1*v,.004,320);nz(d,'bandpass',1500,900,2,t,.03,.08*v,.001);osc(d,'sine',210,280,t+.05,.35,.04*v,.1,900);},
    trapClose:(d,t,v,o)=>{osc(d,'triangle',140,90,t,.11,.2*v,.003,1000);},
    boing:(d,t,v,o)=>{   /* lò xo: sine trượt xuống + rung FM tắt dần */
      const c=ctx.createOscillator(),g=ctx.createGain(),m=ctx.createOscillator(),md=ctx.createGain();
      c.type='sine';c.frequency.setValueAtTime(560*o.r,t);c.frequency.exponentialRampToValueAtTime(170*o.r,t+.55);
      m.frequency.value=26;md.gain.setValueAtTime(110,t);md.gain.exponentialRampToValueAtTime(2,t+.55);
      m.connect(md);md.connect(c.frequency);
      env(g,t,.006,.6,.22*v);
      const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=2200;
      c.connect(f);f.connect(g);g.connect(d);c.start(t);m.start(t);done(c,t+.65);m.stop(t+.65);},
    trapFire:(d,t,v,o)=>{LIB.stepWood(d,t,v*1.3,{r:.85});LIB.boing(d,t+.015,v,{r:1});nz(d,'bandpass',400,1500,.7,t+.1,.3,.06*v,.05);},
    /* ===== Cổng ===== */
    gateOut:(d,t,v,o)=>{osc(d,'sine',200,1400,t,.5,.1*v,.1,3000);osc(d,'sine',203,1410,t,.5,.06*v,.1,3000);nz(d,'bandpass',500,3000,1,t,.5,.05*v,.15);},
    gateIn:(d,t,v,o)=>{osc(d,'sine',1400,240,t,.6,.1*v,.02,3000);osc(d,'sine',1410,243,t,.6,.06*v,.02,3000);nz(d,'bandpass',3000,500,1,t,.6,.05*v,.02);},
    /* ===== Rương, vật phẩm ===== */
    chestOpen:(d,t,v,o)=>{osc(d,'sawtooth',150,250,t,.28,.06*v,.03,550);osc(d,'sine',300,520,t+.22,.12,.1*v,.006,2500);nz(d,'bandpass',2500,1800,1.5,t+.24,.05,.06*v,.002);},
    vanish:(d,t,v,o)=>{nz(d,'bandpass',3000,6000,.8,t,.22,.07*v,.03);osc(d,'sine',1200,1800,t,.08,.04*v,.005,4000);},
    gift_brick:(d,t,v,o)=>{chime(d,[262,196],.1,.4,.1*v,'triangle',t);},
    gift_boots:(d,t,v,o)=>{chime(d,[523,659,784],.07,.3,.08*v,'sine',t);},
    gift_hammer:(d,t,v,o)=>{chime(d,[880,1320],.05,.6,.06*v,'sine',t);osc(d,'triangle',150,100,t,.1,.1*v,.003,1500);},
    gift_glove:(d,t,v,o)=>{chime(d,[440,554],.09,.35,.08*v,'sine',t);nz(d,'bandpass',1200,2400,.7,t,.2,.05*v,.05);},
    gift_pick:(d,t,v,o)=>{chime(d,[330,495],.08,.5,.08*v,'triangle',t);osc(d,'sine',1980,1980,t+.02,.3,.025*v,.003,4000);},
    zip:(d,t,v,o)=>{nz(d,'bandpass',600,2800,1,t,.28,.12*v,.04);osc(d,'sine',500,1100,t,.2,.05*v,.01,3000);},
    swipe:(d,t,v,o)=>{nz(d,'bandpass',1800,600,.8,t,.22,.1*v,.03);LIB.stepWood(d,t+.18,v*.8,{r:1.2});},
    hammer:(d,t,v,o)=>{LIB.stepWood(d,t,v*1.6,{r:.75});nz(d,'bandpass',300,1600,.7,t+.04,.55,.1*v,.1);},
    pick:(d,t,v,o)=>{nz(d,'highpass',900,900,.5,t,.07,.3*v,.001);osc(d,'sine',75,40,t,.3,.38*v,.003,500);LIB.stepWood(d,t,v*1.4,{r:.6});
      nz(d,'lowpass',1700,500,.6,t+.06,.4,.16*v,.03);
      for(let i=0;i<7;i++)osc(d,'triangle',rnd(500,1300),rnd(300,700),t+.12+Math.pow(i/6,1.6)*.85+rnd(0,.05),.05,.07*v,.002,2500);},
    wall:(d,t,v,o)=>{osc(d,'sine',150*o.r,88*o.r,t,.14,.5*v,.003,1100);osc(d,'triangle',330*o.r,200*o.r,t,.06,.14*v,.002,2200);nz(d,'bandpass',700,500,.9,t,.04,.2*v,.002);},
    /* ===== Người chặn đường ===== */
    warn:(d,t,v,o)=>{
      const x=ctx.createOscillator(),g=ctx.createGain(),l=ctx.createOscillator(),ld=ctx.createGain();
      x.type='sine';x.frequency.value=52;l.frequency.value=5;ld.gain.value=.5;l.connect(ld);
      const am=ctx.createGain();am.gain.value=.5;ld.connect(am.gain);x.connect(am);am.connect(g);
      g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.22*v,t+.8);g.gain.linearRampToValueAtTime(.0001,t+1.6);
      g.connect(d);x.start(t);l.start(t);done(x,t+1.7);l.stop(t+1.7);
      nz(d,'lowpass',260,420,.5,t,1.5,.2*v,.7,true);},
    flyby:(d,t,v,o)=>{nz(d,'bandpass',250,1400,.7,t,2.4,.16*v,1.2);nz(d,'bandpass',1500,300,.7,t+1.2,1.6,.08*v,.4,true);},
    clang:(d,t,v,o)=>{osc(d,'sine',72,38,t,.4,.6*v,.004,400);nz(d,'lowpass',3200,900,.7,t,.14,.28*v,.002);
      [420,630,1130,1710].forEach((f,i)=>osc(d,'sine',f,f*.99,t,.5-i*.07,.09*v,.002,5000));},
    sym:(d,t,v,o)=>{chime(d,[880,1175],.12,.4,.06*v,'sine',t);},
    bstep:(d,t,v,o)=>{osc(d,'sine',96*o.r,52*o.r,t,.15,.4*v,.003,700);osc(d,'triangle',310*o.r,260*o.r,t,.07,.1*v,.002,1800);nz(d,'lowpass',1800,700,.6,t,.06,.14*v,.002);},
    fall:(d,t,v,o)=>{osc(d,'sine',900,85,t,1.1,.09*v,.02,2500);nz(d,'bandpass',1500,300,.6,t,1.1,.08*v,.05);},
    charge:(d,t,v,o)=>{osc(d,'sawtooth',70,230,t,.8,.07*v,.3,500);nz(d,'bandpass',300,1800,.8,t,.85,.1*v,.4);},
    beam:(d,t,v,o)=>{osc(d,'sine',2600,1100,t,.16,.05*v,.004,4000);nz(d,'bandpass',4000,1500,1,t,.18,.04*v,.01);},
    crackle:(d,t,v,o)=>{nz(d,'highpass',rnd(3500,6000),4000,.5,t,.02,.05*v,.001);},
    /* ===== Kết thúc ===== */
    cheer:(d,t,v,o)=>{chime(d,[523,659,784,1047],.11,.5,.1*v,'sine',t);chime(d,[1047],.5,.9,.04*v,'sine',t+.4);},
    lose:(d,t,v,o)=>{chime(d,[392,330,262],.2,.6,.07*v,'sine',t);},
    rocket:(d,t,v,o)=>{osc(d,'sine',500,2300,t,.55,.04*v,.05,3000);nz(d,'highpass',3500,3500,.5,t,.5,.03*v,.1);},
    boom:(d,t,v,o)=>{nz(d,'lowpass',700,150,.6,t,.5,.22*v,.003,true);osc(d,'sine',85,40,t,.4,.22*v,.003,300);},
    bounce:(d,t,v,o)=>{osc(d,'sine',420,230,t,.16,.1*v,.004,1800);}
  };

  /* Phát một tiếng. bus mặc định sfx; tên bắt đầu bằng 'ui:' thì vào bus ui */
  function play(name,o){
    if(!ok())return;
    o=o||{};let b='sfx';
    if(name.indexOf('ui:')===0){b='ui';name=name.slice(3);}
    const f=LIB[name];if(!f)return;
    if(vc>34&&b==='sfx'&&name.indexOf('step')===0)return;
    const t=now()+(o.delay||0),v=(o.v===undefined?1:o.v)*rnd(.9,1.1);
    const d=out(b,o.pan!==undefined?o.pan:panOf(o.x,o.z),1);
    f(d,t,v,{r:(o.r||1)*rnd(.95,1.05),mat:o.mat});
  }

  /* ---- Bước chân theo chất liệu ---- */
  function matOf(code){
    switch(code){case 2:return'Grass';case 8:return'Sand';case 7:return'Water';case 4:return'Plate';case 1:case 9:return'Stone';default:return'Wood';}
  }
  const matName={Grass:'grass',Sand:'sand',Water:'water',Plate:'wood',Stone:'wood',Wood:'wood'};
  /* Mã ô dưới toạ độ thế giới (x,z); 0 nếu Classic */
  function codeAt(x,z){
    if(typeof S==='undefined'||!S.terr)return 0;
    const c=Math.round(x/CFG.PITCH+HALF),r=Math.round(z/CFG.PITCH+HALF);
    if(c<0||c>=N||r<0||r>=N)return 0;
    return S.terr[r*N+c]||0;
  }
  function step(code,x,z,v,r){play('step'+matOf(code),{x,z,v,r});}

  /* ---- Vòng lặp liên tục: lửa phản lực, tiếng trượt, gió giật ---- */
  function mkLoop(kind){
    const L={g:ctx.createGain(),f:null,s:null,last:0,lv:0};
    L.g.gain.value=0;
    const s=ctx.createBufferSource();s.buffer=kind==='jet'?nzW:nzW;s.loop=true;
    const f=ctx.createBiquadFilter();
    if(kind==='jet'){f.type='bandpass';f.frequency.value=650;f.Q.value=.5;}
    else if(kind==='slide'){f.type='bandpass';f.frequency.value=2600;f.Q.value=.6;}
    else{f.type='bandpass';f.frequency.value=480;f.Q.value=.5;}
    const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=kind==='slide'?6000:kind==='jet'?2800:1500;
    s.connect(f);f.connect(lp);lp.connect(L.g);
    L.g.connect(bus[kind==='gust'?'amb':'sfx']);
    s.start(0,Math.random()*1.5);L.f=f;L.s=s;
    if(kind==='jet'){   /* rì rì trầm bên dưới lửa */
      const b=ctx.createBufferSource();b.buffer=nzB;b.loop=true;
      const bf=ctx.createBiquadFilter();bf.type='lowpass';bf.frequency.value=220;b.connect(bf);bf.connect(L.g);b.start(0,Math.random()*1.5);
    }
    return L;
  }
  function setLoop(kind,v,pan){
    if(!ctx||!st.on||ctx.state!=='running')return;
    let L=loops[kind];
    if(!L){if(v<.02)return;L=loops[kind]=mkLoop(kind);}
    L.last=performance.now();L.lv=v;
    const t=now(),k=cl(v,0,1);
    if(kind==='jet'){L.g.gain.setTargetAtTime(.2*k,t,.05);L.f.frequency.setTargetAtTime(500+700*k,t,.08);}
    else if(kind==='slide'){L.g.gain.setTargetAtTime(.13*k,t,.05);L.f.frequency.setTargetAtTime(1800+2200*k,t,.06);}
    else{L.g.gain.setTargetAtTime(.1*k,t,.3);L.f.frequency.setTargetAtTime(380+500*k,t,.3);}
  }
  function watch(){   /* ngừng được gọi >250ms thì mờ dần về 0 (hoạt ảnh bị hủy giữa chừng, ván mới...) */
    if(!ctx)return;const n=performance.now();
    for(const k in loops){if(k==='gust')continue;const L=loops[k];if(L.lv>0&&n-L.last>250){L.lv=0;L.g.gain.setTargetAtTime(0,now(),.12);}}
  }

  /* ---- Môi trường theo biome ---- */
  const AMB={   /* bed: [tần số lowpass, âm lượng] · extra: các sự kiện ngẫu nhiên */
    meadow:{bed:[900,.03],birds:.3,wind:.35},
    forest:{bed:[700,.035],birds:.5,leaves:.5},
    river:{bed:[1200,.02],rain:true,stream:true},
    desert:{bed:[1100,.05],wind:.6},
    snow:{bed:[1400,.055],wind:.7},
    mountain:{bed:[600,.065],wind:.8},
    autumn:{bed:[800,.035],birds:.2,leaves:.7,wind:.4}
  };
  function setBiome(b){
    cur=b||null;stopAmbient();
    if(!ctx||!b||!AMB[b])return;
    const A=AMB[b],nodes=[];
    const mkBed=(kind,f,g,q)=>{
      const s=ctx.createBufferSource();s.buffer=kind==='b'?nzB:nzW;s.loop=true;
      const fl=ctx.createBiquadFilter();fl.type=q?'bandpass':'lowpass';fl.frequency.value=f;if(q)fl.Q.value=q;
      const gg=ctx.createGain();gg.gain.value=0;gg.gain.setTargetAtTime(g,now(),1.5);
      const l=ctx.createOscillator(),ld=ctx.createGain();l.frequency.value=rnd(.05,.12);ld.gain.value=g*.5;l.connect(ld);ld.connect(gg.gain);   /* thở chậm */
      s.connect(fl);fl.connect(gg);gg.connect(bus.amb);s.start(0,Math.random()*1.5);l.start();
      nodes.push(s,l);return gg;
    };
    mkBed('b',A.bed[0],A.bed[1]);
    if(A.rain){mkBed('w',6000,.03,.3);mkBed('w',900,.02,.5);}   /* mưa + suối */
    if(A.wind)mkBed('b',420,A.wind*.03);
    const iv=setInterval(()=>{   /* sự kiện ngẫu nhiên mỗi giây */
      if(!ok())return;
      const t=now()+rnd(0,.8),pan=rnd(-.8,.8);
      if(A.birds&&Math.random()<A.birds*.45){   /* chim: vài nốt ngắn lượn lên xuống */
        const n=1+Math.floor(Math.random()*4),f0=rnd(2400,4000),d=out('amb',pan,1);
        for(let i=0;i<n;i++)osc(d,'sine',f0*rnd(.9,1.15),f0*rnd(1.1,1.4),t+i*.09,.07,.012,.01,5000);
      }
      if(A.leaves&&Math.random()<A.leaves*.4){nz(out('amb',pan,1),'bandpass',3000,2000,.7,t,.5,.02,.15);}
      if(A.rain){for(let i=0;i<3;i++)osc(out('amb',rnd(-.8,.8),1),'sine',rnd(1600,2800),rnd(900,1500),now()+rnd(0,.9),.03,.012,.002,4000);}
    },1000);
    amb={nodes,iv};
  }
  function stopAmbient(){
    if(!amb)return;clearInterval(amb.iv);
    for(const n of amb.nodes){try{n.stop(now()+.1);}catch(e){}}
    amb=null;
  }
  function stopAll(){
    stopAmbient();
    for(const k in loops){const L=loops[k];L.lv=0;if(ctx)L.g.gain.setTargetAtTime(0,now(),.05);}
  }

  /* ---- Pháo bông: lịch theo đúng thời điểm các đợt nổ ---- */
  function burst(delay,x,z){
    if(!ok())return;
    play('rocket',{x,z,delay:Math.max(0,delay-.5),v:.9});
    play('boom',{x,z,delay,v:1});
    for(let i=0;i<9;i++)play('crackle',{x,z,delay:delay+.05+i*rnd(.05,.12),v:1});
  }

  /* ---- Giao diện chuột: hover/click nút, mở khóa AudioContext ---- */
  function bindUI(){
    const first=()=>unlock();
    for(const ev of['pointerdown','keydown','touchstart'])document.addEventListener(ev,first,{passive:true});
    let lastBtn=null;
    document.addEventListener('pointerover',e=>{
      const b=e.target.closest&&e.target.closest('button,select,.opt,[role=radio]');
      if(!b||b===lastBtn||b.disabled){if(!b)lastBtn=null;return;}
      lastBtn=b;
      if(e.pointerType==='touch')return;
      if(gate('hv',40))play('ui:hover',{r:1+(((b.id||'x').length%5)-2)*.03});
    },{passive:true});
    document.addEventListener('click',e=>{
      const b=e.target.closest&&e.target.closest('button,.opt,[role=radio]');
      if(!b||b.disabled)return;
      if(b.id==='bEval'||b.id==='bPause'){
        setTimeout(()=>play('ui:'+(b.getAttribute('aria-pressed')==='false'?'off':'on')),0);   /* đọc trạng thái SAU khi nút xử lý xong */
      }else if(b.id==='cfX'||b.id==='winX'||b.id==='cfNo')play('ui:close');
      else play('ui:click');
    },true);
    document.addEventListener('change',e=>{if(e.target&&e.target.tagName==='SELECT')play('ui:tick');});
  }

  /* ---- Cài đặt ---- */
  function setOn(on){st.on=!!on;save();if(ctx){if(st.on)ctx.resume();applyVol();}if(!st.on)stopAll();syncBtn();emit();}
  function set(k,v){st[k]=v;save();applyVol();emit();}
  function syncBtn(){ /* Cài đặt âm thanh được quản lý tập trung bởi Settings. */ }
  function init(){bindUI();}
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
    /* Dựng trước AudioContext và buffer khi trang còn rảnh; không resume nên không phát tiếng trước tương tác. */
    const warm=()=>{try{if(!ctx)build();}catch(e){}};
    setTimeout(warm,0);
  }

  return{
    st,onChange:f=>subs.push(f),play,step,codeAt,matOf,matName,burst,setBiome,stopAll,unlock,setOn,set,syncBtn,prepare(){if(!ctx)build();},
    jet:v=>setLoop('jet',v),slide:v=>setLoop('slide',v),gust:k=>setLoop('gust',k),
    get on(){return st.on;},
    gift:(g,x,z)=>play('gift_'+g,{x,z,v:1}),
    crackle:(x,z)=>{if(gate('ck',70))play('crackle',{x,z,v:.8});},
    ok
  };
})();
