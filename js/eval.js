'use strict';
/* [EVAL] Đánh giá thế cờ → xác suất thắng. Thanh khả năng thắng dùng whiteProb(); engine/AI sau này dùng lại score().
   Thuần logic: chỉ đọc S và rules.js, không đụng tới 3D hay DOM. Mọi hằng số nằm ở CFG.EVAL (config.js).

   Hai tầng:
   1. TÌM KIẾM (score): alpha-beta vài nước, có cả nước đặt tường, lá chấm bằng cuộc đua đường đi. Nhờ vậy thấy được
      "về đích trước khi đối phương kịp chặn" → thắng chắc (±WIN), thay vì chỉ nhìn thế cờ đứng yên.
   2. QUY ĐỔI RA XÁC SUẤT (whiteProb): độ chắc chắn của một lợi thế phụ thuộc vào TƯỜNG CÒN LẠI của bên đang thua.
      Hết tường thì dẫn 1 bước đã gần như chắc thắng; còn nhiều tường thì dẫn 4-5 bước vẫn chưa chắc.
      Nên điểm bước đi không đi qua một sigmoid cố định, mà qua "chênh lệch hiệu dụng" (đã cộng trừ giá trị tường hai bên)
      và độ mờ k tăng theo số tường bên thua. */
const Eval=(function(){
  const WIN=100;                                   /* điểm của thế thắng chắc (trừ đi độ sâu để ưu tiên thắng sớm) */
  const PAR=new Int16Array(N*N),SEEN=new Int32Array(N*N),QQ=new Int16Array(N*N);let st=0;
  let nodes=0,budget=0,aborted=false;

  /* Một đường ngắn nhất của người p từ ô quân tới hàng đích, dạng mảng ô; null nếu bị chặn kín */
  function path(p){
    const goal=goalRow(p),s=S.pl[p],s0=s.r*N+s.c;
    if(s.r===goal)return[s0];
    st++;let h=0,t=0;QQ[t++]=s0;SEEN[s0]=st;PAR[s0]=-1;
    while(h<t){
      const k=QQ[h++],r=(k/N)|0,c=k-r*N;
      for(let i=0;i<4;i++){
        const dr=D[i][0],dc=D[i][1];
        if(blk(r,c,dr,dc))continue;
        const r2=r+dr,c2=c+dc;if(!inb(r2,c2))continue;
        const k2=r2*N+c2;if(SEEN[k2]===st)continue;
        SEEN[k2]=st;PAR[k2]=k;QQ[t++]=k2;
        if(r2===goal){const out=[];for(let x=k2;x!==-1;x=PAR[x])out.push(x);return out.reverse();}
      }
    }
    return null;
  }

  /* Tường đáng thử của người p: chỉ những tường nằm trên một đường ngắn nhất của đối thủ (tường nào làm đối thủ đi xa
     hơn thì buộc phải cắt mọi đường ngắn nhất, nên cũng cắt đường này). Xếp theo lợi = (đối thủ chậm thêm) - (mình chậm thêm). */
  function wallCands(p,topK){
    const op=1-p,pa=path(op);if(!pa||pa.length<2)return[];
    const d0=dist(p,S.pl[p]),e0=pa.length-1,seen=new Set(),out=[];
    for(let i=0;i+1<pa.length;i++){
      const a=pa[i],b=pa[i+1],r=(a/N)|0,c=a-r*N,r2=(b/N)|0,c2=b-r2*N;
      const cand=r===r2?[['v',r,Math.min(c,c2)],['v',r-1,Math.min(c,c2)]]:[['h',Math.min(r,r2),c],['h',Math.min(r,r2),c-1]];
      for(const[o,wr,wc]of cand){
        const key=o+wr*16+wc*256;if(seen.has(key))continue;seen.add(key);
        if(!wallFree(o,wr,wc))continue;
        const nd=wallDists(o,wr,wc);if(!nd)continue;
        const dOp=nd[op]-e0;if(dOp<=0)continue;
        out.push({o,r:wr,c:wc,g:dOp-(nd[p]-d0)});
      }
    }
    out.sort((x,y)=>y.g-x.g);
    return out.slice(0,topK);
  }

  /* Điểm ở lá, nhìn từ Trắng, tính bằng "bước đi": chênh đường ngắn nhất + tempo của bên có lượt t.
     (Giá trị tường KHÔNG tính ở đây: nó đã được cây tìm kiếm xử lý và được quy đổi ở whiteProb.) */
  function leaf(t){
    return(dist(1,S.pl[1])-dist(0,S.pl[0]))+(t===0?CFG.EVAL.tempo:-CFG.EVAL.tempo);
  }

  /* Minimax alpha-beta. p = bên đi; trả điểm theo góc nhìn Trắng. */
  function ab(depth,p,alpha,beta,ply){
    if(depth===0)return leaf(p);
    if(++nodes>budget){aborted=true;return leaf(p);}
    const E=CFG.EVAL,white=p===0,goal=goalRow(p),sign=white?1:-1,a=S.pl[p];
    let best=white?-Infinity:Infinity;
    /* 1) nước đi quân (ưu tiên nước làm mình gần đích nhất). Về được đích ngay thì thắng luôn. */
    const mv=moves(p);
    for(const m of mv)if(m[0]===goal)return sign*(WIN-ply);
    const sc=mv.map(m=>({m,d:dist(p,{r:m[0],c:m[1]})}));sc.sort((x,y)=>x.d-y.d);
    for(const x of sc){
      S.pl[p]={r:x.m[0],c:x.m[1]};
      const v=ab(depth-1,1-p,alpha,beta,ply+1);
      S.pl[p]=a;
      if(white){if(v>best)best=v;if(v>alpha)alpha=v;}else{if(v<best)best=v;if(v<beta)beta=v;}
      if(beta<=alpha||aborted)return best;
    }
    /* 2) đặt tường (không thử ở nút sát lá: tường đó chỉ đổi điểm lá thêm một nhịp, không đổi được kết cục) */
    if(S.left[p]>0&&depth>1){
      for(const w of wallCands(p,ply===0?E.topRoot:E.top)){
        setW(w.o,w.r,w.c,1);S.left[p]--;
        const v=ab(depth-1,1-p,alpha,beta,ply+1);
        setW(w.o,w.r,w.c,0);S.left[p]++;
        if(white){if(v>best)best=v;if(v>alpha)alpha=v;}else{if(v<best)best=v;if(v<beta)beta=v;}
        if(beta<=alpha||aborted)return best;
      }
    }
    return best;
  }

  /* Trả kết quả cũ nếu thế cờ không đổi (renderBar được gọi nhiều lần trong một lượt) */
  let lastKey='',lastScore=0;
  const keyOf=()=>S.turn+'|'+S.pl[0].r+','+S.pl[0].c+'|'+S.pl[1].r+','+S.pl[1].c+'|'+S.left[0]+','+S.left[1]+'|'+S.ws.h.join('')+'|'+S.ws.v.join('');

  return{
    WIN,
    wallCands,   /* review.js dùng để liệt kê các tường đáng thử khi tìm "nước tốt nhất" */
    /* Điểm của thế cờ hiện tại, đơn vị "bước đi", góc nhìn Trắng (dương = Trắng dẫn).
       ±(WIN - ply) nghĩa là tìm kiếm thấy bên đó thắng chắc trong ply nước nữa. */
    score(){
      const key=keyOf();if(key===lastKey)return lastScore;
      const E=CFG.EVAL;nodes=0;budget=E.nodes;aborted=false;
      let v=leaf(S.turn);
      /* đào sâu dần: độ sâu nào xong trọn vẹn mới nhận; hết ngân sách thì dùng kết quả của độ sâu trước */
      for(let d=1;d<=E.depth;d++){
        const r=ab(d,S.turn,-Infinity,Infinity,0);
        if(aborted)break;
        v=r;
        if(Math.abs(v)>WIN/2)break;                /* đã thấy thắng chắc thì khỏi sâu thêm */
      }
      lastKey=key;lastScore=v;return v;
    },

    /* Xác suất Trắng thắng (0..1). Xác suất của Đen luôn là 1 trừ số này, nên hai bar cộng lại đúng 100%. */
    whiteProb(){
      if(S.over)return S.draw?.5:(S.turn===0?1:0);   /* ván đã xong: người về đích là người thắng */
      const E=CFG.EVAL,s=this.score();
      if(Math.abs(s)>WIN/2)return s>0?E.max:1-E.max; /* tìm kiếm thấy thắng chắc */
      const L=clamp(s,-12,12),white=L>=0;
      const wl=S.left[white?0:1],wt=S.left[white?1:0];        /* tường còn lại của bên dẫn / bên thua */
      const val=w=>E.wallA*w+E.wallB*w*w;
      const eff=Math.abs(L)+val(wl)-val(wt);                  /* lợi thế hiệu dụng của bên dẫn, sau khi tính tường hai bên */
      const k=wt===0?E.kZero:E.k0+E.kWall*wt;                 /* bên thua còn nhiều tường thì khó nói chắc */
      const pl=1/(1+Math.exp(-eff/k));                        /* xác suất bên dẫn thắng */
      return clamp(white?pl:1-pl,1-E.max,E.max);
    }
  };
})();
