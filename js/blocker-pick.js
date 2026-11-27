'use strict';
/* [BLOCKER-PICK] Chọn ô cho người chặn đường. THUẦN LOGIC (không 3D, không S): nhận bộ luật R (Core.make) + trạng thái st, nên SERVER dùng được y nguyên.
   Cùng thuật toán với Blocker.pick() ở view/blocker.js (client offline dùng bản có sẵn); sửa luật chọn thì sửa cả hai.
   Ô hợp lệ = ô thường (terr = 0), không phải hàng đích, không có quân, và sau khi chặn hai bên VẪN còn đường về đích.
   Điểm của ô = số bước hai bên phải đi THÊM nếu ô bị chặn + .25 × số cạnh ô đã bị tường/đá bịt. Bốc ngẫu nhiên trong các ô điểm cao nhất.
   Ván thoáng (chặn ô nào cũng không làm ai đi thêm): ô nằm 2-4 bước trước bên đang dẫn. Trả về chỉ số ô r*N+c, -1 nếu không có chỗ.
   Chỉ dùng cho chế độ Hỗn Loạn: Classic không bao giờ có người chặn đường. */
const BlockerPick=(function(){
  const NOPATH=9999;
  function okCell(R,st,r,c){
    const N=R.N;
    if(r<1||r>N-2||c<0||c>=N)return false;
    const k=r*N+c;
    if(!R.open(st,r,c)||st.blocker===k)return false;
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
  return{okCell,gainOf,closedSides,pathOf,pick};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BlockerPick;
