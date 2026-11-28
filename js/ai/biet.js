'use strict';
/* [AI/BIET] "Mr. Biết" — boss: tìm kiếm sâu + đọc đối thủ + chọn nước mềm để khó đoán.
   ----------------------------------------------------------------
   Không có "chế độ" cứng. Tấn công hay phòng thủ đều do một cây tìm kiếm quyết định, nên tự thích nghi mọi chiến thuật:
   1. TÌM KIẾM  negamax alpha-beta + đào sâu dần + bảng băm (Zobrist). Mỗi nút thử các nước đi quân và những tường cắt
      đường ngắn nhất của đối thủ (xếp theo lợi). Có kéo dài khi đối thủ sắp về đích. Giới hạn bằng số nút và thời gian.
   2. CHẤM LÁ   (đường đối thủ - đường mình) + giá trị tường dư hai bên. Tường dư là "đạn": mình còn nhiều thì dám dẫn
      sát, đối thủ còn nhiều thì không dám chủ quan. Giá trị này chính là cần gạt công/thủ.
   3. ĐỌC ĐỐI THỦ  đo xem mỗi tường đối thủ đã đặt làm mình chậm thêm bao nhiêu bước (trung bình trượt). Đối thủ đặt tường
      dở thì tường dư của họ bị coi rẻ (mình dám chạy), đặt tường hiểm thì coi đắt (mình giữ tường, đi cẩn thận).
   4. KHÓ ĐOÁN  mỗi ván lệch nhẹ giá trị tường; ở gốc chọn mềm (softmax) giữa các nước chỉ kém nước tốt nhất < margin bước,
      lúc mở màn margin rộng hơn. Có đường thắng chắc thì bỏ ngẫu nhiên, đi nước thắng nhanh nhất.
   5. CHỐNG BÍ   thế cờ đã lặp lại thì bị phạt (rep) nên không đi qua đi lại, tự phá thế hòa.
   Kết quả đấu thử (tools/tournament.js, cả hai phe): thắng 95-100% mọi AI trong js/ai/, ~92% một bot ngoài dùng Eval.score.
   Luôn đúng: về đích được thì về. Chỉnh: CFG.AI.biet trong config.js (thử nhanh: node tools/tournament.js biet attacker --set AI.biet.nodes=8000). */
