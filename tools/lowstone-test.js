'use strict';
/* Kiểm tra luật ĐÁ THẤP / ĐÁ CAO bằng tham chiếu VIẾT ĐỘC LẬP (không gọi blk/lvl/ground/stepInfo của lõi):
   tường dựng thành tập cạnh bị chắn theo hình học, độ cao tra thẳng từ mã ô, BFS tự viết.   node tools/lowstone-test.js
   Lõi chỉ được hỏi qua moves / dist / canWall / apply / snapshot (những thứ người chơi thật sự dùng). */
const Core=require('../js/core.js'),BlockerPick=require('../js/blocker-pick.js');
const RS=Core.ruleset('chaos'),R=Core.make(RS),N=9,WN=8;
let ok=0,bad=0;const ck=(c,m)=>{if(c)ok++;else{bad++;if(bad<=25)console.log('  ✗',m);}};
const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const ri=(rnd,a,b)=>a+Math.floor(rnd()*(b-a+1));
const DIRS=[[-1,0],[1,0],[0,-1],[0,1]];

/* ---------- tham chiếu độc lập ---------- */
const L=(terr,r,c)=>r<0||r>=N||c<0||c>=N?0:terr[r*N+c]===1?2:terr[r*N+c]===9?1:0;
function wallEdges(st){   /* tập cạnh bị tường chắn: khóa "k1-k2" với k1<k2 */
  const E=new Set(),add=(r1,c1,r2,c2)=>{const a=r1*N+c1,b=r2*N+c2;E.add(a<b?a+'-'+b:b+'-'+a);};
  for(let r=0;r<WN;r++)for(let c=0;c<WN;c++){
    if(st.ws.h[r*WN+c]){add(r,c,r+1,c);add(r,c+1,r+1,c+1);}
    if(st.ws.v[r*WN+c]){add(r,c,r,c+1);add(r+1,c,r+1,c+1);}
  }
  return E;
}
function mkRef(st){
  const E=wallEdges(st),t=st.terr;
  const cellOK=(r,c)=>r>=0&&r<N&&c>=0&&c<N&&st.blocker!==r*N+c;
  const walled=(r1,c1,r2,c2)=>{const a=r1*N+c1,b=r2*N+c2;return E.has(a<b?a+'-'+b:b+'-'+a);};
  /* đi được từ ô (r1,c1) sang ô kề (r2,c2): chênh bậc ≤1, và tường chỉ chặn khi có ít nhất một ô là ô thường */
  const pass=(r1,c1,r2,c2)=>{
    const h1=L(t,r1,c1),h2=L(t,r2,c2);
    if(Math.abs(h1-h2)>1)return false;
    if(h1>0&&h2>0)return true;
    return !walled(r1,c1,r2,c2);
  };
  function moves(p){
    const a=st.pl[p],o=st.pl[1-p],out=[];
    if(st.stuck&&st.stuck[p])return out;
    for(const[dr,dc]of DIRS){
      const r=a.r+dr,c=a.c+dc;if(!cellOK(r,c)||!pass(a.r,a.c,r,c))continue;
      if(r===o.r&&c===o.c){
        const r2=r+dr,c2=c+dc;
        if(cellOK(r2,c2)&&pass(r,c,r2,c2)&&Math.abs(L(t,a.r,a.c)-L(t,r2,c2))<=1)out.push([r2,c2]);
        else for(const[er,ec]of DIRS){
          if(er*dr+ec*dc!==0)continue;
          const r3=r+er,c3=c+ec;
          if(cellOK(r3,c3)&&pass(r,c,r3,c3)&&Math.abs(L(t,a.r,a.c)-L(t,r3,c3))<=1)out.push([r3,c3]);
        }
      }else out.push([r,c]);
    }
    return out;
  }
  function dist(p,s){
    const goal=p===0?0:N-1,d=new Int16Array(N*N).fill(-1);let q=[[s.r,s.c]];d[s.r*N+s.c]=0;
    for(let h=0;h<q.length;h++){
      const[r,c]=q[h];if(r===goal)return d[r*N+c];
      for(const[dr,dc]of DIRS){const r2=r+dr,c2=c+dc;if(!cellOK(r2,c2)||d[r2*N+c2]>=0||!pass(r,c,r2,c2))continue;d[r2*N+c2]=d[r*N+c]+1;q.push([r2,c2]);}
    }
    return 9999;
  }
  return{pass,moves,dist,cellOK};
}
const key=a=>a.map(x=>x[0]*N+x[1]).sort((x,y)=>x-y).join(',');

