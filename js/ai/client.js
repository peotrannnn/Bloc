'use strict';
/* [AI/CLIENT] Cầu nối luồng chính ↔ worker (js/ai/worker.js) cho các AI đánh dấu `worker:true` (hiện là Mr. Biết).
   decide(aiId,p) trả Promise<act|null>. null nghĩa là "không dùng được worker": App sẽ tự gọi AI.decide() trên luồng chính như cũ.
   Mở bằng file://: dùng Worker từ Blob (js/ai/worker-src.js, sinh bởi tools/build-worker.js — nhớ build lại sau khi sửa biet.js/config.js...).
   - Cùng một thế cờ được hỏi nhiều lần (bắt đầu nghĩ sớm, rồi lúc tới hạn hỏi lại) thì dùng chung một lần tính, không tính hai lần.
   - Worker không trả lời quá hạn, hoặc báo lỗi → tắt hẳn, từ đó mọi lần hỏi trả null (fallback an toàn, ván không bao giờ kẹt). */
const AIWorker=(function(){
  let w=null,dead=typeof Worker==='undefined',seq=0,cur=null,warned=false;
  const pending=new Map();                                   /* id → hàm resolve */

  function warn(why){if(!warned){warned=true;console.warn('[AI] Không dùng được Web Worker ('+why+'): Mr. Biết sẽ chạy trên luồng chính, có thể giật. Mở game qua http://localhost thay vì file://.');}}
  function stop(){
    if(w){try{w.terminate();}catch(e){}w=null;}
    for(const r of pending.values())r(null);pending.clear();cur=null;
  }
  function fail(why){dead=true;warn(why);stop();}
  function spawn(){
    if(dead)return null;
    if(w)return w;
    try{
      /* file:// → Chrome chặn Worker theo đường dẫn, nên dùng Worker từ Blob (mã nhúng sẵn trong worker-src.js). http(s) → dùng thẳng file, luôn mới nhất */
      if(location.protocol==='file:'&&typeof AI_WORKER_SRC!=='undefined')w=new Worker(URL.createObjectURL(new Blob([AI_WORKER_SRC],{type:'text/javascript'})));
      else w=new Worker('js/ai/worker.js');
      w.onmessage=e=>{const r=pending.get(e.data.id);if(r){pending.delete(e.data.id);r(e.data.act||null);}};
      w.onerror=ev=>{if(ev&&ev.preventDefault)ev.preventDefault();fail('lỗi nạp/chạy worker');};
    }catch(err){dead=true;w=null;warn(String(err&&err.message||err));}
    return w;
  }

  /* Dấu vân tay của thế cờ + bên đi, để nhận ra "cùng một câu hỏi" */
  const keyOf=(id,p)=>id+'|'+p+'|'+S.ply+'|'+S.pl.map(x=>x.r+','+x.c).join(';')+'|'+S.left.join(',')+'|'+S.blocker+'|'+S.ws.h.join('')+S.ws.v.join('');

  function decide(aiId,p){
    const key=keyOf(aiId,p);
    if(cur&&cur.key===key)return cur.promise;
    const wk=spawn();
    if(!wk)return Promise.resolve(null);
    const id=++seq;
    const promise=new Promise(resolve=>{
      const guard=setTimeout(()=>{if(pending.has(id))fail('worker không trả lời kịp');},(CFG.AI.biet.ms||500)+3000);
      pending.set(id,v=>{clearTimeout(guard);resolve(v);});
      try{
        wk.postMessage({id:id,ai:aiId,p:p,ply:S.ply,pl:S.pl.map(x=>({r:x.r,c:x.c})),left:S.left.slice(),blocker:S.blocker,h:S.ws.h.slice(),v:S.ws.v.slice()});
      }catch(err){fail('không gửi được thế cờ');}
    });
    cur={key:key,promise:promise};
    return promise;
  }

  return{decide};
})();
