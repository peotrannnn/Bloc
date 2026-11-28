'use strict';
/* [VIEW/TERRAIN] Dựng địa hình 3D cho chế độ "Hỗn Loạn" từ mảng terr (mã ô giống js/mapgen.js, js/core.js).
   Chỉ là hình ảnh: luật nằm ở core.js. Cùng terr + cùng seed → cùng hình trên mọi máy (mọi "ngẫu nhiên" ở đây dùng hash/PRNG có seed, không dùng Math.random).

   Dùng:
     Stage.setTerrain(terr[,seed])        // dựng (terr: Uint8Array/mảng/chuỗi 81 chữ số). Gọi lại để đổi map; Stage.setTerrain(null) = bàn Classic
     Terrain.update(dt)                   // gọi mỗi khung hình trong vòng lặp; trả true khi còn chuyển động (cỏ đung đưa, cổng xoáy, nước, bẫy nhún) để vòng lặp vẽ tiếp
     Terrain.setBiome('forest'|'river'|'meadow'|'autumn'|'desert'|'snow'|'mountain'|{grass:[a,b],dirt,sand,stone,cover,coverAmt,water,flowers:[..],floor,shape:{..}})
                                          // đổi bảng màu TẠI CHỖ (không dựng lại). Nếu biome mới có `shape` (hình dạng cỏ) khác biome cũ thì bàn được dựng lại MỘT lần.
     Terrain.setPieces([[x,z(,bán kính)],…≤4])   // cỏ rạp xuống quanh quân cờ (toạ độ bàn cờ); gọi khi quân di chuyển
     Terrain.setTraps(0|2[,instant])      // 0 bẫy đóng · 2 đang bật (khung tấm gỗ phát sáng đỏ, tấm gỗ vẫn nằm thấp: báo trước, KHÔNG trồi lên). instant=true: đặt ngay không nhún.  Gợi ý: R.trapOn(st,0)?2:0
     Terrain.fireTrap(r,c)                // tấm gỗ của bẫy ở ô (r,c) bật tung lên rồi nhún về: gọi đúng lúc quân bị hất đi
     Terrain.setGateBlocked([[r,c],…])    // các cổng đang bị chặn (cổng kia có người): lõi chuyển đỏ mượt; danh sách rỗng = bình thường
     Terrain.flashGate(r,c)               // cổng loé sáng (dịch chuyển)
     Terrain.openChest(r,c)               // rương ở ô (r,c) mở nắp (bản lề phía sau, hào quang vàng trong miệng rương), giữ mở một lúc rồi thu nhỏ biến mất. Quân đứng chờ ở ô kề trong lúc đó (xem Pawns, đoạn 'chest')
     Terrain.syncChests(terr)             // gỡ NGAY (không hoạt ảnh) mọi rương mà terr không còn mã 5 ở ô đó: dựng lại ván / nối lại sau khi rương đã bị mở
     Terrain.shadowBusy                   // true nếu trong khung hình vừa rồi có vật tĩnh-có-bóng (tấm bẫy) đang chuyển động → vòng lặp cần dựng lại bản đồ bóng

   Mỗi loại ô (cao đo theo quân cờ ≈ .7):
     9 đá thấp  như đá cao nhưng cao một nửa (CFG.TERRAIN.lowH), sáng/ẩm hơn một chút để phân biệt bậc; quân leo lên được. Độ cao mặt ô: Terrain.heightAt(r,c)
     1 đá     khối vuông vức cao ≈ quân (một dạng duy nhất, mặt nhám, không vết nứt), nhám, flatShading; xoay 0/90/180/270° cho đỡ lặp
     2 cỏ     nền đất + các cụm cỏ (tuft) rải tự nhiên (dart-throwing có seed), mỗi cụm vài lưỡi dẹt thon cong, xoè ra nhiều hướng (InstancedMesh, 1 draw call); gió thổi trong vertex shader (sóng gió chung + rung riêng từng lưỡi), không tốn CPU
              Hình dạng cỏ theo biome (biome.shape): forest cỏ CAO gấp đôi + nhiều hoa + thỉnh thoảng có cây tre (thân có đốt, lá thon) · meadow nhiều hoa · autumn như cũ ·
              snow lưỡi mảnh, NGẮN, đứng thẳng, ngả xanh băng · desert cỏ gai + xương rồng · mountain cỏ thẳng đứng hơn ·
              river cỏ như meadow + lau sậy (cattail) nhỏ mọc trong ô NƯỚC, SÁT MÉP ô giáp bờ (không mọc giữa sông) · snow thêm cột băng nhọn nhỏ + người tuyết đơn giản
     3 băng   ô vuông vức như ô gỗ: xanh lam trong suốt, bóng; texture tinh thể (Voronoi: mảnh đa giác sắc cạnh, đường nứt thẳng); lớp đáy đục cũng là tinh thể xanh đậm có mảnh nhọn
     4 bẫy    hố đen viền thép cố định; bên trong là cả một TẤM GỖ (như ô sàn) có khung thép, đội trên lò xo, trồi lên/hạ xuống theo setTraps
     5 rương  rương nhỏ, dài: thân + nắp hình hộp, vân gỗ giống ô sàn, viền đen chạy đúng theo 12 cạnh của mỗi hộp, khóa vàng. Nắp nằm trong một nhóm có bản lề (phía sau) để mở được; mở xong rương biến mất (luật: js/core.js, openChest)
     6 cổng   sprite 2D kiểu nether portal: khung obsidian tím liền một khối (texture smooth) + lõi xoáy xanh/tím chuyển động; xoay theo camera quanh trục đứng (billboard)
     7 nước   xanh navy, khá trong, sóng gợn mềm: 3 lớp normal map (sóng pha ngẫu nhiên) xoay lệch nhau, lấy mẫu theo TOẠ ĐỘ THẾ GIỚI (không lặp theo ô, liền mạch giữa các ô);
              ánh sáng caustics = noise fbm bị bẻ cong (không có lưới/hoa văn đều), lấp lánh rải ngẫu nhiên từng điểm nhấp nháy lệch pha; nước kề nước: bỏ mặt bên
     8 cát    ô như ô gỗ, màu và vân cát NHÁM (hạt li ti), mặt cát GỢN SÓNG: các gợn ngẫu nhiên như gợn cát do gió (hướng/độ dày/độ đậm đổi theo từng mảng), TĨNH (đứng yên, không chuyển động) và liền mạch giữa các ô (theo toạ độ thế giới) — khác kiểu sóng ngẫu nhiên của nước
     Nước/cát kề nhau (đúng luật "không đặt tường được"): khe giữa được lấp bằng cách nới mỗi ô thêm nửa khe về phía ô kề, ngã tư 3 ô thì thêm miếng lấp. */
