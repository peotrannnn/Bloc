'use strict';
/* [INPUT] Chuột, cảm ứng, bàn phím. Bấm nhẹ = đi/đặt tường. Kéo quá 6px = xoay camera.
   Chỉ nhận đi quân/đặt tường khi humanTurn() (đến lượt người, không phải máy). */
/* Lời nhắn khi bấm đặt tường mà bị từ chối (chỉ Hỗn Loạn). MỘT bảng duy nhất: khóa = mã lý do của Core wallWhy (xem chú thích ở core.js).
   Mỗi mục là hàm (w, x) → chữ; w = kết quả wallWhy, x = {me: chỉ số bên mình, stone:[quân 0 / quân 1 đang đứng trên đá]}. Hàm thuần, test trong tools/view-test.js.
   Thêm lý do mới: thêm mã ở core.js wallWhy → thêm một dòng ở đây → thêm ca trong tools/wallwhy-test.js. Mã không có dòng (vd 'range') = im lặng. */
const WALL_WHY={
  taken:()=>'Chỗ này đã có tường hoặc bị tường khác cắt ngang',
  water:()=>'Không đặt tường giữa hai ô nước/cát liền nhau',
  gates:()=>'Không được bịt kín cả hai cổng dịch chuyển',
  sealed:(w,x)=>{
    const mine=!!w.sides[x.me],theirs=!!w.sides[1-x.me];
    const onStone=w.sides.some((hit,q)=>hit&&x.stone[q]);   /* quân bị nhốt đang đứng trên núi: nói rõ để người chơi hiểu vì sao */
    const base=mine&&theirs?'Tường này nhốt kín đường về đích của cả hai bên'
      :mine?'Tường này nhốt kín đường về đích của bạn'
      :'Không được nhốt kín đối thủ: tường này bịt hết đường về đích của họ';
    return base+(onStone?' (quân đang đứng trên núi)':'');
  }
};