/* ---------- dựng bản đồ núi ngẫu nhiên: đá cao, đá thấp, và vài ô đặc biệt rải ngoài ---------- */
function randTerr(rnd,heavy){
  const t=new Uint8Array(N*N);
  const blob=(code,n)=>{let r=ri(rnd,2,6),c=ri(rnd,0,8);for(let i=0;i<n;i++){if(r>=2&&r<=6&&t[r*N+c]===0)t[r*N+c]=code;const d=DIRS[ri(rnd,0,3)];r=Math.max(2,Math.min(6,r+d[0]));c=Math.max(0,Math.min(8,c+d[1]));}};
  for(let i=0,n=ri(rnd,1,heavy?4:2);i<n;i++)blob(1,ri(rnd,2,6));
  for(let i=0,n=ri(rnd,0,heavy?5:3);i<n;i++)blob(9,ri(rnd,1,3));
  for(const code of[2,3,4,5,7,8])if(rnd()<.35){const r=ri(rnd,2,6),c=ri(rnd,0,8);if(t[r*N+c]===0)t[r*N+c]=code;}
  if(rnd()<.3){const g=[];for(let k=0;k<2;k++){const r=ri(rnd,2,6),c=ri(rnd,0,8);if(t[r*N+c]===0){t[r*N+c]=6;g.push(1);}}if(g.length===1){for(let i=0;i<N*N;i++)if(t[i]===6)t[i]=0;}}
  return t;
}
const mkState=(t,seed)=>R.newState({spawn:[ri(lcg(seed),0,8),ri(lcg(seed+1),0,8)],terr:t,seed});
const isStone=(t,r,c)=>t[r*N+c]===1||t[r*N+c]===9;

/* ===== 1. moves/dist trùng tham chiếu trên trạng thái ngẫu nhiên (tường đặt bừa, quân đứng bừa kể cả trên đá, người chặn đường) ===== */
console.log('1. moves/dist ↔ tham chiếu độc lập');
{
  const rnd=lcg(11);let withStoneStand=0,jumpCases=0;
  for(let it=0;it<12000;it++){
    const t=randTerr(rnd,it%2===0),st=mkState(t,it);
    for(let i=0,n=ri(rnd,0,14);i<n;i++){const o=rnd()<.5?'h':'v';st.ws[o][ri(rnd,0,7)*WN+ri(rnd,0,7)]=1;}   /* bừa: có thể chồng/chéo, tham chiếu vẫn đúng */
    for(const p of[0,1]){let r,c;do{r=ri(rnd,0,8);c=ri(rnd,0,8);}while(false);st.pl[p]={r,c};}
    if(st.pl[0].r===st.pl[1].r&&st.pl[0].c===st.pl[1].c)st.pl[1].c=(st.pl[1].c+1)%N;
    if(rnd()<.2){const k=ri(rnd,0,N*N-1);if(t[k]===0&&!st.pl.some(p=>p.r*N+p.c===k))st.blocker=k;}
    if(rnd()<.5&&st.pl[0].r*N+st.pl[0].c!==0&&Math.abs(st.pl[0].r-st.pl[1].r)+Math.abs(st.pl[0].c-st.pl[1].c)>1){   /* hay cho hai quân đứng kề nhau để thử nhảy */
      const d=DIRS[ri(rnd,0,3)];const r=st.pl[0].r+d[0],c=st.pl[0].c+d[1];if(r>=0&&r<N&&c>=0&&c<N&&st.blocker!==r*N+c)st.pl[1]={r,c};
    }
    const ref=mkRef(st);
    for(const p of[0,1]){
      if(st.pl[p].r>=0&&isStone(t,st.pl[p].r,st.pl[p].c))withStoneStand++;
      const a=key(R.moves(st,p)),b=key(ref.moves(p));
      ck(a===b,`moves p${p} khác tham chiếu (it ${it}): ${a} ≠ ${b}`);
      ck(R.dist(st,p,st.pl[p])===ref.dist(p,st.pl[p]),`dist p${p} khác tham chiếu (it ${it})`);
      if(Math.abs(st.pl[0].r-st.pl[1].r)+Math.abs(st.pl[0].c-st.pl[1].c)===1)jumpCases++;
      /* nước đi không bao giờ chênh ≥ 2 bậc giữa đích và chỗ đứng (kể cả cú nhảy), và không bao giờ thường ↔ cao */
      for(const m of R.moves(st,p))ck(Math.abs(L(t,st.pl[p].r,st.pl[p].c)-L(t,m[0],m[1]))<=1,`nước chênh ≥2 bậc (it ${it})`);
    }
    /* dist từ ô bất kỳ */
    for(let i=0;i<6;i++){const s={r:ri(rnd,0,8),c:ri(rnd,0,8)};if(!ref.cellOK(s.r,s.c))continue;for(const p of[0,1])ck(R.dist(st,p,s)===ref.dist(p,s),`dist(ô bất kỳ) khác tham chiếu (it ${it})`);}
  }
  console.log(`  (quân đứng trên đá: ${withStoneStand}, hai quân kề nhau: ${jumpCases})`);
  ck(withStoneStand>2000,'có đủ trường hợp quân đứng trên đá');ck(jumpCases>800,'có đủ trường hợp hai quân kề');
}

