'use strict';
/* [GUIDE-SHOTS] Chạy trong guide-shots.html (iframe ẩn của cửa sổ Hướng dẫn). Nhận bản mô tả cảnh (xem GUIDE trong js/guide-data.js), dựng cảnh bằng
   Stage + Terrain THẬT của game rồi trả ảnh (data URL) về trang cha. Không có hình vẽ tay: mọi ô là mô hình 3D của game.
   Giờ chỉ còn dùng để CHỤP ảnh tĩnh một lần (tools/guide-capture.html, trang đó tự đóng vai "cha"); cửa sổ Hướng dẫn trong game đọc ảnh có sẵn ở img/guide/.
   Tin nhắn:  cha → {t:'shot',key,spec}      con → {t:'ready'} | {t:'img',key,url} | {t:'err',key,why} | {t:'fail',why} */
(function(){
  const post=m=>parent.postMessage(m,'*');
  if(typeof THREE==='undefined'||typeof Stage==='undefined'||typeof Terrain==='undefined'){post({t:'fail',why:'three'});return;}
  window.Sfx={play(){},gust(){}};   /* terrain.js gọi Sfx ở vài chỗ (mở rương, bẫy bật); ảnh tĩnh không cần tiếng */

  const W=512,H=512;                /* kích thước ảnh vuông trả về */
  Stage.init(document.getElementById('host'));
  Stage.ren.setPixelRatio(1);Stage.ren.setSize(W,H);
  Stage.cam.aspect=W/H;Stage.cam.updateProjectionMatrix();

  /* Tông ánh sáng theo biome: cùng bảng CFG.GRADE mà Weather.grade() dùng trong ván */
  function grade(b){
    const L=Stage.L,G=CFG.GRADE,g=G&&G[b]?G[b]:CFG.LIGHT;
    L.hemi.color.setHex(g.hemi[0]);L.hemi.groundColor.setHex(g.hemi[1]);L.hemi.intensity=g.hemi[2];
    L.sun.color.setHex(g.sun[0]);L.sun.intensity=g.sun[1];
    L.fill.color.setHex(g.fill[0]);L.fill.intensity=g.fill[1];
  }

  /* Cùng công thức chọn kiểu khối đá như Terrain.build: bốc u đầu tiên của PRNG theo (seed, chỉ số ô) rồi 55% nguyên / 25% sứt nhẹ / 20% sứt sâu.
     Tìm seed làm ô k ra đúng kiểu vi để ảnh minh họa đủ 3 dạng. Sau khi dựng, đối chiếu lại với Terrain._stoneAt cho chắc. */
  function mul32(a){return function(){a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  function viOf(seed,k){const u=mul32((seed+Math.imul(k+1,0x9E3779B1))>>>0)();return u<.55?0:u<.8?1:2;}
  function seedFor(k,vi){for(let s=1;s<2000;s++)if(viOf(s,k)===vi)return s;return 1;}

  let actorsBuilt=false;
  function showActor(spec,look,tx,tz,yaw){
    const hasP=typeof Pawns!=='undefined'&&Pawns.build,hasB=typeof Blocker!=='undefined'&&Blocker.build;
    if(!hasP)return;
    if(!actorsBuilt){Pawns.build(Stage.scene);if(hasB)Blocker.build(Stage.scene);actorsBuilt=true;}
    for(const p of Pawns.list)p.g.visible=false;
    if(hasB&&Blocker.s)Blocker.s.g.visible=false;
    const face=yaw==null?.785:yaw;   /* mặt nằm ở phía +z của nhóm; xoay quanh y một góc = yaw thì mặt hướng về (sin yaw, cos yaw), tức đúng phía camera */
    if(spec.pawn!=null){const s=Pawns.list[spec.pawn];s.g.position.set(tx,Pawns.floorY(look[0],look[1]),tz);s.g.rotation.y=face;s.g.scale.set(1,1,1);Pawns.settle(s);s.g.visible=true;}
    if(spec.blocker&&hasB&&Blocker.s){const s=Blocker.s;s.g.position.set(tx,TOP,tz);s.g.rotation.y=face;Blocker.settle();s.g.visible=true;}
  }

  function shot(spec){
    const terr=new Uint8Array(N*N),look=spec.look||[4,4];
    const put=(r,c,v)=>{if(r>=0&&r<N&&c>=0&&c<N)terr[r*N+c]=v;};
    if(spec.patch){const[v,k]=spec.patch,a=4-((k-1)>>1);for(let r=a;r<a+k;r++)for(let c=a;c<a+k;c++)put(r,c,v);}
    for(const[r,c,v]of spec.cells||[])put(r,c,v);
    const lk=Math.round(look[0])*N+Math.round(look[1]);
    const seed=spec.vi!=null?seedFor(lk,spec.vi):(spec.seed||7);

    Terrain.setBiome(spec.biome||'meadow',true);   /* đặt biome TRƯỚC khi dựng (cỏ đúng hình dạng ngay), như App.buildTerrain */
    Stage.setTerrain(terr,seed);
    grade(spec.biome||'meadow');
    Terrain.setTraps(spec.trap||0,true);
    Terrain.setGateBlocked(spec.block||[]);

    /* Camera kiểu khối Minecraft: nhìn chéo 45° từ trên xuống, góc mở (fov) rất hẹp + đặt xa để gần như chiếu song song (isometric) */
    const tx=cellX(look[1]),tz=cellZ(look[0]),ty=spec.ty!=null?spec.ty:(spec.pawn!=null||spec.blocker?.5:spec.vi!=null?.3:.15);
    const dist=spec.dist||7,pitch=spec.pitch||.62,yaw=spec.yaw==null?.785:spec.yaw,cp=Math.cos(pitch)*dist;
    Stage.cam.fov=spec.fov||16;Stage.cam.updateProjectionMatrix();
    Stage.cam.position.set(tx+Math.sin(yaw)*cp,ty+Math.sin(pitch)*dist,tz+Math.cos(yaw)*cp);
    Stage.cam.lookAt(tx,ty,tz);
    Stage.cam.updateMatrixWorld();

    /* Rương trong game xoay ngẫu nhiên theo bội 90°: ảnh minh họa luôn quay khóa vàng về phía camera (mặt +z, camera nhìn từ +x/+z) */
    if(Stage.scene&&Stage.scene.traverse&&terr[lk]===5)Stage.scene.traverse(o=>{if(o.isGroup&&o.children.some(c=>c.isGroup)&&Math.abs(o.position.x-tx)<.01&&Math.abs(o.position.z-tz)<.01)o.rotation.y=0;});
    /* Quân cờ / Người chặn đường: dựng model THẬT của game (Pawns.build / Blocker.build) một lần, mỗi ảnh chỉ hiện một nhân vật, mặt quay về camera */
    showActor(spec,look,tx,tz,yaw);
    for(let i=0;i<40;i++)Terrain.update(.05);   /* cổng xoay theo camera, đổi màu mượt, bẫy nhún xong, nước/cỏ chạy vài nhịp */
    /* Mỗi ảnh CHỈ MỘT Ô: cắt mọi thứ ngoài hình hộp thẳng đứng quanh ô look (4 mặt phẳng cắt toàn cục), nền còn lại trong suốt */
    if(THREE.Plane&&THREE.Vector3){
      const h=Math.abs(cellX(look[1]+1)-cellX(look[1]))/2+.03;
      Stage.ren.clippingPlanes=[[1,0,0,tx-h],[-1,0,0,-(tx+h)],[0,0,1,tz-h],[0,0,-1,-(tz+h)]].map(([a,b,c,d])=>new THREE.Plane(new THREE.Vector3(a,b,c),-d));
    }
    Stage.shadowDirty=true;Stage.render();
    /* trang chụp ảnh (tools/guide-capture.html) xin png; mặc định webp */
    return Stage.ren.domElement.toDataURL(spec.png?'image/png':'image/webp',.92);
  }

  addEventListener('message',e=>{
    if(e.source!==parent)return;
    const m=e.data;if(!m||m.t!=='shot')return;
    try{post({t:'img',key:m.key,url:shot(m.spec)});}
    catch(err){post({t:'err',key:m.key,why:String(err&&err.message||err)});}
  });
  post({t:'ready'});
})();
