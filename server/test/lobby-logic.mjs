/* Kiểm tra logic danh sách phòng chờ, không cần server:  node test/lobby-logic.mjs */
import {add,remove,take,prune,RESERVE_MS,MAX_AGE} from '../src/lobby-logic.js';
let bad=0;const ck=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};
let q=[];
ck(take(q,'classic',0).code===null,'danh sách trống → không có phòng');
q=add(q,{code:'AAAAAA',mode:'classic'},1000);q=add(q,{code:'BBBBBB',mode:'classic'},2000);q=add(q,{code:'AAAAAA',mode:'classic'},3000);
ck(q.length===2&&q[0].at===1000,'đăng ký trùng mã không tạo mục mới, không đổi thứ tự');
let t=take(q,'classic',5000);
ck(t.code==='AAAAAA','chọn phòng chờ lâu nhất');
t=take(t.q,'classic',5001);
ck(t.code==='BBBBBB','phòng đang giữ chỗ bị bỏ qua, lấy phòng kế tiếp');
t=take(t.q,'classic',5002);
ck(t.code===null,'hết phòng trống thì không có');
t=take(t.q,'classic',5000+RESERVE_MS+1);
ck(t.code==='AAAAAA','hết hạn giữ chỗ thì phòng chờ lâu nhất lại được chọn');
ck(take(q,'khac',5000).code===null,'khác chế độ thì không ghép');
ck(remove(q,'AAAAAA').length===1&&remove(q,'ZZZZZZ').length===2,'gỡ phòng đúng mã');
ck(prune(q,1000+MAX_AGE).length===1&&prune(q,0+1).length===2,'phòng quá hạn bị dọn');
console.log(bad?'THẤT BẠI':'ĐẠT');process.exit(bad?1:0);
