'use strict';
/* [REVIEW] Gán nhãn chất lượng cho từng nước đi (kiểu chess.com), dựa trên Eval. Thuần logic, không đụng 3D/DOM.
   Cách làm:
   1. Đầu mỗi lượt gọi snap() để chụp lại thế cờ.
   2. Khi nước đi xong, judge() suy ra nước đó từ chênh lệch với bản chụp, rồi quay S về thế trước nước đi,
      liệt kê các nước thay thế (mọi nước đi quân + vài tường đáng đặt nhất + chính nước đã đi) và chấm từng nước
      bằng Eval.whiteProb() quy về xác suất thắng của người vừa đi. S được trả lại nguyên trạng sau khi chấm.
   3. loss = (xác suất thắng của nước tốt nhất) - (của nước đã đi). Nhãn chọn theo loss và vài tín hiệu phụ
      (gap = nước tốt nhất hơn nước nhì bao nhiêu, swing = nước đó cải thiện thế cờ bao nhiêu). Ngưỡng ở CFG.REVIEW.t.
   Nhãn đặc biệt: forced (chỉ một nước đi) và hopeless (hết cửa thắng, mọi nước như nhau).
   Lưu ý: "nước tốt nhất" ở đây là tốt nhất TRONG số nước ứng viên, không phải toàn bộ ~130 nước có thể. */