const Terrain=(function(){
  const T={STONE:1,BRUSH:2,ICE:3,TRAP:4,CHEST:5,PORTAL:6,WATER:7,SAND:8,LOW:9};
  const DEF={
    stoneH:.7,                 /* cao khối đá cao trên mặt ô (quân cờ cao ≈ .7) */
    lowH:.35,                  /* cao khối đá thấp (mã 9, chỉ biome núi): một nửa đá cao, luật độ cao ở js/core.js (lvl) */
    tufts:7,tuftBlades:5,      /* số cụm cỏ mỗi ô và số lưỡi mỗi cụm (±1) */
    bladeH:[.4,.75],           /* khoảng cao lưỡi cỏ */
    sway:.34,swaySpeed:1.2,    /* biên độ ngọn cỏ khi gió thổi (đơn vị bàn cờ) và tốc độ */
    flowers:.4,                /* xác suất mỗi ô cỏ có hoa (0 = không hoa) */
    anim:true,                 /* false = tắt mọi chuyển động liên tục (cỏ, nước, cổng) cho đỡ tốn pin */
    gateColor:0x7b3fd0,        /* màu tím của lõi cổng */
    gateColor2:0x2fd2ff,       /* màu xanh của lõi cổng */
    gateBack:.3                /* dịch sprite cổng ra xa camera (để quân đứng trên ô cổng không bị cắt ngang) */
  };
  const cfg=()=>Object.assign({},DEF,(typeof CFG!=='undefined'&&CFG.TERRAIN)||{});

  /* ----- BIOME = bảng màu + hình dạng cỏ. Texture đất/cát/đá vẽ ở dạng xám (giữ chi tiết sáng tối), màu thật đến từ bảng này qua màu vật liệu / uniform shader.
     grass: [màu nền, màu loang] (loang theo noise toạ độ thế giới); cover: màu phủ trên đá (rêu / tuyết / cát), coverAmt: độ phủ;
     flowers: màu hoa ([] = ẩn hoa); floor: màu nhân cho ô sàn gỗ thường (gọi stage.setFloorTint nếu stage có hàm này).
     shape = hình dạng cỏ (ghi đè DEF): geo = kiểu lưỡi (grass|thin|spike|upright), tufts/tuftBlades/bladeH/sway/flowers như DEF,
             nf = số hoa tối đa mỗi ô, lean = nhân độ nghiêng/xoè của lưỡi (<1 thẳng hơn, >1 xoè hơn), hMul = nhân chiều cao cọng hoa,
             cactus = xác suất mỗi ô cỏ có 1 cây xương rồng, bamboo = xác suất mỗi ô cỏ có 1 cây tre lẻ,
             reeds = xác suất mỗi CẠNH ô nước giáp bờ có 1–3 cụm lau sậy nhỏ, đặt sát mép ô nước (góc lõm của bờ cũng có cụm),
             icicles = xác suất mỗi ô cỏ có cụm cột băng nhọn nhỏ, snowman = xác suất mỗi ô cỏ có người tuyết,
             tumble = xác suất mỗi ô CÁT có 1 cục tumbleweed (cỏ khô) lăn chậm trong ô (tối đa 12 cục cho cả bàn). ----- */
  const BIOMES={
    forest:{grass:[0x4f8a24,0x9aa334],dirt:0x4e6e34,sand:0xeacc91,stone:0xffffff,cover:0x5d8c3a,coverAmt:.5,water:0x0a2f80,flowers:[0xffffff,0xf7d84a,0xe879a6,0x9b7be8,0xff8a5c],floor:0xffffff,
            shape:{geo:'grass',bladeH:[.8,1.5],sway:.3,flowers:.9,nf:4,hMul:2,bamboo:.1}},
    river:{grass:[0x4c9230,0x93b04a],dirt:0x56763a,sand:0xeacc91,stone:0xffffff,cover:0x5d8c3a,coverAmt:.45,water:0x0a2f80,flowers:[0xffffff,0xf7d84a,0xe879a6],floor:0xffffff,
            shape:{geo:'grass',sway:.3,flowers:.5,nf:3,reeds:.85}},
    meadow:{grass:[0x629126,0xa8a83a],dirt:0x56763a,sand:0xeacc91,stone:0xffffff,cover:0x5d8c3a,coverAmt:.45,water:0x0a2f80,flowers:[0xffffff,0xf7d84a,0xe879a6,0x9b7be8,0xff8a5c],floor:0xffffff,
            shape:{geo:'grass',flowers:.9,nf:4}},
    autumn:{grass:[0x9a7a24,0xb5532a],dirt:0x6b4a2c,sand:0xe0b98a,stone:0xffeedd,cover:0xa0622a,coverAmt:.4,water:0x0d3470,flowers:[0xf4a63a,0xd9502c],floor:0xffe6c8,
            shape:{geo:'grass'}},
    desert:{grass:[0xb4a24a,0xd2b668],dirt:0xc9a46a,sand:0xf0d198,stone:0xe8c9a4,cover:0xd9b56e,coverAmt:.5,water:0x0b5a78,flowers:[0xf5e27a],floor:0xffe9bf,
            shape:{geo:'spike',tufts:5,tuftBlades:7,bladeH:[.22,.5],sway:.1,lean:1.7,flowers:.08,nf:1,cactus:.2,tumble:.15}},
    snow:{grass:[0xa6d0f4,0xc6e4ff],dirt:0xc9d4dc,sand:0xe6eef2,stone:0xd2dde8,cover:0xf6faff,coverAmt:.9,water:0x0e3f8a,flowers:[],floor:0xe4eef8,
          shape:{geo:'thin',tufts:9,tuftBlades:6,bladeH:[.18,.38],sway:.22,lean:.3,flowers:0,icicles:.3,snowman:.1}},
    mountain:{grass:[0x5f8a38,0x93a352],dirt:0x6a6e5c,sand:0xd9c7a0,stone:0xc9ced8,cover:0x7a9a5a,coverAmt:.5,water:0x0c3a7a,flowers:[0xffffff,0xf7d84a],floor:0xf2f2f2,
              shape:{geo:'upright',lean:.35,sway:.2,flowers:.2,nf:2}}
  };

  /* ----- Số ngẫu nhiên có seed ----- */
  function mul32(a){return function(){a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  /* hash theo TỌA ĐỘ: các đỉnh trùng vị trí (khác mặt của hộp) luôn dịch giống nhau nên khối đá không bị nứt hở */
  function hash3(x,y,z,s){
    let h=(Math.round(x*997)*374761393+Math.round(y*997)*668265263+Math.round(z*997)*2147483647+s*1274126177)|0;
    h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296;
  }

  let root=null,cache=null,stage=null,traps=[],gates=[],animOn=false,grass=[],stones=[],geos=[],flowerMesh=null,flowerCols=[],biome=Object.assign({},BIOMES.meadow),hidden=[],time={value:0},trapPhase=0,hasWater=false,hasSand=false,waterTex=null,lastTerr=null,curTerr=null,lastSeed,tumbles=[],tumbleMesh=null,tumbleAcc=0,tw=null,chests=[],baseSway=.34,gustK=0;

  /* ----- Texture vẽ bằng canvas ----- */
  function canvas(S){const cv=document.createElement('canvas');cv.width=cv.height=S;return[cv,cv.getContext('2d')];}
  function stoneTex(){
    const S=256,[cv,g]=canvas(S),r=mul32(1000);
    g.fillStyle='#7c7e85';g.fillRect(0,0,S,S);
    for(let i=0;i<700;i++){
      const lit=r()<.5;
      g.fillStyle=lit?'rgba(255,255,255,'+(.02+r()*.05)+')':'rgba(15,18,28,'+(.03+r()*.08)+')';
      g.beginPath();g.ellipse(r()*S,r()*S,2+r()*14,(2+r()*14)*(.4+r()*.8),r()*3,0,6.283);g.fill();
    }
    for(let i=0;i<2600;i++){g.fillStyle=r()<.5?'rgba(0,0,0,.2)':'rgba(255,255,255,.15)';g.fillRect(r()*S,r()*S,1+r()*1.6,1+r()*1.6);}
    g.lineWidth=1;
    for(let i=0;i<9;i++){const y=r()*S;g.strokeStyle='rgba(30,30,40,'+(.05+r()*.08)+')';g.beginPath();g.moveTo(0,y);for(let x=0;x<=S;x+=16)g.lineTo(x,y+(r()-.5)*5);g.stroke();}
    return cv;
  }
  function sandTex(){   /* xám sáng: màu cát đến từ biome.sand. Nhám: nhiều hạt li ti sáng/tối, vài hạt to hơn */
    const S=256,[cv,g]=canvas(S),r=mul32(555);
    g.fillStyle='#ececec';g.fillRect(0,0,S,S);
    for(let i=0;i<9000;i++){
      const t=r();g.fillStyle=t<.33?'rgba(110,80,35,.5)':t<.66?'rgba(255,255,255,.65)':'rgba(80,60,25,.4)';
      const s=.5+r()*1.5;g.fillRect(r()*S,r()*S,s,s);
    }
    for(let i=0;i<260;i++){   /* hạt sạn to */
      g.fillStyle=r()<.5?'rgba(95,72,35,.55)':'rgba(255,255,255,.7)';const s=1.6+r()*1.8;g.fillRect(r()*S,r()*S,s,s);
    }
    for(let i=0;i<46;i++){   /* mảng loang sáng/tối rất mờ, vẽ lặp 3×3 để texture liền mạch khi lát (thay cho các đường gợn ngang cũ → hết vẻ sọc máy móc) */
      const x=r()*S,y=r()*S,rx=10+r()*34,ry=rx*(.4+r()*.9),a=r()*3.14,lit=r()<.5;
      g.fillStyle=lit?'rgba(255,255,255,'+(.05+r()*.07)+')':'rgba(90,65,30,'+(.04+r()*.07)+')';
      for(let ox=-S;ox<=S;ox+=S)for(let oy=-S;oy<=S;oy+=S){g.beginPath();g.ellipse(x+ox,y+oy,rx,ry,a,0,6.283);g.fill();}
    }
    return cv;
  }
  function dirtTex(){   /* xám: màu đất/nền cỏ đến từ biome.dirt */
    const S=256,[cv,g]=canvas(S),r=mul32(808);
    g.fillStyle='#cfcfcf';g.fillRect(0,0,S,S);
    for(let i=0;i<500;i++){
      const t=r();g.fillStyle=t<.45?'rgba(0,0,0,.14)':t<.8?'rgba(60,40,10,.12)':'rgba(255,255,255,.16)';
      g.beginPath();g.ellipse(r()*S,r()*S,3+r()*12,3+r()*9,r()*3,0,6.283);g.fill();
    }
    for(let i=0;i<1500;i++){g.fillStyle='rgba(0,0,0,.22)';g.fillRect(r()*S,r()*S,1,1+r()*2);}
    return cv;
  }
  /* Texture TINH THỂ: Voronoi → các mảnh đa giác góc cạnh, mỗi mảnh một tông + dốc sáng riêng (như mặt cắt tinh thể), viền mảnh sáng và sắc (khoảng cách thật tới đường trung trực,
     nên nét đều, không răng cưa), thêm vài vết nứt THẲNG xuyên qua và các mảnh tam giác nhọn.
     o: n (lưới n×n hạt), lo/hi (màu tối/sáng RGB), edge (màu viền), edgeW (px), edgeK (0..1), aLo/aHi (alpha mảnh tối/sáng), lines, shards, border */
  function crystalTex(seed,o){
    const S=256,[cv,g]=canvas(S),r=mul32(seed),n=o.n,pts=[];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)pts.push({x:(i+.15+r()*.7)*S/n,y:(j+.15+r()*.7)*S/n,t:r(),gx:r()-.5,gy:r()-.5});
    const img=g.createImageData(S,S),d=img.data,K=pts.length;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){
      let b1=1e9,b2=1e9,i1=0,i2=0;
      for(let k=0;k<K;k++){const p=pts[k],dx=x-p.x,dy=y-p.y,dd=dx*dx+dy*dy;if(dd<b1){b2=b1;i2=i1;b1=dd;i1=k;}else if(dd<b2){b2=dd;i2=k;}}
      const p=pts[i1],q=pts[i2],e=(b2-b1)/(2*(Math.hypot(p.x-q.x,p.y-q.y)||1));   /* khoảng cách tới cạnh mảnh */
      const tone=Math.min(1,Math.max(0,.2+p.t*.7+((x-p.x)*p.gx+(y-p.y)*p.gy)*.005));
      let m=e<o.edgeW?1-e/o.edgeW:0;m=m*m*o.edgeK;
      const i=(y*S+x)*4;
      d[i]  =o.lo[0]+(o.hi[0]-o.lo[0])*tone;d[i]  +=(o.edge[0]-d[i]  )*m;
      d[i+1]=o.lo[1]+(o.hi[1]-o.lo[1])*tone;d[i+1]+=(o.edge[1]-d[i+1])*m;
      d[i+2]=o.lo[2]+(o.hi[2]-o.lo[2])*tone;d[i+2]+=(o.edge[2]-d[i+2])*m;
      const a=o.aLo+(o.aHi-o.aLo)*tone;d[i+3]=255*(a+(1-a)*m);
    }
    g.putImageData(img,0,0);
    g.lineCap='butt';
    for(let i=0;i<o.lines;i++){   /* vết nứt thẳng: một nét sáng + một nét tối sát bên → có độ sâu */
      const x=r()*S,y=r()*S,a=r()*Math.PI,cx=Math.cos(a),sy=Math.sin(a),L=S;
      g.strokeStyle='rgba(255,255,255,'+(.3+r()*.3)+')';g.lineWidth=.8+r()*.8;g.beginPath();g.moveTo(x-cx*L,y-sy*L);g.lineTo(x+cx*L,y+sy*L);g.stroke();
      g.strokeStyle='rgba(8,36,90,.22)';g.lineWidth=1;g.beginPath();g.moveTo(x-cx*L-sy*1.4,y-sy*L+cx*1.4);g.lineTo(x+cx*L-sy*1.4,y+sy*L+cx*1.4);g.stroke();
    }
    for(let i=0;i<o.shards;i++){   /* mảnh tam giác nhọn: đỉnh mũi nhọn, đáy hẹp */
      const x=r()*S,y=r()*S,a=r()*6.283,len=50+r()*100,w=5+r()*9,dx=Math.cos(a),dy=Math.sin(a);
      g.beginPath();g.moveTo(x+dx*len,y+dy*len);g.lineTo(x-dy*w,y+dx*w);g.lineTo(x+dy*w,y-dx*w);g.closePath();
      g.fillStyle='rgba(215,242,255,'+(.14+r()*.12)+')';g.fill();g.strokeStyle='rgba(255,255,255,.45)';g.lineWidth=.8;g.stroke();
    }
    if(o.border){g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=3;g.strokeRect(1.5,1.5,S-3,S-3);}
    return cv;
  }
  const iceTex=v=>crystalTex(900+v*31,{n:5,lo:[40,128,230],hi:[150,214,255],edge:[255,255,255],edgeW:2.4,edgeK:.95,aLo:.55,aHi:.95,lines:5,shards:0,border:true});
  const iceBaseTex=v=>crystalTex(1200+v*57,{n:4,lo:[28,92,190],hi:[100,190,255],edge:[190,235,255],edgeW:2.8,edgeK:.8,aLo:1,aHi:1,lines:4,shards:7,border:false});
  /* Khung cổng obsidian liền một khối, texture mịn: viền bo tròn, lõi chữ nhật trong suốt, có vân tím và quầng sáng xanh ở mép trong.
     Tỉ lệ ảnh 256×320 = tấm cổng .72×.9; viền dày 50px (= .14). */
  function rrect(g,x,y,w,h,r){g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
  function gateFrameTex(){
    const W=256,H=320,T=50,cv=document.createElement('canvas');cv.width=W;cv.height=H;
    const g=cv.getContext('2d'),r=mul32(606);
    g.save();g.beginPath();rrect(g,0,0,W,H,30);rrect(g,T,T,W-2*T,H-2*T,12);g.clip('evenodd');
    const gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'#2e1850');gr.addColorStop(.5,'#170c2c');gr.addColorStop(1,'#25133f');g.fillStyle=gr;g.fillRect(0,0,W,H);
    for(let i=0;i<260;i++){   /* mảng sáng/tối mờ → vân đá obsidian */
      const x=r()*W,y=r()*H,rad=6+r()*26,lit=r()<.45,rg=g.createRadialGradient(x,y,0,x,y,rad);
      rg.addColorStop(0,lit?'rgba(120,76,200,'+(.10+r()*.14)+')':'rgba(4,2,10,'+(.18+r()*.2)+')');rg.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=rg;g.fillRect(x-rad,y-rad,rad*2,rad*2);
    }
    g.lineCap='round';
    for(let i=0;i<14;i++){   /* vân sáng mảnh */
      let x=r()*W,y=r()*H,a=r()*6.28;g.strokeStyle='rgba(170,120,255,'+(.08+r()*.12)+')';g.lineWidth=.8+r()*1.2;g.beginPath();g.moveTo(x,y);
      for(let k=0;k<5;k++){a+=(r()-.5)*1.4;x+=Math.cos(a)*(12+r()*18);y+=Math.sin(a)*(12+r()*18);g.lineTo(x,y);}g.stroke();
    }
    const hl=g.createLinearGradient(0,0,W,0);hl.addColorStop(0,'rgba(255,255,255,.10)');hl.addColorStop(.5,'rgba(255,255,255,0)');hl.addColorStop(1,'rgba(0,0,0,.18)');g.fillStyle=hl;g.fillRect(0,0,W,H);   /* sáng trái, tối phải */
    g.restore();
    g.save();g.beginPath();rrect(g,0,0,W,H,30);rrect(g,T,T,W-2*T,H-2*T,12);g.clip('evenodd');   /* quầng xanh ở mép trong + viền sáng mép ngoài */
    g.shadowColor='rgba(90,200,255,.85)';g.shadowBlur=16;g.strokeStyle='rgba(120,210,255,.55)';g.lineWidth=3;g.beginPath();rrect(g,T,T,W-2*T,H-2*T,12);g.stroke();
    g.shadowBlur=0;g.strokeStyle='rgba(170,120,255,.45)';g.lineWidth=3;g.beginPath();rrect(g,1.5,1.5,W-3,H-3,29);g.stroke();
    g.restore();
    return cv;
  }
  function glowTex(){
    const S=128,[cv,g]=canvas(S),gr=g.createRadialGradient(S/2,S/2,2,S/2,S/2,S/2);
    gr.addColorStop(0,'rgba(255,255,255,.8)');gr.addColorStop(.5,'rgba(255,255,255,.28)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,S,S);return cv;
  }
  function waterNormal(){   /* bản đồ pháp tuyến tuần hoàn: ~22 sóng hướng/tần số/pha NGẪU NHIÊN (vector sóng nguyên → vẫn tuần hoàn), sóng dài mạnh hơn sóng ngắn, thêm bẻ cong nhẹ → không có hoa văn lặp rõ */
    const S=128,[cv,g]=canvas(S),h=new Float32Array(S*S),TAU2=Math.PI*2,r=mul32(4242),Wv=[];
    for(let i=0;i<22;i++){
      let kx,ky,l;do{kx=Math.round((r()-.5)*12);ky=Math.round((r()-.5)*12);l=Math.hypot(kx,ky);}while(l<1||l>6.5);
      Wv.push([kx,ky,r()*TAU2,Math.pow(l,-1.25)*(.6+r()*.8)]);
    }
    let mean=0,sq=0;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){
      const u0=x/S,v0=y/S,u=u0+.05*Math.sin(TAU2*(2*v0)+.3),v=v0+.05*Math.sin(TAU2*(3*u0)+.9);
      let s=0;for(const w of Wv)s+=w[3]*Math.sin(TAU2*(w[0]*u+w[1]*v)+w[2]);
      h[y*S+x]=s;mean+=s;
    }
    mean/=S*S;for(let i=0;i<S*S;i++){h[i]-=mean;sq+=h[i]*h[i];}
    const sc=.58/Math.sqrt(sq/(S*S));for(let i=0;i<S*S;i++)h[i]*=sc;   /* độ lệch chuẩn như bản cũ (≈.58) */
    const img=g.createImageData(S,S);
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){
      const dx=h[y*S+(x+1)%S]-h[y*S+(x+S-1)%S],dy=h[((y+1)%S)*S+x]-h[((y+S-1)%S)*S+x],k=2.2;
      let nx=-dx*k,ny=-dy*k,nz=1;const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
      const i=(y*S+x)*4;img.data[i]=(nx*.5+.5)*255;img.data[i+1]=(ny*.5+.5)*255;img.data[i+2]=(nz*.5+.5)*255;img.data[i+3]=255;
    }
    g.putImageData(img,0,0);return cv;
  }
  function envMap(ren){   /* trời giả cho phản chiếu của nước/băng/kim loại (chỉ gắn vào vật liệu địa hình, không đụng phần còn lại của cảnh) */
    try{
      const [cv,g]=canvas(256);cv.height=128;
      const gr=g.createLinearGradient(0,0,0,128);gr.addColorStop(0,'#8fc4f0');gr.addColorStop(.5,'#ffffff');gr.addColorStop(.52,'#b9c2cc');gr.addColorStop(1,'#59636e');
      g.fillStyle=gr;g.fillRect(0,0,256,128);
      const sun=g.createRadialGradient(150,34,1,150,34,26);sun.addColorStop(0,'rgba(255,255,255,1)');sun.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=sun;g.fillRect(0,0,256,128);
      const t=new THREE.CanvasTexture(cv);t.mapping=THREE.EquirectangularReflectionMapping;
      const pm=new THREE.PMREMGenerator(ren),env=pm.fromEquirectangular(t).texture;pm.dispose();t.dispose();return env;
    }catch(e){console.warn('[terrain] không tạo được envMap → nước/băng/kim loại sẽ không phản chiếu (mất độ bóng):',e);return null;}
  }

  /* ----- Hình khối ----- */
  /* Khối đá: hộp chia nhỏ rồi bóp méo nhẹ theo hash tọa độ: vuông vức, vát cạnh trên, mặt hơi gồ ghề.
     3 biến thể (variant): 0 nguyên khối · 1 sứt chéo một góc trên · 2 sứt sâu góc khác. Có màu đỉnh tối dần về chân (giả AO, nhân với texture). */
  /* Bóp méo MỘT đỉnh của khối đá (hàm thuần, không cần three.js): dùng chung cho hình học thật (stoneGeo) và cho bảng độ cao mặt đá (topGrid),
     nên chiều cao quân đứng/ô gợi ý tính từ đây luôn khớp với thứ đang vẽ. Trả [x,y,z] mới. */
  function stoneVert(x,y,z,Hh,hw,vs,chip){
    const jt=.012;
    if(y>.04){
      const n1=hash3(x,y,z,11+vs)-.5,n2=hash3(x,y,z,23+vs)-.5,n3=hash3(x,y,z,37+vs)-.5;
      const onX=Math.abs(Math.abs(x)-hw)<1e-4,onZ=Math.abs(Math.abs(z)-hw)<1e-4,isTop=y>Hh-1e-4;
      if(onX)x-=Math.sign(x)*Math.abs(n1)*2*jt;else x+=n1*jt*.6;   /* mẻ vào trong, không phình ra ngoài ô */
      if(onZ)z-=Math.sign(z)*Math.abs(n2)*2*jt;else z+=n2*jt*.6;
      if(isTop){y+=n3*.02;if(onX||onZ){y-=.02;if(onX)x-=Math.sign(x)*.04;if(onZ)z-=Math.sign(z)*.04;}}
      if(chip){const t=x*chip[0]+z*chip[1];if(t>hw*1.1)y=Math.min(y,Hh-(t-hw*1.1)*chip[2]);}   /* mặt cắt phẳng chéo qua một góc */
    }
    return[x,y,z];
  }
  const chipOf=variant=>variant===1?[1,1,.5]:variant===2?[-1,1,.75]:null;
  function stoneGeo(top,variant){
    const C=CFG.CELL,W=C*.97,hw=W/2,Hh=CFG.CELL_H+top,g=new THREE.BoxGeometry(W,Hh,W,4,7,4),vs=variant*101;
    g.translate(0,Hh/2,0);   /* đáy ở y=0, đỉnh ở y=Hh; đặt mesh ở y=-CELL_H/2 để đáy chạm đáy ô */
    const p=g.attributes.position,col=new Float32Array(p.count*3),chip=chipOf(variant);
    for(let i=0;i<p.count;i++){
      const[x,y,z]=stoneVert(p.getX(i),p.getY(i),p.getZ(i),Hh,hw,vs,chip);
      p.setXYZ(i,x,y,z);
      const ao=.5+.5*Math.min(1,Math.max(0,y/.45));col[i*3]=col[i*3+1]=col[i*3+2]=ao;
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    g.computeVertexNormals();g.computeBoundingSphere();
    return g;
  }

  /* ----- Độ cao THẬT của mặt đá (để quân, ô gợi ý, nhãn bám đúng mặt đang vẽ) -----
     heightAt chỉ là độ cao danh nghĩa theo bậc (0/lowH/stoneH) dùng cho luật và chọn ô. Mặt đá vẽ ra lệch khỏi đó vì: mỗi khối nhân chiều cao với sy (±6% của cả khối,
     tới ±.1), đỉnh nhiễu ±.01, mép vát .02, biến thể 1/2 sứt chéo một góc. Quân đứng ở độ cao danh nghĩa nên chân chìm vào chỗ lồi / lơ lửng ở chỗ lõm (lỗi người chơi báo). */
  const gridCache={},stoneAt=new Map();   /* stoneAt: k=r*N+c → {rot,sy,vi,low} của khối đá đang dựng (đặt trong build) */
  function topGrid(top,variant){   /* lưới 5×5 độ cao đỉnh (đơn vị khối chưa nhân sy), cùng lưới đỉnh mặt trên của BoxGeometry(…,4,7,4) */
    const key=top+':'+variant;if(gridCache[key])return gridCache[key];
    const W=CFG.CELL*.97,hw=W/2,Hh=CFG.CELL_H+top,vs=variant*101,chip=chipOf(variant),y=[];
    for(let iz=0;iz<5;iz++)for(let ix=0;ix<5;ix++)y.push(stoneVert(-hw+ix*W/4,Hh,-hw+iz*W/4,Hh,hw,vs,chip)[1]);
    return gridCache[key]={y,W,hw};
  }
  /* Độ cao mặt đá tại điểm thế giới (x,z), so với mặt ô thường (cùng gốc với heightAt). Không có khối đá ở đó (hoặc ngoài bàn) → 0. Hàm thuần theo stoneAt. */
  function surfaceAt(x,z){
    if(!stoneAt.size)return 0;
    const c=Math.round(x/CFG.PITCH+HALF),r=Math.round(z/CFG.PITCH+HALF);
    if(r<0||r>=N||c<0||c>=N)return 0;
    const inf=stoneAt.get(r*N+c);if(!inf)return 0;
    const dx=x-cellX(c),dz=z-cellZ(r),ca=Math.round(Math.cos(inf.rot)),sa=Math.round(Math.sin(inf.rot));
    const top=inf.low?cfg().lowH:cfg().stoneH,G=topGrid(top,inf.vi),q=G.W/4;
    const lx=dx*ca-dz*sa,lz=dx*sa+dz*ca;   /* nghịch đảo phép xoay quanh trục Y của khối */
    const fx=Math.min(4,Math.max(0,(lx+G.hw)/q)),fz=Math.min(4,Math.max(0,(lz+G.hw)/q));
    const ix=Math.min(3,Math.floor(fx)),iz=Math.min(3,Math.floor(fz)),tx=fx-ix,tz=fz-iz,Y=G.y;
    const y0=Y[iz*5+ix]*(1-tx)+Y[iz*5+ix+1]*tx,y1=Y[(iz+1)*5+ix]*(1-tx)+Y[(iz+1)*5+ix+1]*tx;
    return inf.sy*(y0*(1-tz)+y1*tz)-CFG.CELL_H;   /* thế giới = -CELL_H/2 + sy*y; trừ TOP (= CELL_H/2) */
  }
  const topAt=(r,c)=>surfaceAt(cellX(c),cellZ(r));   /* độ cao mặt đá ngay tâm ô */
  function topMaxAt(r,c){   /* cao nhất trong vùng giữa ô (ô gợi ý là tấm phẳng, đặt theo chỗ cao nhất để không chìm vào chỗ lồi) */
    let m=-1e9;const x=cellX(c),z=cellZ(r),R=CFG.CELL*.4;
    for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)m=Math.max(m,surfaceAt(x+i*R/2,z+j*R/2));
    return m;
  }
  /* Đường xoắn của lò xo. KHÔNG được viết `class Helix extends THREE.Curve` ở mức trên cùng: file này chạy lúc trang vừa tải,
     khi three.js còn chưa được loader.js tải (nó tải lười), nên THREE chưa tồn tại → lỗi. Tạo lúc cần (trong getCache). */
  function helixCurve(){
    const c=new THREE.Curve();
    c.getPoint=function(t,target){const a=t*Math.PI*8;return(target||new THREE.Vector3()).set(Math.cos(a)*.17,t,Math.sin(a)*.17);};
    return c;
  }

  /* Lưỡi cỏ: dải dẹt thon, cong dần về phía +z (nghiêng/cong thật sự do lean + yaw của từng instance). Màu đỉnh sáng hơn gốc.
     Mỗi kiểu (BLADES) có đường cong và tiết diện riêng; K.bladeGeos giữ cache theo kiểu. */
  const BLADES={
    grass:{curve:.28,rows:[[0,.045],[.3,.04],[.6,.028],[.85,.014],[1,0]]},
    upright:{curve:.08,rows:[[0,.045],[.3,.04],[.6,.028],[.85,.014],[1,0]]},   /* núi: thẳng đứng hơn */
    thin:{curve:.12,rows:[[0,.028],[.3,.024],[.6,.016],[.85,.008],[1,0]]},       /* tuyết: mảnh, ngắn, gần như đứng thẳng */
    spike:{curve:.05,rows:[[0,.07],[.2,.058],[.6,.03],[1,0]]}                     /* sa mạc: gai nhọn, đáy bè */
  };
  function bladeGeo(def){
    const pos=[],col=[],idx=[];
    def.rows.forEach(([y,w],i)=>{
      const z=def.curve*y*y,c=.45+.85*y;
      pos.push(-w,y,z,w,y,z);col.push(c,c,c,c,c,c);
      if(i<def.rows.length-1){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
    });
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  function getBlade(K,k){return K.bladeGeos[k]||(K.bladeGeos[k]=bladeGeo(BLADES[k]||BLADES.grass));}

  /* Cây tre: cao 1 đơn vị (chuẩn hoá), mỗi cây đặt trong build() bằng một ma trận scale đều (≈2–2.8) nên tỉ lệ luôn đúng.
     Thân = LatheGeometry (tròn xoay) có profile thon dần lên ngọn và các ĐỐT: mỗi đốt là một vòng phồng nhẹ (gờ), đốt dày ở gốc, thưa ở giữa, sát nhau gần ngọn; màu đốt sẫm hơn lóng.
     Lá = các dải thon (hình mũi giáo, gập chữ V nhẹ, rủ xuống) mọc theo cặp cành ở các đốt phía trên + một chùm lá hướng lên ở ngọn. */
  const BAMBOO_R=.024,bambooR=y=>BAMBOO_R*(1-.45*y);
  function bambooCulmGeo(){
    const nodes=[.1,.21,.33,.45,.56,.66,.75,.83,.9,.96],prof=[new THREE.Vector2(bambooR(0)*1.2,0)];
    for(const n of nodes){const r=bambooR(n);prof.push(new THREE.Vector2(r,n-.02),new THREE.Vector2(r*1.42,n-.008),new THREE.Vector2(r*1.42,n+.008),new THREE.Vector2(r,n+.02));}
    prof.push(new THREE.Vector2(bambooR(1)*.85,1),new THREE.Vector2(0,1.006));
    const g=new THREE.LatheGeometry(prof,8),p=g.attributes.position,col=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),node=Math.hypot(x,z)>bambooR(y)*1.2;   /* đỉnh nằm trên gờ → màu đốt */
      const c=node?.58:.92+.1*y;col[i*3]=col[i*3+1]=col[i*3+2]=c;
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();g.computeBoundingSphere();return g;
  }
  function bambooLeafGeo(){
    const r=mul32(2024),pos=[],col=[],idx=[],rows=[[0,.2],[.3,1],[.65,.8],[1,0]];
    const leaf=(bx,by,bz,a,el,L,w,droop)=>{
      const ca=Math.cos(a),sa=Math.sin(a),ce=Math.cos(el),se=Math.sin(el),base=pos.length/3;
      rows.forEach(([t,wf],i)=>{
        const d=t*L,cx=bx+ca*ce*d,cy=by+se*d-droop*t*t*L,cz=bz+sa*ce*d,ww=w*wf;
        pos.push(cx-sa*ww,cy-ww*.3,cz+ca*ww,cx+sa*ww,cy-ww*.3,cz-ca*ww);   /* hai mép thấp hơn gân giữa → lá gập chữ V */
        const c=.72+.28*t;col.push(c,c,c,c,c,c);
        if(i<rows.length-1){const k=base+i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
      });
    };
    for(const n of[.55,.64,.73,.81,.88,.94]){
      const a0=r()*6.283,rb=bambooR(n);
      for(let b=0;b<2;b++){   /* hai cành đối nhau ở mỗi đốt, mỗi cành 3 lá xoè quạt */
        const a=a0+b*Math.PI+(r()-.5)*.6,el=.35+r()*.3;
        for(const off of[-.4,0,.4])leaf(Math.cos(a)*rb,n,Math.sin(a)*rb,a+off,el+(off?0:.12),.12+r()*.04,.011,.55+r()*.25);
      }
    }
    for(let i=0;i<5;i++)leaf(0,1,0,i*1.2566+r()*.4,.95+r()*.3,.1+r()*.03,.01,.35);   /* chùm lá ở ngọn */
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();g.computeBoundingSphere();return g;
  }
  /* vật liệu tre: gió đung đưa riêng (ngọn lệch nhiều hơn gốc theo y²), dùng chung biên độ K.U.amp với cỏ */
  function bambooMaterial(K,leaf){
    return swayMaterial(K,leaf?{color:0x6fb03c,roughness:.7,flatShading:true,vertexColors:true,side:THREE.DoubleSide}:{color:0x9cbc4c,roughness:.6,flatShading:true,vertexColors:true},false,.35);
  }
  /* Vật liệu có gió cho cây cao (tre, lau sậy). attr=true: dùng thuộc tính đỉnh aSw làm hệ số lay (0 gốc … 1 ngọn), nếu không thì dùng y². str = độ mạnh. */
  function swayMaterial(K,opts,attr,str){
    const m=new THREE.MeshStandardMaterial(opts);if(attr)m.defines={SWATTR:1};
    m.onBeforeCompile=sh=>{
      sh.uniforms.uTime=time;sh.uniforms.uAmp=K.U.amp;sh.uniforms.uSpd={value:cfg().swaySpeed};
      sh.uniforms.uStr={value:str};
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;uniform float uAmp;uniform float uSpd;uniform float uStr;\n#ifdef SWATTR\nattribute float aSw;\n#endif')
        .replace('#include <project_vertex>',`
vec4 mvPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
  mvPosition=instanceMatrix*mvPosition;
#ifdef SWATTR
  float bk=aSw;
#else
  float bk=transformed.y*transformed.y;
#endif
  float bs=length(instanceMatrix[1].xyz);
  vec3 bip=instanceMatrix[3].xyz;float bt=uTime*uSpd;
  float bg=sin(bt*1.1+dot(bip.xz,vec2(1.0,.45))*1.3)*.55+sin(bt*2.1+bip.x*2.1-bip.z*1.7)*.25;
  mvPosition.x+=(bg+.2)*uAmp*bk*bs*uStr;
  mvPosition.z+=bg*.4*uAmp*bk*bs*uStr;
#endif
mvPosition=modelViewMatrix*mvPosition;
gl_Position=projectionMatrix*mvPosition;`);
    };
    return m;
  }

  function getCache(st){
    if(cache)return cache;
    const ren=st.ren,aniso=ren.capabilities.getMaxAnisotropy(),env=envMap(ren),K={env};
    const tex=(cv,rep)=>{const t=new THREE.CanvasTexture(cv);t.anisotropy=aniso;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;}return t;};
    const glass=(o)=>{const envI=o.envI||1.2;o=Object.assign({},o);delete o.envI;const m=new THREE.MeshStandardMaterial(Object.assign({transparent:true,depthWrite:false,metalness:0},o));if(env){m.envMap=env;m.envMapIntensity=envI;}return m;};
    K.unit=new THREE.BoxGeometry(1,1,1);
    K.hid=new THREE.MeshBasicMaterial();K.hid.visible=false;   /* mặt bị ẩn */
    K.U={amp:{value:.34},gA:{value:new THREE.Color()},gB:{value:new THREE.Color()},cover:{value:new THREE.Color()},coverAmt:{value:.45},pc:{value:[0,1,2,3].map(()=>new THREE.Vector3(999,999,0))}};   /* uniform dùng chung: đổi biome/quân cờ chỉ cần sửa giá trị */
    K.stone=new THREE.MeshStandardMaterial({map:tex(stoneTex()),roughness:1,metalness:0,flatShading:true,vertexColors:true});stoneShader(K.stone,K);
    K.sand=new THREE.MeshStandardMaterial({map:tex(sandTex(),true),roughness:1,metalness:0});sandShader(K.sand);
    K.dirt=new THREE.MeshStandardMaterial({map:tex(dirtTex(),true),roughness:1});
    K.tex=tex;K.glass=glass;   /* băng dựng lười (ensureIce): chỉ tốn công vẽ texture tinh thể khi bàn thật sự có ô băng */
    /* nước: xanh navy khá trong. Sóng = normal map mềm, lấy mẫu hai lần (hai tốc độ/hướng khác nhau) trong fragment shader nên không lặp, không nhăn */
    K.waterNormal=tex(waterNormal(),true);
    K.waterGlass=glass({color:0x0a2f80,opacity:.7,roughness:.03,normalMap:K.waterNormal,envI:1.2,emissive:0x082a70,emissiveIntensity:.12});K.waterGlass.normalScale.set(.7,.7);
    K.waterGlass.onBeforeCompile=sh=>{
      sh.uniforms.uT=time;
      /* vertex: đưa toạ độ thế giới sang fragment để vẽ họa tiết sáng theo vị trí (liền mạch giữa các ô nước) */
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
      /* fragment: (1) 3 lớp normal lấy mẫu theo TOẠ ĐỘ THẾ GIỚI, mỗi lớp xoay một góc khác + tỉ lệ khác + trôi hướng khác → không lặp theo ô, không thẳng hàng với bàn cờ;
                   (2) caustics = fbm noise bị bẻ cong bởi một fbm khác (domain warp) → mảng sáng loang tự nhiên, không lưới sin;
                   (3) lấp lánh: mỗi ô nhỏ có điểm sáng ở vị trí ngẫu nhiên, ~1/5 ô có điểm, mỗi điểm nhấp nháy theo tốc độ/pha riêng */
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
uniform float uT;varying vec3 vWP;
float wh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float wn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wh(i),wh(i+vec2(1.,0.)),f.x),mix(wh(i+vec2(0.,1.)),wh(i+vec2(1.,1.)),f.x),f.y);}
float wf(vec2 p){float s=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<4;i++){s+=a*wn(p);p=R*p*2.03+vec2(17.1,9.3);a*=.5;}return s/.9375;}`);
      let hit=false;   /* tên biến vUv đổi theo bản three.js (vUv / vNormalMapUv): bắt bằng regex cho cả hai */
      /* onBeforeCompile chạy TRƯỚC khi three.js bung các #include, nên dòng mapN chưa có trong fragmentShader: phải lấy nội dung chunk, sửa nó, rồi thế vào chỗ #include */
      const nmChunk=THREE.ShaderChunk.normal_fragment_maps.replace(/vec3 mapN = texture2D\( normalMap, \w+ \)\.xyz \* 2\.0 - 1\.0;/,()=>{hit=true;return `vec2 wwq=vWP.xz;
  vec3 mapN = texture2D( normalMap, mat2(.82,.57,-.57,.82)*wwq*.93 + vec2( uT * .021, uT * .013 ) ).xyz
            + texture2D( normalMap, mat2(.34,-.94,.94,.34)*wwq*1.31 + vec2( -uT * .034, uT * .026 ) ).xyz
            + texture2D( normalMap, mat2(.97,-.26,.26,.97)*wwq*.67 + vec2( uT * .018, -uT * .03 ) ).xyz - vec3( 1.5, 1.5, 2.0 );`;});
      if(hit)sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_maps>',nmChunk);
      else console.warn('[terrain] không thay được dòng đọc normalMap trong shader nước (three.js đổi chunk?) → sóng giữ kiểu mặc định');
      sh.fragmentShader=sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 q=vWP.xz;
vec2 wp=vec2(wf(q*.55+vec2(uT*.05,-uT*.04)),wf(q*.55+vec2(-uT*.035,uT*.045)+7.3));
float n=wf(q*.9+wp*1.8+vec2(uT*.04,uT*.03));
float n2=wf(q*3.1-wp*1.2+vec2(-uT*.06,uT*.05)+3.7);
diffuseColor.rgb*=mix(.55,1.25,smoothstep(.25,.75,n))*mix(.82,1.15,n2)*mix(vec3(.85,.95,1.15),vec3(1.0,1.2,1.1),smoothstep(.4,.7,wp.x));   /* loang đậm/nhạt + sắc xanh/lục ngẫu nhiên */`)
        .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
{
  float caus=pow(smoothstep(.52,.86,n),2.);
  vec2 sc=q*8.5,id=floor(sc);float hh=wh(id+11.7);vec2 off=vec2(wh(id+3.1),wh(id+7.7));
  float tw=pow(max(0.,sin(uT*(1.2+hh*2.4)+hh*80.)),14.);
  float spark=(1.-smoothstep(0.,.13,length(fract(sc)-(.2+.6*off))))*tw*step(.8,hh);
  totalEmissiveRadiance+=vec3(.12,.38,.75)*caus*.6+vec3(.85,.95,1.)*spark*.9;
}`);
    };
    K.waterBase=new THREE.MeshStandardMaterial({color:0x071f55,roughness:.5});
    K.steel=new THREE.MeshStandardMaterial({color:0x8a8f99,roughness:.4,metalness:.8});if(env){K.steel.envMap=env;K.steel.envMapIntensity=.9;}
    K.plate=new THREE.MeshStandardMaterial({map:st.woodTex('#dcb67f',11),roughness:.7});   /* tấm bẫy = gỗ sàn mặc định (ô sáng) */
    K.well=new THREE.MeshStandardMaterial({color:0x14151a,roughness:.8});
    K.padGeo=new THREE.CylinderGeometry(.26,.26,.05,28);K.wellGeo=new THREE.CylinderGeometry(.3,.3,.03,28);
    K.springGeo=new THREE.TubeGeometry(helixCurve(),72,.02,6,false);
    K.bladeGeos={};   /* lưỡi cỏ dựng lười theo kiểu của biome (getBlade) */
    /* xương rồng (sa mạc) */
    K.cactusMat=new THREE.MeshStandardMaterial({color:0x4f8a3c,roughness:.8,flatShading:true});
    K.cactusGeo={body:new THREE.CylinderGeometry(.07,.078,.52,10),cap:new THREE.SphereGeometry(.07,10,6),
                 armH:new THREE.CylinderGeometry(.04,.04,.14,8),armV:new THREE.CylinderGeometry(.04,.04,.2,8),armCap:new THREE.SphereGeometry(.04,8,6)};
    K.cactusGeo.armH.rotateZ(Math.PI/2);
    /* tre (rừng): dựng lười ở ensureBamboo khi bàn thật sự có tre */
    K.stoneGeos=null;K.lowGeos=null;   /* dựng theo chiều cao cấu hình ở build() */
    K.headGeo=new THREE.IcosahedronGeometry(.032,0);K.headGeo.scale(1,.8,1);   /* đầu hoa */
    /* rương: nhỏ và dài; vân gỗ lấy đúng từ hàm vẽ gỗ của ô sàn */
    K.chestGeo={body:new THREE.BoxGeometry(.56,.2,.34),lid:new THREE.BoxGeometry(.56,.11,.34),lock:new THREE.BoxGeometry(.07,.1,.03)};
    K.chestMat=new THREE.MeshStandardMaterial({map:st.woodTex('#7f4f2b',51),roughness:.7});
    K.chestLidMat=new THREE.MeshStandardMaterial({map:st.woodTex('#8d5b33',37),roughness:.7});
    K.chestEdge=new THREE.MeshStandardMaterial({color:0x101014,roughness:.55});K.edgeGeo={};
    K.iron=new THREE.MeshStandardMaterial({color:0x3a3a42,roughness:.5,metalness:.7});
    K.gold=new THREE.MeshStandardMaterial({color:0xf0b429,roughness:.3,metalness:.85});if(env){K.gold.envMap=env;K.gold.envMapIntensity=1;}
    K.gateFrameMap=tex(gateFrameTex());
    K.glowMap=tex(glowTex());
    cache=K;K.grassMat=grassMaterial(K,false);K.headMat=grassMaterial(K,true);applyBiome();
    return K;
  }
  function ensureBamboo(K){
    if(K.bambooCulm)return;
    K.bambooCulm=bambooCulmGeo();K.bambooLeaf=bambooLeafGeo();
    K.bambooCulmMat=bambooMaterial(K,false);K.bambooLeafMat=bambooMaterial(K,true);
  }

  /* ----- Vật trang trí gộp thành MỘT geometry (lau sậy, liễu, cột băng, người tuyết, đá nhọn), dựng lười khi bàn thật sự cần -----
     propBuilder: gom nhiều hình con (có ma trận + màu đỉnh) và dải dẹt vào một BufferGeometry có color + aSw (hệ số lay theo gió, 0 gốc … 1 ngọn). */
  function propBuilder(){
    const pos=[],nor=[],col=[],idx=[],sw=[];let base=0;
    const M4=(x,y,z,rx,ry,rz,sx,sy,sz)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(sx,sy,sz));
    return{
      M4,
      geo(g,m,c,swf){   /* c: [r,g,b] hoặc (x,y,z)=>[r,g,b]; swf: hệ số lay (số hoặc hàm), mặc định y² */
        g=g.clone();g.applyMatrix4(m);
        const p=g.attributes.position,n=g.attributes.normal,ix=g.index;
        for(let i=0;i<p.count;i++){
          const x=p.getX(i),y=p.getY(i),z=p.getZ(i),cc=typeof c==='function'?c(x,y,z):c;
          pos.push(x,y,z);nor.push(n.getX(i),n.getY(i),n.getZ(i));col.push(cc[0],cc[1],cc[2]);
          sw.push(swf===undefined?y*y:typeof swf==='function'?swf(x,y,z):swf);
        }
        if(ix)for(let i=0;i<ix.count;i++)idx.push(base+ix.getX(i));else for(let i=0;i<p.count;i++)idx.push(base+i);
        base+=p.count;g.dispose();
      },
      ribbon(pts,ws,tx,tz,cf,sf){   /* dải dẹt đi qua các điểm pts, rộng ws[i], mở ngang theo (tx,tz); cf(t)→màu, sf(t,y)→hệ số lay */
        const n=pts.length;
        for(let i=0;i<n;i++){
          const t=i/(n-1),p=pts[i],w=ws[i],cc=cf(t),s=sf?sf(t,p[1]):p[1]*p[1];
          for(const sg of[-1,1]){pos.push(p[0]+tx*w*sg,p[1],p[2]+tz*w*sg);nor.push(0,1,0);col.push(cc[0],cc[1],cc[2]);sw.push(s);}
          if(i<n-1){const k=base+i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
        }
        base+=n*2;
      },
      build(){
        const g=new THREE.BufferGeometry();
        g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
        g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setAttribute('aSw',new THREE.Float32BufferAttribute(sw,1));
        g.setIndex(idx);g.computeBoundingSphere();return g;
      }
    };
  }
  /* Lau sậy (cattail): cụm 3 thân mảnh, mỗi thân có bông nâu hình xúc xích + ngọn nhọn nhô lên, cùng vài lá dài cong từ gốc. Cao ≈ 1 đơn vị (chuẩn hoá); mỗi cụm đặt với scale .55–.85 (nhỏ), mọc trong nước. */
  function reedGeo(){
    const B=propBuilder(),r=mul32(77),G=(a,b,h,s)=>new THREE.CylinderGeometry(a,b,h,s);
    for(const[x0,z0,rx,rz,hy]of[[0,0,.05,-.04,.6],[.05,.03,-.07,.05,.68],[-.045,.04,.03,.09,.54]]){   /* vị trí gốc, độ nghiêng, độ cao đáy bông */
      const P=B.M4(x0,0,z0,rx,0,rz,1,1,1),hh=.15,part=(g,y,c)=>B.geo(g,new THREE.Matrix4().multiplyMatrices(P,B.M4(0,y,0,0,0,0,1,1,1)),c);
      part(G(.011,.016,hy+hh+.02,5),(hy+hh+.02)/2,[.5,.68,.28]);   /* thân */
      part(G(.03,.03,hh,7),hy+hh/2,[.42,.25,.12]);                  /* bông nâu */
      part(G(0,.03,.04,7),hy+hh+.02,[.42,.25,.12]);                 /* chỏm bông */
      part(G(.004,.007,.2,4),hy+hh+.14,[.62,.55,.3]);               /* ngọn mảnh trên bông */
    }
    for(let i=0;i<5;i++){   /* lá dài cong ra ngoài */
      const a=r()*6.283,L=.55+r()*.35,pts=[],ws=[];
      for(let k=0;k<5;k++){const t=k/4,d=.22*t*t;pts.push([Math.cos(a)*d,L*t*(1-.12*t),Math.sin(a)*d]);ws.push(.022*(1-t)+.002);}
      B.ribbon(pts,ws,-Math.sin(a),Math.cos(a),t=>[.34+.2*t,.6+.12*t,.2+.1*t]);
    }
    return B.build();
  }
  /* Người tuyết siêu đơn giản: 3 khối cầu, 2 mắt đen, 1 que nâu làm mũi (chĩa về +z). Cao ≈ .52 (chuẩn hoá), 3 khối chồng lên nhau một chút cho chắc. */
  function snowmanGeo(){
    const B=propBuilder(),S=new THREE.SphereGeometry(1,12,9),white=[.96,.97,1],dark=[.08,.08,.1];
    B.geo(S,B.M4(0,.13,0,0,0,0,.15,.14,.15),white,0);     /* thân dưới: y∈[-.01,.27] */
    B.geo(S,B.M4(0,.29,0,0,0,0,.11,.11,.11),white,0);     /* thân giữa: y∈[.18,.40] → chồng lên thân dưới ~.09 */
    B.geo(S,B.M4(0,.43,0,0,0,0,.08,.08,.08),white,0);     /* đầu: y∈[.35,.51] → chồng lên thân giữa ~.05 */
    for(const sg of[-1,1])B.geo(S,B.M4(sg*.03,.455,.07,0,0,0,.013,.013,.013),dark,0);
    B.geo(new THREE.CylinderGeometry(.007,.011,.1,5),B.M4(0,.425,.115,Math.PI/2,0,0,1,1,1),[.45,.3,.15],0);
    return B.build();
  }
  /* Mũi nhọn (nón 5 cạnh cao 1, bán kính 1, đáy ở y=0), màu đỉnh chuyển c0 (đáy) → c1 (ngọn); dùng cho cột băng. */
  function spikeGeo(c0,c1){
    const B=propBuilder();
    B.geo(new THREE.ConeGeometry(1,1,5,1),B.M4(0,.5,0,0,0,0,1,1,1),(x,y)=>{const t=Math.max(0,Math.min(1,y));return[c0[0]+(c1[0]-c0[0])*t,c0[1]+(c1[1]-c0[1])*t,c0[2]+(c1[2]-c0[2])*t];},0);
    return B.build();
  }
  /* Tumbleweed: một bụi cầu rối gồm 10 vòng mảnh xoay ngẫu nhiên, gộp thành MỘT geometry (~700 tam giác) dùng chung cho mọi cục (InstancedMesh → 1 draw call).
     Bán kính chuẩn hoá ≈ 1; mỗi cục scale theo r. */
  function tumbleGeo(){
    const B=propBuilder(),r=mul32(314),TG=new THREE.TorusGeometry(1,.07,3,14);
    for(let i=0;i<10;i++){
      const m=B.M4(0,0,0,r()*6.283,r()*6.283,r()*6.283,.78+r()*.3,.78+r()*.3,.78+r()*.3);
      B.geo(TG,m,(x,y,z)=>{const h=.78+.4*hash3(x,y,z,5);return[.7*h,.52*h,.28*h];},0);
    }
    TG.dispose();return B.build();
  }
  function ensureTumble(K){
    if(K.tumbleGeo)return;
    K.tumbleGeo=tumbleGeo();K.tumbleMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true,vertexColors:true,side:THREE.DoubleSide});
  }
  /* Mỗi cục đi trên một đường Lissajous chậm (2 sin lệch tần số/pha) quanh tâm ô, biên độ giới hạn để không ra khỏi ô; xoay lăn THẬT theo quãng đường đi (góc = quãng đường / bán kính,
     quanh trục vuông góc hướng đi). Chỉ cập nhật ~30 lần/giây, không cấp phát bộ nhớ trong vòng lặp, không đổ bóng. */
  function stepTumble(dt,force){
    tumbleAcc+=dt;if(!force&&tumbleAcc<.033)return;tumbleAcc=0;
    const t=time.value;
    for(let i=0;i<tumbles.length;i++){
      const o=tumbles[i],nx=o.cx+o.ax*Math.sin(o.w1*t+o.p1),nz=o.cz+o.az*Math.sin(o.w2*t+o.p2),dx=nx-o.x,dz=nz-o.z,d=Math.hypot(dx,dz);
      if(d>1e-6){tw.a.set(dz/d,0,-dx/d);tw.q.setFromAxisAngle(tw.a,d/o.r);o.q.premultiply(tw.q).normalize();}
      o.x=nx;o.z=nz;tw.p.set(nx,o.y,nz);tw.s.setScalar(o.r);tw.m.compose(tw.p,o.q,tw.s);tumbleMesh.setMatrixAt(i,tw.m);
    }
    tumbleMesh.instanceMatrix.needsUpdate=true;
  }
  /* Không dùng THREE ở mức trên cùng (three.js tải lười) → tạo tuỳ chọn lúc cần. */
  const swOpt=()=>({color:0xffffff,roughness:.78,flatShading:true,vertexColors:true,side:THREE.DoubleSide});
  function ensureReeds(K){if(K.reedGeo)return;K.reedGeo=reedGeo();K.reedMat=swayMaterial(K,swOpt(),true,.4);}
  function ensureSnow(K){
    if(K.snowmanGeo)return;
    K.snowmanGeo=snowmanGeo();K.snowmanMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,vertexColors:true});
    K.icicleGeo=spikeGeo([.5,.78,1],[.95,1,1]);
    K.icicleMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.08,metalness:0,flatShading:true,vertexColors:true,transparent:true,opacity:.88,emissive:0x2c7fd8,emissiveIntensity:.22});
    if(K.env){K.icicleMat.envMap=K.env;K.icicleMat.envMapIntensity=1.4;}
  }
  /* Đá: phủ rêu/tuyết/cát (uCover, theo biome) lên mặt trên và chân đá, vị trí theo noise toạ độ thế giới (mỗi khối một khác). (Đã bỏ các đốm khoáng trắng lấp lánh.) */
  function stoneShader(m,K){
    m.onBeforeCompile=sh=>{
      sh.uniforms.uCover=K.U.cover;sh.uniforms.uCoverAmt=K.U.coverAmt;
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>',`#include <begin_vertex>
vec4 wps=vec4(transformed,1.0);
#ifdef USE_INSTANCING
wps=instanceMatrix*wps;
#endif
vWP=(modelMatrix*wps).xyz;`);
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
uniform vec3 uCover;uniform float uCoverAmt;varying vec3 vWP;
float sh1(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float sn1(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sh1(i),sh1(i+vec2(1.,0.)),f.x),mix(sh1(i+vec2(0.,1.)),sh1(i+vec2(1.,1.)),f.x),f.y);}`)
        .replace('#include <color_fragment>',`#include <color_fragment>
vec3 wnn=normalize(cross(dFdx(vWP),dFdy(vWP)));
float topF=smoothstep(.6,.9,wnn.y);
float nz=sn1(vWP.xz*6.)*.6+sn1(vWP.xz*15.)*.4;
float cov=topF*smoothstep(.3,.55,nz)+(1.-smoothstep(-.1,.14,vWP.y))*.55*smoothstep(.45,.7,nz)*(1.-topF);
diffuseColor.rgb=mix(diffuseColor.rgb,uCover,clamp(cov,0.,1.)*uCoverAmt);`);
    };
  }

  /* Cát: GỢN SÓNG kiểu gợn cát do gió (khác sóng nước): các gợn KHÔNG đều: hướng, độ dày và độ đậm đổi dần theo vị trí (noise), hiện từng mảng, có chỗ cát phẳng, uốn lượn mạnh (hai tần số lệch pha, gợn bất đối xứng).
     TĨNH: không phụ thuộc thời gian (không có uniform uT) nên cát đứng yên và không làm cảnh phải vẽ lại liên tục.
     Tính theo TOẠ ĐỘ THẾ GIỚI nên liền mạch giữa các ô. Gợn làm lệch pháp tuyến (ăn sáng/tối theo ánh sáng) + hơi đổi độ sáng.
     NHÁM: thêm hạt li ti theo ô lưới mịn (~72 hạt/đơn vị): lệch độ sáng và lệch pháp tuyến ngẫu nhiên từng hạt. Chỉ áp dụng cho mặt trên (vách bên không gợn). */
  function sandShader(m){
    m.onBeforeCompile=sh=>{
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vWP;
float sdh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float sdn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sdh(i),sdh(i+vec2(1.,0.)),f.x),mix(sdh(i+vec2(0.,1.)),sdh(i+vec2(1.,1.)),f.x),f.y);}`)
        .replace('#include <color_fragment>',`#include <color_fragment>
