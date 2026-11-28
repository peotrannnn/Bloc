#!/usr/bin/env node
'use strict';
/* Lý do tường bị từ chối: Core.wallWhy + bảng chữ WALL_WHY (js/input.js).   node tools/wallwhy-test.js
   Lỗi cũ: Input.explainWall ĐOÁN lý do ("có quân đứng trên đá" ⇒ "Không được nhốt người chơi trên núi") nên khi người chơi đang đứng trên núi
   và bị từ chối vì bịt kín cả hai cổng dịch chuyển thì vẫn nhận lời nhắn về núi — sai.
   Giờ lý do do lõi tính cùng một phép đo với canWall. Test: (1) wallWhy khớp canWall trên nhiều trạng thái ngẫu nhiên, (2) từng mã lý do với ca dựng sẵn,
   (3) đúng ca cũ (hai cổng + quân trên núi) ra đúng chữ, (4) mọi mã lý do wallWhy có thể trả đều có chữ (trừ 'range' cố ý im lặng). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const Core=require('../js/core.js'),R=Core.make(Core.ruleset('chaos')),N=9,WN=8;
let ok=0,bad=0;const ck=(c,m)=>{if(c)ok++;else{bad++;if(bad<=25)console.log('  ✗',m);}};
const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const ri=(rnd,a,b)=>a+Math.floor(rnd()*(b-a+1));
const why=(st,o,r,c)=>{const w=R.wallWhy(st,o,r,c);return w?w.why:null;};

/* ===== 1. khớp canWall trên trạng thái ngẫu nhiên (có cổng, nước/cát, đá, người chặn đường) ===== */
console.log('1. khớp canWall');
{
  const rnd=lcg(20260101);let states=0,seen={};
  for(let g=0;g<60;g++){
    const t=new Uint8Array(N*N);
    for(let r=2;r<=6;r++)for(let c=0;c<N;c++){const x=rnd();t[r*N+c]=x<.12?1:x<.2?9:x<.3?7:x<.38?8:x<.42?3:x<.46?2:0;}
    if(rnd()<.8){t[ri(rnd,2,6)*N+ri(rnd,0,3)]=6;t[ri(rnd,2,6)*N+ri(rnd,5,8)]=6;}
    let st;try{st=R.newState({spawn:[4,4],terr:t,seed:g+1});}catch(e){continue;}
    for(let ply=0;ply<18;ply++){
      if(ply>2&&rnd()<.35){const gr=[];for(let r=1;r<N-1;r++)for(let c=0;c<N;c++)if(R.ground(st,r,c))gr.push(r*N+c);st.blocker=rnd()<.5&&gr.length?gr[ri(rnd,0,gr.length-1)]:-1;}
      states++;
      for(const o of['h','v'])for(let r=-1;r<=WN;r++)for(let c=-1;c<=WN;c++){
        const w=R.wallWhy(st,o,r,c),can=R.canWall(st,o,r,c);
        ck((w===null)===can,`wallWhy===null ⇔ canWall (${o},${r},${c})`);
        ck(R.wallFree(st,o,r,c)===(R.wallSlot(st,o,r,c)===null),`wallFree ⇔ wallSlot===null (${o},${r},${c})`);
        if(w){seen[w.why]=1;ck(['range','taken','water','sealed','gates'].includes(w.why),'mã lý do lạ: '+w.why);
          if(w.why==='sealed')ck(Array.isArray(w.sides)&&w.sides.length===2&&w.sides.some(Boolean),'sealed phải kèm sides có ít nhất một bên');}
      }
      const p=st.turn;
      if(rnd()<.5&&st.left[p]>0){const cs=[];for(const o of['h','v'])for(let r=0;r<WN;r++)for(let c=0;c<WN;c++)if(R.canWall(st,o,r,c))cs.push({o,r,c});if(cs.length){if(!R.apply(st,{wall:cs[ri(rnd,0,cs.length-1)]}).ok)break;continue;}}
      const mv=R.moves(st,p);if(!mv.length)break;const res=R.apply(st,{move:mv[ri(rnd,0,mv.length-1)]});if(!res.ok||res.over||st.over)break;
    }
  }
  ck(states>1000,'đủ trạng thái ngẫu nhiên ('+states+')');
  ck(seen.taken&&seen.water&&seen.sealed,'ngẫu nhiên đã gặp taken/water/sealed');
}