const Review=(function(){
  let pre=null,prevLoss=0;   /* pre = bản chụp đầu lượt; prevLoss = đối thủ vừa mất bao nhiêu (để xét "Bỏ lỡ") */

  const copy=()=>({turn:S.turn,ply:S.ply,pl:S.pl.map(p=>({r:p.r,c:p.c})),left:S.left.slice(),h:S.ws.h.slice(),v:S.ws.v.slice()});
  const same=(x,y)=>x.type===y.type&&x.r===y.r&&x.c===y.c&&x.o===y.o;

  /* Xác suất thắng của bên m trong thế S hiện tại (S.turn đã là bên kia). Về tới đích là thắng chắc. */
  function prob(m){
    if(S.pl[m].r===goalRow(m))return 1;
    const w=Eval.whiteProb();return m===0?w:1-w;
  }

  /* "Biên độ thắng/thua" của bên m, tính bằng số bước đi (mượn ý của chess.com/Lichess khi gần chiếu hết: thắng nhanh hơn là tốt hơn).
     Xác suất bị chặn trần ở 99% nên khi đã dẫn xa, mọi nước (kể cả nước phí tường) đều ra 99% và không phân biệt được.
     Biên độ thì không bị chặn: thế chưa thấy thắng cưỡng bức = chênh đường đi (kẹp ±12, khớp whiteProb);
     thấy thắng cưỡng bức trong k nước = ±(14 - k/4), luôn hơn mọi thế chưa thấy thắng. Gọi ngay sau prob(m) nên Eval.score() lấy từ bộ nhớ đệm. */
  function margin(m){
    if(S.pl[m].r===goalRow(m))return 14;
    const s=Eval.score()*(m===0?1:-1),W=Eval.WIN;
    return s>W/2?14-(W-s)*.25:s<-W/2?-14+(W+s)*.25:clamp(s,-12,12);
  }

  /* Cả nước tốt nhất lẫn nước đã đi đều nằm trong vùng thắng chắc: xác suất không còn phân biệt được, nên chấm theo số bước đi bị lãng phí. */
  function classifyLead(lost){
    const L=CFG.REVIEW.t.lead;
    return lost<=L.best?'best':lost<=L.excellent?'excellent':lost<=L.good?'good':lost<=L.ok?'ok':'inaccuracy';   /* đang thắng chắc thì tối đa là "Thiếu chính xác"; làm mất thế thắng thì đã rơi vào nhánh xác suất */
  }

  /* Chọn nhãn theo ngưỡng. loss = mức mất điểm "hiệu dụng" (đã loại phần nằm trong vùng thắng/thua hẳn). Thứ tự nhánh = thứ tự ưu tiên. */
  function classify(act,loss,gap,second,played,before,best){
    const T=CFG.REVIEW.t;
    if(pre.ply<CFG.REVIEW.bookPly&&act.type==='move'&&loss<=T.book)return 'book';
    if(loss<=T.top&&gap>=T.gap){
      /* chess.com: Thiên tài không được ở thế xấu sau nước đi, và không được là thế thắng chắc kể cả khi không tìm ra nó */
      if(played>=T.brilMin&&played-before>=T.swing&&second<T.won)return 'brilliant';
      if(played>=T.greatMin)return 'great';
    }
    if(loss<=T.best)return 'best';
    if(loss<=T.excellent)return 'excellent';
    if(loss<=T.good)return 'good';
    if(loss<=T.ok)return 'ok';
    if(loss<T.mistake&&prevLoss>=T.missPrev&&best>=T.missBest)return 'miss';
    if(loss<T.inacc)return 'inaccuracy';
    if(loss<T.mistake)return 'mistake';
    return 'blunder';
  }

  /* Chấm nước act của bên m. Gọi khi S đang là thế trước nước đi (đã dựng lại bởi judge). */
  function analyze(m,act){
    S.turn=m;
    const wb=Eval.whiteProb(),before=m===0?wb:1-wb;   /* thế cờ của mình trước khi đi */
    const cands=moves(m).map(x=>({type:'move',r:x[0],c:x[1]}));
    if(S.left[m]>0)   /* hết tường thì không có nước đặt tường nào để so sánh (trước đây vẫn thử, S.left tụt xuống -1 và Eval tưởng thế đó tốt 99%) */
      for(const w of Eval.wallCands(m,CFG.REVIEW.walls))cands.push({type:'wall',o:w.o,r:w.r,c:w.c});
    let ai=cands.findIndex(x=>same(x,act));
    if(ai<0){cands.push(act);ai=cands.length-1;}
    S.turn=1-m;                                        /* sau nước đi thì đến lượt đối thủ */
    const mg=[];
    const vals=cands.map(x=>{
      const old=S.pl[m];
      if(x.type==='move')S.pl[m]={r:x.r,c:x.c};else{setW(x.o,x.r,x.c,1);S.left[m]--;}
      const v=prob(m);mg.push(v>=CFG.REVIEW.t.won?margin(m):0);   /* biên độ chỉ cần khi nước đó còn nằm trong vùng thắng chắc */
      if(x.type==='move')S.pl[m]=old;else{setW(x.o,x.r,x.c,0);S.left[m]++;}
      return v;
    });
    let best=-1,second=-1,worst=2;
    for(const v of vals){if(v>best){second=best;best=v;}else if(v>second)second=v;if(v<worst)worst=v;}
    const T=CFG.REVIEW.t,played=vals[ai],zone=p=>clamp(p,T.lost,T.won);
    /* Đang thắng chắc và nước đã đi vẫn giữ thế thắng: chấm theo số bước đi lãng phí so với cách thắng nhanh nhất (không còn bị "không nhãn") */
    if(cands.length>=2&&best>=T.won&&played>=T.won){
      let top=-99;for(let i=0;i<vals.length;i++)if(vals[i]>=T.won&&mg[i]>top)top=mg[i];
      const waste=Math.max(0,top-mg[ai]),key=classifyLead(waste);prevLoss=0;
      const res={key,mover:m,act,loss:0,rawLoss:0,gap:0,best,played,before,n:cands.length,waste};
      if(CFG.REVIEW.debug)console.log('[review] thắng chắc',key,'| lãng phí',waste.toFixed(2),'bước',act);
      return res;
    }
    /* Không có lựa chọn nào đáng kể (chỉ một nước, hoặc mọi nước cho cùng kết quả, vd thế đã thua chắc): không gán nhãn */
    /* Không có gì để so sánh: chỉ một nước hợp lệ → "Nước ép buộc"; mọi nước đều thua như nhau → "Hết cách". Nhãn hiện ở mọi nước như vậy (không điều kiện thêm). */
    if(cands.length<2||best-worst<=T.flat){
      prevLoss=0;
      const key=cands.length<2?'forced':best<=T.lost?'hopeless':'best';   /* mọi nước ngang nhau mà chưa thua hẳn (hiếm): mất điểm = 0 nên theo đúng ngưỡng là "Tốt nhất" */
      return{key,mover:m,act,loss:0,rawLoss:0,gap:0,best,played,before,n:cands.length};
    }
    /* Mất điểm hiệu dụng: bỏ phần nằm trong vùng đã định (thắng/thua hẳn), rồi giảm theo độ "còn sống" của thế:
       nếu ngay cả nước tốt nhất cũng chỉ còn rất ít cơ hội thì không ai bị coi là sai lầm */
    const alive=smooth(clamp((best-T.aliveFrom)/(T.aliveTo-T.aliveFrom),0,1));
    const loss=Math.max(0,zone(best)-zone(played))*alive,gap=zone(best)-zone(second);
    const key=classify(act,loss,gap,second,played,before,best);
    prevLoss=loss;
    const res={key,mover:m,act,loss,rawLoss:Math.max(0,best-played),gap,best,played,before,n:cands.length};
    if(CFG.REVIEW.debug)console.log('[review]',key,'| trước',before.toFixed(2),'| tốt nhất',best.toFixed(2),'| đã đi',played.toFixed(2),'| mất thô',res.rawLoss.toFixed(2),'→ hiệu dụng',loss.toFixed(2),'| ứng viên',cands.length,act);
    return res;
  }

  return{
    reset(){prevLoss=0;this.snap();},
    snap(){pre=copy();},
    skip(){prevLoss=0;},   /* nước đi này không được chấm (đang tắt đánh giá): quên mức mất điểm cũ để lần chấm sau không xét "Bỏ lỡ" nhầm */

    /* Chấm nước vừa đi. Trả về {key,mover,act,...} hoặc null nếu không suy ra được nước đi. */
    judge(){
      if(!pre)return null;
      const m=pre.turn,now=copy(),a=pre.pl[m],b=now.pl[m];
      let act=null;
      if(a.r!==b.r||a.c!==b.c)act={type:'move',r:b.r,c:b.c};
      else for(const o of['h','v']){
        const i=now[o].findIndex((x,k)=>x&&!pre[o][k]);
        if(i>=0)act={type:'wall',o,r:(i/WN)|0,c:i%WN};
      }
      if(!act)return null;
      const keep={pl:S.pl,left:S.left,ws:S.ws,turn:S.turn,over:S.over,draw:S.draw};
      S.pl=pre.pl.map(p=>({r:p.r,c:p.c}));S.left=pre.left.slice();S.ws={h:pre.h.slice(),v:pre.v.slice()};S.over=S.draw=false;
      try{return analyze(m,act);}finally{Object.assign(S,keep);}   /* luôn trả S về nguyên trạng, kể cả khi có lỗi */
    }
  };
})();
