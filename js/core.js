'use strict';
/* [CORE] Lõi luật chơi — thuần logic, KHÔNG đụng biến toàn cục (S, N, WN, CFG), DOM hay 3D.
   Client, AI (worker) và sau này cả server (Cloudflare Durable Object) đều dùng chung file này: luật chỉ có MỘT bản.

   Cách dùng:
     const R=Core.make(Core.ruleset('classic'));        // R = bộ luật gắn với một ruleset (cỡ bàn, số tường...)
     const st=R.newState();                             // trạng thái ván mới
     R.check(st,{move:[r,c]})  hoặc  {wall:{o:'h'|'v',r,c}}   → {ok:true} | {ok:false,reason}
     R.apply(st,action)                                 // kiểm tra + áp dụng + chuyển lượt + xét thắng; trả {ok,over,winner,reason}
     R.moves(st,p)  R.dist(st,p,{r,c})  R.canWall(st,o,r,c) ...   // các hàm hỏi luật

   Trạng thái st (chỉ những trường lõi dùng; client cho phép có thêm trường khác, lõi bỏ qua):
     pl:[{r,c},{r,c}]  vị trí quân (0 = Trắng đi trước, xuất phát hàng cuối; 1 = Đen, xuất phát hàng 0)
     ws:{h:Uint8Array(WN*WN), v:Uint8Array(WN*WN)}  tường đã đặt (1 = có), chỉ số r*WN+c
     left:[số tường còn lại của mỗi bên]   turn:0|1   ply:số nước đã đi   over:bool   winner:-1|0|1   draw:bool
   Tường (o,r,c): 'h' nằm giữa hàng r và r+1, phủ cột c và c+1; 'v' nằm giữa cột c và c+1, phủ hàng r và r+1.

   Ruleset: {id,name,N,walls,maxPly}. Thêm chế độ mới = thêm một ruleset (sau này kèm hook đầu lượt/sau hành động). */
