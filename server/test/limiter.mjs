/* Kiểm tra bộ giới hạn tần suất, không cần server:  node test/limiter.mjs */
import {makeLimiter} from '../src/limiter.js';
let bad=0;const ck=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};
const L=makeLimiter({capacity:3,perSec:1,max:3});
ck(L.take('a',0)&&L.take('a',0)&&L.take('a',0),'cho đủ 3 lượt dồn');
ck(!L.take('a',0),'lượt thứ 4 bị từ chối');
ck(!L.take('a',500),'sau 0,5 giây vẫn chưa đủ 1 lượt');
ck(L.take('a',1000),'sau 1 giây được 1 lượt');
ck(L.take('b',0),'khóa khác có xô riêng');
ck(L.take('a',60000)&&L.take('a',60000)&&L.take('a',60000)&&!L.take('a',60000),'nghỉ lâu chỉ nạp lại tới mức tối đa (3), không dồn thêm');
L.take('c',0);L.take('d',0);
ck(L.size()<=3,'bộ nhớ có trần số khóa');
console.log(bad?'THẤT BẠI':'ĐẠT');process.exit(bad?1:0);
