'use strict';
/* [AI/WORKER] Chạy các AI nặng (hiện chỉ Mr. Biết) ở luồng nền để trang không bị đứng hình khi nó suy nghĩ.
   Worker nạp đúng các file logic thuần (không đụng DOM/3D) và giữ một bản S riêng; mỗi yêu cầu gửi kèm thế cờ,
   worker chép vào S rồi gọi decide() y như trên luồng chính. Bộ nhớ của AI (đọc đối thủ, thế cờ đã lặp) nằm lại trong worker
   suốt ván, vẫn tự đặt lại khi S.ply < 2 (ván mới).
   Giao thức: nhận {id,ai,p,ply,pl,left,blocker,h,v} → trả {id,act}  (act = null nếu lỗi → bên gọi tự tính lại trên luồng chính). */
importScripts('../config.js','../util.js','../state.js','../core.js','../rules.js','registry.js','tools.js','biet.js');

self.onmessage=function(e){
  const m=e.data;
  let act=null;
  try{
    S.pl=m.pl;S.left=m.left;S.ws={h:m.h,v:m.v};S.blocker=m.blocker===undefined?-1:m.blocker;S.ply=m.ply;S.turn=m.p;S.over=false;
    act=AIs.get(m.ai).decide(m.p);
  }catch(err){act=null;}
  self.postMessage({id:m.id,act:act});
};
