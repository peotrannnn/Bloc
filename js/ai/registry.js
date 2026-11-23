'use strict';
/* [AI/REGISTRY] Danh sách các mô hình AI. Mỗi AI là một object:
     { id:'duy-nhat', name:'Tên hiển thị', desc:'Mô tả ngắn', decide(p){...} }
   decide(p) nhận chỉ số bên p (0 = Trắng, 1 = Đen), đọc trạng thái S + hàm trong rules.js,
   rồi trả về {move:[r,c]} hoặc {wall:{o,r,c}}. Không được sửa S trực tiếp.
   Thêm AI mới: tạo file js/ai/<ten>.js gọi AIs.register({...}), rồi thêm <script> vào index.html
   (sau registry.js). Menu tự liệt kê mọi AI đã đăng ký. */
const AIs={
  list:[],
  register(def){this.list.push(def);},
  get(id){return this.list.find(a=>a.id===id)||this.list[0];},
  defaultId(){return this.list[0].id;}
};
