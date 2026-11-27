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

   Địa hình (tùy chọn, chỉ chế độ 'chaos'; Classic không có các trường này nên mọi thứ chạy y như cũ):
     terr:Uint8Array(N*N)  mã ô: 0 thường, 1 đá (không đi qua được), 2 cỏ, 3 băng, 4 bẫy, 5 rương, 6 cổng, 7 nước, 8 cát
                           (lõi biết đá, nước, cát; các mã còn lại dành cho bước hiệu ứng sau này)      blocker:chỉ số ô (r*N+c) của người chặn đường, -1 = chưa có
     spawn:[{r,c},{r,c}]   ô xuất phát của mỗi bên (dùng cho bẫy bật sau này)
     stuck:[bool,bool]     bên nào đang "đứng yên" (vừa bước vào ô nước): lượt kế tiếp của bên đó không được đi, chỉ được đặt tường
     gwait:[bool,bool]     bên nào đang đứng trên ô cổng mà cổng kia bị đối thủ chiếm (chờ dịch chuyển, xem luật cổng)

   Luật ô nước / ô cát (chỉ khi có terr, Classic không bị ảnh hưởng):
     • Hai ô kề nhau (4 hướng) đều là nước/cát (nước–nước, cát–cát, nước–cát) thì cạnh chung KHÔNG đặt tường được. Một tường phủ 2 cạnh; tường nào phủ lên một cạnh như vậy bị từ chối ('badwall').
     • Bước vào ô nước (kể cả nhảy chéo vào) → stuck[p]=true. Lượt kế tiếp của p: moves()=[] và đi bị từ chối ('frozen'); chỉ đặt được tường. Dùng xong lượt đó thì stuck[p]=false,
       đi lại bình thường (đứng trên nước nhiều lượt cũng không bị kẹt; chỉ bước vào ô nước MỚI mới đứng yên).
     • Nếu p đang đứng yên mà hết tường (hoặc không còn chỗ đặt hợp lệ) thì lượt đó mất: apply tự bỏ qua, tính 1 nước (ply), và kết quả có skipped:[những bên bị mất lượt].
   Luật cát lún (chỉ Hỗn Loạn): kết thúc nước ĐI trên ô cát (bước vào, nhảy xuống, hoặc trượt băng dừng đúng ô) thì bốc rnd(st) < rs.sandSink (mặc định 15%) → quân bị LÚN: st.sunk[p]=true.
     Tới lượt kế tiếp của p thì lượt đó bị BỎ QUA hoàn toàn (không đi, không đặt tường, không dùng đồ; tính 1 nước ply; res.skipped có p và fx {t:'sunkskip',p}) rồi sunk[p]=false.
     Lún không cho giày: lượt thêm bị hủy. Dịch chuyển cổng / bẫy hất không kích hoạt lún. fx:{t:'sink',p,cell:[r,c]} báo quân vừa bị lún.
   Ô "mở" = trong bàn, không phải đá, không có người chặn. BFS/nước đi chỉ đi qua ô mở.
   dist() trả NOPATH (9999) khi bị chặn kín (giữ nguyên 9999 và mảng Int16 để sau này đổi cỡ bàn không phải sửa lại).

   Hiệu ứng ô (chỉ khi có terr; Classic không bị ảnh hưởng). Mọi hiệu ứng chạy trong apply() ngay sau khi quân bước xong:
     • Cỏ (2): quân đứng trên cỏ thì đối thủ KHÔNG thấy, trừ khi đối thủ cũng đứng trên cỏ và ở trong 8 ô xung quanh. Chỉ là luật nhìn thấy: dùng sees(st,viewer,target)
       và snapshotFor(st,viewer) (bản snapshot đã giấu quân bị che) để client/server không lộ vị trí. Luật đi/nhảy vẫn dùng vị trí thật.
     • Băng (3): bước vào ô băng thì trượt sang một ô kề hợp lệ ngẫu nhiên (không bị tường/đá/blocker/đối thủ chặn, không quay lại ô vừa rời). Rơi vào băng tiếp thì trượt tiếp;
       dừng khi tới ô không phải băng, hết đường, chạm hàng đích (thắng) hoặc đủ rs.slideMax lần. Ô cuối cùng vẫn được áp hiệu ứng của nó (nước → đứng yên, bẫy, cổng...).
     • Bẫy (4): bẫy lò xo, chu kỳ theo ply: rs.trapClosed lượt đóng (mặc định 2) rồi rs.trapOpen lượt bật (mặc định 1). trapOn(st,0) cho biết lượt đang đi có phải lượt bẫy bật không.
       Kết thúc lượt của mình (đi tới HOẶC đứng yên đặt tường) trên ô bẫy đúng lúc nó bật → bị bắn về một ô ngẫu nhiên trên hàng xuất phát của mình (ô mở, không phải ô đối thủ đang đứng).
       Bẫy chỉ tính cho bên đang đi: bên kia đứng trên bẫy lúc nó bật ở lượt của đối phương thì không sao (bên đó thấy dấu hiệu "!" và còn lượt của mình để bước đi).
     • Cổng (6): đúng 2 ô mã 6 là một cặp. Bước vào một cổng → dịch chuyển sang cổng kia (không kích hoạt lại). Số cổng khác 2 thì cổng không hoạt động.
       Cổng kia đang có đối thủ đứng → KHÔNG dịch chuyển, quân đó "chờ" (st.gwait[p]=true) và đứng nguyên trên ô cổng. Ngay khi đối thủ rời cổng kia (xong nước đi/đặt tường của họ, vẫn trong lượt đó)
       thì quân đang chờ được dịch chuyển sang cổng vừa trống (fx có late:true). gwait tự tắt khi quân đó đi khỏi ô cổng.
     • Dịch chuyển/bắn về không kích hoạt thêm hiệu ứng ô nào ở nơi đáp (tránh vòng lặp).
     • Ngẫu nhiên: lõi KHÔNG dùng Math.random. Trạng thái có st.rng (số nguyên 32 bit, PRNG mulberry32); newState({seed}) đặt hạt giống. Cùng trạng thái + cùng hành động ⇒ cùng kết quả,
       nên client, AI và server khớp nhau. Server nên giữ seed bí mật (snapshotFor không gửi rng).
     • apply() trả thêm fx:[{t:'slide',p,path},{t:'launch',p,from,to},{t:'gate',p,from,to,late?},{t:'stuck',p}] để client dựng hoạt ảnh (theo đúng thứ tự xảy ra; p = quân bị ảnh hưởng, không nhất thiết là bên vừa đi).

   Rương và vật phẩm (chỉ khi có terr, tức Hỗn Loạn; Classic không bị ảnh hưởng):
     • Ô rương (5): quân kết thúc nước ĐI trên ô này (bước vào trực tiếp, nhảy qua đối thủ đáp xuống, hoặc trượt băng dừng đúng ô này) thì rương mở: ô trở thành ô thường (rương biến mất), server bốc một món quà
       bằng rnd(st) (rs.gifts = [[tên,trọng số],…], mặc định gạch 30 · giày 20 · búa 20 · găng 15 · cuốc 15). Dịch chuyển cổng / bẫy hất không kích hoạt rương (đúng quy ước 'nơi đáp không có hiệu ứng').
       fx:{t:'chest',p,cell:[r,c],gift,drop?}  (drop = món cũ nhất bị đẩy ra khi túi đầy).
     • Gạch: +1 tường ngay (không chiếm túi). Các món còn lại vào túi st.inv[p] (tối đa rs.bag=2; đầy thì bỏ món CŨ NHẤT, giữ món mới).
     • Dùng vật phẩm là hành động {item:{use,...}}:
         boots   MIỄN PHÍ (không tốn lượt, không tăng ply): st.bonus[p]=1. Sau hành động kế tiếp của p (đi hoặc đặt tường), p được thêm MỘT lượt CHỈ ĐƯỢC ĐI QUÂN (st.bonus[p]=2, st.turn giữ nguyên).
                 Nếu lúc đó p đang đứng yên (vừa lội xuống nước) hoặc không còn nước đi thì mất lượt thêm. Không dùng giày khi đang có giày chờ hoặc trong lượt thêm.
         glove   tốn một lượt: cướp 1 tường của đối thủ (chỉ khi đối thủ còn ≥ 2 tường).
         hammer  tốn một lượt, kèm {o,r,c}: tháo một tường của ĐỐI THỦ, trả lại cho đối thủ (left[đối thủ]++); khe đó đặt lại được.
         pick    tốn một lượt, kèm {o,r,c}: phá hẳn một tường của đối thủ (không trả lại); khe đó bị chiếm vĩnh viễn (st.dead), không ai xây lại được và không còn chắn đường.
     • Chủ tường: st.wo = {h,v} Uint8Array(WN*WN), 0 không có, 1 = Trắng đặt, 2 = Đen đặt (giá trị = bên + 1). st.dead = {h,v} tường bị cuốc chim phá (chỉ dùng trong wallFree).
     • st.inv = [[tên…],[tên…]] túi đồ (công khai cho cả hai bên), st.bonus = [0|1|2, 0|1|2] trạng thái giày.
   Ruleset: {id,name,N,walls,maxPly,...}. Thêm chế độ mới = thêm một ruleset (sau này kèm hook đầu lượt/sau hành động).
     maxPlyCloser:true → hết maxPly thì bên gần đích hơn thắng (bằng nhau mới hòa). */