/* ===== 2. từng mã lý do với ca dựng sẵn ===== */
console.log('2. từng mã lý do');
{
  const t0=new Uint8Array(N*N);
  const mk=(terr,pl)=>{const st=R.newState({spawn:[4,4],terr:terr||t0,seed:5});if(pl)st.pl=pl;return st;};
  let st=mk();
  ck(why(st,'h',-1,0)==='range'&&why(st,'x',0,0)==='range'&&why(st,'v',3,WN)==='range','ngoài bàn / hướng sai: range');
  st.ws.h[3*WN+3]=1;
  ck(why(st,'h',3,3)==='taken'&&why(st,'v',3,3)==='taken'&&why(st,'h',3,4)==='taken','trùng, chéo, chồng đầu: taken');
  ck(why(st,'h',5,5)===null,'tường tự do: null');
  /* nước/cát */
  const tw=new Uint8Array(N*N);tw[4*N+3]=7;tw[4*N+4]=8;
  st=mk(tw);ck(why(st,'v',4,3)==='water','tường phủ cạnh giữa hai ô nước–cát: water');
  ck(why(st,'v',2,3)===null,'tường xa nước: null');
  /* nhốt kín: túi {(4,0),(4,1)} chỉ còn hở cạnh phải, tường v(3,1) bịt nốt */
  const pocket=(st)=>{st.ws.h[3*WN+0]=1;st.ws.h[4*WN+0]=1;return st;};
  st=pocket(mk(null,[{r:4,c:0},{r:2,c:3}]));
  let w=R.wallWhy(st,'v',3,1);
  ck(w&&w.why==='sealed'&&w.sides[0]===true&&w.sides[1]===false,'nhốt Trắng: sealed, sides=[true,false]');
  st=pocket(mk(null,[{r:2,c:3},{r:4,c:1}]));w=R.wallWhy(st,'v',3,1);
  ck(w&&w.why==='sealed'&&w.sides[0]===false&&w.sides[1]===true,'nhốt Đen: sealed, sides=[false,true]');
  st=pocket(mk(null,[{r:4,c:0},{r:4,c:1}]));w=R.wallWhy(st,'v',3,1);
  ck(w&&w.why==='sealed'&&w.sides[0]&&w.sides[1],'nhốt cả hai: sealed, sides=[true,true]');
  /* người chặn đường chỉ làm tường kín thêm: lý do vẫn là sealed, không có mã riêng */
  st=mk();for(const c of[0,2,4])R.setW(st,'h',3,c,1);st.blocker=3*N+8;
  w=R.wallWhy(st,'h',3,6);ck(w&&w.why==='sealed'&&!R.canWall(st,'h',3,6),'người chặn bịt khe cuối: sealed');
  /* cổng: tường bịt nốt cổng còn lại (cùng kịch bản test cổng trong lowstone-test) */
  const mkG=(sealG2,sealG1,extra)=>{
    const t=new Uint8Array(N*N);t[4*N+1]=6;t[4*N+6]=6;if(extra)extra(t);
    const s=R.newState({spawn:[0,0],terr:t});s.pl=[{r:6,c:4},{r:2,c:4}];
    if(sealG2){s.ws.h[3*WN+5]=1;s.ws.h[4*WN+5]=1;s.ws.v[4*WN+6]=1;s.ws.v[3*WN+4]=1;}
    if(sealG1){s.ws.h[3*WN+0]=1;s.ws.h[4*WN+0]=1;}
    return s;
  };
  st=mkG(true,true);
  ck(why(st,'v',3,1)==='gates','bịt nốt cổng còn lại: gates');
  ck(R.wallFree(st,'v',3,1)&&!R.canWall(st,'v',3,1),'(tiền đề) tường đúng vị trí nhưng canWall từ chối');
  st=mkG(false,true);ck(why(st,'v',3,1)===null,'một cổng bị bịt, cổng kia còn: được phép');
}

