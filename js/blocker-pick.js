'use strict';
/* [BLOCKER-PICK] Chọn ô cho người chặn đường. THUẦN LOGIC (không 3D, không S): nhận bộ luật R (Core.make) + trạng thái st, nên SERVER dùng được y nguyên.
   Cùng thuật toán với Blocker.pick() ở view/blocker.js (client offline dùng bản có sẵn); sửa luật chọn thì sửa cả hai.
   Ô hợp lệ = ô thường (terr = 0, bậc 0: không phải đá thấp/cao), không phải hàng đích, không có quân, và sau khi chặn hai bên VẪN còn đường về đích.
   Điểm của ô = số bước hai bên phải đi THÊM nếu ô bị chặn + .25 × số cạnh ô đã bị tường/đá bịt. Bốc ngẫu nhiên trong các ô điểm cao nhất.
   Ván thoáng (chặn ô nào cũng không làm ai đi thêm): ô nằm 2-4 bước trước bên đang dẫn. Trả về chỉ số ô r*N+c, -1 nếu không có chỗ.
   pickTarget() = bản CÂN BẰNG (server dùng): chỉ nhắm bên dẫn xa, gần/xa và lâu/mau theo độ lớn lợi thế; pick() cũ chỉ còn là đường lùi cho phím B thử.
   Chỉ dùng cho chế độ Hỗn Loạn: Classic không bao giờ có người chặn đường. */