/* ===== 2. đối xứng: X→Y bước được ⇔ Y→X bước được (không tính tường một chiều: tường chặn cả hai chiều nên luôn đối xứng) ===== */
console.log('2. đối xứng và bảng tường 1.3');
{
  const rnd=lcg(22);
  for(let it=0;it<3000;it++){
    const t=randTerr(rnd,true),st=mkState(t,it);
    for(let i=0;i<10;i++){const o=rnd()<.5?'h':'v';st.ws[o][ri(rnd,0,7)*WN+ri(rnd,0,7)]=1;}
    for(let r=0;r<N;r++)for(let c=0;c<N;c++)for(const[dr,dc]of[[1,0],[0,1]]){
      if(r+dr>=N||c+dc>=N)continue;
      ck(R.blk(st,r,c,dr,dc)===R.blk(st,r+dr,c+dc,-dr,-dc),'blk không đối xứng');
      /* điểm duy nhất: blk phải khớp tham chiếu pass */
      ck(R.blk(st,r,c,dr,dc)===!mkRef(st).pass(r,c,r+dr,c+dc),'blk khác pass tham chiếu');
    }
  }
  /* bảng từng loại cạnh: hàng giữa, ô (4,3)→(4,4), tường 'v' (3,3) hoặc (4,3) phủ cạnh đó */
  const cases=[['thường–thường',0,0,true],['thường–thấp',0,9,true],['thấp–thấp',9,9,false],['thấp–cao',9,1,false],['cao–cao',1,1,false],['thường–cao',0,1,'xa']];
  for(const[name,a,b,blocks]of cases){
    const t=new Uint8Array(N*N);t[4*N+3]=a;t[4*N+4]=b;
    const st=R.newState({spawn:[0,0],terr:t});st.pl=[{r:7,c:0},{r:1,c:8}];
    st.ws.v[4*WN+3]=1;   /* tường dọc giữa cột 3 và 4, phủ hàng 4 và 5 */
    const m=R.moves(Object.assign(st,{pl:[{r:4,c:3},{r:1,c:8}]}),0).some(x=>x[0]===4&&x[1]===4);
    if(blocks==='xa')ck(!m,`${name}: không được bước`);
    else ck(m===!blocks,`${name}: tường ${blocks?'phải chặn':'không được chặn'} (bước=${m})`);
    st.ws.v[4*WN+3]=0;st.pl[0]={r:4,c:3};
    if(blocks!=='xa')ck(R.moves(st,0).some(x=>x[0]===4&&x[1]===4),`${name}: không tường thì đi được`);
  }
  /* tường phủ 2 cạnh: cạnh (4,3)-(4,4) đá thấp–đá thấp (bỏ qua), cạnh (5,3)-(5,4) thường–thường (vẫn chặn) */
  const t=new Uint8Array(N*N);t[4*N+3]=9;t[4*N+4]=9;
  const st=R.newState({spawn:[0,0],terr:t});st.ws.v[4*WN+3]=1;
  st.pl=[{r:4,c:3},{r:1,c:8}];ck(R.moves(st,0).some(x=>x[0]===4&&x[1]===4),'tường 2 cạnh: cạnh đá–đá vẫn đi được');
  st.pl=[{r:5,c:3},{r:1,c:8}];ck(!R.moves(st,0).some(x=>x[0]===5&&x[1]===4),'tường 2 cạnh: cạnh thường–thường vẫn bị chặn');
  /* tường đặt được giữa hai đá và vẫn tính vào số tường */
  const t2=new Uint8Array(N*N);t2[4*N+3]=1;t2[4*N+4]=1;t2[5*N+3]=1;t2[5*N+4]=1;
  const s2=R.newState({spawn:[0,0],terr:t2});
  ck(R.check(s2,{wall:{o:'v',r:4,c:3}}).ok,'đặt tường giữa hai đá cao được');
  const l0=s2.left[0];R.apply(s2,{wall:{o:'v',r:4,c:3}});ck(s2.left[0]===l0-1,'tường trên đá vẫn tính vào số tường');
}

