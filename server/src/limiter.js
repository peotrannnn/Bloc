/* [SERVER/LIMITER] Giới hạn tần suất kiểu xô token, thuần hàm, không cần Durable Object nên không tốn thêm request.
   Mỗi khóa (địa chỉ IP) có một xô chứa tối đa `capacity` lượt, nạp lại `perSec` lượt mỗi giây. Mỗi yêu cầu lấy 1 lượt; hết lượt thì từ chối.
   Giới hạn nằm trong bộ nhớ của từng isolate Worker nên chỉ là lớp chặn cơ bản (mỗi nơi chạy một bản đếm riêng); muốn chặt hơn, thêm
   luật Rate limiting trong bảng điều khiển Cloudflare. Bộ nhớ có trần `max` khóa: đầy thì bỏ khóa lâu không dùng nhất. */
export function makeLimiter({capacity,perSec,max=5000}){
  const m=new Map();
  return{
    take(key,now=Date.now()){
      let b=m.get(key);
      if(b){b.t=Math.min(capacity,b.t+(now-b.at)/1000*perSec);b.at=now;m.delete(key);}
      else b={t:capacity,at:now};
      m.set(key,b);                                   /* delete rồi set: khóa vừa dùng nằm cuối Map, khóa cũ nhất nằm đầu */
      if(m.size>max)m.delete(m.keys().next().value);
      if(b.t<1)return false;
      b.t-=1;return true;
    },
    size:()=>m.size
  };
}
