/* [SERVER/NAMES] Tên hiển thị của người chơi. Không có đăng nhập: tên chỉ là chữ do client gửi trong hello, nên server luôn làm sạch
   (client không đáng tin). Tối đa 16 ký tự, bỏ ký tự điều khiển và < > & " ` (giao diện vẫn tự thoát HTML, đây là lớp phòng thủ thứ hai).
   Rỗng sau khi làm sạch → '' (client tự hiện "Đối thủ"). */
export const NAME_MAX=16;
export function cleanName(s){
  if(typeof s!=='string')return '';
  const t=s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e<>&"`]/g,'').replace(/\s+/g,' ').trim();
  return Array.from(t).slice(0,NAME_MAX).join('').trim();
}
