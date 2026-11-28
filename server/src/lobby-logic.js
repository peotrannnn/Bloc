/* [SERVER/LOBBY-LOGIC] Danh sách phòng công khai đang chờ, thuần hàm (không phụ thuộc Cloudflare, chạy thử được bằng Node).
   Mỗi mục: {code, mode, biome, at, until} (biome null ở Classic; Hỗn Loạn chỉ ghép cùng biome, 'random' ghép với 'random'). at = lúc đăng ký (chọn phòng chờ LÂU NHẤT trước). until = đến lúc này phòng đang được "giữ chỗ"
   cho một người vừa được ghép, người khác bỏ qua (tránh hai người cùng nhắm một phòng); hết hạn giữ chỗ mà phòng chưa đủ người thì lại được chọn. */
export const RESERVE_MS=15e3;        /* giữ chỗ sau khi ghép */
export const MAX_AGE=60*60e3;        /* trùng thời gian phòng chờ tự hết hạn bên Room */

export const prune=(q,now)=>q.filter(e=>now-e.at<MAX_AGE);
/* Đăng ký trùng mã: không tạo mục mới, không đổi thứ tự (at giữ nguyên), chỉ bổ sung tên chủ phòng nếu trước đó chưa có (phòng vừa tạo thì chưa ai vào nên chưa có tên) */
export const add=(q,e,now)=>q.some(x=>x.code===e.code)
  ?q.map(x=>x.code===e.code&&e.name&&x.name!==e.name?{...x,name:e.name}:x)
  :[...q,{code:e.code,mode:e.mode,biome:e.biome||null,name:e.name||'',at:now,until:0}];
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

/* Danh sách phòng chờ cho cửa sổ "Ghép nhanh": lọc theo chế độ / bản đồ (bỏ trống hoặc 'all' = không lọc), phòng chờ lâu nhất đứng đầu.
   Chỉ trả những trường client cần; tối đa `max` phòng. Không đụng tới giữ chỗ (until): người bấm thẳng vào một phòng là chọn có chủ đích. */
export function list(q,now,f,max){
  const o=f||{},mode=o.mode&&o.mode!=='all'?o.mode:null,biome=o.biome&&o.biome!=='all'?o.biome:null;
  return prune(q,now).filter(e=>(!mode||e.mode===mode)&&(!biome||(e.biome||null)===biome))
    .sort((a,b)=>a.at-b.at).slice(0,max||30).map(e=>({code:e.code,mode:e.mode,biome:e.biome||null,name:e.name||'',age:Math.max(0,now-e.at)}));
}