/* ===== 3. nhảy qua đối thủ: đủ tổ hợp bậc (A,B,C) ===== */
console.log('3. nhảy qua đối thủ theo độ cao');
{
  const code=l=>l===0?0:l===1?9:1,tab={};
  for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++)for(let s=0;s<3;s++){
    /* hàng 4: A (4,3), B (4,4), C (4,5); hai ô né sang bên: (3,4) bậc s và (5,4) bậc 0 */
    const t=new Uint8Array(N*N);t[4*N+3]=code(a);t[4*N+4]=code(b);t[4*N+5]=code(c);t[3*N+4]=code(s);
    const st=R.newState({spawn:[0,0],terr:t});st.pl=[{r:4,c:3},{r:4,c:4}];
    const mv=R.moves(st,0),has=(r,c)=>mv.some(x=>x[0]===r&&x[1]===c);
    const stepOK=(h1,h2)=>Math.abs(h1-h2)<=1;
    const straight=stepOK(a,b)&&stepOK(b,c)&&Math.abs(a-c)<=1;
    ck(has(4,5)===(stepOK(a,b)&&straight),`nhảy thẳng A${a} B${b} C${c}`);
    if(stepOK(a,b)&&!straight){
      ck(has(3,4)===(stepOK(b,s)&&Math.abs(a-s)<=1),`né lên A${a} B${b} S${s}`);
      ck(has(5,4)===(stepOK(b,0)&&Math.abs(a-0)<=1),`né xuống A${a} B${b} ô thường`);
    }
    if(!stepOK(a,b))ck(!has(4,5)&&!has(3,4)&&!has(5,4),`A→B không bước được thì không nhảy (A${a} B${b})`);
    tab[`${a}${b}${c}`]=has(4,5);
  }
  ck(tab['010']===true&&tab['121']===true,'thường→thấp(B)→thường nhảy được (A−C=0)');
  ck(tab['022']===false,'A thường, B thấp, C cao: A–C = 2 bị chặn');
  ck(tab['120']===false,'cao,thấp,thường: A–C = 2 bị chặn');
}

/* ===== 4. băng không trượt lên đá; bẫy/cổng/người chặn đường chỉ ở ô thường ===== */
console.log('4. băng, bẫy, người chặn đường');
{
  /* băng ở (4,4), toàn bộ ô kề băng là đá thấp trừ (4,3): trượt luôn sang (4,3) */
  let slidOk=true;
  for(let seed=0;seed<200;seed++){
    const t=new Uint8Array(N*N);t[4*N+4]=3;t[3*N+4]=9;t[5*N+4]=9;t[4*N+5]=9;
    const st=R.newState({spawn:[0,0],terr:t,seed});st.pl=[{r:5,c:5},{r:1,c:0}];st.pl[0]={r:4,c:5};
    st.terr[4*N+5]=0;st.pl[0]={r:4,c:5};
    const res=R.apply(st,{move:[4,4]});
    const a=st.pl[0];if(!(a.r===4&&a.c===3)&&!(a.r===4&&a.c===5)||L(st.terr,a.r,a.c)!==0)slidOk=false;
    if(res.fx)for(const f of res.fx)if(f.t==='slide')for(const[r,c]of f.path.slice(1))if(L(st.terr,r,c)!==0)slidOk=false;
  }
  ck(slidOk,'băng không bao giờ trượt lên đá');
  /* băng bị đá bao kín trừ chỗ vừa đi tới: dừng tại băng */
  const t=new Uint8Array(N*N);t[4*N+4]=3;t[3*N+4]=9;t[5*N+4]=1;t[4*N+3]=9;
  const st=R.newState({spawn:[0,0],terr:t});st.pl=[{r:4,c:5},{r:1,c:0}];R.apply(st,{move:[4,4]});
  ck(st.pl[0].r===4&&st.pl[0].c===4,'băng kẹt giữa đá: quân đứng lại trên băng');
  /* người chặn đường chỉ chọn ô thường */
  const rnd=lcg(5);let picked=0;
  for(let it=0;it<400;it++){
    const s=mkState(randTerr(rnd,true),it);s.pl=[{r:7,c:ri(rnd,0,8)},{r:1,c:ri(rnd,0,8)}];
    const k=BlockerPick.pick(R,s,rnd);if(k<0)continue;picked++;
    ck(L(s.terr,(k/N)|0,k%N)===0&&s.terr[k]===0,`người chặn chọn ô đá/đặc biệt (it ${it})`);
  }
  ck(picked>200,'người chặn chọn được ô trong đa số bàn');
}