const BlockerPick=(function(){
  const NOPATH=9999;
  function okCell(R,st,r,c){
    const N=R.N;
    if(r<1||r>N-2||c<0||c>=N)return false;
    const k=r*N+c;
    if(!R.ground(st,r,c)||st.blocker===k)return false;   /* ground = ô mở và bậc 0: người chặn không bao giờ lên đá */
    if(st.terr&&st.terr[k]!==0)return false;
    return !st.pl.some(p=>p.r===r&&p.c===c);
  }
  /* Nếu chặn ô k: số bước hai bên phải đi thêm (cộng lại), -1 nếu có bên hết đường */
  function gainOf(R,st,k,d0,d1){
    const keep=st.blocker;st.blocker=k;
    const a=R.dist(st,0,st.pl[0]),b=R.dist(st,1,st.pl[1]);
    st.blocker=keep;
    if(a>=NOPATH||b>=NOPATH)return -1;
    return (a-d0)+(b-d1);
  }
  function closedSides(R,st,r,c){
    const N=R.N;let n=0;
    for(const[dr,dc]of R.D){const r2=r+dr,c2=c+dc;if(r2<0||r2>=N||c2<0||c2>=N)continue;if(R.blk(st,r,c,dr,dc)||!R.open(st,r2,c2))n++;}
    return n;
  }
  /* Một đường ngắn nhất của người p tới hàng đích (mảng chỉ số ô, kể cả ô đang đứng); null nếu bị chặn kín */
  function pathOf(R,st,p){
    const N=R.N,goal=R.goalRow(p),s0=st.pl[p].r*N+st.pl[p].c,par=new Int16Array(N*N).fill(-2),q=[s0];par[s0]=-1;
    for(let h=0;h<q.length;h++){
      const k=q[h],r=(k/N)|0,c=k%N;
      for(const[dr,dc]of R.D){
        const r2=r+dr,c2=c+dc,k2=r2*N+c2;
        if(!R.open(st,r2,c2)||par[k2]!==-2||R.blk(st,r,c,dr,dc))continue;
        par[k2]=k;q.push(k2);
        if(r2===goal){const out=[];for(let x=k2;x!==-1;x=par[x])out.push(x);return out.reverse();}
      }
    }
    return null;
  }
  function pickOpen(R,st,d0,d1,rnd){
    const N=R.N,lead=d0<d1?0:d1<d0?1:st.turn,path=pathOf(R,st,lead),safe=k=>gainOf(R,st,k,d0,d1)>=0;
    if(path)for(const i of[2,3,4,1,5,6]){
      if(i>=path.length-1)continue;
      const k=path[i];if(okCell(R,st,(k/N)|0,k%N)&&safe(k))return k;
    }
    const all=[];for(let r=1;r<N-1;r++)for(let c=0;c<N;c++)if(okCell(R,st,r,c))all.push(r*N+c);
    for(let i=all.length-1;i>0;i--){const j=(rnd()*(i+1))|0,t=all[i];all[i]=all[j];all[j]=t;}
    for(const k of all)if(safe(k))return k;
    return -1;
  }
  function pick(R,st,rnd){
    rnd=rnd||Math.random;
    const N=R.N,d0=R.dist(st,0,st.pl[0]),d1=R.dist(st,1,st.pl[1]);
    let best=-1,top=[];
    for(let r=1;r<N-1;r++)for(let c=0;c<N;c++){
      if(!okCell(R,st,r,c))continue;
      const k=r*N+c,g=gainOf(R,st,k,d0,d1);
      if(g<1)continue;   /* g<0: có bên hết đường; g=0: chặn không làm ai chậm, không phải choke point */
      const sc=g+.25*closedSides(R,st,r,c);
      if(sc>best+1e-9){best=sc;top=[k];}else if(Math.abs(sc-best)<=1e-9)top.push(k);
    }
    if(top.length)return top[(rnd()*top.length)|0];
    return pickOpen(R,st,d0,d1,rnd);
  }

  /* ===== CÂN BẰNG: chỉ nhắm người đang dẫn rõ rệt =====
     Lợi thế (lead) của bên p = (đường bên kia − đường bên p) ± nửa nước theo lượt đi (bên tới lượt hơn nửa nước). Đúng một bên có lead > 0 (bên dẫn).
     lead < minLead: không ai đáng bị chặn, người chặn đường KHÔNG xuất hiện (đợi nước sau). lead càng lớn thì sức mạnh s (0..1) càng cao:
       • ô chặn càng SÁT bên dẫn (s=1: kề mặt, s=0: xa `far` bước) • đứng càng LÂU (stay[0]..stay[1] nước) • rời sớm khi lead đã tụt dưới `release`.
     Ô chặn phải nằm trên (hoặc sát) đường đi của bên dẫn, và không được làm bên bị dẫn chậm hơn bên dẫn (tg ≤ lg). */
  const BAL={minLead:3,fullLead:8,near:1,far:5,stay:[3,8],minStay:2,release:1};
  const bal=plan=>Object.assign({},BAL,plan&&plan.stay?{stay:plan.stay}:null,plan&&plan.balance);   /* khoảng đứng lấy từ plan.stay (cùng chỗ với bảng hướng dẫn) */
  const lerp=(a,b,t)=>a+(b-a)*t;
  function leadOf(R,st){   /* {p: bên dẫn, lead: lợi thế của bên dẫn (>0)} hoặc null nếu có bên hết đường */
    const d=[R.dist(st,0,st.pl[0]),R.dist(st,1,st.pl[1])];
    if(d[0]>=NOPATH||d[1]>=NOPATH)return null;
    const l0=d[1]-d[0]+(st.turn===0?.5:-.5);
    return l0>0?{p:0,lead:l0,d}:{p:1,lead:-l0,d};
  }
  /* lợi thế hiện tại của bên p (âm nếu đang kém) */
  function leadFor(R,st,p){
    const d0=R.dist(st,0,st.pl[0]),d1=R.dist(st,1,st.pl[1]);
    if(d0>=NOPATH||d1>=NOPATH)return 0;
    const l0=d1-d0+(st.turn===0?.5:-.5);return p===0?l0:-l0;
  }
  const strength=(lead,B)=>Math.max(0,Math.min(1,(lead-B.minLead)/(B.fullLead-B.minLead)));
  /* Số bước đi bộ từ quân p tới mọi ô (BFS cùng blk/open với nước đi thật) */
  function distFrom(R,st,p){
    const N=R.N,dd=new Int16Array(N*N).fill(-1),s0=st.pl[p].r*N+st.pl[p].c,q=[s0];dd[s0]=0;
    for(let h=0;h<q.length;h++){
      const k=q[h],r=(k/N)|0,c=k%N;
      for(const[dr,dc]of R.D){
        const r2=r+dr,c2=c+dc,k2=r2*N+c2;
        if(r2<0||r2>=N||c2<0||c2>=N||dd[k2]>=0||!R.open(st,r2,c2)||R.blk(st,r,c,dr,dc))continue;
        dd[k2]=dd[k]+1;q.push(k2);
      }
    }
    return dd;
  }
  /* Chọn mục tiêu: {cell,tgt,lead,s,stay} hoặc null (chưa ai dẫn đủ xa / không có ô hợp lệ → người chặn đường chưa xuất hiện) */
  function pickTarget(R,st,rnd,plan){
    rnd=rnd||Math.random;
    const B=bal(plan),N=R.N,L=leadOf(R,st);
    if(!L||L.lead<B.minLead)return null;
    const s=strength(L.lead,B),want=Math.round(lerp(B.far,B.near,s)),p=L.p,q=1-p,dl=distFrom(R,st,p);
    let best=-1e9,top=[];
    for(let r=1;r<N-1;r++)for(let c=0;c<N;c++){
      const k=r*N+c;
      if(!okCell(R,st,r,c)||dl[k]<1||dl[k]>B.far+1)continue;
      const dg=R.dist(st,p,{r,c});
      if(dl[k]+dg>L.d[p]+1)continue;   /* không nằm trên/sát đường đi của bên dẫn */
      const keep=st.blocker;st.blocker=k;
      const a=R.dist(st,p,st.pl[p]),b=R.dist(st,q,st.pl[q]);
      st.blocker=keep;
      if(a>=NOPATH||b>=NOPATH)continue;
      const lg=a-L.d[p],tg=b-L.d[q];
      if(tg>lg)continue;   /* không để bên bị dẫn chịu thiệt hơn bên dẫn */
      const u=-Math.abs(dl[k]-want)+2*Math.min(lg,3)-3*tg+(dl[k]+dg===L.d[p]?.5:0);
      if(u>best+1e-9){best=u;top=[k];}else if(Math.abs(u-best)<=1e-9)top.push(k);
    }
    if(!top.length)return null;
    const jit=((rnd()*3)|0)-1,stay=Math.max(B.minStay,Math.round(lerp(B.stay[0],B.stay[1],s))+jit);
    return{cell:top[(rnd()*top.length)|0],tgt:p,lead:L.lead,s,stay};
  }
  /* Người chặn đang đứng: bên bị nhắm đã hết dẫn rõ (lead tụt dưới `release`) thì nên rời sớm */
  function released(R,st,tgt,plan){return tgt===0||tgt===1?leadFor(R,st,tgt)<bal(plan).release:false;}
  return{okCell,gainOf,closedSides,pathOf,pick,pickTarget,released,leadOf,leadFor,BAL,minStay:BAL.minStay};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BlockerPick;
