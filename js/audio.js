'use strict';
/* [AUDIO] Nhạc nền, THUẦN ÂM THANH (không đụng trạng thái ván, không cần đồng bộ online). Tiếng môi trường/hiệu ứng nằm ở module sfx riêng, file này CHỈ phát nhạc.
   Nhạc KHÔNG phát liên tục: một bài (cắt ở ~70-130 giây) mờ vào → mờ ra → im lặng 80-180 giây → bài khác ...  Giữa hai bài luôn có khoảng im nên tai được nghỉ và tiếng sfx nghe rõ.
   Chọn bài kiểu "túi xáo": phát hết danh sách mới xáo lại, và không bao giờ bốc lại bài vừa phát → không trùng hai bài liên tiếp.
   ĐỂ KHÔNG LAG (mọi thứ nặng đều ở ngoài luồng chính / ngoài lúc đang cần mượt):
   - Stream bằng <audio> (trình duyệt giải mã ở luồng riêng, không nạp cả bài vào RAM như decodeAudioData ~30MB/bài). Chỉ MỘT deck: nạp bài kế trong lúc im lặng nên không cần deck thứ hai.
   - Không đụng mạng trong lúc tải bản đồ / biên dịch shader: start() gọi sau khi dựng xong ván và còn chờ firstDelay; mỗi lần gán src còn chờ requestIdleCallback.
   - Bài kế nạp trước ~10 giây khi đang im lặng (không tranh băng thông với lúc đang phát). Bật "Tiết kiệm dữ liệu" hoặc mạng 2G thì không tải nhạc.
   - Fade bằng đường cong WebAudio chạy trên luồng âm thanh (mượt kể cả khi game giật khung hình); KHÔNG dùng audio.volume vì iOS Safari bỏ qua nó.
   - AudioContext latencyHint 'playback' (buffer lớn, ít CPU, hợp nhạc nền) và ctx.suspend() suốt khoảng im lặng; hết bài thì gỡ src khỏi <audio> để giải phóng bộ đệm/bộ giải mã.
   Âm lượng lấy từ Sfx (js/sfx.js): thanh Âm lượng × thanh Nhạc nền, phím M tắt/bật. Về 0 (hoặc tắt tiếng) thì dừng hẳn, không tải gì; bật lại thì chạy lại.
   Tích hợp: xem 3 chỗ gắn ở cuối file. */
