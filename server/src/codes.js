/* [SERVER/CODES] Mã phòng và danh sách chế độ, dùng chung cho index.js và lobby.js. */
export const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* đúng 32 ký tự: 24 chữ (không I, O) + 8 số (không 0, 1) → x&31 chọn đều, không lệch */
export const CODE=/^[A-HJ-NP-Z2-9]{6}$/;
export const MODES=['classic'];
export const VISIBILITY=['public','private'];
export function newCode(){
  let s='';for(const x of crypto.getRandomValues(new Uint8Array(6)))s+=ALPHABET[x&31];
  return s;
}