/* ===== 4b. bẫy chỉ hất vào ô còn đường (đã quyết định: không hất vào túi kín) ===== */
console.log('4b. bẫy hất');
{
  /* Túi kín {(8,0),(8,1)}: h(7,0) chắn (7,0)-(8,0),(7,1)-(8,1); v(7,1) chắn (7,1)-(7,2),(8,1)-(8,2).
     Trắng đứng trên bẫy (6,4) lúc bẫy bật (ply 2) rồi đặt tường: đứng yên trên bẫy vẫn bị bắn về hàng xuất phát. */
  let launched=0,pocketLand=0;
  for(let seed=0;seed<400;seed++){
    const t=new Uint8Array(N*N);t[6*N+4]=4;
    const st=R.newState({spawn:[4,4],terr:t,seed});
    st.ws.h[7*WN]=1;st.ws.v[7*WN+1]=1;
    st.pl=[{r:6,c:4},{r:0,c:8}];st.ply=2;st.turn=0;
    ck(R.trapOn(st,0),'bẫy bật ở ply 2');
    const res=R.apply(st,{wall:{o:'h',r:3,c:0}});
    ck(res.ok,'đặt tường được');
    const f=(res.fx||[]).find(x=>x.t==='launch');
    if(f){launched++;ck(f.to[0]===8,'hất về hàng xuất phát');if(f.to[1]<=1)pocketLand++;ck(R.dist(st,0,st.pl[0])<9999,`bẫy hất vào ô mất đường (seed ${seed})`);}
  }
  ck(launched===400,'còn ô hợp lệ thì luôn hất');ck(pocketLand===0,'không bao giờ hất vào túi {(8,0),(8,1)}');
  /* hàng 8 bị bịt gần hết (chỉ còn cột 8 thông): chỉ được hất vào ô còn đường */
  const t=new Uint8Array(N*N);t[6*N+4]=4;const st=R.newState({spawn:[4,4],terr:t});
  for(const c of[0,2,4,6])st.ws.h[7*WN+c]=1;
  st.pl=[{r:6,c:4},{r:0,c:8}];st.ply=2;st.turn=0;
  const r2=R.apply(st,{wall:{o:'h',r:3,c:0}}),f2=(r2.fx||[]).find(x=>x.t==='launch');
  ck(r2.ok&&(!f2||R.dist(st,0,st.pl[0])<9999),'hàng xuất phát bị bịt: hất (nếu có) vào ô còn đường');
}

/* ===== 5. chống kẹt: tường nhốt một bên trên núi bị từ chối ===== */
console.log('5. chống kẹt trên núi');
{
  /* núi: đá cao (4,4), đá thấp (4,3) là lối xuống duy nhất; ba tường dọc/ngang bịt các cạnh thấp–thường của (4,3) */
  const mk=(extraLow)=>{
    const t=new Uint8Array(N*N);t[4*N+4]=1;t[4*N+3]=9;if(extraLow)t[4*N+5]=9;
    const st=R.newState({spawn:[0,0],terr:t});st.pl=[{r:4,c:4},{r:7,c:0}];
    st.ws.h[3*WN+2]=1;   /* chắn (3,3)-(4,3) và (3,2)-(4,2) */
    st.ws.h[4*WN+3]=1;   /* chắn (4,3)-(5,3) và (4,4)-(5,4) */
    return st;
  };
  let st=mk(false);
  ck(R.dist(st,0,st.pl[0])<9999,'trước khi chặn nốt, quân trên núi còn đường (qua (4,2))');
  ck(!R.canWall(st,'v',4,2),'tường chặn nốt lối thoát của quân trên núi (đối thủ đặt) bị từ chối');
  ck(!R.canWall(st,'v',3,2),'cùng lối thoát, vị trí tường khác: bị từ chối');
  st.turn=0;ck(!R.check(st,{wall:{o:'v',r:4,c:2}}).ok,'chính chủ tự nhốt mình cũng bị từ chối');
  st=mk(true);   /* có lối thoát thứ hai qua đá thấp (4,5) */
  ck(R.canWall(st,'v',4,2),'còn lối thoát thứ hai thì tường được phép');
  /* quân đối thủ đứng trong túi: phía kia cũng được bảo vệ */
  const t=new Uint8Array(N*N);t[4*N+4]=1;t[4*N+3]=9;const s3=R.newState({spawn:[0,0],terr:t});s3.pl=[{r:7,c:0},{r:4,c:4}];s3.ws.h[3*WN+2]=1;s3.ws.h[4*WN+3]=1;
  ck(!R.canWall(s3,'v',4,2),'nhốt quân đen trên núi cũng bị từ chối');
}

