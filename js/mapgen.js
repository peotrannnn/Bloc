'use strict';
/* [MAPGEN] Sinh map cho chế độ "Hỗn Loạn" (bàn 9×9, 10 tường mỗi bên như Classic). Thuần logic, KHÔNG dùng Math.random: cùng seed → cùng map, trên mọi máy.
   Server gọi MapGen.generate(seed) rồi gửi MapGen.serialize(map) cho hai client; client không tự sinh nên không bao giờ lệch.

   Dùng:
     const m=MapGen.generate(seed[,opts]);      // seed: số hoặc chuỗi
     m = {seed,biome,N,terr:Uint8Array(N*N),spawn:[cộtTrắng,cộtĐen],clusters:[{kind,shape,cells:[chỉ số]}],traps:[...],chests:[...],portals:[[a,b],...],
          water:[ô nước rải rác],sand:[ô cát rải rác],paths:[đườngTrắng,đườngĐen] (BFS thuần, khớp Core.dist),costs:[chi phí Trắng,Đen] (ô nước tính 2: vào nước + lượt đứng yên),attempt,fallback}
     clusters có thêm kind 'water' (con sông, biome river) và 'sand' (vùng cát góc, biome desert); nước/cát rải rác nằm riêng trong water[] / sand[].
     Core.make(Core.ruleset('chaos')).newState({spawn:m.spawn,terr:m.terr})     // dựng ván từ map

   Mã ô (terr): 0 thường · 1 đá (CAO) · 2 cỏ · 3 băng · 4 bẫy · 5 rương · 6 cổng · 7 nước · 8 cát · 9 đá THẤP (chỉ biome núi).   (Nước/cát đi qua được; luật riêng của chúng nằm ở js/core.js: hai ô nước/cát kề nhau thì cạnh chung không đặt tường được; bước vào nước thì lượt sau chỉ được đặt tường.)   Chỉ số ô = r*N+c. Trắng xuất phát hàng N-1, đi tới hàng 0; Đen ngược lại.

   Quy tắc sinh (bản 9×9; mọi con số nằm ở nhóm hằng số ngay dưới, chỉnh một chỗ):
     • 2 hàng đầu và 2 hàng cuối luôn trống (vùng spawn, SAFE); mọi ô đặc biệt chỉ mọc ở 5 hàng giữa. Mỗi bên spawn ở cột ngẫu nhiên, độc lập nhau.
     • Đá, cỏ, băng: mỗi cụm 2–5 ô. Hình: khối đặc (lump), tròn (round), bầu dục (oval), dải (ridge), ôm đá (wrap), uốn lượn (meander) — tùy loại.
       Đá không bao giờ có lỗ/ô bị bao kín (kể cả giữa hai cụm đá hoặc giữa đá và mép bàn), nên cổng, rương, bẫy không rơi vào chỗ kẹt.
     • Biome: rừng nhiều cỏ, núi nhiều đá, tuyết nhiều băng. Loại nổi bật 2–3 cụm, kích thước nửa trên khoảng; loại còn lại 0–1 cụm, nửa dưới.
       Các cụm của loại nổi bật mọc quanh một điểm neo (bán kính ANCHOR_RAD) nên gom thành vùng. Biome 'balanced' (tùy chọn, mặc định tắt): mỗi loại 1–2 cụm, toàn khoảng kích thước.
     • Biome SÔNG (river): một con sông nước chạy ngang bàn từ cột 0 tới cột N-1 (đường uốn ngẫu nhiên, thỉnh thoảng dày 2 ô), liền cạnh và kín hết bề ngang nên cả hai bên PHẢI lội qua
       (mỗi ô nước = 1 lượt bước vào + 1 lượt đứng yên). Đá/cỏ/băng chỉ còn rải nhẹ (0–1 cụm mỗi loại, kích thước nửa dưới).
     • Biome SA MẠC (desert): 2 trong 4 góc của vùng giữa mọc một cụm cát lớn (7–11 ô, hình tròn mọc từ góc). Không có băng, ít cỏ (0–1 cụm nhỏ), đá 1–2 cụm nửa trên.
     • Nước rải rác (1–3 ô) mọc sát ô băng, cát rải rác (1–3 ô) mọc sát ô đá — chỉ ở các map thường (không phải sông / sa mạc tương ứng); ô mới ưu tiên dính vào ô cùng loại đã đặt nên thành vũng nhỏ.
       Không có băng/đá thì không có nước/cát rải rác.
     • Các cụm có thể sát cạnh nhau nhưng không chồng lên nhau; mỗi cụm là một khối liền cạnh.
     • Bẫy 1–2 ô đứng lẻ · "rương" 1–3 (hiện là ô giữ chỗ cho vật phẩm sẽ thiết kế sau, chưa có hiệu ứng) · cổng 0–1 cặp (hai đầu cách nhau ≥ 4 ô, lệch nhau tối đa 2 hàng; biome sông không có cổng vì cổng nối hai bờ sẽ bỏ qua việc lội sông).
       Rương ưu tiên hốc đá hẹp và rìa cụm cỏ; cổng đặt ở chỗ vắng nhất (ít đá/cỏ/băng/rương/bẫy quanh nhất).
     • Hợp lệ khi cả hai bên có đường về đích (bẫy, rương, cổng, nước, cát đi qua được; cổng nối hai đầu như một cạnh) và chênh lệch CHI PHÍ đường đi ban đầu ≤ maxDiff (mặc định MAXDIFF; ô nước tính 2).
       Không đạt thì đổi seed phụ và sinh lại (tối đa MAXTRY lần); nếu vẫn không đạt thì trả bàn trống (fallback:true).

   Đá thấp (biome núi, xem js/core.js mục "Độ cao"): bậc 1 (cao 0,35), đá cao bậc 2 (0,7), còn lại bậc 0; chỉ đi giữa hai ô chênh ≤ 1 bậc, nên đá cao CHỈ vào được từ đá thấp.
     Sinh bằng addFoothills (bước hậu kỳ, PRNG con nên không đổi dãy số cũ): mỗi cụm đá cao 1-3 ô đá thấp ở ô thường kề nó, tối đa 6 ô cả bản đồ, chỉ ở 5 hàng giữa; clusters có thêm kind 'low' (shape 'foothill'),
     m.low = các ô đá thấp. pathDist/pathCost tính theo bậc (khớp Core.dist); phải còn cân bằng (chênh chi phí ≤ maxDiff) không thì bỏ đá thấp, trả đúng map như trước đây. map không phải núi không đổi.
     (không đổi định dạng serialize: mã 9 nằm trong chuỗi chữ số.)

   opts (tùy chọn): {foothills:false (tắt đá thấp), biome:'forest'|'mountain'|'snow'|'river'|'desert'|'balanced', balancedChance:0..1, maxDiff, traps:[lo,hi], chests:[lo,hi], portalPairs:[lo,hi], waterDots:[lo,hi], sandDots:[lo,hi]} */