/* ===== 3. ca của người chơi: quân đứng trên núi, bọc hai cổng ===== */
console.log('3. bọc hai cổng khi đứng trên núi');
const ctx=vm.createContext({console,Math,JSON,Date,Sfx:{play(){}},App:{refresh(){}},localStorage:{getItem:()=>null,setItem(){}}});
for(const f of['js/config.js','js/util.js','js/state.js','js/core.js','js/rules.js','js/input.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const g=e=>vm.runInContext(e,ctx);
const TXT=g('WALL_WHY');
{
  /* hai cổng (4,1) và (4,6) đã bị bọc gần hết như test cổng; quân Trắng đứng trên ĐÁ THẤP (6,4) = đang ở trên núi */
  g(`(function(){const t=new Uint8Array(81);t[4*9+1]=6;t[4*9+6]=6;t[6*9+4]=9;
    const st=R.newState({spawn:[0,0],terr:t,seed:5});
    S.chaos=true;S.terr=st.terr;S.pl=[{r:6,c:4},{r:2,c:4}];S.turn=0;S.me=0;S.orient='v';S.net={note:''};
    S.ws=st.ws;S.left=[10,10];S.stuck=[false,false];S.blocker=-1;
    for(const[o,r,c]of[['h',3,5],['h',4,5],['v',4,6],['v',3,4],['h',3,0],['h',4,0]])setW(o,r,c,1);})()`);
  ck(g('R.lvl(S,S.pl[0].r,S.pl[0].c)')>0,'(tiền đề) quân Trắng đang đứng trên núi');
  ck(g('R.wallFree(S,"v",3,1)&&!R.canWall(S,"v",3,1)')===true,'(tiền đề) tường bịt nốt cổng bị từ chối');
  g('Input.explainWall(3,1)');
  const note=g('S.net.note');
  ck(note==='Không được bịt kín cả hai cổng dịch chuyển','lời nhắn đúng lý do (cổng), nhận: '+note);
  ck(!/núi/.test(note),'không nhắc núi khi lý do là cổng');
  /* tường hợp lệ: không nhắn gì thêm */
  g("S.net.note='';Input.explainWall(6,6)");ck(g('S.net.note')==='','tường được phép: không nhắn');
  /* trùng tường: có nhắn rõ lý do (trước đây im lặng) */
  g("S.net.note='';S.ws.h[0]=1;S.orient='h';Input.explainWall(0,0)");ck(g('S.net.note')===TXT.taken(),'tường trùng: nhắn lý do taken');
  /* ngoài bàn: im lặng */
  g("S.net.note='';Input.explainWall(-1,0)");ck(g('S.net.note')==='','ngoài bàn: im lặng (range không có chữ)');
  /* Classic / không địa hình: không nhắn */
  g("S.net.note='';S.chaos=false;S.orient='h';Input.explainWall(0,0);S.chaos=true");ck(g('S.net.note')==='','Classic: không nhắn');
}

/* ===== 4. bảng chữ ===== */
console.log('4. bảng chữ WALL_WHY');
{
  const x=(me,stone)=>({me,stone:stone||[false,false]});
  ck(/của bạn/.test(TXT.sealed({sides:[true,false]},x(0)))&&!/đối thủ/.test(TXT.sealed({sides:[true,false]},x(0))),'nhốt mình: nói "của bạn"');
  ck(/đối thủ/.test(TXT.sealed({sides:[false,true]},x(0))),'nhốt đối thủ: nói "đối thủ"');
  ck(/của bạn/.test(TXT.sealed({sides:[false,true]},x(1))),'đổi bên (me=1): Đen bị nhốt là "của bạn"');
  ck(/cả hai/.test(TXT.sealed({sides:[true,true]},x(0))),'nhốt cả hai: nói "cả hai"');
  ck(/núi/.test(TXT.sealed({sides:[true,false]},x(0,[true,false]))),'quân bị nhốt đứng trên núi: nhắc núi');
  ck(!/núi/.test(TXT.sealed({sides:[false,true]},x(0,[true,false]))),'quân đứng trên núi nhưng KHÔNG bị nhốt: không nhắc núi');
  for(const k of['taken','water','gates'])ck(typeof TXT[k]==='function'&&TXT[k]({},x(0)).length>0,'có chữ cho '+k);
  ck(TXT.range===undefined,"'range' cố ý im lặng");
}
console.log(bad?`THẤT BẠI: ${bad} lỗi, ${ok} đạt`:`Tất cả ${ok} kiểm tra đạt`);
process.exit(bad?1:0);