const BgAudio=(function(){
  const CONF={
    on:true,                    /* false: tắt hẳn module */
    dir:'audio/',               /* thư mục chứa file (cùng origin với trang; để CDN khác thì CDN phải bật CORS rồi gắn el.crossOrigin='anonymous') */
    music:['music/01.mp3','music/02.mp3','music/03.mp3','music/04.mp3','music/05.mp3','music/06.mp3','music/07.mp3'],   /* tên file trong audio/music/; thêm bao nhiêu cũng được */
    trim:.7,                    /* độ lớn riêng của nhạc trước thanh Âm lượng của người chơi (0..1): hạ xuống nếu nhạc to hơn sfx */
    play:[70,130],              /* giây "trên không" mỗi bài (bài dài hơn thì cắt + fade; ngắn hơn thì theo độ dài bài) */
    fadeIn:[4,6],fadeOut:[5,8], /* giây mờ vào / mờ ra */
    silence:[80,180],           /* giây im lặng giữa hai bài (tính sau khi mờ hết) */
    firstDelay:[50,80],          /* giây chờ sau khi vào ván trước khi tải bài đầu tiên (cho game dựng xong, đỡ giật) */
    preload:10,                 /* nạp bài kế trước khi phát bao nhiêu giây (chỉ nạp lúc đang im lặng) */
    debug:false                 /* true: in lịch phát ra console */
  };
  const R=a=>rand(a[0],a[1]);
  const N=48,UP=new Float32Array(N),DN=new Float32Array(N);   /* đường cong mờ vào = sin, mờ ra = 1-cos (nghe đều hơn tuyến tính) */
  for(let i=0;i<N;i++){const t=i/(N-1);UP[i]=Math.sin(t*Math.PI/2);DN[i]=1-Math.cos(t*Math.PI/2);}

  let ctx=null,master=null,deck=null,want=false,live=false,blocked=false,gen=0,timers=[],pre=null,bag=[],lastPlayed=null;
  const SILENT='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';   /* wav rỗng: phát trong lần chạm đầu để iOS "mở khoá" thẻ <audio> */
  const bad=new Set();
  const log=(...a)=>{if(CONF.debug)console.log('[audio]',...a);};
  const vol=()=>typeof Sfx!=='undefined'?(Sfx.on?Sfx.st.master*Sfx.st.music:0):1;   /* dùng chung cài đặt với Sfx: thanh Âm lượng × Nhạc nền, phím M tắt cả hai */
  const later=(s,fn)=>{const g=gen;timers.push(setTimeout(()=>{if(g===gen)fn();},Math.max(0,s*1000)));};   /* mọi hẹn giờ tự huỷ khi gen đổi */
  const clearT=()=>{timers.forEach(clearTimeout);timers=[];};
  const idle=fn=>window.requestIdleCallback?requestIdleCallback(fn,{timeout:2500}):setTimeout(fn,50);
  function thrifty(){   /* Tiết kiệm dữ liệu / mạng quá chậm: không tải nhạc */
    const c=navigator.connection;return !!c&&(c.saveData||/^(slow-)?2g$/.test(c.effectiveType||''));
  }

  /* ---------- Deck + fade ---------- */
  function mkDeck(){
    const el=new Audio(),g=ctx.createGain(),d={el,g,f:{t0:0,d:0,a:0,b:0},tok:0};
    el.preload='auto';g.gain.value=0;
    ctx.createMediaElementSource(el).connect(g);g.connect(master);
    el.onended=el.onerror=()=>{if(live&&d.playing){log('bài dừng sớm → nghỉ');d.playing=false;clearT();gen++;rest();}};   /* hết bài sớm / mạng đứt: không để treo giữa chừng */
    return d;
  }
  function level(d){   /* mức gain HIỆN TẠI (fade bị ngắt giữa chừng vẫn nối liền mạch) */
    const f=d.f;if(!f.d)return f.b;
    const t=clamp((ctx.currentTime-f.t0)/f.d,0,1);
    return f.a+(f.b-f.a)*(f.b>f.a?Math.sin(t*Math.PI/2):1-Math.cos(t*Math.PI/2));
  }
  function fade(d,to,s){
    const now=ctx.currentTime,from=level(d),p=d.g.gain;
    p.cancelScheduledValues(now);
    if(s<.05||from===to){p.setValueAtTime(to,now);d.f={t0:now,d:0,a:to,b:to};return;}
    const arr=new Float32Array(N),c=to>from?UP:DN;
    for(let i=0;i<N;i++)arr[i]=from+(to-from)*c[i];
    p.setValueAtTime(from,now);p.setValueCurveAtTime(arr,now,s);
    d.f={t0:now,d:s,a:from,b:to};
  }
  function free(d){   /* dừng hẳn: ngừng tải + ngừng giải mã + giải phóng bộ đệm */
    d.playing=false;d.el.pause();d.el.removeAttribute('src');try{d.el.load();}catch(e){}
  }
  function suspend(){if(ctx&&ctx.state==='running'&&!live)ctx.suspend().catch(()=>{});}   /* im lặng thì tắt luôn luồng âm thanh */

  /* ---------- Chọn bài ---------- */
  const shuffled=l=>{const b=l.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;};
  function pick(){
    const list=CONF.music.filter(u=>!bad.has(u));if(!list.length)return null;
    if(!bag.length||bag.some(u=>!list.includes(u)))bag=shuffled(list);   /* túi rỗng, hoặc danh sách đổi (có file lỗi) → xáo lại */
    let t=bag.pop();
    if(t===lastPlayed&&list.length>1){   /* trúng đúng bài vừa phát (ranh giới túi, hoặc bài nạp trước bị huỷ) → trả về túi, bốc bài khác */
      const rest=bag.length?bag:shuffled(list.filter(u=>u!==t));
      bag=rest;rest.unshift(t);t=rest.pop();
    }
    return t;   /* lastPlayed chỉ ghi khi bài THỰC SỰ phát (xem play) */
  }

  /* ---------- Nạp bài vào deck (chưa phát): chờ rảnh rồi lấy metadata ---------- */
  function load(){
    const url=pick();
    if(!url)return Promise.resolve(null);
    return new Promise(res=>idle(()=>{
      const d=deck,my=++d.tok,el=d.el;let done=false;
      const fin=(ok,dead)=>{
        if(done)return;done=true;clearTimeout(to);
        if(d.tok!==my)return res(null);
        el.onloadedmetadata=null;el.removeEventListener('error',onerr);
        if(!ok){if(dead)bad.add(url);log('lỗi nạp',url);return res(null);}
        res({url,dur:isFinite(el.duration)?el.duration:0,my});
      };
      const onerr=()=>fin(false,true),to=setTimeout(()=>fin(false,false),10000);
      el.onloadedmetadata=()=>fin(true);el.addEventListener('error',onerr);
      el.src=CONF.dir+url;
    }));
  }

  /* ---------- Chu kỳ: phát một bài → im lặng → ... ---------- */
  async function play(){
    const g=gen,d=deck;
    if(ctx.state!=='running'){   /* bật lại luồng âm thanh; Safari/iOS có thể từ chối nếu không nằm trong cử chỉ → chờ lần bấm kế tiếp (gesture) rồi thử lại */
      await ctx.resume().catch(()=>{});if(g!==gen)return;
      if(ctx.state!=='running'){blocked=true;log('chờ cử chỉ để bật tiếng');return later(3,play);}
    }
    let p=pre?await pre:await load();pre=null;
    if(g!==gen)return;
    if(!p||d.tok!==p.my)return rest();   /* không nạp được: im lặng một lúc rồi thử lại (file lỗi đã bị loại) */
    const L=Math.max(10,Math.min(R(CONF.play),(p.dur||1e9)-2)),fi=R(CONF.fadeIn),fo=Math.min(R(CONF.fadeOut),L/3);
    lastPlayed=p.url;d.playing=true;
    d.el.play().catch(e=>log('play bị chặn',e&&e.name));
    fade(d,CONF.trim,fi);
    log('phát',p.url,L.toFixed(0)+'s','vào',fi.toFixed(1)+'s','ra',fo.toFixed(1)+'s');
    later(L-fo,()=>{fade(d,0,fo);later(fo+.3,()=>{d.playing=false;rest();});});
  }
  function rest(){   /* im lặng: gỡ bài, tắt luồng âm thanh, rồi nạp trước bài kế */
    const d=deck,W=R(CONF.silence);
    free(d);fade(d,0,0);
    later(.5,suspend);
    log('im lặng',W.toFixed(0)+'s');
    later(W-CONF.preload,()=>{pre=load();});
    later(W,play);
  }

  /* ---------- Điều khiển ---------- */
  function sync(){   /* chạy khi đủ điều kiện: muốn phát + có AudioContext (sau cử chỉ đầu tiên) + còn âm lượng */
    if(!want||live||!CONF.on||!ctx||vol()<=.001||thrifty())return;
    live=true;gen++;pre=null;clearT();
    master.gain.value=vol();
    later(R(CONF.firstDelay),play);
  }
  function stop(s){
    want=false;live=false;gen++;clearT();pre=null;
    if(!deck)return;
    const d=deck,t=++d.tok;
    fade(d,0,s==null?2.5:s);
    setTimeout(()=>{if(d.tok===t&&!live){free(d);suspend();}},(s==null?2.5:s)*1000+200);
  }
  function applyVol(){   /* Settings đổi: chỉnh ngay, kéo về 0 / tắt tiếng thì dừng hẳn để khỏi tải */
    const v=vol();
    if(ctx&&master)master.gain.setTargetAtTime(v,ctx.currentTime,.06);
    if(v<=.001){if(live){const w=want;stop(.3);want=w;}}
    else sync();
  }
  function gesture(){   /* Audio graph được chuẩn bị lúc trang rảnh; cử chỉ đầu tiên chỉ resume, không dựng buffer/deck nặng. */
    if(ctx){if(ctx.state!=='running'){blocked=false;ctx.resume().then(sync).catch(()=>{});}return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    try{ctx=new AC({latencyHint:'playback'});}catch(e){ctx=new AC();}
    master=ctx.createGain();master.gain.value=vol();master.connect(ctx.destination);
    deck=mkDeck();
    try{deck.el.src=SILENT;deck.el.play().catch(()=>{});}catch(e){}   /* mồi thẻ <audio> ngay trong cử chỉ (iOS) */
    ctx.suspend().catch(()=>{});   /* chưa có tiếng thì không chạy luồng âm thanh; play() sẽ resume */
    sync();
  }
  /* Chuẩn bị context/deck trước tương tác. Audio vẫn bị suspend theo chính sách autoplay của trình duyệt. */
  function prepare(){if(ctx)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;try{ctx=new AC({latencyHint:'playback'});master=ctx.createGain();master.gain.value=vol();master.connect(ctx.destination);deck=mkDeck();ctx.suspend().catch(()=>{});}catch(e){ctx=null;master=null;deck=null;}}
  for(const e of['pointerdown','keydown','touchend'])addEventListener(e,gesture,{passive:true});
  document.addEventListener('visibilitychange',()=>{   /* ẩn tab: mờ nhanh rồi dừng hẳn (đỡ pin + băng thông); quay lại thì bắt đầu chu kỳ mới */
    if(document.hidden){if(live){stop(.6);want=true;}}else sync();
  });
  if(typeof Sfx!=='undefined'&&Sfx.onChange)Sfx.onChange(applyVol);

  if(typeof window!=='undefined'){const warm=()=>prepare();setTimeout(warm,0);}

  return{
    CONF,
    prepare,
    start(){want=true;sync();},   /* gọi mỗi lần vào ván; đang chạy thì không làm gì */
    stop,                         /* mờ ra rồi dừng (mặc định 2.5 giây) */
    get state(){return{live,want,volume:vol(),ctx:ctx&&ctx.state};}
  };
})();

/* ===== 3 CHỖ GẮN (xem audio-hooks.patch) =====
   1) index.html: nạp js/audio.js sau js/ui.js (cần util.js và sfx.js trước)
   2) js/app.js, cuối App.newGameFinish():  BgAudio.start();
   3) js/app.js, trong App.toMenu(true):    BgAudio.stop();       */
