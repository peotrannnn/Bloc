'use strict';
/* [GUIDE-SHOTS] Chạy trong guide-shots.html (iframe ẩn của cửa sổ Hướng dẫn). Nhận bản mô tả cảnh (xem GUIDE trong js/guide-data.js), dựng cảnh bằng
   Stage + Terrain THẬT của game rồi trả ảnh (data URL) về trang cha. Không có hình vẽ tay: mọi ô là mô hình 3D của game.
   Tin nhắn:  cha → {t:'shot',key,spec}      con → {t:'ready'} | {t:'img',key,url} | {t:'err',key,why} | {t:'fail',why} */
(function(){
  const post=m=>parent.postMessage(m,'*');
  if(typeof THREE==='undefined'||typeof Stage==='undefined'||typeof Terrain==='undefined'){post({t:'fail',why:'three'});return;}
  window.Sfx={play(){},gust(){}};   /* terrain.js gọi Sfx ở vài chỗ (mở rương, bẫy bật); ảnh tĩnh không cần tiếng */

  const W=720,H=450;                /* kích thước ảnh trả về (hiện nhỏ hơn trong cửa sổ cho nét) */
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

    /* Camera: nhìn xuống ô look từ chếch một góc (giống góc nhìn mặc định trong ván) */
    const tx=cellX(look[1]),tz=cellZ(look[0]),ty=spec.vi!=null?.28:.12;
    const dist=spec.dist||5.4,pitch=spec.pitch||.85,yaw=spec.yaw==null?.55:spec.yaw,cp=Math.cos(pitch)*dist;
    Stage.cam.position.set(tx+Math.sin(yaw)*cp,ty+Math.sin(pitch)*dist,tz+Math.cos(yaw)*cp);
    Stage.cam.lookAt(tx,ty,tz);
    Stage.cam.updateMatrixWorld();

    for(let i=0;i<40;i++)Terrain.update(.05);   /* cổng xoay theo camera, đổi màu mượt, bẫy nhún xong, nước/cỏ chạy vài nhịp */
    Stage.shadowDirty=true;Stage.render();
    /* webp có alpha nhẹ hơn png nhiều; Safari không có thì tự rơi về png */
    return Stage.ren.domElement.toDataURL('image/webp',.9);
  }

  addEventListener('message',e=>{
    if(e.source!==parent)return;
    const m=e.data;if(!m||m.t!=='shot')return;
    try{post({t:'img',key:m.key,url:shot(m.spec)});}
    catch(err){post({t:'err',key:m.key,why:String(err&&err.message||err)});}
  });
  post({t:'ready'});
})();
