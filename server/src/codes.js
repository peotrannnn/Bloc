/* [SERVER/CODES] Mã phòng và danh sách chế độ, dùng chung cho index.js và lobby.js. */
export const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* đúng 32 ký tự: 24 chữ (không I, O) + 8 số (không 0, 1) → x&31 chọn đều, không lệch */
export const CODE=/^[A-HJ-NP-Z2-9]{6}$/;
export const MODES=['classic','chaos'];
/* Biome của chế độ Hỗn Loạn. 'random' = server bốc ngẫu nhiên khi bắt đầu mỗi ván (mỗi biome 1/6, kể cả 'balanced');
   'balanced' = map cân bằng (giao diện meadow). Còn lại trùng tên với MapGen.BIOMES. */
export const BIOMES=['random','balanced','forest','mountain','snow','river','desert'];
/* Chuẩn hóa biome theo chế độ: Classic → null; Hỗn Loạn → 'random' nếu bỏ trống; giá trị lạ → undefined (từ chối). */
export function pickBiome(mode,b){
  if(mode!=='chaos')return null;
  if(b===undefined||b===null||b==='')return 'random';
  return BIOMES.includes(b)?b:undefined;
}
export const VISIBILITY=['public','private'];
export function newCode(){
  let s='';for(const x of crypto.getRandomValues(new Uint8Array(6)))s+=ALPHABET[x&31];
  return s;
}