vec3 sWn=normalize(cross(dFdx(vWP),dFdy(vWP)));
float sTop=smoothstep(.7,.95,abs(sWn.y));
vec2 sp=vWP.xz;
float sAg=(sdn(sp*.38+3.1)-.5)*4.4+(sdn(sp*1.05+8.7)-.5)*1.6+.5;   /* hướng gợn đổi dần theo vị trí (không còn một hướng gió chung) */
vec2 sDr=vec2(cos(sAg),sin(sAg));
float sFq=11.+10.*sdn(sp*.55+5.2);                                    /* tần số gợn cũng đổi: chỗ thưa chỗ dày */
float sPh=dot(sp,sDr)*sFq+4.*sdn(sp*1.6+1.3)+2.*sdn(sp*4.1+6.6);     /* uốn lượn mạnh nhờ noise */
float sAm=smoothstep(.3,.68,sdn(sp*.7+2.4));                          /* gợn chỉ hiện từng mảng, có chỗ cát phẳng */
float sRp=(sin(sPh)+.5*sin(2.*sPh+1.1))*sAm;
float sGr=sdh(floor(sp*72.));
float sBl=sdn(sp*.5+11.)+.5*sdn(sp*1.7+4.);                           /* loang sáng tối rộng */
diffuseColor.rgb*=(.92+.13*sBl)*(1.+sTop*(.06*sRp+.16*(sGr-.5)));`)
        .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
{
  float sd=(cos(sPh)+cos(2.*sPh+1.1))*sFq*.0035*sAm;
  vec2 sg=vec2(sdh(floor(sp*72.)+3.3),sdh(floor(sp*72.)+9.1))-.5;
  vec3 sP=vec3(sDr.x*sd+sg.x*.14,0.,sDr.y*sd+sg.y*.14)*sTop;
  normal=normalize(normal-(viewMatrix*vec4(sP,0.)).xyz);
}`);
    };
  }

  /* Áp bảng màu biome vào vật liệu/uniform hiện có (rẻ, gọi bao nhiêu lần cũng được). */
  function applyBiome(){
    if(!cache)return;
    const K=cache,b=biome;
    K.U.gA.value.setHex(b.grass[0]);K.U.gB.value.setHex(b.grass[1]);K.U.cover.value.setHex(b.cover);K.U.coverAmt.value=b.coverAmt;
    baseSway=Object.assign({},cfg(),b.shape).sway;K.U.amp.value=baseSway*(1+gustK*1.2);
    K.dirt.color.setHex(b.dirt);K.sand.color.setHex(b.sand);K.stone.color.setHex(b.stone);
    K.waterGlass.color.setHex(b.water);K.waterBase.color.setHex(b.water).multiplyScalar(.45);
    if(flowerMesh){
      const n=b.flowers.length,c=new THREE.Color();flowerMesh.visible=n>0;
      if(n){flowerCols.forEach((h,i)=>flowerMesh.setColorAt(i,c.setHex(b.flowers[h%n])));flowerMesh.instanceColor.needsUpdate=true;}
    }
    if(stage){if(stage.setFloorTint)stage.setFloorTint(b.floor);stage.invalidate(true);}
  }
  /* defer=true: ván mới sắp gọi build() ngay sau đó, nên đừng dựng lại bản đồ CŨ chỉ để đổi hình cỏ (rematch trước đây dựng đôi: bản cũ rồi bản mới) */
  function setBiome(p,defer){
    if(typeof p==='string')p=BIOMES[p]||{};
    const old=JSON.stringify(biome.shape);
    biome=Object.assign({},biome,p);
    if(defer)return;
    if(stage&&lastTerr&&JSON.stringify(biome.shape)!==old)build(stage,lastTerr,lastSeed);   /* hình dạng cỏ đổi → dựng lại (build tự gọi applyBiome) */
    else applyBiome();
  }
  /* Gió giật (Weather): k = 0..~1.4 → biên độ lay của cỏ tăng thêm k·120%. Chỉ là uniform, không dựng lại gì. */
  function setGust(k){
    gustK=k||0;Sfx.gust(gustK);
    if(cache){cache.U.amp.value=baseSway*(1+gustK*1.2);if(stage)stage.invalidate();}
  }
  function setPieces(list){
    if(!cache)return;
    for(let i=0;i<4;i++){const q=list&&list[i];cache.U.pc.value[i].set(q?q[0]:999,q?q[1]:999,q?(q[2]||.38):0);}
    if(stage)stage.invalidate(true);
  }

  /* Cỏ: màu = (gradient gốc→ngọn của đỉnh) × (độ sáng riêng từng lưỡi) × (bảng màu biome, loang giữa 2 màu theo noise toạ độ thế giới) → đổi biome không cần dựng lại.
     head=true: vật liệu đầu hoa (không vertexColors, màu = instanceColor, đung đưa như ngọn cỏ). */
  function grassMaterial(K,head){
    const m=head?new THREE.MeshStandardMaterial({color:0xffffff,roughness:.55,flatShading:true}):new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85,flatShading:true,vertexColors:true,side:THREE.DoubleSide});
    if(head)m.defines={HEAD:1};
    m.onBeforeCompile=sh=>{
      sh.uniforms.uTime=time;sh.uniforms.uAmp=K.U.amp;sh.uniforms.uSpd={value:cfg().swaySpeed};sh.uniforms.uGA=K.U.gA;sh.uniforms.uGB=K.U.gB;sh.uniforms.uPc=K.U.pc;
      /* gió tính trong không gian bàn (sau instanceMatrix) nên mọi lưỡi bị thổi cùng hướng dù xoay khác nhau; ngọn lệch nhiều hơn gốc (k=y²) */
      sh.vertexShader=sh.vertexShader.replace('#include <common>',`#include <common>
uniform float uTime;uniform float uAmp;uniform float uSpd;uniform vec3 uGA;uniform vec3 uGB;uniform vec3 uPc[4];
float gh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1.,0.)),f.x),mix(gh(i+vec2(0.,1.)),gh(i+vec2(1.,1.)),f.x),f.y);}`)
        .replace('#include <project_vertex>',`
vec4 mvPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
  mvPosition=instanceMatrix*mvPosition;
  float hs=length(instanceMatrix[1].xyz),k=transformed.y*transformed.y;
  #ifdef HEAD
    hs=.5;k=1.0;
  #endif
  vec3 ip=instanceMatrix[3].xyz;float t=uTime*uSpd,ph=ip.x*12.9+ip.z*78.2;
  float gust=sin(t*1.4+dot(ip.xz,vec2(1.0,.45))*1.3)*.55+sin(t*2.6+ip.x*2.1-ip.z*1.7)*.3;   /* sóng gió lớn trượt qua bãi */
  float flutter=sin(t*5.3+ph)*.12+sin(t*3.1+ph*1.7)*.08;                                     /* rung riêng từng lưỡi */
  float w=(gust+.35+flutter)*uAmp*k*hs;
  mvPosition.x+=w;mvPosition.z+=w*.4+sin(t*1.9+ip.x*1.4)*.25*uAmp*k*hs;
  for(int i=0;i<4;i++){   /* quân cờ đi qua: cỏ rạp ra xa và thấp xuống */
    vec2 d=ip.xz-uPc[i].xy;float l=length(d)+1e-4,f=clamp(1.-l/max(uPc[i].z,.001),0.,1.);f*=f;
    mvPosition.xz+=d/l*f*.3*k*hs;mvPosition.y-=f*.22*k*hs;
  }
  #ifdef USE_COLOR
    float gpatch=smoothstep(.35,.65,gn(ip.xz*.9));   /* loang màu theo vị trí */
    vColor.xyz*=mix(uGA,uGB,gpatch)*(1.+.22*gust*k);   /* sóng gió làm ngọn sáng lên khi lướt qua */
  #endif
#endif
mvPosition=modelViewMatrix*mvPosition;
gl_Position=projectionMatrix*mvPosition;`);
    };
    return m;
  }

  /* ----- Dựng ----- */
  /* Gộp các ô cùng nhóm thành MỘT mặt liền (không khe, không đường nối, đáy cũng liền) và chỉ dựng vách ở rìa thật sự.
     Lưới con 3N×3N: mỗi ô = [mép trái nới e | lõi | mép phải nới e] (e = nửa khe giữa hai ô). Ô con nới chỉ được lấp khi ô kề tương ứng cũng thuộc nhóm (inG);
     ô con GÓC nới chỉ lấp khi cả hai ô kề VÀ ô chéo đều thuộc nhóm → không còn cục nhô ra ở góc lõm của chữ L (lỗi cũ: mỗi ô tự nới cả hai chiều rồi còn thêm miếng lấp 3 ô).
     own(r,c): ô thuộc mesh này · inG(r,c): ô thuộc nhóm để nối liền · blk(r,c): ô che mất vách (không dựng vách giữa hai ô con cùng loại này) · UV theo toạ độ thế giới → texture liền mạch. */
  function slabGeo(own,inG,blk,yTop,yBot,uvk){
    const C=CFG.CELL,P=CFG.PITCH,e=(P-C)/2,bx=[cellX(0)-C/2-e],bz=[cellZ(0)-C/2-e],M=3*N,pos=[],uv=[];
    for(let i=0;i<N;i++){bx.push(cellX(i)-C/2,cellX(i)+C/2,cellX(i)+C/2+e);bz.push(cellZ(i)-C/2,cellZ(i)+C/2,cellZ(i)+C/2+e);}   /* mép chung dùng đúng một giá trị → khít tuyệt đối */
    const fill=(a,b,ow)=>{
      if(a<0||b<0||a>=M||b>=M)return false;
      const c=(a/3)|0,r=(b/3)|0;if(!ow(r,c))return false;
      const dx=a-3*c-1,dz=b-3*r-1;
      if(dx&&!inG(r,c+dx))return false;if(dz&&!inG(r+dz,c))return false;if(dx&&dz&&!inG(r+dz,c+dx))return false;
      return true;
    };
    const tri=(a,b,c,h,wall)=>{
      const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      if((uy*vz-uz*vy)*h[0]+(uz*vx-ux*vz)*h[1]+(ux*vy-uy*vx)*h[2]<0){const t=b;b=c;c=t;}
      for(const q of[a,b,c]){pos.push(q[0],q[1],q[2]);if(wall)uv.push((q[0]+q[2])*uvk,q[1]*uvk);else uv.push(q[0]*uvk,q[2]*uvk);}
    };
    const quad=(a,b,c,d,h,wall)=>{tri(a,b,c,h,wall);tri(a,c,d,h,wall);};
    const hid=(a,b)=>fill(a,b,blk);
    for(let a=0;a<M;a++)for(let b=0;b<M;b++){
      if(!fill(a,b,own))continue;
      const x0=bx[a],x1=bx[a+1],z0=bz[b],z1=bz[b+1];
      quad([x0,yTop,z0],[x1,yTop,z0],[x1,yTop,z1],[x0,yTop,z1],[0,1,0],false);
      if(!hid(a+1,b))quad([x1,yTop,z0],[x1,yTop,z1],[x1,yBot,z1],[x1,yBot,z0],[1,0,0],true);
      if(!hid(a-1,b))quad([x0,yTop,z0],[x0,yTop,z1],[x0,yBot,z1],[x0,yBot,z0],[-1,0,0],true);
      if(!hid(a,b+1))quad([x0,yTop,z1],[x1,yTop,z1],[x1,yBot,z1],[x0,yBot,z1],[0,0,1],true);
      if(!hid(a,b-1))quad([x0,yTop,z0],[x1,yTop,z0],[x1,yBot,z0],[x0,yBot,z0],[0,0,-1],true);
    }
    if(!pos.length)return null;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.computeVertexNormals();g.computeBoundingSphere();return g;
  }
  function addMesh(g,geo,mat,x,y,z,sx,sy,sz,shadow){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.receiveShadow=true;m.castShadow=!!shadow;g.add(m);return m;}

  /* Ô trong suốt có đáy đục (băng / nước).
     QUAN TRỌNG: khung gỗ tối của bàn (stage.js addBoard) có mặt trên ở y=0, trong khi ô cao CELL_H=.2 nằm y∈[-.1,.1]. Nếu đáy đục chỉ dày .05 ở đáy ô (y∈[-.1,-.05]) thì
     nó CHÔN trong khung và nhìn xuyên lớp kính chỉ thấy mặt khung gỗ tối → tối, không trong, không bóng. Nên đáy phải nhô lên trên y=0: đáy y∈[-.1,BASE_TOP], kính y∈[BASE_TOP,.1].
     hide = [+x,-x,+z,-z] mặt thân kính bị ẩn */
  const BASE_TOP=.03;
  /* Băng: 4 biến thể (mỗi biến thể một texture tinh thể) */
  const ICE_VAR=4;
  function ensureIce(K){
    if(K.iceGlass)return;
    const vs=[...Array(ICE_VAR).keys()];
    K.iceGlass=vs.map(v=>K.glass({map:K.tex(iceTex(v)),opacity:.78,roughness:.04,envI:1.5,emissive:0x2c7fd8,emissiveIntensity:.18}));
    K.iceBase=vs.map(v=>{
      const m=new THREE.MeshStandardMaterial({map:K.tex(iceBaseTex(v)),roughness:.3,metalness:0,emissive:0x1a5cb0,emissiveIntensity:.22});
      if(K.env){m.envMap=K.env;m.envMapIntensity=.8;}return m;
    });
  }
  function glassTile(K,kind,x,z,w,d,hide,variant){
    const H=CFG.CELL_H,y0=-H/2,bh=BASE_TOP-y0,gh=H/2-BASE_TOP;
    if(kind==='ice'){   /* hình khối vuông vức như các ô khác; chỉ texture là tinh thể */
      ensureIce(K);const v=variant%ICE_VAR,gm=K.iceGlass[v];
      addMesh(root,K.unit,K.iceBase[v],x,y0+bh/2,z,w-.004,bh,d-.004,false).receiveShadow=false;
      addMesh(root,K.unit,[gm,gm,gm,K.hid,gm,gm],x,BASE_TOP+gh/2,z,w,gh,d,false).renderOrder=1;
      return;
    }
  }

  function build(st,terr,seed){
    lastTerr=terr||null;lastSeed=seed;   /* nhớ để setBiome dựng lại khi hình dạng cỏ đổi */
    clear();
    if(!terr)return;
    if(typeof terr==='string')terr=Uint8Array.from(terr,ch=>ch.charCodeAt(0)-48);
    hasWater=false;hasSand=false;stage=st;const K=getCache(st),C=CFG.CELL,H=CFG.CELL_H,TP=H/2,cf=cfg();
    const sp=Object.assign({},cf,biome.shape),lk=sp.lean===undefined?1:sp.lean,hm=sp.hMul||1,bladeCurve=(BLADES[sp.geo]||BLADES.grass).curve;   /* sp = cấu hình cỏ đã gộp hình dạng của biome */
    root=new THREE.Group();st.scene.add(root);
    if(!K.stoneGeos||K.stoneH!==cf.stoneH){if(K.stoneGeos)K.stoneGeos.forEach(g=>g.dispose());K.stoneGeos=[0,1,2].map(v=>stoneGeo(cf.stoneH,v));K.stoneH=cf.stoneH;}
    if(!K.lowGeos||K.lowH!==cf.lowH){if(K.lowGeos)K.lowGeos.forEach(g=>g.dispose());K.lowGeos=[0,1,2].map(v=>stoneGeo(cf.lowH,v));K.lowH=cf.lowH;}
    curTerr=terr;stoneAt.clear();
    seed=seed===undefined?1:(typeof seed==='number'?seed>>>0:[...String(seed)].reduce((a,ch)=>Math.imul(a^ch.charCodeAt(0),16777619)>>>0,2166136261));
    const hideCell=(r,c)=>{const m=st.cells[r][c];if(m){m.visible=false;hidden.push(m);}};
    const tv=(r,c)=>r>=0&&r<N&&c>=0&&c<N?terr[r*N+c]:0,isSoft=(r,c)=>{const v=tv(r,c);return v===T.WATER||v===T.SAND;},isB=(r,c)=>tv(r,c)===T.BRUSH,own=v=>(r,c)=>tv(r,c)===v;
    const blades=[],flowerList=[],bambooList=[],reedList=[],tumbleList=[],iceList=[],snowmanList=[],stoneList=[[],[],[]],lowList=[[],[],[]],gatePos=[],span=C*.84,half=span/2;
    const dm=new THREE.Object3D(),col=new THREE.Color(),tip=new THREE.Vector3();dm.rotation.order='YXZ';

    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      const k=r*N+c,v=terr[k],x=cellX(c),z=cellZ(r),rnd=mul32((seed+Math.imul(k+1,0x9E3779B1))>>>0);
      if(v===T.STONE){
        hideCell(r,c);const u=rnd();   /* 3 kiểu khối: nguyên / sứt nhẹ / sứt sâu; mỗi khối xoay bội 90°, cao thấp và tông màu lệch nhẹ */
        const vi=u<.55?0:u<.8?1:2,e={x,z,rot:Math.floor(rnd()*4)*Math.PI/2,sy:.94+rnd()*.12,l:.84+rnd()*.28,s:(rnd()-.5)*.1};stoneList[vi].push(e);stoneAt.set(k,{rot:e.rot,sy:e.sy,vi,low:false});
      }else if(v===T.LOW){
        hideCell(r,c);const u=rnd();   /* đá thấp: cùng 3 kiểu khối với đá cao, màu sáng/ẩm hơn (l cao hơn, lệch xanh nhẹ) */
        const vi=u<.55?0:u<.8?1:2,e={x,z,rot:Math.floor(rnd()*4)*Math.PI/2,sy:.94+rnd()*.12,l:1.02+rnd()*.2,s:(rnd()-.5)*.1-.03};lowList[vi].push(e);stoneAt.set(k,{rot:e.rot,sy:e.sy,vi,low:true});
      }else if(v===T.SAND||v===T.WATER){
        hideCell(r,c);   /* mặt cát/nước dựng gộp bên dưới */
        if(v===T.SAND&&sp.tumble>0&&tumbleList.length<12&&rnd()<sp.tumble){   /* tumbleweed lăn trong ô cát */
          const tr=.13+rnd()*.05,lim=C/2-tr-.05;
          tumbleList.push({cx:x,cz:z,y:TP+tr*1.05,r:tr,ax:lim*(.55+rnd()*.45),az:lim*(.55+rnd()*.45),w1:.2+rnd()*.2,w2:.16+rnd()*.2,p1:rnd()*6.283,p2:rnd()*6.283,e0:rnd()*6.283,e1:rnd()*6.283,e2:rnd()*6.283});
        }
        if(v===T.WATER&&sp.reeds>0){   /* lau sậy mọc TRONG nước nhưng SÁT MÉP ô giáp bờ: mỗi cạnh giáp bờ có 1–3 cụm rải dọc theo cạnh; góc lõm của bờ cũng có cụm */
          const inB=(rr,cc)=>rr>=0&&rr<N&&cc>=0&&cc<N,isLand=(rr,cc)=>inB(rr,cc)&&tv(rr,cc)!==T.WATER,isWat=(rr,cc)=>inB(rr,cc)&&tv(rr,cc)===T.WATER;
          const edge=C/2-.07;   /* cách tâm ô: sát mép ô nước, gốc lau vẫn nằm trong nước */
          const put=(px,pz)=>reedList.push({x:x+px,z:z+pz,y:BASE_TOP,yaw:rnd()*6.283,s:.55+rnd()*.3});
          for(const[dr,dc]of[[0,1],[0,-1],[1,0],[-1,0]]){
            if(!isLand(r+dr,c+dc)||rnd()>sp.reeds)continue;
            const n=1+Math.floor(rnd()*3);
            for(let i=0;i<n;i++){
              const along=(rnd()-.5)*(C-.24),depth=edge-rnd()*.06;   /* dọc theo cạnh bờ, thụt vào trong nước tối đa .06 */
              put(dc*depth+(dr?along:0),dr*depth+(dc?along:0));
            }
          }
          for(const[dr,dc]of[[1,1],[1,-1],[-1,1],[-1,-1]]){   /* góc: ô chéo là bờ còn hai ô kề là nước → cụm nằm đúng góc ô */
            if(isLand(r+dr,c+dc)&&isWat(r+dr,c)&&isWat(r,c+dc)&&rnd()<sp.reeds)put(dc*(edge-rnd()*.05),dr*(edge-rnd()*.05));
          }
        }
      }else if(v===T.ICE){
        hideCell(r,c);glassTile(K,'ice',x,z,C,C,[0,0,0,0],Math.floor(rnd()*ICE_VAR));
      }else if(v===T.BRUSH){
        hideCell(r,c);   /* nền đất dựng gộp bên dưới */
        /* cạnh nào giáp ô KHÔNG phải cỏ thì cỏ thưa dần và thấp dần về cạnh đó; cạnh giáp ô cỏ khác giữ nguyên để bãi cỏ liền mạch */
        const open=[isB(r,c+1)?0:1,isB(r,c-1)?0:1,isB(r+1,c)?0:1,isB(r-1,c)?0:1];
        const edgeD=(px,pz)=>Math.max(open[0]*Math.max(0,px),open[1]*Math.max(0,-px),open[2]*Math.max(0,pz),open[3]*Math.max(0,-pz))/half;
        /* cụm cỏ rải kiểu dart-throwing (cách nhau tối thiểu) → phân bố tự nhiên, không lưới, không chỗ chồng chỗ trống */
        const pts=[],minD=span/Math.sqrt(sp.tufts)*.72;
        for(let a=0;a<sp.tufts*16&&pts.length<sp.tufts;a++){
          const px=(rnd()-.5)*span,pz=(rnd()-.5)*span,d=edgeD(px,pz);
          if(rnd()>1-.6*d*d)continue;
          if(pts.every(q=>(q[0]-px)*(q[0]-px)+(q[1]-pz)*(q[1]-pz)>=minD*minD))pts.push([px,pz,d]);
        }
        for(const[px,pz,d]of pts){
          const nb=Math.max(2,sp.tuftBlades-1+Math.floor(rnd()*3)),tall=(.75+rnd()*.5)*(1-.25*d);   /* mỗi cụm cao thấp khác nhau */
          for(let i=0;i<nb;i++){
            const a=rnd()*6.283,rad=rnd()*.09,out=rad/.09;   /* lưỡi ngoài rìa cụm nghiêng nhiều hơn, thấp hơn */
            blades.push({x:x+px+Math.cos(a)*rad,z:z+pz+Math.sin(a)*rad,
                         h:(sp.bladeH[0]+rnd()*(sp.bladeH[1]-sp.bladeH[0]))*tall*(1-.25*out),s:.8+rnd()*.5,
                         yaw:Math.PI/2-a+(rnd()-.5)*.9,lean:(.06+out*.28+rnd()*.22)*lk,lig:.3+rnd()*.12});
          }
        }
        if(sp.flowers>0&&rnd()<sp.flowers){   /* hoa: một cọng cao + đầu hoa (instance riêng, màu theo biome) */
          const nf=1+Math.floor(rnd()*(sp.nf||2));
          for(let f=0;f<nf;f++){
            const px=(rnd()-.5)*span,pz=(rnd()-.5)*span;if(edgeD(px,pz)>.6)continue;
            const fl={x:x+px,z:z+pz,h:(.55+rnd()*.2)*hm,yaw:rnd()*6.283,lean:(.1+rnd()*.15)*Math.min(1,lk),col:Math.floor(rnd()*8),sc:.8+rnd()*.5};
            flowerList.push(fl);blades.push({x:fl.x,z:fl.z,h:fl.h,s:.55,yaw:fl.yaw,lean:fl.lean,lig:.36});
          }
        }
        if(sp.cactus>0&&rnd()<sp.cactus){   /* xương rồng: tối đa 1 cây/ô, tránh sát mép */
          const px=(rnd()-.5)*span*.6,pz=(rnd()-.5)*span*.6;
          if(edgeD(px,pz)<.45)buildCactus(K,x+px,z+pz,TP,rnd);
        }
        if(sp.bamboo>0&&rnd()<sp.bamboo){   /* cây tre lẻ: mỗi ô tối đa 1 cây, hiếm, cao vượt hẳn cỏ (như xương rồng ở sa mạc), tránh sát mép ô */
          const px=(rnd()-.5)*span*.5,pz=(rnd()-.5)*span*.5;
          if(edgeD(px,pz)<.4){
            const nbm=1;   /* cây lẻ */
            for(let i=0;i<nbm;i++)bambooList.push({x:x+px+(rnd()-.5)*.24,z:z+pz+(rnd()-.5)*.24,s:2.8+rnd()*.8,yaw:rnd()*6.283,tx:(rnd()-.5)*.08,tz:(rnd()-.5)*.08});
          }
        }
        let snowmanHere=false;
        if(sp.snowman>0&&rnd()<sp.snowman){   /* người tuyết: tối đa 1/ô, không sát mép; ô có người tuyết thì không thêm cột băng */
          const px=(rnd()-.5)*span*.5,pz=(rnd()-.5)*span*.5;
          if(edgeD(px,pz)<.4){snowmanList.push({x:x+px,z:z+pz,y:TP,yaw:rnd()*6.283,s:1+rnd()*.3});snowmanHere=true;}
        }
        if(!snowmanHere&&sp.icicles>0&&rnd()<sp.icicles){   /* cụm 2–4 cột băng nhọn nhỏ: một cột chính cao hơn + vài cột thấp quanh */
          const px=(rnd()-.5)*span*.6,pz=(rnd()-.5)*span*.6;
          if(edgeD(px,pz)<.5){
            const ni=2+Math.floor(rnd()*3);
            for(let i=0;i<ni;i++){
              const a=rnd()*6.283,dd=i?.05+rnd()*.09:0,hh=i?.15+rnd()*.25:.35+rnd()*.25;
              iceList.push({x:x+px+Math.cos(a)*dd,z:z+pz+Math.sin(a)*dd,y:TP,yaw:rnd()*6.283,rx:(rnd()-.5)*.35,rz:(rnd()-.5)*.35,sx:.04+rnd()*.035,sy:hh});
            }
          }
        }
      }else if(v===T.TRAP)buildTrap(K,x,z,TP);
      else if(v===T.CHEST)buildChest(K,x,z,TP,rnd,r,c);
      else if(v===T.PORTAL)gatePos.push([x,z,r,c]);
    }

    /* đá: mỗi biến thể một InstancedMesh (tối đa 3 draw call cho cả bàn), màu riêng từng khối qua instanceColor */
    for(const[lists,geoSet]of[[stoneList,K.stoneGeos],[lowList,K.lowGeos]])lists.forEach((lst,vi)=>{
      if(!lst.length)return;
      const im=new THREE.InstancedMesh(geoSet[vi],K.stone,lst.length);
      lst.forEach((s,j)=>{
        dm.position.set(s.x,-TP,s.z);dm.rotation.set(0,s.rot,0);dm.scale.set(1,s.sy,1);dm.updateMatrix();
        im.setMatrixAt(j,dm.matrix);im.setColorAt(j,col.setRGB(s.l*(1+s.s),s.l,s.l*(1-s.s)));
      });
      im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;im.frustumCulled=false;im.castShadow=im.receiveShadow=true;root.add(im);stones.push(im);
    });

    /* mặt cát / nước / nền cỏ: gộp thành mesh liền (xem slabGeo) */
    const none=()=>false,UVK=.45,mk=(g,mat,order)=>{if(!g)return null;geos.push(g);const m=addMesh(root,g,mat,0,0,0,1,1,1,false);if(order)m.renderOrder=order;return m;};
    hasSand=!!mk(slabGeo(own(T.SAND),isSoft,own(T.SAND),H/2,-H/2,UVK),K.sand);
    const wTop=slabGeo(own(T.WATER),isSoft,isSoft,H/2,BASE_TOP,UVK);   /* kính: từ mặt đáy đục lên mặt ô */
    if(wTop){mk(wTop,K.waterGlass,1);mk(slabGeo(own(T.WATER),isSoft,isSoft,BASE_TOP,-H/2,UVK),K.waterBase).receiveShadow=false;hasWater=true;}
    mk(slabGeo(own(T.BRUSH),none,none,H/2,-H/2,UVK),K.dirt);   /* cỏ: MỖI Ô MỘT KHỐI RIÊNG (không nới nửa khe, dựng vách cả bốn cạnh) như ô băng/đá, vì vẫn đặt tường được giữa hai ô cỏ; chỉ cát/nước mới liền nhau */
    for(const[x,z,gr,gc]of gatePos)buildGate(K,x,z,TP,cf,gr,gc);
    waterTex=K.waterNormal;

    /* cỏ: một InstancedMesh cho cả bàn (1 draw call); mỗi lưỡi xoay/nghiêng riêng, độ sáng riêng (màu thật do biome); không đổ bóng để rẻ */
    if(blades.length){
      const im=new THREE.InstancedMesh(getBlade(K,sp.geo),K.grassMat,blades.length);
      blades.forEach((b,j)=>{
        dm.position.set(b.x,TP,b.z);dm.rotation.set(b.lean,b.yaw,0);dm.scale.set(b.s,b.h,b.s);dm.updateMatrix();
        const l=b.lig/.36;im.setMatrixAt(j,dm.matrix);im.setColorAt(j,col.setRGB(l,l,l));
      });
      im.instanceMatrix.needsUpdate=true;im.frustumCulled=false;im.receiveShadow=true;root.add(im);grass.push(im);
    }
    if(flowerList.length){   /* đầu hoa đặt đúng ngọn cọng (tính bằng cùng ma trận của cọng; ngọn cọng lệch theo độ cong của kiểu lưỡi) */
      const hmsh=new THREE.InstancedMesh(K.headGeo,K.headMat,flowerList.length);
      flowerList.forEach((f,j)=>{
        dm.position.set(f.x,TP,f.z);dm.rotation.set(f.lean,f.yaw,0);dm.scale.set(.55,f.h,.55);dm.updateMatrix();
        tip.set(0,1,bladeCurve).applyMatrix4(dm.matrix);
        dm.position.copy(tip);dm.rotation.set(0,0,0);dm.scale.set(f.sc,f.sc,f.sc);dm.updateMatrix();hmsh.setMatrixAt(j,dm.matrix);
      });
      hmsh.instanceMatrix.needsUpdate=true;hmsh.frustumCulled=false;root.add(hmsh);grass.push(hmsh);
      flowerMesh=hmsh;flowerCols=flowerList.map(f=>f.col);
    }
    if(bambooList.length){   /* tre: thân + lá dùng chung ma trận (2 InstancedMesh cho cả bàn) */
      ensureBamboo(K);
      const cm=new THREE.InstancedMesh(K.bambooCulm,K.bambooCulmMat,bambooList.length),lm=new THREE.InstancedMesh(K.bambooLeaf,K.bambooLeafMat,bambooList.length);
      bambooList.forEach((b,j)=>{
        dm.position.set(b.x,TP,b.z);dm.rotation.set(b.tx,b.yaw,b.tz);dm.scale.setScalar(b.s);dm.updateMatrix();
        cm.setMatrixAt(j,dm.matrix);lm.setMatrixAt(j,dm.matrix);
      });
      for(const im of[cm,lm]){im.instanceMatrix.needsUpdate=true;im.frustumCulled=false;im.receiveShadow=true;root.add(im);grass.push(im);}
      cm.castShadow=true;
    }
    /* vật trang trí: mỗi loại một InstancedMesh. sway=true → có gió (vào nhóm grass, cần vẽ lại liên tục); false → tĩnh (vào nhóm stones, chỉ để dọn dẹp) */
    const addInst=(list,geo,mat,sway,cast)=>{
      if(!list.length)return;
      const im=new THREE.InstancedMesh(geo,mat,list.length);
      list.forEach((o,j)=>{
        dm.position.set(o.x,o.y,o.z);dm.rotation.set(o.rx||0,o.yaw||0,o.rz||0);dm.scale.set(o.sx||o.s,o.sy||o.s,o.sz||o.sx||o.s);dm.updateMatrix();
        im.setMatrixAt(j,dm.matrix);if(o.l)im.setColorAt(j,col.setRGB(o.l,o.l,o.l));
      });
      im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
      im.frustumCulled=false;im.receiveShadow=true;im.castShadow=!!cast;root.add(im);(sway?grass:stones).push(im);
    };
    if(reedList.length){ensureReeds(K);addInst(reedList,K.reedGeo,K.reedMat,true,false);}
    if(tumbleList.length){   /* tumbleweed: 1 InstancedMesh, cập nhật ma trận trong stepTumble */
      ensureTumble(K);tw={m:new THREE.Matrix4(),p:new THREE.Vector3(),s:new THREE.Vector3(),q:new THREE.Quaternion(),a:new THREE.Vector3()};
      const eu=new THREE.Euler();
      tumbles=tumbleList.map(o=>{o.q=new THREE.Quaternion().setFromEuler(eu.set(o.e0,o.e1,o.e2));o.x=o.cx+o.ax*Math.sin(o.w1*time.value+o.p1);o.z=o.cz+o.az*Math.sin(o.w2*time.value+o.p2);return o;});
      tumbleMesh=new THREE.InstancedMesh(K.tumbleGeo,K.tumbleMat,tumbles.length);tumbleMesh.frustumCulled=false;root.add(tumbleMesh);stones.push(tumbleMesh);
      stepTumble(0,true);
    }
    if(iceList.length||snowmanList.length){ensureSnow(K);addInst(iceList,K.icicleGeo,K.icicleMat,false,false);addInst(snowmanList,K.snowmanGeo,K.snowmanMat,false,true);}
    animOn=cf.anim&&(grass.length>0||gates.length>0||hasWater||tumbles.length>0);   /* cát tĩnh nên không tính vào hoạt ảnh */
    setTraps(trapPhase,true);
    applyBiome();   /* tô màu hoa theo biome hiện tại + invalidate */
    st.invalidate(true);
  }

  /* Xương rồng (sa mạc): thân trụ + chỏm cầu + 0–2 nhánh chữ L. Dùng chung geometry/vật liệu trong cache. */
  function buildCactus(K,x,z,TP,rnd){
    const g=new THREE.Group();g.position.set(x,TP,z);g.rotation.y=rnd()*6.283;g.scale.setScalar(.8+rnd()*.5);
    const G=K.cactusGeo,add=(geo,px,py,pz)=>{const m=new THREE.Mesh(geo,K.cactusMat);m.position.set(px,py,pz);m.castShadow=m.receiveShadow=true;g.add(m);};
    add(G.body,0,.26,0);add(G.cap,0,.52,0);
    for(const sg of[-1,1]){
      if(rnd()<.55)continue;   /* mỗi bên có hoặc không có nhánh */
      const lo=.22+rnd()*.1;
      add(G.armH,sg*.1,lo,0);add(G.armV,sg*.17,lo+.1,0);add(G.armCap,sg*.17,lo+.2,0);
    }
    root.add(g);
  }

  /* Bẫy nằm thấp: hố nông (viền thép cao .03), tấm gỗ lúc bình thường chỉ nhô ~.016 trên viền; khi bật trồi lên .18.
     Mọi khối chồng nhau đều có chênh nhỏ (.002–.02) để không có hai mặt trùng phẳng (z-fighting): hố nhỏ hơn viền, thanh khung to hơn ván. */
  function buildTrap(K,x,z,TP){
    const g=new THREE.Group();g.position.set(x,TP,z);
    const S=CFG.CELL*.86,rw=.05,rh=.03,B=S-.16;   /* S: hố cố định; B: tấm gỗ bật lên (nhỏ hơn hố để lọt vào) */
    const sh=o=>{o.castShadow=o.receiveShadow=true;return o;};
    const pit=new THREE.Mesh(new THREE.BoxGeometry(S-.02,.01,S-.02),K.well);pit.position.y=.005;pit.receiveShadow=true;g.add(pit);   /* đáy hố */
    for(const sg of[-1,1]){   /* viền thép của hố (đứng yên) */
      const a=sh(new THREE.Mesh(new THREE.BoxGeometry(S,rh,rw),K.steel));a.position.set(0,rh/2,sg*(S/2-rw/2));g.add(a);
      const b=sh(new THREE.Mesh(new THREE.BoxGeometry(rw,rh,S-2*rw),K.steel));b.position.set(sg*(S/2-rw/2),rh/2,0);g.add(b);
    }
    const spring=new THREE.Mesh(K.springGeo,K.steel);spring.position.y=.01;spring.castShadow=true;g.add(spring);
    /* tấm bật: ván gỗ + khung thép riêng (khung phát sáng đỏ khi bẫy đang bật) */
    const padMat=K.steel.clone();padMat.emissive=new THREE.Color(0xff3a14);padMat.emissiveIntensity=0;
    const pad=new THREE.Group();
    const wood=sh(new THREE.Mesh(new THREE.BoxGeometry(B,.03,B),K.plate));pad.add(wood);
    const fw=.044,fh=.034,o=.002;   /* khung to hơn ván .002 mỗi phía/trên/dưới */
    for(const sg of[-1,1]){
      const a=sh(new THREE.Mesh(new THREE.BoxGeometry(B+2*o,fh,fw),padMat));a.position.set(0,0,sg*(B/2+o-fw/2));pad.add(a);
      const b=sh(new THREE.Mesh(new THREE.BoxGeometry(fw,fh,B-2*(fw-o)),padMat));b.position.set(sg*(B/2+o-fw/2),0,0);pad.add(b);
    }
    g.add(pad);
    const t={g,spring,pad,padMat,L:0,v:0,phase:0,x,z};layoutTrap(t,0);traps.push(t);root.add(g);
  }
  function layoutTrap(t,jit){
    t.spring.scale.y=Math.max(.005,t.L+.02);t.pad.position.set(jit,.012+Math.max(0,t.L)+.017,0);
  }
  const TRAP_L=[0,0,0],TRAP_GLOW=[0,0,.9];   /* chỉ 2 trạng thái thật: 0 (đóng) và 2 (bật). Bật = khung phát sáng đỏ báo trước; tấm gỗ CHỈ trồi lên khi có quân đạp (fireTrap), không trồi sẵn */
  const TRAP_KICK=8;                        /* vận tốc búng lên của tấm gỗ khi fireTrap (lò xo tự nhún về) */
  const api={shadowBusy:false};
  function setTraps(phase,instant){
    const was=trapPhase;phase=phase>=2?2:0;trapPhase=phase;
    if(!instant&&traps.length&&was!==phase)Sfx.play(phase?'trapArm':'trapClose',{x:traps[0].x,z:traps[0].z,v:.9});
    for(const t of traps){
      t.phase=phase;t.padMat.emissiveIntensity=TRAP_GLOW[phase];
      if(instant){t.L=TRAP_L[phase];t.v=0;layoutTrap(t,0);}
    }
    if(stage)stage.invalidate(true);
  }
  /* Tấm gỗ của bẫy ở ô (r,c) (toạ độ ô) bật tung lên: gọi lúc quân đạp phải bẫy bị hất đi */
  function fireTrap(r,c){
    const x=cellX(c),z=cellZ(r);
    Sfx.play('trapFire',{x,z});
    for(const t of traps)if(Math.abs(t.x-x)<.01&&Math.abs(t.z-z)<.01){t.v=Math.max(t.v,TRAP_KICK);}
    if(stage)stage.invalidate(true);
  }
  /* Cổng nào đang bị chặn (đỏ). cells = [[r,c],…] */
  function setGateBlocked(cells){
    for(const t of gates)t.bt=cells.some(k=>k[0]===t.r&&k[1]===t.c)?1:0;
    if(stage)stage.invalidate();
  }
  function flashGate(r,c){for(const t of gates)if(t.r===r&&t.c===c)t.fl=1;if(stage)stage.invalidate();}

  /* Viền đen cho một hộp w×h×d tâm (0,cy,0): 12 thanh nằm đúng trên 12 cạnh, mặt ngoài của thanh nhô ra .002 so với mặt hộp nên khớp sát, không hở, không chồng mép */
  function boxEdges(g,K,w,h,d,cy,t){
    const bar=(bw,bh,bd,px,py,pz)=>{
      const key=bw+'|'+bh+'|'+bd,geo=K.edgeGeo[key]||(K.edgeGeo[key]=new THREE.BoxGeometry(bw,bh,bd));
      const m=new THREE.Mesh(geo,K.chestEdge);m.position.set(px,cy+py,pz);g.add(m);
    };
    const o=.002,ex=w/2-t/2+o,ey=h/2-t/2+o,ez=d/2-t/2+o;
    for(const a of[-1,1])for(const b of[-1,1]){
      bar(w+2*o,t+2*o,t+2*o,0,a*ey,b*ez);   /* dọc x */
      bar(t+2*o,h+2*o,t+2*o,a*ex,0,b*ez);   /* dọc y */
      bar(t+2*o,t+2*o,d+2*o,a*ex,b*ey,0);   /* dọc z */
    }
  }
  /* Rương: thân cố định + NẮP trong nhóm `lid` đặt đúng trục bản lề (cạnh sau, trên thân) để quay mở; khóa vàng gắn vào thân (nắp mở thì khóa ở lại).
     Một tấm phát sáng vàng nằm ngay trong miệng rương (ẩn tới lúc mở). Mỗi rương được ghi vào `chests` theo ô để Terrain.openChest tìm. */
  function buildChest(K,x,z,TP,rnd,r,c){
    const g=new THREE.Group();g.position.set(x,TP,z);g.rotation.y=Math.floor(rnd()*4)*Math.PI/2;   /* chỉ xoay bội 90° */
    const add=(p,geo,mat,px,py,pz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(px,py,pz);p.add(m);return m;};
    const G=K.chestGeo;
    add(g,G.body,K.chestMat,0,.1,0);
    boxEdges(g,K,.56,.2,.34,.1,.022);
    const lid=new THREE.Group();lid.position.set(0,.2,-.17);g.add(lid);     /* trục bản lề: mép sau, mặt trên thân */
    const lb=new THREE.Group();lb.position.set(0,0,.17);lid.add(lb);          /* tâm nắp cách bản lề nửa bề sâu */
    add(lb,G.lid,K.chestLidMat,0,.055,0);boxEdges(lb,K,.56,.11,.34,.055,.022);   /* khe giữa thân và nắp tự thành một đường đen */
    add(g,G.lock,K.gold,0,.2,.17+.006);
    g.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(.5,.3),new THREE.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
    glow.rotation.x=-Math.PI/2;glow.position.y=.203;glow.renderOrder=3;g.add(glow);
    root.add(g);
    chests.push({r,c,g,lid,glow,t:-1,gone:false});
  }
  /* ----- Mở rương: nắp bật lên (easeOutBack) → giữ mở, miệng rương sáng vàng → thu nhỏ biến mất. Quân đứng chờ tới CHEST_T.hold giây rồi mới bước vào ô ----- */
  const CHEST_T={open:.45,hold:1.35,vanish:.35,angle:1.95};
  function openChest(r,c){
    for(const e of chests)if(e.r===r&&e.c===c&&!e.gone&&e.t<0){e.t=0;Sfx.play('chestOpen',{x:cellX(c),z:cellZ(r)});if(stage)stage.invalidate(true);return true;}
    return false;
  }
  function dropChest(e){
    e.gone=true;e.t=-1;if(e.g.parent)e.g.parent.remove(e.g);
    e.glow.geometry.dispose();e.glow.material.dispose();
  }
  function syncChests(terr){
    if(!terr)return;
    for(const e of chests)if(!e.gone&&terr[e.r*N+e.c]!==T.CHEST)dropChest(e);
    if(stage)stage.invalidate(true);
  }
  function stepChests(dt){
    let busy=false;const C=CHEST_T,c1=1.70158,c3=c1+1;
    for(const e of chests){
      if(e.gone||e.t<0)continue;
      e.t+=dt;busy=true;
      const x=Math.min(1,e.t/C.open),ob=1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);   /* easeOutBack: nắp bật quá rồi về */
      e.lid.rotation.x=-C.angle*ob;
      const v=Math.min(1,Math.max(0,(e.t-C.hold)/C.vanish));
      e.glow.material.opacity=.9*Math.min(1,e.t/(C.open*1.2))*(1-v);
      if(v>0){if(!e.vs){e.vs=1;Sfx.play('vanish',{x:e.g.position.x,z:e.g.position.z});}const k=1-v*v;e.g.scale.set(k,k,k);}
      if(v>=1)dropChest(e);
    }
    return busy;
  }

  /* Cổng: sprite 2D (khung obsidian + lõi xoáy), luôn quay mặt về camera quanh trục đứng. Cả hai tấm nằm trong một Group, Group được xoay mỗi khung hình. */
  const hex3=h=>new THREE.Vector3(((h>>16)&255)/255,((h>>8)&255)/255,(h&255)/255);
  const GATE_VS='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
  const GATE_FS=`
    uniform float uTime;uniform vec3 uA;uniform vec3 uB;uniform float uBlock;uniform float uFlash;varying vec2 vUv;
    float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
    void main(){
      vec2 uv=vUv;                                          /* mịn, không pixel hoá */
      vec2 p=(uv-.5)*vec2(1.,1.5);float r=length(p),a=atan(p.y,p.x)+r*5.-uTime*.7;   /* xoáy */
      vec2 q=vec2(cos(a),sin(a))*r*3.;
      float f=vn(q*2.+uTime*.25)*.6+vn(q*4.-uTime*.4)*.4;
      float streak=vn(vec2(uv.x*7.,uv.y*3.-uTime*1.1));      /* vệt sáng trôi lên */
      vec3 c=mix(uA,uB,smoothstep(.25,.8,f));
      c+=vec3(.55,.5,1.)*pow(streak,3.)*.6;
      float tw=pow(vn(uv*vec2(14.,20.)+vec2(0.,-uTime*1.6)),9.);   /* hạt sáng mịn trôi lên */
      c+=vec3(.7,.85,1.)*tw*.9;
      float lum=dot(c,vec3(.3,.5,.2));                       /* cổng bị chặn: giữ chuyển động và sáng tối của xoáy nhưng nhuộm đỏ */
      c=mix(c,vec3(1.,.1,.06)*(.3+lum*1.5)+vec3(.35,0.,0.)*pow(streak,3.),uBlock);
      vec2 e=min(vUv,1.-vUv);c*=.45+.55*smoothstep(0.,.22,min(e.x*1.6,e.y));   /* tối dần về mép → như chiều sâu */
      c*=.8+.25*sin(uTime*1.5+r*6.);
      c+=vec3(.75,.9,1.)*uFlash;                             /* loé sáng khi có người dịch chuyển */
      gl_FragColor=vec4(c,.96);
    }`;
  function buildGate(K,x,z,TP,cf,r,c){
    const g=new THREE.Group();g.position.set(x,TP,z);
    const W=.72,Ht=.9;   /* khung dày .14 → lõi .44×.62; tấm xoáy to hơn lõi một chút, nằm sau khung nên không hở mép */
    const sprite=new THREE.Group();sprite.position.y=Ht/2;g.add(sprite);   /* tấm này mới bị đẩy ra xa camera, ô sàn thì đứng yên */
    const un={uTime:time,uA:{value:hex3(cf.gateColor)},uB:{value:hex3(cf.gateColor2)},uBlock:{value:0},uFlash:{value:0}};
    const inner=new THREE.Mesh(new THREE.PlaneGeometry(.48,.66),new THREE.ShaderMaterial({
      uniforms:un,vertexShader:GATE_VS,fragmentShader:GATE_FS,transparent:true,depthWrite:false}));
    inner.position.z=-.004;inner.renderOrder=2;sprite.add(inner);
    const frame=new THREE.Mesh(new THREE.PlaneGeometry(W,Ht),new THREE.MeshBasicMaterial({map:K.gateFrameMap,transparent:true,depthWrite:false}));
    frame.renderOrder=3;sprite.add(frame);
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:K.glowMap,color:cf.gateColor2,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.55}));
    glow.rotation.x=-Math.PI/2;glow.position.y=.012;glow.renderOrder=1;g.add(glow);   /* quầng sáng dưới sàn */
    gates.push({g,sprite,x,z,r,c,yaw:NaN,back:cf.gateBack,un,glow,glowCol:new THREE.Color(cf.gateColor2),redCol:new THREE.Color(0xff2a1a),bt:0,bk:0,fl:0});root.add(g);
  }

  function clear(){
    for(const m of hidden)m.visible=true;
    for(const e of chests)if(!e.gone){e.glow.geometry.dispose();e.glow.material.dispose();}   /* mỗi rương có tấm sáng riêng */
    hidden=[];traps=[];gates=[];chests=[];trapPhase=0;api.shadowBusy=false;animOn=false;hasWater=false;hasSand=false;waterTex=null;
    for(const im of grass)if(im.dispose)im.dispose();
    for(const im of stones)if(im.dispose)im.dispose();
    for(const g of geos)g.dispose();
    grass=[];stones=[];geos=[];flowerMesh=null;flowerCols=[];tumbles=[];tumbleMesh=null;
    if(root&&root.parent)root.parent.remove(root);
    root=null;curTerr=null;stoneAt.clear();
  }

  /* Độ cao mặt ô (so với mặt ô thường): 0 / lowH / stoneH, theo terr đang dựng. Ngoài bàn hoặc không có địa hình = 0. Hàm thuần theo terr. */
  function heightAt(r,c){
    if(!curTerr||r<0||r>=N||c<0||c>=N)return 0;
    const v=curTerr[r*N+c],cf=cfg();return v===T.STONE?cf.stoneH:v===T.LOW?cf.lowH:0;
  }

  /* Gọi mỗi khung hình. Trả true khi còn chuyển động (để vòng lặp tiếp tục vẽ). */
  function update(dt){
    if(!root)return false;
    let busy=false;
    if(animOn){
      time.value+=dt;busy=true;
      if(waterTex)waterTex.offset.set(time.value*.035+Math.sin(time.value*.45)*.06,time.value*.022+Math.cos(time.value*.37)*.06);   /* sóng gợn: cuộn chậm + lắc nhẹ */
    }
    if(tumbleMesh&&animOn)stepTumble(dt);
    if(stage&&gates.length){   /* billboard khoá trục đứng: quay mặt về camera, đẩy ra xa camera một chút */
      const cp=stage.cam.position;
      for(const t of gates){
        const dx=cp.x-t.x,dz=cp.z-t.z,yaw=Math.atan2(dx,dz);
        if(Math.abs(yaw-t.yaw)>1e-4||!(t.yaw===t.yaw)){
          t.yaw=yaw;t.sprite.rotation.y=yaw;const l=Math.hypot(dx,dz)||1;t.sprite.position.x=-dx/l*t.back;t.sprite.position.z=-dz/l*t.back;
          busy=true;
        }
      }
    }
    let sb=false;
    for(const t of traps){
      const target=TRAP_L[t.phase],n=Math.max(1,Math.ceil(dt/.0167)),h=dt/n;
      for(let i=0;i<n;i++){t.v+=(target-t.L)*220*h;t.v*=Math.exp(-9*h);t.L+=t.v*h;}
      const moving=Math.abs(t.v)>.002||Math.abs(target-t.L)>.002;
      layoutTrap(t,0);if(moving){busy=true;sb=true;}
    }
    const cb=stepChests(dt);if(cb){busy=true;sb=true;}   /* rương đang mở/biến mất cũng đổi bóng */
    api.shadowBusy=sb;   /* tấm bẫy có đổ bóng: đang nhún thì bản đồ bóng phải dựng lại, nếu không bóng cũ (tấm đang trồi) còn mãi */
    for(const t of gates){   /* cổng: đỏ mượt khi bị chặn, loé sáng tàn dần */
      const dk=t.bt-t.bk,df=t.fl;
      if(Math.abs(dk)>.002){t.bk=Math.abs(dk)<.02?t.bt:t.bk+dk*Math.min(1,dt*7);}
      if(t.fl>0)t.fl=Math.max(0,t.fl-dt*2.6);
      t.un.uBlock.value=t.bk;t.un.uFlash.value=t.fl*t.fl*.8;
      t.glow.material.color.copy(t.glowCol).lerp(t.redCol,t.bk);
      if(Math.abs(t.bt-t.bk)>.002||t.fl>0||df>0)busy=true;
    }
    return busy;
  }

  return Object.assign(api,{build,clear,update,heightAt,surfaceAt,topAt,topMaxAt,_stoneAt:stoneAt,setTraps,fireTrap,setGateBlocked,flashGate,setBiome,setGust,setPieces,openChest,syncChests,chestTime:CHEST_T,biomes:BIOMES,T});
})();