const Core=(function(){
  const D=[[-1,0],[1,0],[0,-1],[0,1]];

  /* Ruleset mặc định. Client có thể ghi đè (vd lấy N/walls từ CFG) bằng Core.ruleset('classic',{...}). */
  const RULESETS={
    classic:{id:'classic',name:'Classic',N:9,walls:10,maxPly:300}
  };
  const ruleset=(id,over)=>Object.assign({},RULESETS[id||'classic'],over||{});

  /* Bộ đệm BFS dùng lại cho mọi lần gọi (theo từng R) để không tạo rác */
  function make(rs){
    const N=rs.N,WN=N-1,HALF=WN>>1;
    const VIS=new Int32Array(N*N),DST=new Int8Array(N*N),Q=new Int16Array(N*N);let stamp=0;

    const goalRow=p=>p===0?0:N-1;
    const inb=(r,c)=>r>=0&&r<N&&c>=0&&c<N;
    const W=(st,o,r,c)=>r>=0&&r<WN&&c>=0&&c<WN&&st.ws[o][r*WN+c]===1;
    const setW=(st,o,r,c,v)=>{st.ws[o][r*WN+c]=v;};

    /* Có tường chắn khi đi từ ô (r,c) theo hướng (dr,dc) không */
    function blk(st,r,c,dr,dc){
      if(dr===1)return W(st,'h',r,c)||W(st,'h',r,c-1);
      if(dr===-1)return W(st,'h',r-1,c)||W(st,'h',r-1,c-1);
      if(dc===1)return W(st,'v',r,c)||W(st,'v',r-1,c);
      return W(st,'v',r,c-1)||W(st,'v',r-1,c-1);
    }
    /* Các ô người p có thể đi tới (gồm cả nhảy qua đối thủ, kể cả nhảy chéo khi bị tường chắn sau lưng) */
    function moves(st,p){
      const a=st.pl[p],o=st.pl[1-p],out=[];
      for(const[dr,dc]of D){
        if(blk(st,a.r,a.c,dr,dc))continue;
        const r=a.r+dr,c=a.c+dc;if(!inb(r,c))continue;
        if(r===o.r&&c===o.c){
          const r2=r+dr,c2=c+dc;
          if(inb(r2,c2)&&!blk(st,r,c,dr,dc))out.push([r2,c2]);
          else for(const[er,ec]of D){
            if(er*dr+ec*dc!==0||blk(st,r,c,er,ec)||!inb(r+er,c+ec))continue;
            out.push([r+er,c+ec]);
          }
        }else out.push([r,c]);
      }
      return out;
    }
    /* BFS: số bước ngắn nhất từ ô s tới hàng đích của người p (99 = bị chặn kín) */
    function dist(st,p,s){
      const goal=goalRow(p);
      if(s.r===goal)return 0;
      stamp++;let h=0,t=0;const s0=s.r*N+s.c;Q[t++]=s0;VIS[s0]=stamp;DST[s0]=0;
      while(h<t){
        const k=Q[h++],r=(k/N)|0,c=k-r*N,d=DST[k]+1;
        for(let i=0;i<4;i++){
          const dr=D[i][0],dc=D[i][1];
          if(blk(st,r,c,dr,dc))continue;
          const r2=r+dr,c2=c+dc;
          if(!inb(r2,c2))continue;
          const k2=r2*N+c2;
          if(VIS[k2]===stamp)continue;
          if(r2===goal)return d;
          VIS[k2]=stamp;DST[k2]=d;Q[t++]=k2;
        }
      }
      return 99;
    }
    /* Tường không trùng/chéo với tường đã có */
    function wallFree(st,o,r,c){
      if(o!=='h'&&o!=='v')return false;
      if(r<0||r>=WN||c<0||c>=WN||W(st,o,r,c))return false;
      if(o==='h'&&(W(st,'h',r,c-1)||W(st,'h',r,c+1)||W(st,'v',r,c)))return false;
      if(o==='v'&&(W(st,'v',r-1,c)||W(st,'v',r+1,c)||W(st,'h',r,c)))return false;
      return true;
    }
    /* Đường đi mới của hai bên nếu đặt tường này; null nếu làm kín đường */
    function wallDists(st,o,r,c){
      setW(st,o,r,c,1);const a=dist(st,0,st.pl[0]),b=dist(st,1,st.pl[1]);setW(st,o,r,c,0);
      return a<99&&b<99?[a,b]:null;
    }
    const canWall=(st,o,r,c)=>wallFree(st,o,r,c)&&wallDists(st,o,r,c)!==null;

    /* ----- Vòng đời một ván ----- */
    function newState(){
      return{pl:[{r:N-1,c:HALF},{r:0,c:HALF}],ws:{h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)},
             left:[rs.walls,rs.walls],turn:0,ply:0,over:false,winner:-1,draw:false};
    }
    /* Kiểm tra một hành động của bên đang tới lượt. KHÔNG sửa st. */
    function check(st,a){
      if(!a||typeof a!=='object')return{ok:false,reason:'format'};
      if(st.over)return{ok:false,reason:'over'};
      const p=st.turn;
      if(a.move){
        const m=a.move;
        if(!Array.isArray(m)||!Number.isInteger(m[0])||!Number.isInteger(m[1]))return{ok:false,reason:'format'};
        return moves(st,p).some(x=>x[0]===m[0]&&x[1]===m[1])?{ok:true}:{ok:false,reason:'badmove'};
      }
      if(a.wall){
        const w=a.wall;
        if(!Number.isInteger(w.r)||!Number.isInteger(w.c))return{ok:false,reason:'format'};
        if(st.left[p]<=0)return{ok:false,reason:'nowalls'};
        return canWall(st,w.o,w.r,w.c)?{ok:true}:{ok:false,reason:'badwall'};
      }
      return{ok:false,reason:'format'};
    }
    /* Áp dụng hành động: kiểm tra → cập nhật → xét thắng/hòa → chuyển lượt. Sai thì không đổi gì. */
    function apply(st,a){
      const v=check(st,a);if(!v.ok)return v;
      const p=st.turn;
      if(a.move)st.pl[p]={r:a.move[0],c:a.move[1]};
      else{setW(st,a.wall.o,a.wall.r,a.wall.c,1);st.left[p]--;}
      st.ply++;
      if(st.pl[p].r===goalRow(p)){st.over=true;st.winner=p;}
      else if(rs.maxPly&&st.ply>=rs.maxPly){st.over=true;st.draw=true;}
      else st.turn=1-p;
      return{ok:true,over:st.over,winner:st.winner,draw:st.draw,by:p};
    }

    /* ----- Chuyển đổi để gửi qua mạng / lưu: object thuần JSON ----- */
    function snapshot(st){
      const walls=[];
      for(const o of['h','v'])for(let i=0;i<WN*WN;i++)if(st.ws[o][i])walls.push({o,r:(i/WN)|0,c:i%WN});
      return{pl:[{r:st.pl[0].r,c:st.pl[0].c},{r:st.pl[1].r,c:st.pl[1].c}],left:st.left.slice(),turn:st.turn,ply:st.ply,
             over:st.over,winner:st.winner,draw:st.draw,walls};
    }
    function fromSnapshot(sn){
      const st=newState();
      st.pl=[{r:sn.pl[0].r,c:sn.pl[0].c},{r:sn.pl[1].r,c:sn.pl[1].c}];st.left=sn.left.slice();
      st.turn=sn.turn;st.ply=sn.ply;st.over=!!sn.over;st.winner=sn.winner;st.draw=!!sn.draw;
      for(const w of sn.walls)setW(st,w.o,w.r,w.c,1);
      return st;
    }

    return{rs,N,WN,HALF,D,goalRow,inb,W,setW,blk,moves,dist,wallFree,wallDists,canWall,newState,check,apply,snapshot,fromSnapshot};
  }

  return{D,RULESETS,ruleset,make};
})();
if(typeof module!=='undefined')module.exports=Core;   /* để server/tools Node nạp được; trên trình duyệt đoạn này bị bỏ qua */