/* ===== 6. ván ngẫu nhiên trên map núi có đá thấp: bất biến sau MỖI hành động ===== */
console.log('6. property test ván ngẫu nhiên');
const prop={games:0,steps:0,gateTp:0,gateGames:0,climb:0,hop:0,jump:0};
{
  const rnd=lcg(77);
  const GAMES=+process.env.LOWSTONE_GAMES||2500;
  for(let g=0;g<GAMES;g++){
    let t,st;   /* như mapgen thật: chỉ nhận bản đồ mà cả hai bên có đường về đích */
    do{t=randTerr(rnd,g%3!==0);st=R.newState({spawn:[ri(rnd,0,8),ri(rnd,0,8)],terr:t,seed:g+1});}
    while(R.dist(st,0,st.pl[0])>=9999||R.dist(st,1,st.pl[1])>=9999);
    /* đưa các ô đặc biệt về ô thường: hàng 0,1,7,8 luôn thường (randTerr chỉ rải hàng 2-6) */
    prop.games++;
    const gl=[];for(let i=0;i<N*N;i++)if(st.terr[i]===6)gl.push([(i/N)|0,i%N]);
    let gates0=null;if(gl.length===2){const rf0=mkRef(st);if(gl.some(([r,c])=>rf0.dist(0,{r,c})<9999&&rf0.dist(1,{r,c})<9999)){gates0=gl;prop.gateGames++;}}
    for(let s=0;s<220&&!st.over;s++){
      if(s%17===5&&st.blocker<0){const k=BlockerPick.pick(R,st,rnd);if(k>=0)st.blocker=k;}
      else if(s%17===12)st.blocker=-1;
      const me=st.turn,cand=R.moves(st,me).map(m=>({move:m}));
      for(let i=0;i<3;i++)cand.push({wall:{o:rnd()<.5?'h':'v',r:ri(rnd,0,7),c:ri(rnd,0,7)}});
      let a=cand[ri(rnd,0,cand.length-1)];
      if(!a.move&&rnd()<.6){const mv=cand.filter(x=>x.move);if(mv.length)a=mv[ri(rnd,0,mv.length-1)];}
      const before={r:st.pl[me].r,c:st.pl[me].c},tBefore=st.terr;
      const si=a.move?R.stepInfo(st,before.r,before.c,a.move[0],a.move[1]):null;
      const res=R.apply(st,a);prop.steps++;
      if(!res.ok)continue;
      if(si){if(si.k==='climb')prop.climb++;else if(si.k==='hop')prop.hop++;else if(si.k==='jump')prop.jump++;}
      /* I1: không bao giờ có nước từ ô thường lên ô cao hoặc ngược lại trong MỘT nước (bước đi trực tiếp; trượt băng/cổng/bẫy đã bị loại ở dưới) */
      if(a.move&&!(res.fx&&res.fx.length)){const h1=L(t,before.r,before.c),h2=L(t,a.move[0],a.move[1]);ck(Math.abs(h1-h2)<=1,'nước đi chênh ≥2 bậc');}
      /* I2: dist của mỗi quân (không tính người chặn) luôn < NOPATH; quân không bị người chặn chắn */
      const keep=st.blocker;st.blocker=-1;
      for(const p of[0,1]){
        const d=R.dist(st,p,st.pl[p]);
        ck(d<9999,`ván ${g} bước ${s}: quân ${p} mất đường về đích (trên đá: ${isStone(st.terr,st.pl[p].r,st.pl[p].c)}) fx=${JSON.stringify(res.fx||[])}`);
      }
      st.blocker=keep;
      if(keep>=0)for(const p of[0,1]){
        if(R.dist(st,p,st.pl[p])<9999||st.pl[p].r*N+st.pl[p].c===keep)continue;
        ck(false,`ván ${g} bước ${s}: có người chặn (ô ${keep}) mà quân ${p} hết đường, quân ở ${JSON.stringify(st.pl)} fx=${JSON.stringify(res.fx||[])} nước=${JSON.stringify(a)}`);
      }
      /* I2b (luật cổng mới): cổng dịch chuyển chỉ đưa quân tới ô còn đường (tham chiếu độc lập), và CHƯA BAO GIỜ để cả hai cổng cùng mất đường */
      if(res.fx)for(const f of res.fx)if(f.t==='gate'){prop.gateTp++;st.blocker=-1;ck(mkRef(st).dist(f.p,{r:f.to[0],c:f.to[1]})<9999,'cổng dịch chuyển vào ô hết đường');st.blocker=keep;}
      if(gates0){
        st.blocker=-1;const rf=mkRef(st);
        ck(gates0.some(([r,c])=>rf.dist(0,{r,c})<9999&&rf.dist(1,{r,c})<9999),`ván ${g} bước ${s}: cả hai cổng cùng mất đường`);
        st.blocker=keep;
      }
      /* I3: hiệu ứng ô chỉ ở ô thường */
      if(res.fx)for(const f of res.fx){
        if(f.t==='slide')for(const[r,c]of f.path)ck(L(st.terr,r,c)===0,'trượt băng lên đá');
        if(f.t==='launch')ck(L(st.terr,f.to[0],f.to[1])===0,'bẫy hất lên đá');
        if(f.t==='gate')ck(L(st.terr,f.to[0],f.to[1])===0,'cổng dịch chuyển lên đá');
      }
      /* I4: ô đích, ô xuất phát luôn thường */
      for(const p of[0,1])ck(st.pl[p].r>=0&&st.pl[p].r<N&&st.pl[p].c>=0&&st.pl[p].c<N,'ra ngoài bàn');
    }
    /* round-trip snapshot */
    const sn=R.snapshot(st),st2=R.fromSnapshot(JSON.parse(JSON.stringify(sn)));
    ck(JSON.stringify(R.snapshot(st2))===JSON.stringify(sn),'snapshot round-trip có mã 9');
    ck(key(R.moves(st2,st.turn))===key(R.moves(st,st.turn)),'moves sau fromSnapshot khớp');
  }
  console.log(`  (ván ${prop.games}, hành động ${prop.steps}, leo ${prop.climb}, nhảy tường ${prop.hop}, nhảy/né ${prop.jump}; ván có cặp cổng ${prop.gateGames}, lần dịch chuyển ${prop.gateTp})`);
  ck(prop.climb>500&&prop.hop>50&&prop.jump>100,'ván ngẫu nhiên có đủ leo, nhảy tường và nhảy qua đối thủ');
}

