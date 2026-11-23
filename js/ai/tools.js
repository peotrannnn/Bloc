'use strict';
/* [AI/TOOLS] Đồ nghề dùng chung cho các AI "có tính cách" (attacker, defender, và AI sau này).
   Chỉ đọc S + rules.js, không sửa S (đặt tường thử xong luôn gỡ ra). Không đụng 3D/DOM.
   Quy ước: p = bên đang suy nghĩ, op = 1-p. "net" của tường = (đối thủ chậm thêm) - (mình chậm thêm). */
const AITools=(function(){
  const PAR=new Int16Array(N*N),SEEN=new Int32Array(N*N),QQ=new Int16Array(N*N);let st=0;

  /* ----- ngẫu nhiên ----- */
  const chance=p=>Math.random()<p;
  const between=r=>rand(r[0],r[1]);                         /* số thực trong [a,b] */
  const intBetween=r=>Math.floor(rand(r[0],r[1]+1));        /* số nguyên trong [a,b] */
  function weighted(pairs){                                 /* [[giá trị, trọng số],...] → một giá trị */
    let t=0;for(const x of pairs)t+=x[1];
    let r=Math.random()*t;
    for(const x of pairs){r-=x[1];if(r<=0)return x[0];}
    return pairs[pairs.length-1][0];
  }
  /* Softmax: điểm cao được ưu tiên, nhiệt độ thấp ≈ luôn chọn điểm cao nhất, cao ≈ gần như ngẫu nhiên */
  function softPick(items,score,temp){
    if(items.length<2)return items[0];
    const ss=items.map(score),mx=Math.max(...ss),ws=ss.map(s=>Math.exp((s-mx)/temp));
    let r=Math.random()*ws.reduce((a,b)=>a+b,0);
    for(let i=0;i<items.length;i++){r-=ws[i];if(r<=0)return items[i];}
    return items[items.length-1];
  }

  /* ----- đường đi ----- */
  /* Một đường ngắn nhất của q tới đích (mảng ô); null nếu bị chặn kín */
  function path(q){
    const goal=goalRow(q),s=S.pl[q],s0=s.r*N+s.c;
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
  /* Các tường có thể cắt đường ngắn nhất của q (mỗi bước trên đường có đúng 2 tường chặn được) */
  function cutWalls(q){
    const pa=path(q);if(!pa||pa.length<2)return[];
    const seen=new Set(),out=[];
    for(let i=0;i+1<pa.length;i++){
      const a=pa[i],b=pa[i+1],r=(a/N)|0,c=a-r*N,r2=(b/N)|0,c2=b-r2*N;
      const cand=r===r2?[['v',r,Math.min(c,c2)],['v',r-1,Math.min(c,c2)]]:[['h',Math.min(r,r2),c],['h',Math.min(r,r2),c-1]];
      for(const[o,wr,wc]of cand){
        const key=o+wr+','+wc;if(seen.has(key)||!wallFree(o,wr,wc))continue;
        seen.add(key);out.push({o,r:wr,c:wc});
      }
    }
    return out;
  }

  /* ----- hình học tường: các điểm nút (góc giữa 4 ô) mà tường chạm vào ----- */
  const ends=(o,r,c)=>o==='h'?[[r,c-1],[r,c+1]]:[[r-1,c],[r+1,c]];          /* hai đầu mút của tường (theo tọa độ nút) */
  const pts=(o,r,c)=>[...ends(o,r,c),[r,c]];                                  /* đầu mút + tâm */
  const eq=(x,y)=>x[0]===y[0]&&x[1]===y[1];
  /* Nút (er,ec) đã có tường đi qua / kết thúc ở đó, hoặc nằm ngoài rìa bàn */
  const anchored=(er,ec)=>er<0||er>=WN||ec<0||ec>=WN||
    W('v',er,ec)||W('v',er-1,ec)||W('v',er+1,ec)||W('h',er,ec)||W('h',er,ec-1)||W('h',er,ec+1);
  /* Số đầu mút (0..2) của tường mới nối liền với tường khác hoặc mép bàn: tường nối nhau tạo hàng rào dài, khó vòng qua */
  const links=(o,r,c)=>ends(o,r,c).reduce((n,e)=>n+(anchored(e[0],e[1])?1:0),0);
  /* Hai tường chạm nhau (đầu mút của tường này nằm trên tường kia) */
  function connected(a,b){
    const pa=pts(a.o,a.r,a.c),pb=pts(b.o,b.r,b.c);
    for(const x of ends(a.o,a.r,a.c))for(const y of pb)if(eq(x,y))return true;
    for(const x of ends(b.o,b.r,b.c))for(const y of pa)if(eq(x,y))return true;
    return false;
  }

  /* ----- đánh giá tường ----- */
  /* Mọi tường hợp lệ của p, kèm: opGain (đối thủ chậm thêm), myLoss (mình chậm thêm), links */
  function walls(p){
    const op=1-p,myD=dist(p,S.pl[p]),opD=dist(op,S.pl[op]),out=[];
    for(const o of['h','v'])for(let r=0;r<WN;r++)for(let c=0;c<WN;c++){
      if(!wallFree(o,r,c))continue;
      const nd=wallDists(o,r,c);if(!nd)continue;
      out.push({o,r,c,opGain:nd[op]-opD,myLoss:nd[p]-myD,links:links(o,r,c)});
    }
    return out;
  }
  /* "Độ dễ tổn thương" của q: tường tốt nhất mà ĐỐI THỦ của q còn đặt được sẽ có net bao nhiêu (0 nếu đối thủ hết tường) */
  function harm(q){
    const o=1-q;if(S.left[o]<=0)return 0;
    const dq=dist(q,S.pl[q]),dop=dist(o,S.pl[o]);let best=0;
    for(const w of cutWalls(q)){
      const nd=wallDists(w.o,w.r,w.c);if(!nd)continue;
      const net=(nd[q]-dq)-(nd[o]-dop);if(net>best)best=net;
    }
    return best;
  }

  /* ----- tình huống bắt buộc ----- */
  const winNow=p=>{const g=goalRow(p),m=moves(p).find(x=>x[0]===g);return m?{move:m}:null;};
  /* Đối thủ về đích được ngay nước sau: tìm tường chặn được (ưu tiên làm đối thủ xa nhất, mình ít chậm nhất). null nếu không cần/không chặn được. */
  function block(p){
    if(S.left[p]<=0)return null;
    const op=1-p,g=goalRow(op);
    if(!moves(op).some(m=>m[0]===g))return null;
    let best=null,bs=-1e9;
    for(const o of['h','v'])for(let r=0;r<WN;r++)for(let c=0;c<WN;c++){
      if(!wallFree(o,r,c))continue;
      setW(o,r,c,1);
      if(!moves(op).some(m=>m[0]===g)){
        const a=dist(0,S.pl[0]),b=dist(1,S.pl[1]);
        if(a<99&&b<99){const sc=(op===0?a:b)*2-(p===0?a:b)*3;if(sc>bs){bs=sc;best={wall:{o,r,c}};}}
      }
      setW(o,r,c,0);
    }
    return best;
  }
  /* Các nước đi quân kèm đường còn lại sau nước đó */
  const steps=p=>moves(p).map(m=>({m,d:dist(p,{r:m[0],c:m[1]})}));

  return{chance,between,intBetween,weighted,softPick,path,cutWalls,ends,links,connected,walls,harm,winNow,block,steps};
})();