const Input={
  ray:null,ndc:null,hit:null,plane:null,
  last:null,   /* vị trí chuột gần nhất trên canvas {x,y}; null nếu chuột đang ở ngoài bàn */

  /* Khe tường gần con trỏ chuột nhất (null nếu chuột không ở trên canvas) */
  slotAtPointer(){
    if(!this.last)return null;
    const p=this.pick({clientX:this.last.x,clientY:this.last.y});
    return p?{r:wallIdx(Math.floor(p.w)),c:wallIdx(Math.floor(p.u))}:null;
  },

  /* Tường của ĐỐI THỦ gần điểm p ({u:cột,w:hàng}, đơn vị ô) nhất — mục tiêu của búa / cuốc chim. Khoảng cách tính tới đoạn thẳng của tường (dài ~1,9 ô), null nếu xa hơn ~0,6 ô */
  targetNear(p){
    let best=null,bd=.62;
    for(const w of R.oppWalls(S,S.me)){
      const cu=w.c+.5,cw=w.r+.5,L=.93;
      const du=w.o==='h'?Math.max(0,Math.abs(p.u-cu)-L):Math.abs(p.u-cu),dw=w.o==='v'?Math.max(0,Math.abs(p.w-cw)-L):Math.abs(p.w-cw);
      const d=Math.hypot(du,dw);if(d<bd){bd=d;best=w;}
    }
    return best;
  },
  targetAtPointer(){
    if(!this.last)return null;
    const p=this.pick({clientX:this.last.x,clientY:this.last.y});
    return p?this.targetNear(p):null;
  },

  init(cv){
    this.ray=new THREE.Raycaster();this.ndc=new THREE.Vector2();this.hit=new THREE.Vector3();
    this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),-TOP);
    let dn=null;
    cv.addEventListener('pointerdown',e=>{
      dn={x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,lt:e.timeStamp,moved:false};
      Camera.vy=Camera.vp=0;cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointerleave',()=>{this.last=null;});
    cv.addEventListener('pointermove',e=>{
      this.last={x:e.clientX,y:e.clientY};
      if(dn){
        if(!dn.moved&&Math.hypot(e.clientX-dn.x,e.clientY-dn.y)>6)dn.moved=Camera.dragging=true;
        if(dn.moved){
          Camera.orbit(e.clientX-dn.lx,e.clientY-dn.ly,Math.max(.008,(e.timeStamp-dn.lt)/1000));
          dn.lx=e.clientX;dn.ly=e.clientY;dn.lt=e.timeStamp;return;
        }
      }
      if(humanTurn()&&S.mode==='item'){   /* búa / cuốc chim: tường đối thủ gần con trỏ nhất sáng lên */
        const p=this.pick(e),t=p?this.targetNear(p):null,o=S.tgt;
        if((t&&!o)||(!t&&o)||(t&&o&&(t.o!==o.o||t.r!==o.r||t.c!==o.c))){S.tgt=t;if(t)Sfx.play('ui:tickTarget');App.updateGhost();}
        return;
      }
      if(humanTurn()&&S.mode==='move'){   /* rê qua ô đi được: tick rất nhẹ */
        this.aim(e);const q=this.cellUnder();
        if(q){const r=q.r,c=q.c,k=r*N+c;
          if(k!==this.hc){this.hc=k;if(moves(S.turn).some(m=>m[0]===r&&m[1]===c))Sfx.play('ui:tickWall',{r:1.5,v:.8});}}
      }
      if(!humanTurn()||S.mode!=='wall')return;
      const p=this.pick(e);if(!p)return;
      const h={r:wallIdx(Math.floor(p.w)),c:wallIdx(Math.floor(p.u))};
      if(!S.hov||S.hov.r!==h.r||S.hov.c!==h.c){S.hov=h;Sfx.play(canWall(S.orient,h.r,h.c)?'ui:tickWall':'ui:tickBad');App.updateGhost();}
    });
    const up=e=>{
      if(!dn)return;
      const m=dn.moved;if(m&&e.timeStamp-dn.lt>80)Camera.vy=Camera.vp=0;
      dn=null;Camera.dragging=false;
      if(!m&&e.type==='pointerup')this.act(e);
    };
    cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
    cv.addEventListener('wheel',e=>{e.preventDefault();Camera.zoomBy(e.deltaY);},{passive:false});
  },

  /* Bắn tia từ vị trí chuột */
  aim(e){
    const b=Stage.ren.domElement.getBoundingClientRect();
    this.ndc.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);
    this.ray.setFromCamera(this.ndc,Stage.cam);
  },

  /* Chỉ số quân bị tia chạm trúng (gần nhất), -1 nếu không trúng quân nào */
  pawnAt(){
    let best=-1,bd=Infinity;
    for(let i=0;i<2;i++){
      if(S.hid&&S.hid[i])continue;   /* quân bị cỏ che: raycaster không bỏ qua mesh ẩn nên phải tự loại, kẻo bấm vào để lộ chỗ */
      const h=this.ray.intersectObject(Pawns.list[i].g,true);
      if(h.length&&h[0].distance<bd){bd=h[0].distance;best=i;}
    }
    return best;
  },

  /* Điểm tia chạm mặt bàn, đơn vị ô: u = cột, w = hàng (số thực) */
  ground(){
    return this.ray.ray.intersectPlane(this.plane,this.hit)?{u:this.hit.x/CFG.PITCH+HALF,w:this.hit.z/CFG.PITCH+HALF}:null;
  },

  pick(e){this.aim(e);return this.ground();},

  /* Ô nằm dưới tia (chế độ đi quân), tính cả độ cao đá: hàm thuần của (gốc tia, hướng tia, hàm độ cao).
     Thử các mặt phẳng ngang từ cao xuống thấp (đỉnh đá cao, đỉnh đá thấp, mặt ô thường); tia đi xuống nên chạm mặt cao trước.
     Mặt phẳng ở độ cao h nhận ô (r,c) khi độ cao ô ≥ h: bằng h là trúng đỉnh ô; lớn hơn h nghĩa là tia đã đâm vào SƯỜN khối đá của ô đó (bấm vào thân đá cũng chọn ô đá).
     Mặt ô thường (h=0) luôn nhận, nên luôn có kết quả khi tia hướng xuống. Trả {r,c} hoặc null (tia hướng lên hoặc trúng ngoài bàn). */
  cellAt(ox,oy,oz,dx,dy,dz,hAt,levels){
    if(dy>=-1e-9)return null;
    for(const h of levels){
      const t=(TOP+h-oy)/dy;if(t<=0)continue;
      const r=Math.round((oz+dz*t)/CFG.PITCH+HALF),c=Math.round((ox+dx*t)/CFG.PITCH+HALF);
      if(r<0||r>=N||c<0||c>=N)continue;
      if(hAt(r,c)>=h-1e-6)return{r,c};
    }
    return null;
  },
  /* Ô dưới con trỏ theo Terrain hiện tại (dùng cho đi quân) */
  cellUnder(){
    const o=this.ray.ray.origin,d=this.ray.ray.direction,T=CFG.TERRAIN||{},hAt=(r,c)=>Stage.heightAt(r,c);
    const lv=[T.stoneH||0,T.lowH||0,0].filter((h,i,a)=>h>0||i===2).sort((a,b)=>b-a);
    return this.cellAt(o.x,o.y,o.z,d.x,d.y,d.z,hAt,lv);
  },

  act(e){
    this.aim(e);
    const pi=this.pawnAt();   /* bấm trúng quân: bật/tắt camera bám theo, ưu tiên hơn đi quân/đặt tường (dùng được cả khi máy đang chơi) */
    if(pi>=0){Sfx.play('ui:cam');Camera.toggleFollow(pi);UI.render();return;}
    if(!humanTurn())return;
    const p=this.ground();if(!p)return;   /* mặt nền: dùng cho tường/vật phẩm (tường đặt ở khe giữa các ô, độ cao cố định) */
    if(S.mode==='item'){   /* bấm vào tường đang sáng thì dùng; bấm tường khác thì chuyển mục tiêu sang đó (cảm ứng: chạm lần 1 chọn, lần 2 xác nhận) */
      const t=this.targetNear(p),o=S.tgt;
      if(t&&o&&t.o===o.o&&t.r===o.r&&t.c===o.c)App.confirmItem();
      else{S.tgt=t;App.updateGhost();}
      return;
    }
    if(S.mode==='move'){
      const q=this.cellUnder()||{r:Math.round(p.w),c:Math.round(p.u)},r=q.r,c=q.c;
      if(moves(S.turn).some(m=>m[0]===r&&m[1]===c)){Sfx.play('ui:click');App.commit({move:[r,c]});}
      else{Sfx.play('ui:nope');this.explainMove(r,c);}
    }else{
      S.hov={r:wallIdx(Math.floor(p.w)),c:wallIdx(Math.floor(p.u))};
      if(canWall(S.orient,S.hov.r,S.hov.c)){const w={o:S.orient,r:S.hov.r,c:S.hov.c};S.hov=null;App.commit({wall:w});}
      else{Sfx.play('ui:nope');this.explainWall(S.hov.r,S.hov.c);App.updateGhost();}
    }
  },
  /* Giải thích vì sao bấm không đi được (chỉ Hỗn Loạn có địa hình; luật không đổi, đây chỉ là lời nhắn). Chỉ giải thích những trường hợp chắc chắn, còn lại im lặng như cũ. */
  explainMove(r,c){
    if(!S.chaos||!S.terr)return;
    const p=S.pl[S.turn];if(!p||Math.abs(p.r-r)+Math.abs(p.c-c)!==1)return;   /* chỉ ô kề cạnh */
    const a=R.lvl(S,p.r,p.c),b=R.lvl(S,r,c);
    if(Math.abs(a-b)>1)this.note('Đá quá cao, hãy leo từ đá thấp');
  },
  /* Lý do thật do Core.wallWhy tính (cùng một phép đo với canWall nên không thể lệch); ở đây chỉ đổi mã lý do thành chữ qua WALL_WHY. Không đoán. */
  explainWall(r,c){
    if(!S.chaos||!S.terr)return;
    const w=R.wallWhy(S,S.orient,r,c),f=w&&WALL_WHY[w.why];
    if(f)this.note(f(w,{me:S.me,stone:S.pl.map(q=>!!q&&R.lvl(S,q.r,q.c)>0)}));
  },
  note(t){if(!S.net)return;S.net.note=t;App.refresh();}
};
