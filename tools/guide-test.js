#!/usr/bin/env node
'use strict';
/* Kiểm dữ liệu cửa sổ Hướng dẫn (js/guide-data.js):   node tools/guide-test.js
   1) đủ mọi loại ô và mọi vật phẩm của game, không thừa mục lạ;  2) mô tả ảnh (shot) + tên file ảnh (img) hợp lệ: ô nằm trong bàn, mã ô đúng, kiểu đá chỉ đặt ở ô đá, cổng bị chặn đúng ô cổng;
   3) chữ luật khớp số liệu THẬT của lõi (tỉ lệ rương, xác suất lún cát, chu kỳ bẫy, số lần trượt tối đa, sức chứa túi, lịch người chặn đường) nên sửa luật mà quên sửa hướng dẫn là test đỏ. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const GUIDE=require('../js/guide-data.js'),Core=require('../js/core.js');
const CFG=vm.runInNewContext(fs.readFileSync(path.join(root,'js/config.js'),'utf8')+'\n;CFG');
const RS=Core.ruleset('chaos');
let ok=0,bad=0;const ck=(c,m)=>{if(c)ok++;else{bad++;console.log('  ✗',m);}};
const E=GUIDE.entries,byId=Object.fromEntries(E.map(e=>[e.id,e]));
const txt=e=>[e.sum,...e.lines,...(e.note||[])].join('\n');

/* 1. Phủ đủ */
ck(new Set(E.map(e=>e.id)).size===E.length,'id mục trùng nhau');
for(const e of E){
  ck(GUIDE.groups.includes(e.grp),`${e.id}: nhóm "${e.grp}" không có trong GUIDE.groups`);
  ck(e.name&&e.sum&&e.lines&&e.lines.length>0,`${e.id}: thiếu tên / tóm tắt / nội dung`);
}
for(const g of GUIDE.groups)ck(E.some(e=>e.grp===g),`nhóm "${g}" không có mục nào`);
for(const k of Object.keys(CFG.ITEMS)){
  const e=E.find(x=>x.item===k);
  ck(!!e,`vật phẩm ${k} chưa có mục hướng dẫn`);
  if(e)ck(e.name===CFG.ITEMS[k].name,`${k}: tên mục "${e.name}" khác tên trong CFG.ITEMS "${CFG.ITEMS[k].name}"`);
}
for(const e of E)if(e.item)ck(!!CFG.ITEMS[e.item],`${e.id}: item "${e.item}" không có trong CFG.ITEMS`);

/* 2. Ảnh minh họa */
const codes=new Set();
for(const e of E){
  if(e.item){ck(!e.vars,`${e.id}: vật phẩm dùng biểu tượng game, không có ảnh dựng`);continue;}
  for(const[i,v]of(e.vars||[]).entries()){
    const w=`${e.id}#${i} (${v.label})`,s=v.shot;
    ck(/^[a-z0-9-]+\.png$/.test(v.img||''),`${w}: tên file ảnh "${v.img}" sai`);
    if(!fs.existsSync(path.join(root,'img/guide',v.img||'?')))console.log(`  ! thiếu ảnh img/guide/${v.img} (chạy tools/make-guide-images.py)`);
    ck(v.label,`${w}: thiếu nhãn`);
    ck(s&&typeof s.biome==='string'&&!!s.biome,`${w}: thiếu biome`);
    ck(['meadow','forest','river','autumn','desert','snow','mountain'].includes(s.biome),`${w}: biome "${s.biome}" lạ`);
    const cells=[...(s.cells||[])];
    if(s.patch){ck(s.patch[0]>=1&&s.patch[0]<=9&&s.patch[1]>=1&&s.patch[1]<=7,`${w}: patch sai`);codes.add(s.patch[0]);}
    for(const[r,c,v2]of cells){ck(Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&r<=8&&c>=0&&c<=8,`${w}: ô (${r},${c}) ngoài bàn`);ck(Number.isInteger(v2)&&v2>=0&&v2<=9,`${w}: mã ô ${v2} sai`);codes.add(v2);}
    if(s.look)ck(s.look[0]>=0&&s.look[0]<=8&&s.look[1]>=0&&s.look[1]<=8,`${w}: look ngoài bàn`);
    if(s.vi!==undefined){
      const lk=s.look||[4,4],at=cells.find(([r,c])=>r===lk[0]&&c===lk[1]);
      ck([0,1,2].includes(s.vi),`${w}: vi phải 0|1|2`);
      ck(!!at&&(at[2]===1||at[2]===9),`${w}: vi chỉ dùng cho ô đá ở vị trí look`);
    }
    if(s.trap!==undefined)ck(s.trap===0||s.trap===2,`${w}: trap phải 0|2`);
    if(s.trap!==undefined)ck(cells.some(c=>c[2]===4),`${w}: có trap mà không có ô bẫy`);
    for(const[r,c]of s.block||[])ck(cells.some(x=>x[0]===r&&x[1]===c&&x[2]===6),`${w}: block (${r},${c}) không phải ô cổng`);
    if(s.dist!==undefined)ck(s.dist>2&&s.dist<20,`${w}: dist ngoài khoảng`);
  }
  ck(e.vars?e.vars.length>0:true,`${e.id}: vars rỗng`);
}
for(const c of Object.values(Core.TERR))ck(codes.has(c),`mã ô ${c} chưa có ảnh minh họa nào`);
ck(codes.has(0)||E.some(e=>e.id==='floor'),'thiếu ô thường');
ck(E.some(e=>e.id==='floor'&&e.vars.length>0),'mục Ô thường thiếu ảnh');

