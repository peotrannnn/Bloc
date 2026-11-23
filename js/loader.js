'use strict';
/* [LOADER] Tải three.js theo yêu cầu. */
let threeP=null;
function loadThree(){
  return threeP||(threeP=new Promise((ok,bad)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload=ok;s.onerror=()=>{threeP=null;bad();};
    document.head.appendChild(s);
  }));
}
(window.requestIdleCallback||setTimeout)(()=>loadThree().catch(()=>{}));   /* menu hiện ngay, thư viện tải ngầm lúc rảnh */
