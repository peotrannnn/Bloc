'use strict';
/* Mọi loại tin server gửi (send/broadcast {t:'...'} trong room-logic.js; fx như chest/blocker nằm trong 'applied' nên không tính) phải được menu.js đăng ký nhận (conn.on), nếu không client âm thầm bỏ tin đó
   (lỗi từng xảy ra: chat gửi được nhưng không ai thấy vì 'chat' thiếu trong danh sách). */
const fs=require('fs');
const srv=fs.readFileSync(__dirname+'/../server/src/room-logic.js','utf8'),menu=fs.readFileSync(__dirname+'/../js/menu.js','utf8');
const sent=new Set([...srv.matchAll(/(?:send\([^,]+,|broadcast\()\{t:'(\w+)'/g)].map(m=>m[1]));
const reg=new Set((menu.match(/for\(const t of\[([^\]]*)\]\)/)||[,''])[1].match(/\w+/g));
const SKIP=new Set(['pong','hello']);   /* pong: chỉ để giữ kết nối; hello: client → server */
let bad=0;
for(const t of sent)if(!SKIP.has(t)&&!reg.has(t)){console.log('THIẾU trong menu.js:',t);bad++;}
console.log(bad?'Có '+bad+' loại tin bị bỏ':'Tất cả '+sent.size+' loại tin server gửi đều được đăng ký');
process.exit(bad?1:0);