(function(){
  const T=AITools,WIN=1000,INF=1e9,NN=N*N,mem=[null,null];

  /* ----- bảng băm Zobrist (hai số 32 bit) ----- */
  let sd=0x2545F491;
  const rnd32=()=>{sd^=sd<<13;sd^=sd>>>17;sd^=sd<<5;return sd|0;};
  const mk=n=>{const a=new Int32Array(n),b=new Int32Array(n);for(let i=0;i<n;i++){a[i]=rnd32();b[i]=rnd32();}return[a,b];};
  const WW=WN*WN,L1=CFG.WALLS+1;
  const[ZPa,ZPb]=mk(2*NN),[ZWa,ZWb]=mk(2*WW),[ZLa,ZLb]=mk(2*L1),[ZTa,ZTb]=mk(2);
  let ha=0,hb=0;
  const TTN=1<<17,TTM=TTN-1,ttK=new Int32Array(TTN),ttV=new Float32Array(TTN),ttD=new Int8Array(TTN),ttF=new Int8Array(TTN),ttM=new Int16Array(TTN);
  const flip=()=>{ha^=ZTa[0]^ZTa[1];hb^=ZTb[0]^ZTb[1];};
  function hashAll(p){
    ha=hb=0;
    for(let q=0;q<2;q++){const s=S.pl[q],i=q*NN+s.r*N+s.c,l=q*L1+S.left[q];ha^=ZPa[i]^ZLa[l];hb^=ZPb[i]^ZLb[l];}
    for(let k=0;k<WW;k++){if(S.ws.h[k]){ha^=ZWa[k];hb^=ZWb[k];}if(S.ws.v[k]){ha^=ZWa[WW+k];hb^=ZWb[WW+k];}}
    ha^=ZTa[p];hb^=ZTb[p];
  }

  /* ----- bàn cờ dạng mảng phẳng cho BFS nhanh: E[ô*4+hướng]=1 nếu bị tường chặn. Hướng: 0 lên, 1 xuống, 2 trái, 3 phải ----- */
  const E=new Uint8Array(NN*4),NB=new Int16Array(NN*4).fill(-1);
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){const k=r*N+c;if(r>0)NB[k*4]=k-N;if(r<N-1)NB[k*4+1]=k+N;if(c>0)NB[k*4+2]=k-1;if(c<N-1)NB[k*4+3]=k+1;}
  let BL=-1;   /* ô có người chặn đường (S.blocker, -1 = không): bịt kín cả 4 cạnh để không BFS/nước đi nào vào được (xem blockEdges) */
  function blockEdges(){const b=BL;for(let i=0;i<4;i++){E[b*4+i]=1;const n=NB[b*4+i];if(n>=0)E[n*4+(i^1)]=1;}}   /* i^1: hướng ngược (0 lên↔1 xuống, 2 trái↔3 phải) */
  function edges(o,r,c,v){
    const a=r*N+c;
    if(o==='h'){E[a*4+1]=E[(a+1)*4+1]=E[(a+N)*4]=E[(a+N+1)*4]=v;}          /* tường ngang chặn đi xuống từ 2 ô trên, đi lên từ 2 ô dưới */
    else{E[a*4+3]=E[(a+N)*4+3]=E[(a+1)*4+2]=E[(a+N+1)*4+2]=v;}              /* tường dọc chặn đi phải từ 2 ô trái, đi trái từ 2 ô phải */
    if(v===0&&BL>=0)blockEdges();   /* gỡ tường thử có thể xóa cạnh đang bị người chặn bịt: bịt lại */
  }
  function syncEdges(){E.fill(0);for(let r=0;r<WN;r++)for(let c=0;c<WN;c++){if(W('h',r,c))edges('h',r,c,1);if(W('v',r,c))edges('v',r,c,1);}if(BL>=0)blockEdges();}
  /* Bản đồ "còn bao nhiêu bước tới đích" cho người q: BFS ngược từ cả hàng đích (99 = không tới được) */
  const F=[new Int8Array(NN),new Int8Array(NN)],BQ=new Int16Array(NN);
  const FS=new Int8Array(NN);   /* bản đồ tạm để chấm tường thử, không đè lên F */
  function field(q,tmp){
    const f=tmp||F[q];f.fill(99);let h=0,t=0;const g=q===0?0:N-1;
    for(let c=0;c<N;c++){const k=g*N+c;f[k]=0;BQ[t++]=k;}
    while(h<t){const k=BQ[h++],d=f[k]+1;
      for(let i=0;i<4;i++){const n=NB[k*4+i];if(n>=0&&!E[k*4+i]&&f[n]===99){f[n]=d;BQ[t++]=n;}}}
    return f;
  }
  const pos=q=>S.pl[q].r*N+S.pl[q].c;

  /* ----- trạng thái tìm kiếm (module-level để khỏi cấp phát) ----- */
  let nodes=0,maxNodes=0,deadline=0,aborted=false,rootDepth=0,TOPR=12,TOP=6,TOP2=4,TEMPO=.5;
  const BIG=3*WIN,MAXM=40;
  const VT=[new Float64Array(L1),new Float64Array(L1)];   /* VT[bên][w] = giá trị w tường dư (bước đi), lõm: tường thứ k đáng A*R^(k-1) */
  const leaf=(p,dm,dop)=>(dop-dm)+VT[p][S.left[p]]-VT[1-p][S.left[1-p]]+TEMPO;
  function setVal(side,a,R){let t=0,m=a;for(let w=0;w<=CFG.WALLS;w++){VT[side][w]=t;t+=m;m*=R;}}
  const KB=[],SB=[];for(let i=0;i<40;i++){KB.push(new Int16Array(MAXM));SB.push(new Float32Array(MAXM));}   /* bộ đệm nước đi theo tầng */

  /* Mã nước đi: đi quân = r*N+c (0..80); tường = 100 + (h?0:64) + r*8 + c */
  const wcode=(o,r,c)=>100+(o==='h'?0:WW)+r*WN+c;
  const wdec=k=>{k-=100;const o=k<WW?'h':'v';if(o==='v')k-=WW;return{o,r:(k/WN)|0,c:k%WN};};

  /* Làm / hoàn tác một nước (sửa S và E tại chỗ, luôn hoàn tác trước khi thoát) */
  function make(p,code){
    if(code<100){
      const s=S.pl[p],old=s.r*N+s.c;
      ha^=ZPa[p*NN+old]^ZPa[p*NN+code];hb^=ZPb[p*NN+old]^ZPb[p*NN+code];
      s.r=(code/N)|0;s.c=code%N;return old;
    }
    const w=wdec(code),i=(w.o==='h'?0:WW)+w.r*WN+w.c,l=p*L1+S.left[p];
    setW(w.o,w.r,w.c,1);edges(w.o,w.r,w.c,1);S.left[p]--;
    ha^=ZWa[i]^ZLa[l]^ZLa[l-1];hb^=ZWb[i]^ZLb[l]^ZLb[l-1];return 0;
  }
  function unmake(p,code,old){
    if(code<100){
      const s=S.pl[p],cur=s.r*N+s.c;
      ha^=ZPa[p*NN+cur]^ZPa[p*NN+old];hb^=ZPb[p*NN+cur]^ZPb[p*NN+old];
      s.r=(old/N)|0;s.c=old%N;return;
    }
    const w=wdec(code),i=(w.o==='h'?0:WW)+w.r*WN+w.c,l=p*L1+S.left[p];
    setW(w.o,w.r,w.c,0);edges(w.o,w.r,w.c,0);S.left[p]++;
    ha^=ZWa[i]^ZLa[l]^ZLa[l+1];hb^=ZWb[i]^ZLb[l]^ZLb[l+1];
  }

  /* Nước đi quân của p vào mảng k (kể cả nhảy qua đối thủ), trả về số nước. Cùng luật với rules.moves. */
  function pawnMoves(p,k){
    const a=pos(p),o=pos(1-p);let n=0;
    for(let d=0;d<4;d++){
      if(E[a*4+d])continue;const b=NB[a*4+d];if(b<0)continue;
      if(b!==o){k[n++]=b;continue;}
      const b2=NB[b*4+d];
      if(b2>=0&&!E[b*4+d])k[n++]=b2;
      else for(let e=0;e<4;e++){if(((e^d)>>1)===0)continue;const x=NB[b*4+e];if(x>=0&&!E[b*4+e])k[n++]=x;}   /* hướng vuông góc: 0,1 là dọc, 2,3 là ngang */
    }
    return n;
  }

  /* Các nước của p ở tầng ply, xếp theo độ hứa hẹn: đi quân (tiến lên tốt nhất) + tường cắt đường ngắn nhất của đối thủ
     (lợi lớn nhất). Ghi vào KB/SB[ply], trả về số nước. fm/fo = bản đồ bước của mình/đối thủ (đã tính sẵn). */
  function gen(p,ply,topK,ttMove,fm,fo){
    const op=1-p,kb=KB[ply],sb=SB[ply],a=pos(p),pa=pos(op);let n=pawnMoves(p,kb);
    const d0=fm[a];
    for(let i=0;i<n;i++){const k=kb[i];sb[i]=(d0-fm[k])*1.2+(((k/N)|0)===goalRow(p)?50:0);}
    if(S.left[p]>0&&fo[pa]>0&&fo[pa]<99){
      const e0=fo[pa],tk=[],ts=[];let x=pa;
      while(fo[x]>0){                                    /* đi theo một đường ngắn nhất của đối thủ, mỗi bước thử 2 tường cắt được */
        let y=-1,dir=0;
        for(let d=0;d<4;d++){const z=NB[x*4+d];if(z>=0&&!E[x*4+d]&&fo[z]===fo[x]-1){y=z;dir=d;break;}}
        const r=(x/N)|0,c=x%N;
        const c1=dir<2?[wcode('h',dir===1?r:r-1,c),wcode('h',dir===1?r:r-1,c-1)]:[wcode('v',r,dir===3?c:c-1),wcode('v',r-1,dir===3?c:c-1)];
        for(const key of c1){
          if(tk.indexOf(key)>=0)continue;const w=wdec(key);if(!wallFree(w.o,w.r,w.c))continue;
          edges(w.o,w.r,w.c,1);const g=field(op,FS)[pa]-e0;edges(w.o,w.r,w.c,0);
          if(g>0&&g<50){tk.push(key);ts.push(g*1.3-.4+T.links(w.o,w.r,w.c)*.15);}
        }
        x=y;
      }
      const idx=ts.map((_,i)=>i).sort((u,v)=>ts[v]-ts[u]);
      for(let i=0;i<idx.length&&i<topK&&n<MAXM;i++){kb[n]=tk[idx[i]];sb[n]=ts[idx[i]];n++;}
    }
    if(ttMove>=0)for(let i=0;i<n;i++)if(kb[i]===ttMove)sb[i]+=100;
    for(let i=1;i<n;i++){const k=kb[i],v=sb[i];let j=i-1;while(j>=0&&sb[j]<v){kb[j+1]=kb[j];sb[j+1]=sb[j];j--;}kb[j+1]=k;sb[j+1]=v;}
    return n;
  }

  /* Negamax alpha-beta. Điểm theo góc nhìn người đi p. Trả BIG nếu thế cờ phạm luật (một bên bị nhốt kín). */
  function nm(d,p,alpha,beta,ply){
    if(aborted)return 0;
    if((++nodes&127)===0&&(nodes>maxNodes||Date.now()>deadline)){aborted=true;return 0;}
    const op=1-p,fm=field(p),fo=field(op),dm=fm[pos(p)],dop=fo[pos(op)];
    if(dm>=99||dop>=99)return BIG;
    const mvb=KB[ply];
    {const n=pawnMoves(p,mvb),g=goalRow(p);for(let i=0;i<n;i++)if(((mvb[i]/N)|0)===g)return WIN-ply;}
    if(d<=0){
      /* kéo dài: đối thủ sắp về đích mà mình còn tường thì phải nhìn tiếp xem có chặn nổi không */
      if(dop<=1&&S.left[p]>0&&ply<rootDepth+3)d=1;else return leaf(p,dm,dop);
    }
    const i0=ha&TTM;let ttMove=-1;
    if(ttK[i0]===hb){
      ttMove=ttM[i0];
      if(ttD[i0]>=d){
        const v=ttV[i0],f=ttF[i0];
        if(f===0||(f===1&&v>=beta)||(f===2&&v<=alpha))return v;
      }
    }
    const n=gen(p,ply,d>=3?TOP:TOP2,ttMove,fm,fo),kb=KB[ply],a0=alpha;
    let best=-INF,bm=-1;
    for(let i=0;i<n;i++){
      const k=kb[i],old=make(p,k);flip();
      const v=-nm(d-1,op,-beta,-alpha,ply+1);
      flip();unmake(p,k,old);
      if(aborted)return 0;
      if(v<=-BIG/2)continue;                                  /* nước phạm luật */
      if(v>best){best=v;bm=k;}
      if(v>alpha)alpha=v;
      if(alpha>=beta)break;
    }
    if(best===-INF)return leaf(p,dm,dop);
    ttK[i0]=hb;ttV[i0]=best;ttD[i0]=d;ttM[i0]=bm;ttF[i0]=best<=a0?2:best>=beta?1:0;
    return best;
  }

  /* Tìm ở gốc tới độ sâu d. Các nước điểm trong khoảng margin của nước tốt nhất được chấm chính xác (để chọn mềm). */
  function rootSearch(p,d,roots,margin,seen,rep){
    const op=1-p,res=[];let best=-INF;
    for(const k of roots){
      const old=make(p,k);flip();
      const key=ha+':'+hb,lo=best-margin;
      let v=-nm(d-1,op,-INF,-lo,1);
      flip();unmake(p,k,old);
      if(aborted)return null;
      if(v<=-BIG/2)continue;
      if(Math.abs(v)<WIN/2)v-=rep*(seen.get(key)||0);      /* lặp lại thế cờ đã qua thì bị phạt: tránh đi qua đi lại, ép phá thế bí */
      res.push({k,v:v<=lo?-INF:v,hi:v});
      if(v>best)best=v;
    }
    res.sort((x,y)=>y.hi-x.hi);
    return{res,best};
  }

  /* ----- đọc đối thủ ----- */
  function observe(p,M){
    const op=1-p;
    if(S.left[op]<M.opLeft&&M.myDist>=0){                       /* đối thủ vừa đặt một tường: nó làm mình chậm bao nhiêu? */
      const g=dist(p,S.pl[p])-M.myDist;
      M.sumEff+=clamp(g,0,6);M.nEff++;
    }
  }
  const effOp=M=>(M.prior*M.K+M.sumEff)/(M.K+M.nEff);

  function fresh(){
    const C=CFG.AI.biet,j=C.jitter;
    return{a:C.wallA*rand(1-j,1+j),tempo:C.tempo+rand(-.1,.1),prior:C.effPrior,K:C.effK,sumEff:0,nEff:0,opLeft:CFG.WALLS,myDist:-1,seen:new Map()};
  }

  AIs.register({
    id:'biet',
    worker:true,                             /* App chạy AI này ở Web Worker (js/ai/worker.js) để không làm đứng trang; lỗi worker thì tự gọi decide() ở luồng chính */
    name:'Mr. Biết',
    dbg:{pawnMoves,field,syncEdges,pos,F},   /* chỉ để tools/ kiểm thử đối chiếu với rules.js */
    desc:'Mít stơ Biết (ăn chốt cô lát)',

    decide(p){
      const C=CFG.AI.biet,op=1-p;
      if(!mem[p]||S.ply<2)mem[p]=fresh();
      const M=mem[p];observe(p,M);
      const win=T.winNow(p);if(win){win.why='win';return win;}

      /* thông số của lần suy nghĩ này */
      TEMPO=M.tempo;setVal(p,M.a,C.wallR);
      setVal(op,M.a*clamp(effOp(M)/C.effPrior,C.effLo,C.effHi),C.wallR);
      TOPR=C.topRoot;TOP=C.top;TOP2=C.top2;
      BL=S.blocker>=0?S.blocker:-1;   /* worker chép S.blocker từ luồng chính (xem ai/worker.js) */
      syncEdges();ttK.fill(0);hashAll(p);
      nodes=0;maxNodes=C.nodes;aborted=false;
      /* Trên luồng chính của trình duyệt (worker không dùng được) thì nghĩ ngắn hơn để đỡ giật; ở worker/Node dùng đủ C.ms */
      deadline=Date.now()+(typeof window!=='undefined'&&C.msMain?C.msMain:C.ms);

      const margin=C.margin*(S.ply<C.openPly?C.openBoost:1);
      const fm=field(p),fo=field(op),rn=gen(p,0,TOPR,-1,fm,fo),roots=Array.from(KB[0].subarray(0,rn));
      let last=null;
      const sv={pl:S.pl.map(x=>({r:x.r,c:x.c})),left:S.left.slice(),h:S.ws.h.slice(),v:S.ws.v.slice()};
      try{
        for(let d=1;d<=C.depth;d++){
          rootDepth=d;
          const r=rootSearch(p,d,last?last.res.map(x=>x.k):roots,margin,M.seen,C.rep);
          if(!r)break;
          last=r;
          if(Math.abs(r.best)>WIN/2)break;        /* đã thấy thắng/thua chắc */
        }
      }catch(e){last=null;}                       /* lỗi bất ngờ: bỏ kết quả, đi nước ngắn nhất */
      finally{                                    /* luôn trả thế cờ về như cũ dù tìm kiếm bị ngắt giữa chừng */
        for(let i=0;i<2;i++){S.pl[i].r=sv.pl[i].r;S.pl[i].c=sv.pl[i].c;S.left[i]=sv.left[i];}
        S.ws.h.set(sv.h);S.ws.v.set(sv.v);syncEdges();hashAll(p);
      }
      let act,why='search';
      if(!last){const m=T.steps(p).sort((x,y)=>x.d-y.d)[0].m;act={move:m};why='fallback';}
      else{
        const sure=Math.abs(last.best)>WIN/2,cand=last.res.filter(x=>x.v>-INF&&x.v>=last.best-(sure?0:margin));
        const pick=sure?cand[0]:T.softPick(cand,x=>x.v,C.temp);
        act=pick.k<100?{move:[(pick.k/N)|0,pick.k%N]}:{wall:wdec(pick.k)};
        if(sure)why=last.best>0?'win':'lost';
      }
      act.why=why;

      /* ghi nhớ để lần sau đo hiệu quả tường của đối thủ */
      const s=S.pl[p];let md;
      if(act.wall){setW(act.wall.o,act.wall.r,act.wall.c,1);md=dist(p,s);setW(act.wall.o,act.wall.r,act.wall.c,0);}
      else{const r0=s.r,c0=s.c;s.r=act.move[0];s.c=act.move[1];md=dist(p,s);s.r=r0;s.c=c0;}
      M.myDist=md;M.opLeft=S.left[op];
      const k2=make(p,act.wall?wcode(act.wall.o,act.wall.r,act.wall.c):act.move[0]*N+act.move[1]);flip();   /* ghi thế cờ sau nước vừa chọn */
      const key=ha+':'+hb;M.seen.set(key,(M.seen.get(key)||0)+1);flip();unmake(p,act.wall?wcode(act.wall.o,act.wall.r,act.wall.c):act.move[0]*N+act.move[1],k2);
      return act;
    }
  });
})();
