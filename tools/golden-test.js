'use strict';
/* Golden test: Classic và Hỗn Loạn KHÔNG có đá thấp phải cho đúng kết quả của bản trước tính năng đá thấp.
   Bản đồ lưu cứng trong tools/golden/maps-old.json (sinh bằng core + mapgen CŨ), nên đổi mapgen sau này không làm hỏng tham chiếu.
   Mỗi ván ngẫu nhiên có seed: ở MỌI bước băm (moves của hai bên, dist hai bên, snapshot) rồi so với tools/golden/golden-hashes.json.
     node tools/golden-test.js            so sánh
     node tools/golden-test.js --write    GHI LẠI tham chiếu (chỉ chạy trên bản core CHƯA sửa luật, hoặc khi chủ dự án đồng ý đổi luật, vd bẫy hất) */
const fs=require('fs'),path=require('path');
const Core=require('../js/core.js'),BlockerPick=require('../js/blocker-pick.js');
const DIR=path.join(__dirname,'golden'),MAPS=path.join(DIR,'maps-old.json'),HASH=path.join(DIR,'golden-hashes.json');
const WRITE=process.argv.includes('--write');
const GAMES=400,MAXSTEP=140;

const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function fnv(h,s){for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h;}

/* Bản đồ: lần ghi đầu sinh bằng MapGen hiện tại (CHỈ chạy ở bản cũ); sau đó đọc từ file. */
function loadMaps(){
  if(fs.existsSync(MAPS)&&!process.argv.includes('--regen-maps'))return JSON.parse(fs.readFileSync(MAPS,'utf8'));
  const MapGen=require('../js/mapgen.js'),out=[];
  const biomes=['forest','mountain','snow','river','desert'];
  for(let i=0;i<60;i++){const b=biomes[i%5],m=MapGen.generate(1000+i,{biome:b});out.push({biome:b,seed:1000+i,terr:Array.from(m.terr).join(''),spawn:m.spawn});}
  fs.writeFileSync(MAPS,JSON.stringify(out));return out;
}

function playGame(g,maps){
  const rnd=lcg(7000+g);
  const chaos=g%4!==0,map=chaos?maps[g%maps.length]:null;
  const rs=Core.ruleset(chaos?'chaos':'classic'),R=Core.make(rs);
  const st=chaos?R.newState({spawn:map.spawn,terr:Uint8Array.from(map.terr,ch=>ch.charCodeAt(0)-48),seed:g*31+5}):R.newState();
  let h=2166136261>>>0,steps=0;
  const rec=()=>{
    h=fnv(h,JSON.stringify([R.moves(st,0),R.moves(st,1),R.dist(st,0,st.pl[0]),R.dist(st,1,st.pl[1]),R.snapshot(st)]));
  };
  rec();
  while(!st.over&&steps++<MAXSTEP){
    if(chaos){   /* người chặn đường: đặt/gỡ theo nhịp cố định */
      if(steps%23===0&&st.blocker<0){const k=BlockerPick.pick(R,st,rnd);if(k>=0)st.blocker=k;}
      else if(steps%23===9)st.blocker=-1;
    }
    const cand=[];
    for(const m of R.moves(st,st.turn))cand.push({move:m});
    if(st.inv)for(const u of st.inv[st.turn]){
      if(u==='boots'||u==='glove')cand.push({item:{use:u}});
      else for(const w of R.oppWalls(st,st.turn))cand.push({item:{use:u,o:w.o,r:w.r,c:w.c}});
    }
    for(let t=0;t<4;t++){cand.push({wall:{o:rnd()<.5?'h':'v',r:(rnd()*8)|0,c:(rnd()*8)|0}});}
    /* thiên về đi quân để ván tới đích */
    let a=cand[(rnd()*cand.length)|0];
    if(!a.move&&rnd()<.5){const mv=cand.filter(x=>x.move);if(mv.length)a=mv[(rnd()*mv.length)|0];}
    const res=R.apply(st,a);
    h=fnv(h,JSON.stringify([a,res.ok,res.reason||'',res.fx||null,res.skipped||null]));
    rec();
  }
  return h;
}

const maps=loadMaps();
const hashes=[];for(let g=0;g<GAMES;g++)hashes.push(playGame(g,maps));
if(WRITE){fs.writeFileSync(HASH,JSON.stringify(hashes));console.log('Đã ghi',hashes.length,'băm tham chiếu');process.exit(0);}
const ref=JSON.parse(fs.readFileSync(HASH,'utf8'));let bad=0;
for(let g=0;g<GAMES;g++)if(hashes[g]!==ref[g]){bad++;if(bad<=5)console.log('  ✗ ván',g,'khác bản cũ');}
console.log(bad?`Golden: ${bad}/${GAMES} ván KHÁC bản cũ`:`Golden: ${GAMES}/${GAMES} ván trùng bản cũ`);
process.exit(bad?1:0);
