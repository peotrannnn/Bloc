'use strict';
/* [AI/MIRROR] "Mr. Bắt Chước" — cái bóng của đối thủ.
   ----------------------------------------------------------------
   Phản chiếu đối xứng qua tâm bàn (xoay 180°): bạn bước một ô, nó bước ô tương ứng; bạn đặt tường, nó đặt đúng tường đối xứng.
   Hai bên cứ thế đi song song cho tới khi nó thấy đã đến lúc ra tay thật:
     • KẾT LIỄU   có tường làm đối thủ chậm >= `strike` bước (trừ đi phần mình chậm) → đặt luôn, bỏ qua việc bắt chước
     • HOẢNG      đối thủ cách đích <= `panic` bước → thôi chơi gương, đặt tường tốt nhất để cản
     • TỰ BẢO VỆ  tường phản chiếu mà làm mình thiệt hơn đối thủ quá `tol` bước → bỏ qua
     • LÚC KHÔNG BẮT CHƯỚC ĐƯỢC (nước đối xứng không hợp lệ, đối thủ nhảy qua đầu…) → đi ngắn nhất, hoà thì chọn ô gần ô đối xứng
   Mỗi ván bốc một tính cách (CFG.AI.mirror): độ trung thành (xác suất bỏ gương mỗi lượt), ngưỡng kết liễu, ngưỡng hoảng, độ chịu thiệt.
   Luôn đúng: về đích được thì về ngay; đối thủ sắp về đích mà chặn được thì chặn. */
(function(){
  const T=AITools,mem=[null,null];
  const mp=q=>({r:N-1-q.r,c:N-1-q.c});                    /* ô đối xứng */
  const mw=w=>({o:w.o,r:WN-1-w.r,c:WN-1-w.c});            /* tường đối xứng (cả ngang lẫn dọc đều xoay 180° thành chính loại đó) */

  function roll(p){
    const C=CFG.AI.mirror,op=1-p;
    return{loyal:T.between(C.loyal),strike:T.weighted(C.strike),panic:T.weighted(C.panic),tol:T.between(C.tol),
           opPos:{r:op===0?N-1:0,c:HALF},                  /* chỗ đối thủ đứng ở lần nhìn trước (ban đầu = ô xuất phát) */
           known:{h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)}};
  }
  /* Ghi nhớ thế cờ SAU nước mình đi để lượt sau biết đối thủ vừa làm gì */
  function finish(P,p,act){
    const op=1-p;P.opPos={r:S.pl[op].r,c:S.pl[op].c};
    P.known.h.set(S.ws.h);P.known.v.set(S.ws.v);
    if(act.wall)P.known[act.wall.o][act.wall.r*WN+act.wall.c]=1;
    return act;
  }
  function freshWall(P){
    for(const o of['h','v'])for(let i=0;i<WN*WN;i++)if(S.ws[o][i]&&!P.known[o][i])return{o,r:(i/WN)|0,c:i%WN};
    return null;
  }
  /* Đi ngắn nhất; hoà thì sát ô đối xứng (nếu có) */
  function step(p,target){
    const st=T.steps(p),min=Math.min(...st.map(x=>x.d));
    const c=st.filter(x=>x.d===min);
    if(target)c.sort((a,b)=>(Math.abs(a.m[0]-target.r)+Math.abs(a.m[1]-target.c))-(Math.abs(b.m[0]-target.r)+Math.abs(b.m[1]-target.c)));
    return{move:(target?c[0]:pick1(c)).m};
  }

  AIs.register({
    id:'mirror',
    name:'Mr. Bắt Chước',
    desc:'Người không chính kiến',

    decide(p){
      const op=1-p,C=CFG.AI.mirror;
      if(!mem[p]||S.ply<2)mem[p]=roll(p);
      const P=mem[p],o=S.pl[op];

      const win=T.winNow(p);if(win)return finish(P,p,win);
      const stop=T.block(p);if(stop)return finish(P,p,stop);

      const myD=dist(p,S.pl[p]),opD=dist(op,o),fw=freshWall(P),moved=o.r!==P.opPos.r||o.c!==P.opPos.c;
      const tgt=mp(o);

      /* ----- ra tay thật: kết liễu hoặc đang hoảng ----- */
      let ws=null;const wl=()=>ws||(ws=S.left[p]>0?T.walls(p):[]);
      const best=()=>{let b=null,bv=-1e9;for(const w of wl()){const v=w.opGain-1.5*w.myLoss;if(v>bv){bv=v;b=w;}}return b?{w:b,v:bv}:null;};
      if(S.left[p]>0){
        const b=best();
        if(b&&b.v>=P.strike)return finish(P,p,{wall:{o:b.w.o,r:b.w.r,c:b.w.c}});
        if(opD<=P.panic&&b&&b.v>=1)return finish(P,p,{wall:{o:b.w.o,r:b.w.r,c:b.w.c}});
      }

      /* ----- chơi gương ----- */
      if(T.chance(P.loyal)){
        if(fw&&S.left[p]>0){
          const m=mw(fw),w=wl().find(x=>x.o===m.o&&x.r===m.r&&x.c===m.c);
          if(w&&w.opGain-w.myLoss>=-P.tol)return finish(P,p,{wall:m});
        }else if(moved){
          if(moves(p).some(m=>m[0]===tgt.r&&m[1]===tgt.c))return finish(P,p,{move:[tgt.r,tgt.c]});
        }
      }
      return finish(P,p,step(p,tgt));
    }
  });
})();