const MapGen=(function(){
  const T={FLOOR:0,STONE:1,BRUSH:2,ICE:3,TRAP:4,CHEST:5,PORTAL:6,WATER:7,SAND:8,LOW:9};
  const N=9,SAFE=2,MAXTRY=60,D4=[[-1,0],[1,0],[0,-1],[0,1]];
  const KINDS={
    stone:{type:T.STONE,size:[2,5],shapes:['lump','oval','ridge']},
    brush:{type:T.BRUSH,size:[2,5],shapes:['lump','oval','wrap','wrap','meander']},
    ice:{type:T.ICE,size:[2,5],shapes:['round','oval','lump']},
    /* hai loại dưới không đi qua vòng sinh cụm thường: sông và cát góc sa mạc có đường sinh riêng; size dùng để kiểm tra */
    water:{type:T.WATER,size:[9,26],shapes:['river']},
    sand:{type:T.SAND,size:[7,11],shapes:['corner']},
    /* đá thấp (chân núi) không mọc như cụm thường: là bước hậu kỳ của biome núi (addFoothills), mỗi cụm đá cao có 1-3 ô */
    low:{type:T.LOW,size:[1,3],shapes:['foothill']}
  };
  /* Số cụm theo biome: loại nổi bật / loại còn lại / biome cân bằng (mỗi loại) */
  /* Mặc định cho ô lẻ (opts.traps / chests / portalPairs ghi đè được) */
  const DEFAULTS={traps:[1,2],chests:[1,3],portalPairs:[0,1],waterDots:[1,3],sandDots:[1,3]};
  const HOLE_FILL=2;   /* lỗ nhỏ hơn thế này thì lấp, lớn hơn thì bỏ cụm */
  const MAXDIFF=2;     /* chênh lệch đường đi ban đầu tối đa giữa hai bên (opts.maxDiff ghi đè) */
  const ANCHOR_RAD=3;  /* bán kính vùng đặc trưng của biome quanh điểm neo */
  const WRAP_SLACK=2;  /* cỏ 'ôm đá' ưu tiên đá nằm trong ANCHOR_RAD+WRAP_SLACK quanh điểm neo */
  const CHEST_GAP=3;   /* khoảng cách Manhattan tối thiểu giữa hai rương */
  const PORTAL={maxRow:2,minDist:4,gap:3};   /* cổng: lệch hàng tối đa · cách nhau tối thiểu giữa hai đầu · cách nhau tối thiểu giữa các cặp */
  const RIVER_TURN=0.5; /* xác suất con sông đổi hàng ở mỗi cột (nửa lên, nửa xuống) */
  const RIVER_WIDE=0.25;/* xác suất mỗi cột sông dày thêm 1 ô */
  const DESERT_CORNERS=2;/* số góc có cụm cát lớn */
  const CROWD_R=2;     /* cổng chọn chỗ vắng nhất trong cửa sổ (2R+1)×(2R+1) */
  const COUNT={dom:[2,3],other:[0,1],balanced:[1,2],desert:[1,2]};   /* desert: số cụm đá của sa mạc */
  const BIOMES=['forest','mountain','snow','river','desert'];
  const FAVORED={forest:'brush',mountain:'stone',snow:'ice'};
  const KIND_ORDER=['stone','brush','ice'];
  const FOOT_MAX_CLUSTER=3,FOOT_MAX_MAP=6,FOOT_TRY=6;   /* đá thấp: tối đa mỗi cụm đá cao · cả bản đồ · số lần thử trước khi bỏ đá thấp */
  const LV=v=>v===T.STONE?2:v===T.LOW?1:0;   /* bậc độ cao của mã ô, y hệt Core.lvl (xem js/core.js, mục Độ cao) */

  /* ----- Số ngẫu nhiên có seed ----- */
  function hashSeed(s){
    if(typeof s==='number'&&Number.isFinite(s))return(s>>>0)^0;
    let h=2166136261>>>0;s=String(s);
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
    return h>>>0;
  }
  function mulberry32(a){
    return function(){a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
  }
  const ri=(rnd,lo,hi)=>lo+Math.floor(rnd()*(hi-lo+1));   /* số nguyên trong [lo,hi] */

  /* ----- Mọc một cụm: trả về mảng chỉ số ô (liền cạnh, nằm trọn trong vùng giữa, chỉ trên ô còn trống) -----
     Mọi hình đều mọc theo kiểu "thêm ô biên có điểm thấp nhất", nên đầy đặn, mép hơi lởm chởm cho tự nhiên:
       lump  khối đặc: ưu tiên ô có nhiều hàng xóm trong cụm (tự lấp chỗ trũng)
       round khối tròn · oval khối bầu dục, trục xoay ngẫu nhiên · twin hai khối dính nhau (hình hạt đậu)
       ridge dải dày: một vệt cong rồi nở thành dải rộng 2–3 ô
       wrap  ôm đá: bắt đầu cạnh một khối đá rồi mọc dọc theo mép đá (không có đá thì thành lump)
       meander dải uốn lượn mềm: vệt đi cong (rẽ cùng chiều là chính) rồi nở dày */
  function growCluster(shape,k,rnd,terr,near,start){
    const set=new Set(),cells=[];
    const free=(r,c)=>r>=SAFE&&r<=N-SAFE-1&&c>=0&&c<N&&terr[r*N+c]===0&&!set.has(r*N+c);
    const has=(r,c)=>r>=0&&r<N&&c>=0&&c<N&&set.has(r*N+c);
    const add=(r,c)=>{set.add(r*N+c);cells.push(r*N+c);};
    const stoneAdj=(r,c)=>{let n=0;for(const[dr,dc]of D4){const r2=r+dr,c2=c+dc;if(r2>=0&&r2<N&&c2>=0&&c2<N&&terr[r2*N+c2]===T.STONE)n++;}return n;};
    let r0=-1,c0=-1;
    if(start&&free(start.r,start.c)){r0=start.r;c0=start.c;}   /* điểm bắt đầu cho trước (cát góc sa mạc) */
    if(shape==='wrap'&&r0<0){   /* điểm bắt đầu: ô trống sát đá (ưu tiên gần điểm neo nếu có) */
      const cand=[];
      for(let r=SAFE;r<=N-SAFE-1;r++)for(let c=0;c<N;c++)if(free(r,c)&&stoneAdj(r,c)>0)cand.push([r,c]);
      let pool=cand;
      if(near){const f=cand.filter(q=>Math.abs(q[0]-near.r)<=near.rad+WRAP_SLACK&&Math.abs(q[1]-near.c)<=near.rad+WRAP_SLACK);if(f.length)pool=f;}
      if(pool.length){const q=pool[Math.floor(rnd()*pool.length)];r0=q[0];c0=q[1];}
      else shape='lump';
    }
    if(r0<0)for(let t=0;t<60;t++){
      let r,c;
      if(near&&t<40){r=near.r+ri(rnd,-near.rad,near.rad);c=near.c+ri(rnd,-near.rad,near.rad);}   /* loại nổi bật: mọc quanh điểm neo của biome */
      else{r=SAFE+Math.floor(rnd()*(N-2*SAFE));c=Math.floor(rnd()*N);}
      if(free(r,c)){r0=r;c0=c;break;}
    }
    if(r0<0)return cells;
    add(r0,c0);

    const frontier=()=>{
      const f=[];
      for(const key of cells){const r=(key/N)|0,c=key%N;for(const[dr,dc]of D4)if(free(r+dr,c+dc))f.push([r+dr,c+dc]);}
      return f;
    };
    /* mọc tới khi đủ lim ô: mỗi lần lấy ô biên có score(r,c)+nhiễu nhỏ nhất */
    const grow=(score,noise,lim)=>{
      while(cells.length<lim){
        const f=frontier();if(!f.length)break;
        let best=null,bs=1e9;
        for(const q of f){const sc=score(q[0],q[1])+rnd()*noise;if(sc<bs){bs=sc;best=q;}}
        add(best[0],best[1]);
      }
    };
    const nbr=(r,c)=>(has(r-1,c)?1:0)+(has(r+1,c)?1:0)+(has(r,c-1)?1:0)+(has(r,c+1)?1:0);
    const lumpScore=(r,c)=>-nbr(r,c)*1.2;
    const dist2=(r,c,cr,cc)=>(r-cr)*(r-cr)+(c-cc)*(c-cc);

    if(shape==='lump')grow(lumpScore,1.6,k);
    else if(shape==='round')grow((r,c)=>dist2(r,c,r0,c0),2.5,k);
    else if(shape==='corner')grow((r,c)=>dist2(r,c,r0,c0),2.0,k);   /* cụm tròn mọc từ góc: thành hình quạt dựa vào mép bàn */
    else if(shape==='oval'){
      const th=rnd()*Math.PI,co=Math.cos(th),si=Math.sin(th),asp=1.6+rnd()*0.9;
      grow((r,c)=>{const dr=r-r0,dc=c-c0,u=(dr*co+dc*si)/asp,v=-dr*si+dc*co;return u*u+v*v;},2.2,k);
    }
    else if(shape==='twin'){
      const d=D4.concat([[-1,-1],[-1,1],[1,-1],[1,1]])[Math.floor(rnd()*8)],sp=Math.max(3,Math.round(Math.sqrt(k)*1.1));
      const r1=r0+d[0]*sp,c1=c0+d[1]*sp;
      grow((r,c)=>Math.min(dist2(r,c,r0,c0),dist2(r,c,r1,c1)),2.2,k);
    }
    else if(shape==='ridge'){   /* vệt cong dài ~nửa số ô, sau đó nở thành dải dày */
      const lim=Math.max(3,Math.ceil(k*0.5));
      let dir=D4[Math.floor(rnd()*4)],hr=r0,hc=c0,flipped=false;
      while(cells.length<lim){
        let moved=false;
        if(rnd()<.72&&free(hr+dir[0],hc+dir[1])){hr+=dir[0];hc+=dir[1];add(hr,hc);moved=true;}
        else{
          const cand=D4.filter(d=>!(d[0]===-dir[0]&&d[1]===-dir[1])&&free(hr+d[0],hc+d[1]));
          if(cand.length){dir=cand[Math.floor(rnd()*cand.length)];hr+=dir[0];hc+=dir[1];add(hr,hc);moved=true;}
        }
        if(!moved){if(flipped)break;flipped=true;hr=r0;hc=c0;dir=[-dir[0],-dir[1]];}
      }
      grow(lumpScore,1.2,k);
    }
    else if(shape==='wrap'){   /* ưu tiên ô sát đá + nhiều hàng xóm trong cụm: thành dải cong ôm quanh đá */
      grow((r,c)=>-stoneAdj(r,c)*2.2-nbr(r,c)*0.7,1.8,k);
    }
    else if(shape==='meander'){
      const lim=Math.max(4,Math.ceil(k*0.45)),rot=(d,sg)=>sg>0?[d[1],-d[0]]:[-d[1],d[0]];
      let dir=D4[Math.floor(rnd()*4)],hr=r0,hc=c0,sgn=rnd()<.5?1:-1,flipped=false;
      while(cells.length<lim){
        const nd=rnd()<.35?rot(dir,rnd()<.8?sgn:-sgn):dir;   /* phần lớn đi thẳng, thỉnh thoảng rẽ — chủ yếu cùng một phía nên cong dần */
        if(free(hr+nd[0],hc+nd[1])){dir=nd;hr+=nd[0];hc+=nd[1];add(hr,hc);}
        else{if(flipped)break;flipped=true;hr=r0;hc=c0;dir=[-dir[0],-dir[1]];sgn=-sgn;}
      }
      grow(lumpScore,1.4,k);
    }
    return cells;
  }

  /* Các ô có cùng liền cạnh không */
  function connectedCells(arr){
    if(!arr.length)return true;
    const set=new Set(arr),seen=new Set([arr[0]]),q=[arr[0]];
    for(let h=0;h<q.length;h++){
      const r=(q[h]/N)|0,c=q[h]%N;
      for(const[dr,dc]of D4){const r2=r+dr,c2=c+dc;if(r2<0||r2>=N||c2<0||c2>=N)continue;const k=r2*N+c2;if(set.has(k)&&!seen.has(k)){seen.add(k);q.push(k);}}
    }
    return seen.size===set.size;
  }
  /* Làm viền lưa thưa: bỏ bớt (tối đa drop·số ô) ô ở rìa, ngẫu nhiên, sao cho cụm vẫn liền cạnh và còn ≥ keepMin ô */
  function thin(cells,rnd,drop,keepMin){
    const set=new Set(cells),order=cells.slice();
    for(let i=order.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    let removed=0;const target=Math.round(cells.length*drop);
    for(const k of order){
      if(removed>=target||set.size<=keepMin)break;
      const r=(k/N)|0,c=k%N;let nb=0;
      for(const[dr,dc]of D4){const r2=r+dr,c2=c+dc;if(r2>=0&&r2<N&&c2>=0&&c2<N&&set.has(r2*N+c2))nb++;}
      if(nb>=4||nb===0||rnd()<.35)continue;   /* chỉ ô ở rìa; chừa lại một phần để mép không đều đặn */
      set.delete(k);
      if(!connectedCells(Array.from(set))){set.add(k);continue;}
      removed++;
    }
    return cells.filter(k=>set.has(k));
  }

  /* Các ô "lỗ": ô không bị chặn mà không loang tới được từ ngoài — kể cả ô kẹt giữa cụm và mép bàn.
     "Bị chặn" = ô của cụm đang xét + mọi ô đã có thuộc các loại trong types (đá; hoặc cỏ + đá; hoặc băng + đá).
     Tính cả các cụm cùng loại sát nhau, vì nhiều cụm liền nhau hợp thành một vùng và có thể ôm một khoảng trống bên trong.
     Loang 4 hướng từ ô (0,0) (hàng spawn luôn trống). Trả về mảng chỉ số ô lỗ (rỗng = không có lỗ). */
  function findHoles(terr,cells,types){
    const block=new Uint8Array(N*N);
    for(let k=0;k<N*N;k++)if(types.includes(terr[k]))block[k]=1;
    for(const k of cells)block[k]=1;
    const seen=new Uint8Array(N*N),q=[0];seen[0]=1;
    for(let h=0;h<q.length;h++){
      const r=(q[h]/N)|0,c=q[h]%N;
      for(const[dr,dc]of D4){
        const r2=r+dr,c2=c+dc;if(r2<0||r2>=N||c2<0||c2>=N)continue;
        const k2=r2*N+c2;if(seen[k2]||block[k2])continue;seen[k2]=1;q.push(k2);
      }
    }
    const out=[];
    for(let k=0;k<N*N;k++)if(!block[k]&&!seen[k])out.push(k);
    return out;
  }

  /* ----- Đường đi ngắn nhất (BFS) của bên p trên map; cổng nối hai đầu; trả Infinity nếu không tới được ----- */
  function pathDist(m,p){
    const from=p===0?(N-1)*N+m.spawn[0]:m.spawn[1],goal=p===0?0:N-1;
    const seen=new Int16Array(N*N).fill(-1),q=[from],link=new Map();
    for(const pr of m.portals){link.set(pr[0],pr[1]);link.set(pr[1],pr[0]);}
    seen[from]=0;
    for(let h=0;h<q.length;h++){
      const k=q[h],r=(k/N)|0,c=k%N;
      if(r===goal)return seen[k];
      const nb=[];
      for(const[dr,dc]of D4){const r2=r+dr,c2=c+dc;if(r2>=0&&r2<N&&c2>=0&&c2<N)nb.push(r2*N+c2);}
      if(link.has(k))nb.push(link.get(k));
      for(const k2 of nb){if(seen[k2]>=0||Math.abs(LV(m.terr[k])-LV(m.terr[k2]))>1)continue;seen[k2]=seen[k]+1;q.push(k2);}   /* chênh quá 1 bậc là không đi được (đá cao chỉ vào từ đá thấp); map chưa có tường */
    }
    return Infinity;
  }

  /* ----- Chi phí đường đi (Dijkstra): như pathDist nhưng ô nước tính 2 (một lượt bước vào + một lượt đứng yên). Dùng để cân bằng hai bên, vì cả hai đều phải lội sông ----- */
  function pathCost(m,p){
    const from=p===0?(N-1)*N+m.spawn[0]:m.spawn[1],goal=p===0?0:N-1;
    const best=new Array(N*N).fill(Infinity),done=new Uint8Array(N*N),link=new Map();
    for(const pr of m.portals){link.set(pr[0],pr[1]);link.set(pr[1],pr[0]);}
    best[from]=0;
    for(;;){
      let k=-1,bd=Infinity;
      for(let i=0;i<N*N;i++)if(!done[i]&&best[i]<bd){bd=best[i];k=i;}
      if(k<0)return Infinity;
      const r=(k/N)|0,c=k%N;
      if(r===goal)return bd;
      done[k]=1;
      const nb=[];
      for(const[dr,dc]of D4){const r2=r+dr,c2=c+dc;if(r2>=0&&r2<N&&c2>=0&&c2<N)nb.push(r2*N+c2);}
      if(link.has(k))nb.push(link.get(k));
      for(const k2 of nb){
        if(Math.abs(LV(m.terr[k])-LV(m.terr[k2]))>1)continue;
        const w=m.terr[k2]===T.WATER?2:1;
        if(bd+w<best[k2])best[k2]=bd+w;
      }
    }
  }

  /* ----- Con sông: một đường liền cạnh từ cột 0 tới cột N-1 (mỗi cột ≥ 1 ô, đổi hàng ngẫu nhiên, thỉnh thoảng dày thêm 1 ô) nên chặn kín mọi đường đi dọc bàn ----- */
  function carveRiver(rnd){
    const lo=SAFE+1,hi=N-SAFE-2,set=new Set();
    let r=ri(rnd,lo,hi);
    for(let c=0;c<N;c++){
      if(c>0){
        const t=rnd();let nr=r;
        if(t<RIVER_TURN/2)nr=r-1;else if(t<RIVER_TURN)nr=r+1;
        nr=Math.max(lo,Math.min(hi,nr));
        if(nr!==r){set.add(r*N+c);r=nr;}   /* thêm ô góc để hai đoạn liền cạnh (không chỉ chéo) */
      }
      set.add(r*N+c);
      if(rnd()<RIVER_WIDE){const e=rnd()<.5?r-1:r+1;if(e>=SAFE&&e<=N-SAFE-1)set.add(e*N+c);}
    }
    return Array.from(set);
  }

  /* ----- Dựng một map (chưa kiểm tra hợp lệ) ----- */
  function build(rnd,opts){
    const terr=new Uint8Array(N*N),clusters=[];
    let biome=opts.biome;
    if(!biome){
      const bc=opts.balancedChance||0;
      biome=rnd()<bc?'balanced':BIOMES[Math.floor(rnd()*BIOMES.length)];
    }
    const anchor={r:ri(rnd,SAFE+1,N-SAFE-2),c:ri(rnd,2,N-3),rad:ANCHOR_RAD};   /* tâm vùng đặc trưng của biome */
    let spec_shape='';
    /* địa hình đặc trưng của biome đặt TRƯỚC để các cụm thường tránh chúng */
    if(biome==='river'){
      const cells=carveRiver(rnd);
      for(const k of cells)terr[k]=T.WATER;
      clusters.push({kind:'water',shape:'river',cells});
    }
    if(biome==='desert'){
      const pts=[[SAFE,0],[SAFE,N-1],[N-SAFE-1,0],[N-SAFE-1,N-1]],pick=[];   /* 4 góc của vùng giữa */
      while(pick.length<DESERT_CORNERS){const i=Math.floor(rnd()*4);if(!pick.includes(i))pick.push(i);}
      for(const i of pick){
        const cr=pts[i][0],cc=pts[i][1],top=cr===SAFE,left=cc===0;
        for(let t=0;t<6;t++){   /* điểm bắt đầu lệch vào trong tối đa 1 ô; cụm phải thật sự mọc từ góc (không bị cụm kia chiếm chỗ) mới nhận */
          const start={r:cr+(top?1:-1)*ri(rnd,0,1),c:cc+(left?1:-1)*ri(rnd,0,1)};
          const g=growCluster('corner',ri(rnd,KINDS.sand.size[0],KINDS.sand.size[1]),rnd,terr,null,start);
          if(g.length>=KINDS.sand.size[0]&&g.includes(start.r*N+start.c)){for(const q of g)terr[q]=T.SAND;clusters.push({kind:'sand',shape:'corner',cells:g});break;}
        }
      }
    }
    /* đá đặt trước (để cỏ 'ôm' được đá và đá luôn được kiểm lỗ trên chính nó); cỏ/băng đổi thứ tự ngẫu nhiên để không loại nào luôn được ưu tiên chỗ */
    const rest=['brush','ice'];if(rnd()<.5)rest.reverse();
    const kinds=['stone'].concat(rest);
    for(const kind of kinds){
      const spec=KINDS[kind],[smin,smax]=spec.size,mid=(smin+smax)/2;
      const dom=FAVORED[biome]===kind;
      let cnt,sz;
      if(biome==='balanced'){cnt=COUNT.balanced;sz=[smin,smax];}
      else if(biome==='desert'&&kind==='ice'){cnt=[0,0];sz=[smin,smax];}   /* sa mạc: không có băng */
      else if(biome==='desert'&&kind==='stone'){cnt=COUNT.desert;sz=[Math.ceil(mid),smax];}
      else if(dom){cnt=COUNT.dom;sz=[Math.ceil(mid),smax];}
      else{cnt=COUNT.other;sz=[smin,Math.floor(mid)];}
      const n=ri(rnd,cnt[0],cnt[1]);
      for(let i=0;i<n;i++){
        let cells=[];
        for(let t=0;t<8&&!cells.length;t++){   /* cụm bị lỗ hoặc không đủ chỗ thì mọc lại ở chỗ khác */
          const shape=spec.shapes[Math.floor(rnd()*spec.shapes.length)],k=ri(rnd,sz[0],sz[1]);
          let g;
          if(kind==='brush'){   /* cỏ: mọc dư ~20% rồi tỉa rìa cho lưa thưa */
            g=growCluster(shape,Math.min(smax,Math.round(k*1.2)),rnd,terr,dom?anchor:null);
            if(g.length>=smin)g=thin(g,rnd,.2,Math.max(smin,k-2));
          }else g=growCluster(shape,k,rnd,terr,dom?anchor:null);
          if(g.length>=smin){
            /* lỗ (kể cả lỗ do nhiều cụm cùng loại ôm nhau): nhỏ và toàn ô trống thì lấp vào cụm (nếu cụm vẫn ≤ cỡ tối đa và liền cạnh), còn lại bỏ cụm này */
            const holes=findHoles(terr,g,kind==='stone'?[T.STONE]:[spec.type,T.STONE]);
            if(holes.length){
              const g2=g.concat(holes);
              g=(holes.length<=HOLE_FILL&&g2.length<=smax&&holes.every(q=>terr[q]===0)&&connectedCells(g2))?g2:[];
            }
          }
          if(g.length>=smin){cells=g;spec_shape=shape;}
        }
        if(!cells.length)continue;
        for(const c of cells)terr[c]=spec.type;
        clusters.push({kind,shape:spec_shape,cells});
      }
    }
    /* ----- ô lẻ: rương, bẫy, cổng — chỉ trong vùng giữa ----- */
    const R0=SAFE,R1=N-SAFE-1,inMid=(r,c)=>r>=R0&&r<=R1&&c>=0&&c<N;
    const at=(r,c)=>r>=0&&r<N&&c>=0&&c<N?terr[r*N+c]:-1;
    const cnt4=(r,c,v)=>D4.reduce((n,d)=>n+(at(r+d[0],c+d[1])===v?1:0),0);
    const cnt8=(r,c,v)=>{let n=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&at(r+dr,c+dc)===v)n++;return n;};
    const pickFree=(avoid)=>{
      for(let t=0;t<80;t++){
        const r=SAFE+Math.floor(rnd()*(N-2*SAFE)),c=Math.floor(rnd()*N),k=r*N+c;
        if(terr[k]===0&&(!avoid||avoid(r,c)))return k;
      }
      return -1;
    };
    const traps=[],chests=[],portals=[];
    const tr=opts.traps||DEFAULTS.traps,ch=opts.chests||DEFAULTS.chests,pp=biome==='river'?[0,0]:(opts.portalPairs||DEFAULTS.portalPairs);   /* sông: không cổng, vì cổng nối hai bờ sẽ cho đi tắt không lội nước */

    /* Nước rải rác sát ô băng, cát rải rác sát ô đá (chỉ ô trống ở vùng giữa). Ô mới ưu tiên (x3) dính vào ô cùng loại đã đặt → thành vũng nhỏ.
       Sông không rải thêm nước, sa mạc không rải thêm cát (đã có vùng riêng). Không có băng/đá thì không có gì để mọc cạnh. */
    const water=[],sand=[];
    const scatter=(type,nearType,range,out)=>{
      for(let i=ri(rnd,range[0],range[1]);i>0;i--){
        let tot=0;const cand=[];
        for(let r=R0;r<=R1;r++)for(let c=0;c<N;c++){
          if(terr[r*N+c]!==0||cnt4(r,c,nearType)===0)continue;
          const w=cnt4(r,c,type)>0?3:1;tot+=w;cand.push([r*N+c,w]);
        }
        if(!cand.length)break;
        let x=rnd()*tot,k=cand[cand.length-1][0];
        for(const[kk,w]of cand){x-=w;if(x<=0){k=kk;break;}}
        terr[k]=type;out.push(k);
      }
    };
    if(biome!=='river')scatter(T.WATER,T.ICE,opts.waterDots||DEFAULTS.waterDots,water);
    if(biome!=='desert')scatter(T.SAND,T.STONE,opts.sandDots||DEFAULTS.sandDots,sand);

    /* Rương (ô giữ chỗ cho vật phẩm sau này): chọn theo trọng số — hốc đá hẹp (ô trống kẹp giữa 2–3 ô đá) nhiều nhất, rồi rìa cụm cỏ; ô trống thường vẫn có chút xác suất.
       Nhánh 'tâm cụm băng' giữ lại nhưng cụm tối đa 5 ô nên không bao giờ có ô đủ 8 hàng xóm băng. Các rương cách nhau ≥ CHEST_GAP ô. */
    const owner=new Map();clusters.forEach((cl,i)=>{for(const k of cl.cells)owner.set(k,i);});
    const chestWeight=(r,c)=>{
      const k=r*N+c,v=terr[k];
      for(const q of chests)if(Math.abs(((q/N)|0)-r)+Math.abs(q%N-c)<CHEST_GAP)return 0;
      if(v===T.FLOOR){
        let w=0.1;
        const s4=cnt4(r,c,T.STONE),s8=cnt8(r,c,T.STONE);
        if(s4>=3)w=12;
        else if(s4===2){const opp=(at(r-1,c)===T.STONE&&at(r+1,c)===T.STONE)||(at(r,c-1)===T.STONE&&at(r,c+1)===T.STONE);w=opp?7:3.5;}
        else if(s4===1&&s8>=4)w=2.5;
        if(cnt4(r,c,T.BRUSH)>=1)w=Math.max(w,4);
        return w;
      }
      if(v===T.ICE&&cnt8(r,c,T.ICE)===8){
        const cl=clusters[owner.get(k)];
        if(cl&&cl.cells.length>KINDS.ice.size[0]&&connectedCells(cl.cells.filter(q=>q!==k)))return 9;
      }
      return 0;
    };
    for(let i=ri(rnd,ch[0],ch[1]);i>0;i--){
      let tot=0;const cand=[];
      for(let r=R0;r<=R1;r++)for(let c=0;c<N;c++){const w=chestWeight(r,c);if(w>0){tot+=w;cand.push([r*N+c,w]);}}
      if(!cand.length)break;
      let x=rnd()*tot,k=cand[cand.length-1][0];
      for(const[kk,w]of cand){x-=w;if(x<=0){k=kk;break;}}
      if(terr[k]===T.ICE){const cl=clusters[owner.get(k)];cl.cells=cl.cells.filter(q=>q!==k);owner.delete(k);}
      terr[k]=T.CHEST;chests.push(k);
    }
    for(let i=ri(rnd,tr[0],tr[1]);i>0;i--){
      const k=pickFree((r,c)=>!D4.some(d=>{const r2=r+d[0],c2=c+d[1];return r2>=0&&r2<N&&c2>=0&&c2<N&&terr[r2*N+c2]===T.TRAP;}));   /* bẫy đứng một mình */
      if(k>=0){terr[k]=T.TRAP;traps.push(k);}
    }
    /* Cổng: đặt ở chỗ trống vắng nhất — "độ đông" = số ô đặc biệt trong cửa sổ (2·CROWD_R+1)² (đá tính gấp đôi) chia số ô của cửa sổ, thấp nhất thắng.
       Hai đầu cách nhau ≥ PORTAL.minDist ô, lệch nhau tối đa PORTAL.maxRow hàng (cổng dịch chuyển ngang, không để bỏ qua cả quãng đường); các cổng cách nhau ≥ PORTAL.gap ô. */
    const crowd=(r,c)=>{let s=0,n=0;for(let dr=-CROWD_R;dr<=CROWD_R;dr++)for(let dc=-CROWD_R;dc<=CROWD_R;dc++){const r2=r+dr,c2=c+dc;if(!inMid(r2,c2))continue;n++;const v=terr[r2*N+c2];if(v)s+=v===T.STONE?2:1;}return s/n;};
    for(let i=ri(rnd,pp[0],pp[1]);i>0;i--){
      const cand=[];
      for(let r=R0;r<=R1;r++)for(let c=0;c<N;c++)if(terr[r*N+c]===0&&portals.every(p=>p.every(q=>Math.abs(((q/N)|0)-r)+Math.abs(q%N-c)>=PORTAL.gap)))cand.push([r*N+c,crowd(r,c)+rnd()*0.15]);
      cand.sort((x,y)=>x[1]-y[1]);
      for(let t=0;t<Math.min(cand.length,10);t++){
        const a=cand[t][0],ar=(a/N)|0,ac=a%N;
        const b=cand.find(q=>{const r=(q[0]/N)|0,c=q[0]%N;return Math.abs(r-ar)<=PORTAL.maxRow&&Math.abs(r-ar)+Math.abs(c-ac)>=PORTAL.minDist;});
        if(b){terr[a]=T.PORTAL;terr[b[0]]=T.PORTAL;portals.push([a,b[0]]);break;}
      }
    }
    const spawn=[Math.floor(rnd()*N),Math.floor(rnd()*N)];
    return{biome,N,terr,spawn,clusters,traps,chests,portals,water,sand};
  }

  /* ----- Chân núi (đá thấp): bước hậu kỳ của biome núi. Mỗi cụm đá cao mọc 1-3 ô đá thấp ở ô thường kề nó (ô sau ưu tiên kề ô thấp trước → bậc thang ngắn).
     Chỉ thay ô thường (terr 0) trong 5 hàng giữa, nên không đè rương/bẫy/cổng/nước/cát/cỏ/băng. Mỗi ô phải có "dốc" (kề ít nhất một ô không phải đá) và không được làm
     ô không phải đá nào bị bao kín (mọi ô không phải đá vẫn liền một khối). Trả {terr,low,clusters} (terr là bản sao), null nếu không mọc được ô nào. Không đụng map gốc. ----- */
  function addFoothills(m,rnd2){
    const terr=Uint8Array.from(m.terr),low=[],clusters=[],lastRow=N-SAFE-1;
    const inb=(r,c)=>r>=0&&r<N&&c>=0&&c<N;
    const free=(r,c)=>inb(r,c)&&terr[r*N+c]!==T.STONE&&terr[r*N+c]!==T.LOW;   /* ô trong bàn, không phải đá */
    const freeNb=(r,c)=>D4.reduce((n,d)=>n+(free(r+d[0],c+d[1])?1:0),0);
    /* mọi ô không phải đá còn liền một khối (loang 4 hướng từ ô (0,0), luôn trống) = đá thấp không bao kín ô nào */
    const allReachable=()=>{
      const seen=new Uint8Array(N*N),q=[0];seen[0]=1;let n=1,total=0;
      for(let k=0;k<N*N;k++)if(terr[k]!==T.STONE&&terr[k]!==T.LOW)total++;
      for(let h=0;h<q.length;h++){const r=(q[h]/N)|0,c=q[h]%N;for(const d of D4){const r2=r+d[0],c2=c+d[1];if(!free(r2,c2)||seen[r2*N+c2])continue;seen[r2*N+c2]=1;n++;q.push(r2*N+c2);}}
      return n===total;
    };
    for(const cl of m.clusters){
      if(cl.kind!=='stone'||low.length>=FOOT_MAX_MAP)continue;
      const set=new Set(cl.cells),mine=[],want=ri(rnd2,1,FOOT_MAX_CLUSTER);
      for(let i=0;i<want&&low.length<FOOT_MAX_MAP;i++){
        const cand=[];let tot=0;
        for(let r=SAFE;r<=lastRow;r++)for(let c=0;c<N;c++){
          const k=r*N+c;if(terr[k]!==T.FLOOR)continue;
          let adjHigh=0,adjMine=0;
          for(const d of D4){const k2=(r+d[0])*N+c+d[1];if(!inb(r+d[0],c+d[1]))continue;if(set.has(k2))adjHigh++;if(mine.includes(k2))adjMine++;}
          if(!adjHigh&&!adjMine)continue;
          if(freeNb(r,c)===0)continue;   /* phải có dốc để bước lên */
          terr[k]=T.LOW;const sealed=!allReachable();terr[k]=T.FLOOR;   /* thử: biến thành đá thấp có bao kín ô nào không */
          if(sealed)continue;
          const w=1+adjHigh+(i>0?2*adjMine:0);tot+=w;cand.push([k,w]);
        }
        if(!cand.length)break;
        let x=rnd2()*tot,pk=cand[cand.length-1][0];
        for(const[kk,w]of cand){x-=w;if(x<=0){pk=kk;break;}}
        terr[pk]=T.LOW;mine.push(pk);low.push(pk);
      }
      if(mine.length)clusters.push({kind:'low',shape:'foothill',cells:mine});
    }
    return low.length?{terr,low,clusters}:null;
  }

  function generate(seed,opts){
    opts=opts||{};
    const base=hashSeed(seed),maxDiff=opts.maxDiff===undefined?MAXDIFF:opts.maxDiff;
    for(let attempt=0;attempt<MAXTRY;attempt++){
      const rnd=mulberry32((base+Math.imul(attempt,0x9E3779B1))>>>0);
      const m=build(rnd,opts);
      const d0=pathDist(m,0),d1=pathDist(m,1);
      if(d0===Infinity||d1===Infinity)continue;
      if(m.biome==='desert'&&m.clusters.filter(c=>c.kind==='sand').length<DESERT_CORNERS)continue;   /* sa mạc phải đủ cụm cát ở các góc */
      const c0=pathCost(m,0),c1=pathCost(m,1);   /* cân bằng theo chi phí (nước tính 2), không theo số ô thuần */
      if(Math.abs(c0-c1)>maxDiff)continue;
      m.seed=seed;m.attempt=attempt;m.paths=[d0,d1];m.costs=[c0,c1];m.fallback=false;m.low=[];
      /* Biome núi: thử thêm đá thấp bằng PRNG con (không đụng dãy số của bản gốc, nên cùng seed vẫn ra đúng các cụm đá cao cũ). Phải qua lại kiểm tra cân bằng bằng luật độ cao;
         không đạt sau FOOT_TRY lần thì giữ map gốc (không bao giờ tệ hơn trước). opts.foothills===false tắt hẳn. */
      if(m.biome==='mountain'&&opts.foothills!==false){
        for(let t=0;t<FOOT_TRY;t++){
          const rnd2=mulberry32((base^0x10C5^Math.imul(attempt+1,0x85EBCA6B)^Math.imul(t+1,0xC2B2AE35))>>>0),f=addFoothills(m,rnd2);
          if(!f)break;
          const mm={terr:f.terr,spawn:m.spawn,portals:m.portals},e0=pathDist(mm,0),e1=pathDist(mm,1);
          if(e0===Infinity||e1===Infinity)continue;
          const g0=pathCost(mm,0),g1=pathCost(mm,1);
          if(Math.abs(g0-g1)>maxDiff)continue;
          m.terr=f.terr;m.low=f.low;for(const cl of f.clusters)m.clusters.push(cl);
          m.paths=[e0,e1];m.costs=[g0,g1];
          break;
        }
      }
      return m;
    }
    /* hết cách: bàn trống, cột giữa (không bao giờ xảy ra với các tham số mặc định; có để server không bao giờ kẹt) */
    const m={biome:opts.biome||'balanced',N,terr:new Uint8Array(N*N),spawn:[N>>1,N>>1],clusters:[],traps:[],chests:[],portals:[],water:[],sand:[],low:[]};
    m.seed=seed;m.attempt=MAXTRY;m.paths=[N-1,N-1];m.costs=[N-1,N-1];m.fallback=true;
    return m;
  }

  /* ----- Gửi qua mạng: object thuần JSON, terr là chuỗi N*N chữ số (81 chữ số) ----- */
  function serialize(m){
    return{v:1,seed:m.seed,biome:m.biome,N:m.N,terr:Array.from(m.terr).join(''),spawn:m.spawn.slice(),
           traps:m.traps.slice(),chests:m.chests.slice(),portals:m.portals.map(p=>p.slice())};
  }
  function deserialize(o){
    const terr=Uint8Array.from(o.terr,ch=>ch.charCodeAt(0)-48),low=[];terr.forEach((v,i)=>{if(v===T.LOW)low.push(i);});   /* mã 9 đi qua chuỗi chữ số, không đổi định dạng */
    return{seed:o.seed,biome:o.biome,N:o.N,terr,spawn:o.spawn.slice(),low,
           clusters:[],traps:o.traps.slice(),chests:o.chests.slice(),portals:o.portals.map(p=>p.slice())};
  }

  /* ----- In ra chữ để xem nhanh (công cụ dòng lệnh dùng): W/B = chỗ spawn của Trắng/Đen ----- */
  const CH={0:'.',1:'#',2:'"',3:'~',4:'^',5:'$',7:'=',8:':',9:'o'};   /* # đá cao · o đá thấp */
  function ascii(m){
    const link=new Map();m.portals.forEach((p,i)=>{link.set(p[0],String.fromCharCode(65+i));link.set(p[1],String.fromCharCode(65+i));});
    const rows=[];
    for(let r=0;r<N;r++){
      let s='';
      for(let c=0;c<N;c++){
        const k=r*N+c;let ch=CH[m.terr[k]];
        if(m.terr[k]===T.PORTAL)ch=link.get(k)||'O';
        if(r===N-1&&c===m.spawn[0])ch='W';
        if(r===0&&c===m.spawn[1])ch='B';
        s+=ch;
      }
      rows.push(s);
    }
    return rows.join('\n');
  }

  return{T,N,SAFE,MAXTRY,MAXDIFF,CHEST_GAP,PORTAL,KINDS,COUNT,DEFAULTS,BIOMES,generate,addFoothills,serialize,deserialize,pathDist,pathCost,ascii,LV,hashSeed,mulberry32};
})();
if(typeof module!=='undefined')module.exports=MapGen;   /* để server/tools Node nạp được; trên trình duyệt đoạn này bị bỏ qua */
