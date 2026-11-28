#!/usr/bin/env node
'use strict';
/* Kiểm độ cao mặt đá THẬT (Terrain.surfaceAt) khớp với hình học khối đá đang vẽ:   node tools/stone-surface-test.js
   Nạp js/view/terrain.js THẬT với BoxGeometry giả (chỉ sinh lưới đỉnh như three.js: mỗi mặt một lưới riêng), dựng stoneGeo thật, rồi so surfaceAt tại từng nút
   lưới mặt trên với y của chính đỉnh đó (nhân sy, trừ CELL_H). Lỗi gốc: quân/ô gợi ý đặt theo độ cao danh nghĩa (heightAt) nên chìm vào chỗ lồi / lơ lửng ở chỗ lõm. */
const vm=require('vm'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
let fails=0,checks=0;const ok=(c,m)=>{checks++;if(!c){fails++;console.log('  ✗',m);}};

function box(W,Hh,Wd,sx,sy,sz){
  const pos=[],faces=[['x',1,'z','y',sz,sy],['x',-1,'z','y',sz,sy],['y',1,'x','z',sx,sz],['y',-1,'x','z',sx,sz],['z',1,'x','y',sx,sy],['z',-1,'x','y',sx,sy]],dim={x:W,y:Hh,z:Wd};
  for(const[a,sgn,u,v,nu,nv]of faces)for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
    const p={};p[a]=sgn*dim[a]/2;p[u]=-dim[u]/2+dim[u]*i/nu;p[v]=-dim[v]/2+dim[v]*j/nv;pos.push([p.x,p.y,p.z]);}
  const g={pos,attributes:{},translate(x,y,z){for(const p of this.pos){p[0]+=x;p[1]+=y;p[2]+=z;}},setAttribute(n,a){this.attributes[n]=a;},computeVertexNormals(){},computeBoundingSphere(){}};
  g.attributes.position={count:pos.length,getX:i=>pos[i][0],getY:i=>pos[i][1],getZ:i=>pos[i][2],setXYZ(i,x,y,z){pos[i]=[x,y,z];}};
  return g;
}
const ctx=vm.createContext({console,Math,JSON,Date,Map,Set,Uint8Array,Float32Array,window:{},document:{},localStorage:{getItem:()=>null,setItem(){}},
  THREE:{BoxGeometry:box,BufferAttribute:class{constructor(a){this.a=a;}}}});
for(const f of['js/config.js','js/util.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/view/terrain.js'),'utf8').replace('return Object.assign(api,','globalThis.__sg=stoneGeo;return Object.assign(api,'),ctx);
const CF=vm.runInContext('CFG',ctx),TE=vm.runInContext('Terrain',ctx),H=CF.CELL_H;
const TOP_FACE=80;   /* BoxGeometry(…,4,7,4): hai mặt x (5×8=40 đỉnh mỗi mặt) đứng trước mặt trên (lưới 5×5) */

let n=0,worst=0;
for(const[low,top]of[[false,CF.TERRAIN.stoneH],[true,CF.TERRAIN.lowH]])for(const vi of[0,1,2])for(let rot=0;rot<4;rot++)for(const sy of[.94,1,1.06]){
  const g=ctx.__sg(top,vi);TE._stoneAt.clear();TE._stoneAt.set(4*9+4,{rot:rot*Math.PI/2,sy,vi,low});
  const ca=Math.round(Math.cos(rot*Math.PI/2)),sa=Math.round(Math.sin(rot*Math.PI/2));
  for(let iz=1;iz<=3;iz++)for(let ix=1;ix<=3;ix++){   /* nút trong (nút mép bị mẻ ngang nên nội suy lệch chút, quân không đứng ở đó) */
    const v=g.pos[TOP_FACE+iz*5+ix],x=v[0]*ca+v[2]*sa,z=-v[0]*sa+v[2]*ca;
    const d=Math.abs(TE.surfaceAt(x,z)-(sy*v[1]-H));n++;worst=Math.max(worst,d);
    if(d>2e-3)ok(false,`${low?'thấp':'cao'} kiểu ${vi} xoay ${rot*90}° sy=${sy} nút (${ix},${iz}) lệch ${d.toFixed(4)}`);
  }
}
ok(n===3*3*4*2*3||n>0,'có mẫu');checks+=n-1;   /* mỗi mẫu là một kiểm tra */
console.log('Mặt đá thật ↔ đỉnh hình học:',n,'mẫu, lệch lớn nhất',worst.toFixed(5));
ok(worst<2e-3,'sai lệch lớn nhất < 2 mm');
/* heightAt danh nghĩa lệch mặt thật bao nhiêu (lý do phải dùng surfaceAt): đo trên cùng các khối */
let dev=0;for(const sy of[.94,1.06]){TE._stoneAt.clear();TE._stoneAt.set(4*9+4,{rot:0,sy,vi:0,low:false});dev=Math.max(dev,Math.abs(TE.topAt(4,4)-CF.TERRAIN.stoneH));}
ok(dev>.05,'độ cao danh nghĩa lệch mặt thật >.05 ở đá cao (đo được '+dev.toFixed(3)+'): không thể bỏ surfaceAt');
console.log(fails?'\nTHẤT BẠI '+fails+'/'+checks:'\nTất cả '+checks+' kiểm tra đạt');
process.exit(fails?1:0);