const Core=(function(){
  const D=[[-1,0],[1,0],[0,-1],[0,1]];
  const TERR={STONE:1,GRASS:2,ICE:3,TRAP:4,CHEST:5,GATE:6,WATER:7,SAND:8};   /* các mã ô mà lõi cần biết */
  const NOPATH=9999;
  const GIFTS=[['brick',30],['boots',20],['hammer',20],['glove',15],['pick',15]];   /* quà trong rương: [tên, trọng số] */
  const ITEMS=['boots','glove','hammer','pick'];   /* món vào túi (gạch cộng tường ngay nên không nằm đây) */

  /* Ruleset mặc định. Client có thể ghi đè (vd lấy N/walls từ CFG) bằng Core.ruleset('classic',{...}). */
  const RULESETS={
    classic:{id:'classic',name:'Classic',N:9,walls:10,maxPly:300},
    chaos:{id:'chaos',name:'Hỗn Loạn',N:9,walls:10,maxPly:300,maxPlyCloser:true,trapClosed:2,trapOpen:1,slideMax:40,bag:2,
           sandSink:.25,blockerPlan:{first:[20,30],stay:[5,7],gap:[20,30]}}   /* người chặn đường (CHỈ Hỗn Loạn, server chạy lịch; xem js/blocker-plan.js). Classic không có khóa này = không bao giờ có người chặn */
  };
  const ruleset=(id,over)=>Object.assign({},RULESETS[id||'classic'],over||{});

  /* Bộ đệm BFS dùng lại cho mọi lần gọi (theo từng R) để không tạo rác */
  function make(rs){
    const N=rs.N,WN=N-1,HALF=WN>>1;
    const VIS=new Int32Array(N*N),DST=new Int16Array(N*N),Q=new Int16Array(N*N);let stamp=0;

    const goalRow=p=>p===0?0:N-1;
    const inb=(r,c)=>r>=0&&r<N&&c>=0&&c<N;
    /* Ô mở: trong bàn, không phải đá, không có người chặn đường. Classic (không có terr/blocker) thì chỉ còn kiểm tra trong bàn. */
    const open=(st,r,c)=>{
      if(r<0||r>=N||c<0||c>=N)return false;
      if(st.terr&&st.terr[r*N+c]===1)return false;
      return st.blocker===undefined||st.blocker<0||st.blocker!==r*N+c;
    };
    /* Ô nước hoặc cát. Cạnh giữa hai ô như vậy kề nhau thì không đặt tường được. Classic (không có terr) thì luôn false. */
    const soft=(st,r,c)=>{
      if(!st.terr||r<0||r>=N||c<0||c>=N)return false;
      const v=st.terr[r*N+c];return v===TERR.WATER||v===TERR.SAND;
    };
    const bridged=(st,r1,c1,r2,c2)=>soft(st,r1,c1)&&soft(st,r2,c2);
    /* ----- Hỗn loạn: PRNG có hạt giống nằm trong st.rng (mulberry32) ----- */
    function rnd(st){
      let t=(st.rng=(st.rng+0x6D2B79F5)>>>0);
      t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
      return((t^(t>>>14))>>>0)/4294967296;
    }
    const tc=(st,r,c)=>st.terr&&r>=0&&r<N&&c>=0&&c<N?st.terr[r*N+c]:0;   /* mã ô, 0 nếu không có địa hình */
    /* Bẫy đang bật ở nước đi thứ (st.ply+ahead) chưa. */
    function trapOn(st,ahead){
      const cl=rs.trapClosed||2,op=rs.trapOpen||1;
      return((st.ply+(ahead||0))%(cl+op))>=cl;
    }
    /* Viewer có thấy quân của target không (cỏ che quân). */
    function sees(st,viewer,target){
      if(viewer===target)return true;
      const t=st.pl[target];
      if(tc(st,t.r,t.c)!==TERR.GRASS)return true;
      const v=st.pl[viewer];
      return tc(st,v.r,v.c)===TERR.GRASS&&Math.max(Math.abs(v.r-t.r),Math.abs(v.c-t.c))<=1;
    }
    /* Ô cổng còn lại của cặp (null nếu không đúng 2 cổng) */
    function gateOther(st,r,c){
      const g=[];
      for(let i=0;i<N*N;i++)if(st.terr[i]===TERR.GATE)g.push({r:(i/N)|0,c:i%N});
      if(g.length!==2)return null;
      return g[0].r===r&&g[0].c===c?g[1]:g[1].r===r&&g[1].c===c?g[0]:null;
    }
    /* Áp hiệu ứng địa hình sau khi p vừa bước tới st.pl[p] (from = ô vừa rời). Trả danh sách sự kiện cho client. */
    function settle(st,p,from){
      const fx=[],goal=goalRow(p),o=st.pl[1-p],max=rs.slideMax||40;
      let a=st.pl[p],prev=from;
      if(tc(st,a.r,a.c)===TERR.ICE){
        const path=[[a.r,a.c]];
        for(let i=0;i<max&&a.r!==goal&&tc(st,a.r,a.c)===TERR.ICE;i++){
          const cand=[];
          for(const[dr,dc]of D){
            const r=a.r+dr,c=a.c+dc;
            if(blk(st,a.r,a.c,dr,dc)||!open(st,r,c))continue;
            if(r===o.r&&c===o.c)continue;
            if(r===prev.r&&c===prev.c)continue;
            cand.push([r,c]);
          }
          if(!cand.length)break;
          const n=cand[(rnd(st)*cand.length)|0];
          prev={r:a.r,c:a.c};a={r:n[0],c:n[1]};path.push(n);
        }
        st.pl[p]=a;
        if(path.length>1)fx.push({t:'slide',p,path});
      }
      if(a.r===goal)return fx;
      const code=tc(st,a.r,a.c);
      if(code===TERR.WATER){st.stuck[p]=true;fx.push({t:'stuck',p});}   /* vừa lội xuống nước: lượt sau đứng yên */
      else if(code===TERR.SAND){   /* cát: có xác suất bị lún, lượt kế tiếp của p bị bỏ qua (xem resolveSkips) */
        const pr=rs.sandSink===undefined?.25:rs.sandSink;
        if(pr>0&&rnd(st)<pr){st.sunk[p]=true;fx.push({t:'sink',p,cell:[a.r,a.c]});}
      }
      else if(code===TERR.TRAP)trapHit(st,p,fx);
      else if(code===TERR.CHEST)openChest(st,p,a,fx);
      else if(code===TERR.GATE){
        const g=gateOther(st,a.r,a.c);
        if(g){
          if(g.r===o.r&&g.c===o.c)st.gwait[p]=true;   /* cổng kia có người: đứng chờ tại chỗ, đối thủ đi khỏi thì được dịch chuyển (gateRelease) */
          else{st.pl[p]={r:g.r,c:g.c};fx.push({t:'gate',p,from:[a.r,a.c],to:[g.r,g.c]});}
        }
      }
      return fx;
    }
    /* Bốc một món quà theo trọng số (rs.gifts hoặc GIFTS) bằng PRNG của trạng thái */
    function rollGift(st){
      const g=rs.gifts||GIFTS;let tot=0;for(const e of g)tot+=e[1];
      let x=rnd(st)*tot;for(const e of g){x-=e[1];if(x<0)return e[0];}
      return g[g.length-1][0];
    }
    /* Quân p vừa kết thúc nước đi trên ô rương a: rương mở rồi biến mất (ô thành ô thường), p nhận quà. Gạch: +1 tường. Còn lại: vào túi, đầy thì bỏ món cũ nhất. */
    function openChest(st,p,a,fx){
      st.terr[a.r*N+a.c]=0;
      const gift=rollGift(st),e={t:'chest',p,cell:[a.r,a.c],gift};
      if(gift==='brick')st.left[p]++;
      else{
        const bag=st.inv[p];bag.push(gift);
        if(bag.length>(rs.bag||2))e.drop=bag.shift();
      }
      fx.push(e);
    }
    /* Quân p kết thúc lượt của mình đang đứng trên ô bẫy: nếu bẫy đang bật thì bị bắn về một ô ngẫu nhiên trên hàng xuất phát. Gọi cả khi đi tới lẫn khi đặt tường. */
    function trapHit(st,p,fx){
      const a=st.pl[p],o=st.pl[1-p];
      if(tc(st,a.r,a.c)!==TERR.TRAP||!trapOn(st,0))return;
      const row=st.spawn[p].r,cs=[];
      for(let c=0;c<N;c++){
        if(!open(st,row,c)||(row===o.r&&c===o.c)||(row===a.r&&c===a.c))continue;
        cs.push(c);
      }
      if(cs.length){
        const c=cs[(rnd(st)*cs.length)|0];
        st.pl[p]={r:row,c};fx.push({t:'launch',p,from:[a.r,a.c],to:[row,c]});
      }
    }
    /* Sau hành động của p: đối thủ q đang chờ ở cổng mà cổng kia giờ đã trống (p vừa rời) → dịch chuyển q ngay trong lượt này. */
    function gateRelease(st,p,fx){
      const q=1-p;
      if(!st.gwait[q])return;
      const a=st.pl[q],g=tc(st,a.r,a.c)===TERR.GATE?gateOther(st,a.r,a.c):null;
      if(!g){st.gwait[q]=false;return;}
      if(g.r===st.pl[p].r&&g.c===st.pl[p].c)return;   /* vẫn bị chiếm */
      st.gwait[q]=false;st.pl[q]={r:g.r,c:g.c};
      fx.push({t:'gate',p:q,from:[a.r,a.c],to:[g.r,g.c],late:true});
    }
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
      if(st.stuck&&st.stuck[p])return out;   /* vừa bước vào ô nước: lượt này chỉ được đặt tường */
      for(const[dr,dc]of D){
        if(blk(st,a.r,a.c,dr,dc))continue;
        const r=a.r+dr,c=a.c+dc;if(!open(st,r,c))continue;
        if(r===o.r&&c===o.c){
          const r2=r+dr,c2=c+dc;
          if(open(st,r2,c2)&&!blk(st,r,c,dr,dc))out.push([r2,c2]);
          else for(const[er,ec]of D){
            if(er*dr+ec*dc!==0||blk(st,r,c,er,ec)||!open(st,r+er,c+ec))continue;
            out.push([r+er,c+ec]);
          }
        }else out.push([r,c]);
      }
      return out;
    }
    /* BFS: số bước ngắn nhất từ ô s tới hàng đích của người p (NOPATH = bị chặn kín) */
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
          if(!open(st,r2,c2))continue;
          const k2=r2*N+c2;
          if(VIS[k2]===stamp)continue;
          if(r2===goal)return d;
          VIS[k2]=stamp;DST[k2]=d;Q[t++]=k2;
        }
      }
      return NOPATH;
    }
    /* Tường không trùng/chéo với tường đã có */
    function wallFree(st,o,r,c){
      if(o!=='h'&&o!=='v')return false;
      if(r<0||r>=WN||c<0||c>=WN||W(st,o,r,c))return false;
      if(o==='h'&&(W(st,'h',r,c-1)||W(st,'h',r,c+1)||W(st,'v',r,c)))return false;
      if(o==='v'&&(W(st,'v',r-1,c)||W(st,'v',r+1,c)||W(st,'h',r,c)))return false;
      if(st.dead){   /* tường bị cuốc chim phá: khe vẫn bị chiếm (cùng khe, chéo nhau, hoặc chồng lên đầu) nhưng không còn chắn đường (blk không xét st.dead) */
        const X=(oo,rr,cc)=>rr>=0&&rr<WN&&cc>=0&&cc<WN&&st.dead[oo][rr*WN+cc]===1;
        if(X(o,r,c)||(o==='h'&&(X('h',r,c-1)||X('h',r,c+1)||X('v',r,c)))||(o==='v'&&(X('v',r-1,c)||X('v',r+1,c)||X('h',r,c))))return false;
      }
      if(st.terr){   /* tường phủ 2 cạnh; cạnh nào nằm giữa hai ô nước/cát kề nhau thì cấm */
        if(o==='h'&&(bridged(st,r,c,r+1,c)||bridged(st,r,c+1,r+1,c+1)))return false;
        if(o==='v'&&(bridged(st,r,c,r,c+1)||bridged(st,r+1,c,r+1,c+1)))return false;
      }
      return true;
    }
    /* Đường đi mới của hai bên nếu đặt tường này; null nếu làm kín đường.
       Khi có người chặn đường: tường phải giữ đường đi cả khi có người chặn lẫn khi người chặn đã đi (số trả về là lúc có người chặn). */
    function wallDists(st,o,r,c){
      setW(st,o,r,c,1);
      const a=dist(st,0,st.pl[0]),b=dist(st,1,st.pl[1]);
      let freeOk=true;
      if(st.blocker>=0){
        const keep=st.blocker;st.blocker=-1;
        freeOk=dist(st,0,st.pl[0])<NOPATH&&dist(st,1,st.pl[1])<NOPATH;
        st.blocker=keep;
      }
      setW(st,o,r,c,0);
      return a<NOPATH&&b<NOPATH&&freeOk?[a,b]:null;
    }
    const canWall=(st,o,r,c)=>wallFree(st,o,r,c)&&wallDists(st,o,r,c)!==null;

    /* ----- Vòng đời một ván ----- */
    /* opts (tùy chọn, cho chế độ có địa hình): {spawn:[c0,c1] cột xuất phát của Trắng/Đen (mặc định cột giữa), terr:mảng N*N (0/1)}.
       Không truyền opts = ván Classic y như trước. */
    function newState(opts){
      const sp=opts&&opts.spawn?opts.spawn:[HALF,HALF];
      const st={pl:[{r:N-1,c:sp[0]},{r:0,c:sp[1]}],ws:{h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)},
             left:[rs.walls,rs.walls],turn:0,ply:0,over:false,winner:-1,draw:false};
      if(opts&&(opts.spawn||opts.terr)){
        st.spawn=[{r:st.pl[0].r,c:st.pl[0].c},{r:st.pl[1].r,c:st.pl[1].c}];
        st.terr=opts.terr?Uint8Array.from(opts.terr):new Uint8Array(N*N);
        st.blocker=-1;
        st.stuck=[false,false];st.gwait=[false,false];st.sunk=[false,false];
        st.wo={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};st.dead={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};
        st.inv=[[],[]];st.bonus=[0,0];
        st.rng=opts.seed!==undefined?(opts.seed>>>0):20240601;   /* hạt giống cho băng/bẫy; client/server nên truyền seed */
      }
      return st;
    }
    /* Kiểm tra một hành động của bên đang tới lượt. KHÔNG sửa st. */
    function check(st,a){
      if(!a||typeof a!=='object')return{ok:false,reason:'format'};
      if(st.over)return{ok:false,reason:'over'};
      const p=st.turn;
      if(st.bonus&&st.bonus[p]===2&&!a.move)return{ok:false,reason:'moveonly'};   /* lượt thêm của giày: chỉ được đi quân */
      if(a.item)return checkItem(st,p,a.item);
      if(a.move){
        const m=a.move;
        if(!Array.isArray(m)||!Number.isInteger(m[0])||!Number.isInteger(m[1]))return{ok:false,reason:'format'};
        if(st.stuck&&st.stuck[p])return{ok:false,reason:'frozen'};
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
    /* Kiểm tra việc dùng một vật phẩm của p (xem phần 'Rương và vật phẩm' đầu file) */
    function checkItem(st,p,it){
      if(!st.inv||!it||typeof it!=='object'||typeof it.use!=='string')return{ok:false,reason:'format'};
      if(ITEMS.indexOf(it.use)<0)return{ok:false,reason:'format'};
      if(st.inv[p].indexOf(it.use)<0)return{ok:false,reason:'noitem'};
      const q=1-p;
      if(it.use==='boots')return st.bonus[p]===0?{ok:true}:{ok:false,reason:'bootsbusy'};
      if(it.use==='glove')return st.left[q]>=2?{ok:true}:{ok:false,reason:'glovefail'};
      if((it.o!=='h'&&it.o!=='v')||!Number.isInteger(it.r)||!Number.isInteger(it.c))return{ok:false,reason:'format'};
      if(it.r<0||it.r>=WN||it.c<0||it.c>=WN)return{ok:false,reason:'badtarget'};
      return st.wo[it.o][it.r*WN+it.c]===q+1&&st.ws[it.o][it.r*WN+it.c]===1?{ok:true}:{ok:false,reason:'badtarget'};   /* chỉ tường của ĐỐI THỦ */
    }
    /* Các tường của đối thủ của p (mục tiêu của búa / cuốc chim): [{o,r,c}] */
    function oppWalls(st,p){
      const out=[];if(!st.wo)return out;
      for(const o of['h','v'])for(let i=0;i<WN*WN;i++)if(st.wo[o][i]===2-p&&st.ws[o][i]===1)out.push({o,r:(i/WN)|0,c:i%WN});
      return out;
    }
    /* p có dùng được món nào TỐN LƯỢT (găng/búa/cuốc) không — để lượt đứng yên không bị bỏ qua oan khi hết tường mà còn món dùng được */
    function hasPaidItem(st,p){
      if(!st.inv)return false;
      for(const u of st.inv[p]){
        if(u==='glove'&&st.left[1-p]>=2)return true;
        if((u==='hammer'||u==='pick')&&oppWalls(st,p).length)return true;
      }
      return false;
    }
    /* Bên p còn đặt được ít nhất một tường hợp lệ không (còn tường và còn chỗ) */
    function hasWall(st,p){
      if(st.left[p]<=0)return false;
      for(const o of['h','v'])for(let r=0;r<WN;r++)for(let c=0;c<WN;c++)if(canWall(st,o,r,c))return true;
      return false;
    }
    /* Hết số nước: bên gần đích hơn thắng nếu ruleset bật maxPlyCloser, bằng nhau (hoặc không bật) thì hòa */
    function finishByPly(st){
      st.over=true;
      if(rs.maxPlyCloser){
        const d0=dist(st,0,st.pl[0]),d1=dist(st,1,st.pl[1]);
        if(d0<d1)st.winner=0;else if(d1<d0)st.winner=1;else st.draw=true;
      }else st.draw=true;
    }
    /* Tới lượt một bên đang đứng yên mà không có tường nào đặt được → mất lượt đó, chuyển lượt (lặp nếu bên kia cũng vậy). Trả danh sách bên bị mất lượt. */
    function resolveSkips(st,fx){
      const sk=[];
      /* Mất lượt khi KHÔNG CÒN hành động nào: không đi được (đứng yên vì nước, hoặc bị tường/đá/người chặn đường/đối thủ vây kín), không đặt được tường, không có vật phẩm tốn lượt.
         Chỉ áp dụng khi có địa hình (Hỗn Loạn); Classic giữ luật Quoridor gốc. Bị lún cát thì mất TRỌN lượt (kể cả đặt tường / dùng đồ). */
      while(st.stuck){
        const q=st.turn;
        if(st.sunk&&st.sunk[q]){st.sunk[q]=false;if(fx)fx.push({t:'sunkskip',p:q});}
        else if(moves(st,q).length===0&&!hasWall(st,q)&&!hasPaidItem(st,q))st.stuck[q]=false;
        else break;
        sk.push(q);st.ply++;
        if(rs.maxPly&&st.ply>=rs.maxPly){finishByPly(st);break;}
        st.turn=1-q;
      }
      return sk;
    }
    /* Áp dụng hành động: kiểm tra → cập nhật → xét thắng/hòa → chuyển lượt. Sai thì không đổi gì. */
    function apply(st,a){
      const v=check(st,a);if(!v.ok)return v;
      const p=st.turn,q=1-p;
      if(a.item&&a.item.use==='boots'){   /* giày: miễn phí, không tốn lượt, không tăng ply; lượt thêm tới sau hành động kế tiếp của p */
        st.inv[p].splice(st.inv[p].indexOf('boots'),1);st.bonus[p]=1;
        return{ok:true,over:false,winner:-1,draw:false,by:p,free:true,fx:[{t:'boots',p}]};
      }
      const wasExtra=!!st.bonus&&st.bonus[p]===2;   /* hành động này là lượt thêm của giày */
      if(st.stuck)st.stuck[p]=false;   /* lượt đứng yên (nếu có) được dùng để đặt tường hoặc dùng vật phẩm */
      let fx=st.terr?[]:null;
      if(a.move){
        const from={r:st.pl[p].r,c:st.pl[p].c};
        if(st.gwait)st.gwait[p]=false;   /* đi khỏi ô cổng: hết chờ */
        st.pl[p]={r:a.move[0],c:a.move[1]};
        if(st.terr)fx=settle(st,p,from);   /* băng/nước/bẫy/cổng: có thể đổi vị trí cuối của quân */
      }
      else if(a.item){
        const it=a.item,bag=st.inv[p];bag.splice(bag.indexOf(it.use),1);
        if(it.use==='glove'){st.left[q]--;st.left[p]++;fx.push({t:'glove',p});}
        else{
          const i=it.r*WN+it.c;st.ws[it.o][i]=0;st.wo[it.o][i]=0;
          if(it.use==='pick')st.dead[it.o][i]=1;else st.left[q]++;   /* búa trả tường về cho đối thủ, cuốc chim thì phá hẳn */
          fx.push({t:it.use,p,o:it.o,r:it.r,c:it.c});
        }
      }
      else{
        setW(st,a.wall.o,a.wall.r,a.wall.c,1);st.left[p]--;
        if(st.wo)st.wo[a.wall.o][a.wall.r*WN+a.wall.c]=p+1;
        if(st.terr)trapHit(st,p,fx);   /* đứng yên trên bẫy lúc nó bật vẫn bị bắn */
      }
      st.ply++;
      let skipped=[];
      if(st.pl[p].r===goalRow(p)){st.over=true;st.winner=p;}
      else{
        if(st.terr)gateRelease(st,p,fx);   /* p vừa rời cổng → đối thủ đang chờ ở cổng kia được dịch chuyển ngay */
        if(st.pl[q].r===goalRow(q)){st.over=true;st.winner=q;}   /* (hiếm) dịch chuyển trúng hàng đích */
        else if(rs.maxPly&&st.ply>=rs.maxPly)finishByPly(st);
        else{
          let stay=false;   /* giày: p được thêm một lượt đi quân nếu còn nước đi (không đứng yên, không bị chặn kín) */
          if(st.bonus){
            if(wasExtra)st.bonus[p]=0;
            else if(st.bonus[p]===1){if(!st.stuck[p]&&!st.sunk[p]&&moves(st,p).length){st.bonus[p]=2;stay=true;}else st.bonus[p]=0;}
          }
          if(!stay){st.turn=q;skipped=resolveSkips(st,fx);}
        }
      }
      const res={ok:true,over:st.over,winner:st.winner,draw:st.draw,by:p};
      if(skipped.length)res.skipped=skipped;
      if(fx&&fx.length)res.fx=fx;
      return res;
    }

    /* ----- Chuyển đổi để gửi qua mạng / lưu: object thuần JSON ----- */
    function snapshot(st){
      const walls=[];
      for(const o of['h','v'])for(let i=0;i<WN*WN;i++)if(st.ws[o][i]){const w={o,r:(i/WN)|0,c:i%WN};if(st.wo)w.p=st.wo[o][i]-1;walls.push(w);}   /* Hỗn Loạn: kèm chủ tường p (0/1) */
      const sn={pl:[{r:st.pl[0].r,c:st.pl[0].c},{r:st.pl[1].r,c:st.pl[1].c}],left:st.left.slice(),turn:st.turn,ply:st.ply,
             over:st.over,winner:st.winner,draw:st.draw,walls};
      if(st.terr){   /* địa hình: chuỗi N*N chữ số (mã ô) cho gọn; Classic không có các khóa này nên snapshot cũ không đổi */
        sn.terr=Array.from(st.terr).join('');sn.blocker=st.blocker;
        sn.spawn=st.spawn.map(s=>({r:s.r,c:s.c}));
        sn.stuck=(st.stuck||[false,false]).slice();sn.sunk=(st.sunk||[false,false]).slice();sn.gwait=(st.gwait||[false,false]).slice();sn.rng=st.rng;
        sn.inv=(st.inv||[[],[]]).map(b=>b.slice());sn.bonus=(st.bonus||[0,0]).slice();
        sn.dead=[];if(st.dead)for(const o of['h','v'])for(let i=0;i<WN*WN;i++)if(st.dead[o][i])sn.dead.push({o,r:(i/WN)|0,c:i%WN});
      }
      return sn;
    }
    function fromSnapshot(sn){
      const st=newState();
      st.pl=[{r:sn.pl[0].r,c:sn.pl[0].c},{r:sn.pl[1].r,c:sn.pl[1].c}];st.left=sn.left.slice();
      st.turn=sn.turn;st.ply=sn.ply;st.over=!!sn.over;st.winner=sn.winner;st.draw=!!sn.draw;
      if(typeof sn.terr==='string'){
        st.terr=Uint8Array.from(sn.terr,ch=>ch.charCodeAt(0)-48);st.blocker=Number.isInteger(sn.blocker)?sn.blocker:-1;
        st.spawn=sn.spawn.map(s=>({r:s.r,c:s.c}));
        st.stuck=Array.isArray(sn.stuck)?[!!sn.stuck[0],!!sn.stuck[1]]:[false,false];
        st.sunk=Array.isArray(sn.sunk)?[!!sn.sunk[0],!!sn.sunk[1]]:[false,false];
        st.gwait=Array.isArray(sn.gwait)?[!!sn.gwait[0],!!sn.gwait[1]]:[false,false];
        st.rng=Number.isInteger(sn.rng)?sn.rng>>>0:20240601;
        st.wo={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};st.dead={h:new Uint8Array(WN*WN),v:new Uint8Array(WN*WN)};
        st.inv=Array.isArray(sn.inv)?[sn.inv[0].slice(),sn.inv[1].slice()]:[[],[]];
        st.bonus=Array.isArray(sn.bonus)?[sn.bonus[0]|0,sn.bonus[1]|0]:[0,0];
        for(const w of sn.dead||[])st.dead[w.o][w.r*WN+w.c]=1;
      }
      for(const w of sn.walls){setW(st,w.o,w.r,w.c,1);if(st.wo&&(w.p===0||w.p===1))st.wo[w.o][w.r*WN+w.c]=w.p+1;}
      return st;
    }

    /* Snapshot dành cho người chơi 'viewer': quân đối thủ bị cỏ che thì pl[đối thủ]=null, và không gửi rng. CHỈ để hiển thị, không nạp lại bằng fromSnapshot. */
    function snapshotFor(st,viewer){
      const sn=snapshot(st);delete sn.rng;
      if(!sees(st,viewer,1-viewer))sn.pl[1-viewer]=null;
      return sn;
    }

    return{rs,N,WN,HALF,D,NOPATH,goalRow,inb,open,W,setW,blk,moves,dist,wallFree,wallDists,canWall,bridged,hasWall,newState,check,apply,snapshot,fromSnapshot,snapshotFor,sees,trapOn,gateOther,oppWalls,hasPaidItem};
  }

  return{D,NOPATH,TERR,GIFTS,ITEMS,RULESETS,ruleset,make};
})();
if(typeof module!=='undefined')module.exports=Core;   /* để server/tools Node nạp được; trên trình duyệt đoạn này bị bỏ qua */