/* 3. Chữ khớp lõi */
const sumW=Core.GIFTS.reduce((a,g)=>a+g[1],0);
ck(sumW===100,`tổng trọng số quà là ${sumW}, không phải 100 nên tỉ lệ % trong hướng dẫn sẽ sai`);
const label={brick:'Gạch',boots:'Giày',hammer:'Búa',glove:'Găng tay',pick:'Cuốc chim'};
for(const[k,w]of Core.GIFTS)ck(txt(byId.chest).includes(`${label[k]} ${w}%`),`rương: thiếu "${label[k]} ${w}%" (lõi: ${k} ${w})`);
ck(txt(byId.brick).includes(Core.GIFTS.find(g=>g[0]==='brick')[1]+'%'),'gạch: tỉ lệ rơi không khớp lõi');
const sink=Math.round(RS.sandSink*100);
ck(txt(byId.sand).includes(sink+'%'),`cát: lõi lún ${sink}% nhưng hướng dẫn ghi khác`);
ck(txt(byId.trap).includes(`đóng ${RS.trapClosed} lượt`)&&txt(byId.trap).includes(`bật ${RS.trapOpen} lượt`),`bẫy: chu kỳ phải là đóng ${RS.trapClosed} / bật ${RS.trapOpen}`);
ck(txt(byId.ice).includes(RS.slideMax+' lần'),`băng: số lần trượt tối đa phải là ${RS.slideMax}`);
ck(/tối đa 2 món/.test(txt(byId.chest))&&RS.bag===2,`túi đồ: hướng dẫn ghi tối đa 2 món, lõi bag=${RS.bag}`);
const bp=RS.blockerPlan;
/* Kiểm SỐ LIỆU, không kiểm từ ngữ: hướng dẫn được phép viết "lượt" hay "nước", "tường" hay "bức tường" (từng đỏ oan vì test đòi đúng "nước" / "10 tường"). */
const num=(a,b)=>new RegExp(`${a} đến ${b} (nước|lượt)`);
ck(num(bp.first[0],bp.first[1]).test(txt(byId.blocker)),`người chặn đường: lần đầu phải là ${bp.first[0]} đến ${bp.first[1]} lượt`);
ck(num(bp.gap[0],bp.gap[1]).test(txt(byId.blocker)),`người chặn đường: khoảng nghỉ phải là ${bp.gap[0]} đến ${bp.gap[1]} lượt`);
ck(num(bp.stay[0],bp.stay[1]).test(txt(byId.blocker)),`người chặn đường: thời gian đứng phải là ${bp.stay[0]} đến ${bp.stay[1]} lượt`);
ck(new RegExp(`${RS.walls} (bức )?tường`).test(txt(byId.wall)),`đặt tường: mỗi bên phải ghi ${RS.walls} tường (lõi: walls=${RS.walls})`);
ck(/ít nhất 2 (bức )?tường/.test(txt(byId.glove)),'găng tay: điều kiện đối thủ còn ≥ 2 tường (lõi: Core.canUse glove st.left[q]>=2)');
ck(/cạnh/i.test(txt(byId.stone)),'đá cao: luật tường theo cạnh');


