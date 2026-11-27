/* [SERVER/LOBBY-LOGIC] Danh sách phòng công khai đang chờ, thuần hàm (không phụ thuộc Cloudflare, chạy thử được bằng Node).
   Mỗi mục: {code, mode, biome, at, until} (biome null ở Classic; Hỗn Loạn chỉ ghép cùng biome, 'random' ghép với 'random'). at = lúc đăng ký (chọn phòng chờ LÂU NHẤT trước). until = đến lúc này phòng đang được "giữ chỗ"
   cho một người vừa được ghép, người khác bỏ qua (tránh hai người cùng nhắm một phòng); hết hạn giữ chỗ mà phòng chưa đủ người thì lại được chọn. */
export const RESERVE_MS=15e3;        /* giữ chỗ sau khi ghép */
export const MAX_AGE=60*60e3;        /* trùng thời gian phòng chờ tự hết hạn bên Room */

export const prune=(q,now)=>q.filter(e=>now-e.at<MAX_AGE);
export const add=(q,e,now)=>q.some(x=>x.code===e.code)?q:[...q,{code:e.code,mode:e.mode,biome:e.biome||null,at:now,until:0}];
export const remove=(q,code)=>q.filter(e=>e.code!==code);

/* Chọn phòng chờ lâu nhất cùng chế độ (và cùng biome) và chưa bị giữ chỗ. Trả {q: danh sách mới (đã giữ chỗ), code | null} */
export function take(q,mode,now,biome){
  let best=-1;
  for(let i=0;i<q.length;i++){
    const e=q[i];
    if(e.mode===mode&&(e.biome||null)===(biome||null)&&e.until<=now&&(best<0||e.at<q[best].at))best=i;
  }
  if(best<0)return{q,code:null};
  return{q:q.map((e,i)=>i===best?{...e,until:now+RESERVE_MS}:e),code:q[best].code};
}