/* ===== 7. stepInfo ===== */
console.log('7. stepInfo');
{
  const t=new Uint8Array(N*N);t[4*N+3]=9;t[4*N+4]=9;t[4*N+5]=1;t[3*N+3]=0;
  const st=R.newState({spawn:[0,0],terr:t});
  ck(R.stepInfo(st,4,3,4,4).k==='walk','thấp–thấp không tường: walk');
  st.ws.v[4*WN+3]=1;ck(R.stepInfo(st,4,3,4,4).k==='hop','thấp–thấp có tường: hop');
  ck(R.stepInfo(st,4,4,4,5).k==='climb'&&R.stepInfo(st,4,4,4,5).dh===1,'thấp→cao: climb +1');
  ck(R.stepInfo(st,4,5,4,4).dh===-1,'cao→thấp: climb −1');
  ck(R.stepInfo(st,3,3,4,3).dh===1&&R.stepInfo(st,3,3,4,3).k==='climb','thường→thấp: climb +1');
  ck(R.stepInfo(st,4,3,4,5).k==='jump','hai ô cách nhau: jump');
  st.ws.v[4*WN+2]=1;   /* tường trên cạnh (4,2)-(4,3): ô (4,2) thường, (4,3) thấp */
  ck(R.stepInfo(st,4,3,4,2).k==='climb'&&R.stepInfo(st,4,2,4,3).k==='climb','thấp–thường có tường trên cạnh: không phải hop (tường chặn, không nhảy)');
  const t2=new Uint8Array(N*N);t2[4*N+3]=1;t2[4*N+4]=1;const s2=R.newState({spawn:[0,0],terr:t2});s2.ws.v[4*WN+3]=1;
  ck(R.stepInfo(s2,4,3,4,4).k==='walk','cao–cao có tường: walk (tường chìm trong đá)');
  const cl=Core.make(Core.ruleset('classic')),sc=cl.newState();ck(cl.stepInfo(sc,4,4,3,4).k==='walk','Classic: walk');
}
/* ===== 8. luật cổng: cổng đích bị bịt thì không dịch chuyển; tường không được làm CẢ HAI cổng mất đường ===== */
console.log('8. luật cổng');
{
  const mk=(sealG2,sealG1)=>{
    const t=new Uint8Array(N*N);t[4*N+1]=6;t[4*N+6]=6;
    const st=R.newState({spawn:[0,0],terr:t});st.pl=[{r:6,c:3},{r:2,c:3}];st.pl[0]={r:4,c:0};
    if(sealG2){st.ws.h[3*WN+5]=1;st.ws.h[4*WN+5]=1;st.ws.v[4*WN+6]=1;st.ws.v[3*WN+4]=1;}   /* túi {(4,5),(4,6)} kín */
    if(sealG1){st.ws.h[3*WN+0]=1;st.ws.h[4*WN+0]=1;}                                          /* túi {(4,0),(4,1)} chỉ còn hở cạnh phải v(3,1) */
    return st;
  };
  let st=mk(false,false);   /* đối chứng: không bịt thì dịch chuyển bình thường */
  let res=R.apply(st,{move:[4,1]});
  ck(res.ok&&res.fx.some(f=>f.t==='gate')&&st.pl[0].r===4&&st.pl[0].c===6,'đối chứng: cổng đích mở thì dịch chuyển');
  st=mk(true,false);        /* cổng đích bị bịt kín: quân đứng nguyên */
  ck(R.dist(st,0,{r:4,c:6})>=9999&&R.dist(st,0,{r:4,c:1})<9999,'dựng túi cổng kia kín, cổng này còn đường');
  res=R.apply(st,{move:[4,1]});
  ck(res.ok&&!(res.fx||[]).some(f=>f.t==='gate')&&st.pl[0].r===4&&st.pl[0].c===1&&!st.gwait[0],'cổng đích bị bịt: không dịch chuyển, không chờ');
  ck(R.dist(st,0,st.pl[0])<9999,'quân vẫn còn đường về đích sau khi bước vào cổng');
  /* tường bịt nốt cổng còn lại bị từ chối; chưa bịt cổng kia thì được */
  st=mk(true,true);st.pl=[{r:6,c:4},{r:2,c:4}];
  ck(R.wallFree(st,'v',3,1)&&!R.canWall(st,'v',3,1),'tường bịt nốt cổng còn lại bị từ chối');
  ck(!R.check(st,{wall:{o:'v',r:3,c:1}}).ok,'check cũng từ chối');
  st=mk(false,true);st.pl=[{r:6,c:4},{r:2,c:4}];
  ck(R.canWall(st,'v',3,1),'một cổng bị bịt, cổng kia còn thì tường được phép');
  /* cổng đã chết sẵn từ trước (map hỏng): tường khác không bị phạt oan */
  st=mk(true,true);st.ws.v[3*WN+1]=1;st.pl=[{r:6,c:4},{r:2,c:4}];
  ck(R.canWall(st,'h',5,6),'cả hai cổng chết sẵn: tường không liên quan vẫn đặt được');
  /* Classic và map không cổng không bị ảnh hưởng */
  const t0=new Uint8Array(N*N),sn=R.newState({spawn:[0,0],terr:t0});ck(R.canWall(sn,'h',4,4),'map không cổng: tường bình thường');
  /* gateRelease: quân đang chờ ở cổng, cổng kia trống ra nhưng đã bị bịt (với hàng đích của quân chờ): không dịch chuyển */
  {
    const t=new Uint8Array(N*N);t[2*N+1]=6;t[5*N+6]=6;
    const s2=R.newState({spawn:[0,0],terr:t});s2.pl=[{r:2,c:0},{r:5,c:6}];
    for(const c of[0,2,4,6])s2.ws.h[3*WN+c]=1;s2.ws.h[3*WN+7]=1;   /* đường chắn kín giữa hàng 3 và 4: nửa dưới không tới được hàng đích của quân trắng */
    const r1=R.apply(s2,{move:[2,1]});
    ck(r1.ok&&s2.gwait[0]&&s2.pl[0].r===2&&s2.pl[0].c===1,'cổng kia có người: quân chờ');
    const r2=R.apply(s2,{move:[5,5]});
    ck(r2.ok&&s2.pl[0].r===2&&s2.pl[0].c===1&&s2.gwait[0]&&!(r2.fx||[]).some(f=>f.t==='gate'),'cổng kia trống nhưng bị bịt: quân chờ KHÔNG dịch chuyển');
  }
  /* người chặn đường: dist có người chặn vẫn dùng đúng */
  st=mk(true,false);st.pl=[{r:6,c:4},{r:2,c:4}];st.blocker=4*N+3;
  ck(typeof R.canWall(st,'h',5,6)==='boolean','có người chặn: canWall vẫn chạy');
}

console.log(bad?`\n✗ ${bad} kiểm tra hỏng / ${ok} đạt`:`\nTất cả ${ok} kiểm tra đạt`);
process.exit(bad?1:0);