/* 4. js/guide-shots.js chạy thử với three.js/Stage/Terrain giả: mọi cảnh phải dựng được, ô đúng mã, seed ra đúng kiểu khối đá, ảnh trả về.
   (Ảnh 3D thật chỉ xem được trên trình duyệt có mạng; ở đây kiểm logic dựng cảnh.) */
{
  const T=fs.readFileSync(path.join(root,'js/view/terrain.js'),'utf8'),GS=fs.readFileSync(path.join(root,'js/guide-shots.js'),'utf8');
  /* công thức chọn kiểu khối đá phải y hệt Terrain.build, nếu không "Sứt nhẹ / Sứt sâu" sẽ không ra đúng dạng */
  for(const f of['(seed+Math.imul(k+1,0x9E3779B1))>>>0','u<.55?0:u<.8?1:2'])ck(T.includes(f)&&GS.includes(f),`công thức kiểu khối đá "${f}" lệch giữa terrain.js và guide-shots.js`);
  const calls=[],msgs=[];let handler=null;
  const noop=()=>{},col={setHex:noop};
  const sandbox={console,Math,Uint8Array,String,
    THREE:{},CFG,N:9,cellX:c=>(c-4)*1.2,cellZ:r=>(r-4)*1.2,
    Terrain:{setBiome:(b)=>calls.push({b}),setTraps:(t)=>calls.push({trap:t}),setGateBlocked:(l)=>calls.push({block:l}),update:noop},
    Stage:{init:noop,L:{hemi:{color:col,groundColor:col},sun:{color:col},fill:{color:col}},
      ren:{setPixelRatio:noop,setSize:noop,domElement:{toDataURL:()=>'data:image/webp;base64,AA=='}},
      cam:{aspect:1,updateProjectionMatrix:noop,updateMatrixWorld:noop,position:{set:noop},lookAt:noop},
      setTerrain:(terr,seed)=>calls.push({terr:Array.from(terr),seed}),render:noop},
    document:{getElementById:()=>({})},
    addEventListener:(t,f)=>{if(t==='message')handler=f;}};
  sandbox.window=sandbox;sandbox.parent={postMessage:m=>msgs.push(m)};
  vm.runInNewContext(GS,sandbox);
  ck(msgs.length===1&&msgs[0].t==='ready','guide-shots.js phải báo ready khi nạp xong');
  /* kiểu khối đá theo công thức của lõi dựng (bản chép từ terrain.js đã kiểm ở trên) */
  const mul32=a=>()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
  const viOf=(seed,k)=>{const u=mul32((seed+Math.imul(k+1,0x9E3779B1))>>>0)();return u<.55?0:u<.8?1:2;};
  for(const e of E)for(const[i,v]of(e.vars||[]).entries()){
    calls.length=0;msgs.length=1;
    handler({source:sandbox.parent,data:{t:'shot',key:e.id+':'+i,spec:v.shot}});
    const m=msgs[msgs.length-1],w=`${e.id}#${i}`;
    ck(m&&m.t==='img'&&m.key===e.id+':'+i&&/^data:image\//.test(m.url),`${w}: không dựng ra ảnh (${m&&m.why})`);
    const tc=calls.find(c=>c.terr);
    ck(!!tc,`${w}: không dựng địa hình`);if(!tc)continue;
    ck(calls.some(c=>c.b===v.shot.biome),`${w}: sai biome`);
    const s=v.shot,exp=new Uint8Array(81);
    if(s.patch){const a=4-((s.patch[1]-1)>>1);for(let r=a;r<a+s.patch[1];r++)for(let c=a;c<a+s.patch[1];c++)exp[r*9+c]=s.patch[0];}
    for(const[r,c,x]of s.cells||[])exp[r*9+c]=x;
    ck(tc.terr.every((x,j)=>x===exp[j]),`${w}: mảng ô dựng ra khác mô tả`);
    if(s.vi!==undefined){const lk=s.look||[4,4];ck(viOf(tc.seed,lk[0]*9+lk[1])===s.vi,`${w}: seed ${tc.seed} không ra kiểu khối ${s.vi}`);}
    if(s.trap!==undefined)ck(calls.some(c=>c.trap===s.trap),`${w}: không đặt trạng thái bẫy`);
  }
  handler({source:{},data:{t:'shot',key:'zzz',spec:{}}});   /* tin nhắn không phải từ trang cha thì bỏ qua */
  ck(!msgs.some(m=>m.key==='zzz'),'guide-shots.js phải bỏ qua tin không phải từ trang cha');
}

console.log(bad?`\nTHẤT BẠI ${bad}/${ok+bad}`:`Tất cả ${ok} kiểm tra đạt`);
process.exit(bad?1:0);
