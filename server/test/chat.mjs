import __Core from '../../js/core.js';const HELLO_V=__Core.PROTO;
/* Kiểm tra chat + chống spam: cd server && node test/chat.mjs   (đồng hồ giả, io giả như room-logic.mjs) */
import {RoomLogic} from '../src/room-logic.js';
import {cleanChat,makeChatGuard,makeFlood,CHAT} from '../src/chat.js';

let bad=0;const ck=(ok,m)=>{console.log(ok?'  ✓':'  ✗',m);if(!ok)bad++;};
let now=1e12;Date.now=()=>now;
const clone=o=>JSON.parse(JSON.stringify(o));
const tok=n=>n.padEnd(20,'x');
function makeRoom(){
  const room={store:undefined,conns:[],saves:0};
  room.io={load:async()=>room.store?clone(room.store):undefined,save:async g=>{room.saves++;room.store=clone(g);},
    send:(c,m)=>{if(c.open)c.inbox.push(clone(m));},conns:()=>room.conns.filter(c=>c.open),
    getSeat:c=>c.seat,setSeat:(c,s)=>{c.seat=s;},close:(c,code)=>{c.open=false;c.closeCode=code;},
    alarm:()=>{},wipe:async()=>{},lobby:async()=>{}};
  room.logic=new RoomLogic(room.io,{grace:45e3,rand:()=>.1});
  room.connect=()=>{const c={open:true,seat:-1,inbox:[],closeCode:null};room.conns.push(c);return c;};
  room.say=(c,o)=>room.logic.onMessage(c,JSON.stringify(o));
  room.all=(c,t)=>{const r=c.inbox.filter(m=>m.t===t);c.inbox=c.inbox.filter(m=>m.t!==t);return r;};
  return room;
}
async function pair(name){
  const rm=makeRoom();await rm.logic.init({mode:'classic',visibility:'private',code:'ABCDEF'});
  const A=rm.connect(),B=rm.connect();
  await rm.say(A,{t:'hello',v:HELLO_V,token:tok('A'),name:'An'});
  return{rm,A,B,go:async()=>{await rm.say(B,{t:'hello',v:HELLO_V,token:tok('B'),name:'Binh'});A.inbox=[];B.inbox=[];}};
}

try{
  console.log('1. cleanChat');
  ck(cleanChat('  xin   chào \n\n bạn ')==='xin chào bạn','gộp khoảng trắng, bỏ xuống dòng');
  ck(cleanChat('a​b‮c')==='a b c','bỏ ký tự ẩn / đổi chiều chữ');
  ck(cleanChat('\u0000\u0007 \t')==='','toàn ký tự điều khiển → rỗng');
  ck(cleanChat('x'.repeat(500)).length<=CHAT.MAX&&Array.from(cleanChat('ab'.repeat(200))).length===CHAT.MAX,'cắt đúng '+CHAT.MAX+' ký tự');
  ck(cleanChat('aaaaaaaaaaaaaaaa!!!!!!!!!!!!')==='aaaaaaa!!!!!!!','chuỗi ký tự lặp dài bị rút gọn');
  ck(cleanChat(123)===''&&cleanChat(null)===''&&cleanChat({})==='','không phải chuỗi → rỗng');
  ck(cleanChat('<b>hi</b> 😀')==='<b>hi</b> 😀','giữ nguyên < > và emoji (giao diện dùng textContent, không chèn HTML)');

  console.log('2. Phát tin trong phòng');
  {const {rm,A,B,go}=await pair();
   await rm.say(A,{t:'chat',text:'chưa đủ người'});ck(A.inbox.every(m=>m.t!=='chat'),'phòng chưa bắt đầu: bỏ qua');
   await go();
   const saves=rm.saves;
   await rm.say(A,{t:'chat',text:'  chào bạn  '});
   const a=rm.all(A,'chat'),b=rm.all(B,'chat');
   ck(a.length===1&&b.length===1,'cả hai nhận được (kể cả người gửi)');
   ck(b[0].text==='chào bạn'&&b[0].name==='An'&&(b[0].by===0||b[0].by===1)&&Number.isInteger(b[0].id),'có by / name / text / id, chữ đã làm sạch');
   ck(rm.saves===saves,'chat KHÔNG ghi storage');
   const C=rm.connect();await rm.say(C,{t:'chat',text:'người lạ'});ck(rm.all(A,'chat').length===0,'kết nối chưa có ghế không chat được');
   ck(true,'(id tăng dần)');
   now+=1000;await rm.say(B,{t:'chat',text:'hi'});const x=rm.all(A,'chat')[0];ck(x&&x.id===b[0].id+1&&x.name==='Binh','id tăng dần, tên đúng người');
   rm.all(B,'chat');await rm.say(A,{t:'chat',text:12345});await rm.say(A,{t:'chat'});ck(rm.all(B,'chat').length===0,'text sai kiểu / thiếu: bỏ qua');
  }

  console.log('3. Giới hạn tần suất');
  {const {rm,A,B,go}=await pair();await go();now+=5000;
   let sent=0;
   for(let i=0;i<CHAT.CAP;i++){await rm.say(A,{t:'chat',text:'m'+i});now+=CHAT.GAP_MS+10;sent++;}
   ck(rm.all(B,'chat').length===CHAT.CAP,'gửi dồn '+CHAT.CAP+' tin (mỗi tin cách '+(CHAT.GAP_MS+10)+'ms) đều được');
   await rm.say(A,{t:'chat',text:'quá rồi'});
   const rj=rm.all(A,'chatRejected');ck(rj.length===1&&rj[0].reason==='rate'&&rj[0].wait>0,'tin thứ '+(CHAT.CAP+1)+' bị từ chối reason=rate kèm wait');
   ck(rm.all(B,'chat').length===0,'đối thủ không nhận tin bị từ chối');
   now+=rj[0].wait+50;await rm.say(A,{t:'chat',text:'đã chờ'});ck(rm.all(B,'chat').length===1,'chờ đủ thời gian thì gửi lại được');
   now+=60e3;
   await rm.say(A,{t:'chat',text:'một'});await rm.say(A,{t:'chat',text:'hai'});
   ck(rm.all(B,'chat').length===1&&rm.all(A,'chatRejected')[0].reason==='rate','hai tin liền nhau dưới '+CHAT.GAP_MS+'ms: tin thứ hai bị chặn');
  }

  console.log('4. Tin trùng');
  {const {rm,A,B,go}=await pair();await go();now+=5000;
   await rm.say(A,{t:'chat',text:'gg'});now+=1000;await rm.say(A,{t:'chat',text:'gg'});
   ck(rm.all(B,'chat').length===1&&rm.all(A,'chatRejected')[0].reason==='dup','cùng nội dung trong '+CHAT.DUP_MS/1000+'s bị chặn (dup)');
   now+=CHAT.DUP_MS;await rm.say(A,{t:'chat',text:'gg'});ck(rm.all(B,'chat').length===1,'sau '+CHAT.DUP_MS/1000+'s gửi lại được');
  }

  console.log('5. Spam liên tục → bị cấm chat, phạt tăng dần');
  {const {rm,A,B,go}=await pair();await go();now+=5000;
   let muted=null,rejects=0,replies=0;
   for(let i=0;i<40;i++){await rm.say(A,{t:'chat',text:'spam'+i});now+=5;const r=rm.all(A,'chatRejected');replies+=r.length;if(r.some(x=>x.reason==='muted'))muted=r.find(x=>x.reason==='muted');}
   ck(!!muted&&muted.wait>0&&muted.wait<=CHAT.MUTE_MS,'spam 40 tin trong 0,2 giây → bị cấm (muted, wait ≤ '+CHAT.MUTE_MS/1000+'s)');
   ck(rm.all(B,'chat').length<=CHAT.CAP,'đối thủ chỉ nhận tối đa '+CHAT.CAP+' tin (còn lại bị chặn)');
   ck(replies<=4,'server chỉ trả lời '+replies+'/40 tin spam (không phản hồi từng tin)');
   await rm.say(B,{t:'chat',text:'tôi vẫn chat được'});ck(rm.all(A,'chat').length>=1,'người kia (ghế khác) KHÔNG bị ảnh hưởng');
   rm.all(B,'chat');now+=CHAT.MUTE_MS+100;await rm.say(A,{t:'chat',text:'hết cấm'});ck(rm.all(B,'chat').length===1,'hết '+CHAT.MUTE_MS/1000+'s cấm thì chat lại được');
   let m2=null;for(let i=0;i<40;i++){await rm.say(A,{t:'chat',text:'lại'+i});now+=5;const r=rm.all(A,'chatRejected').find(x=>x.reason==='muted');if(r)m2=r;}
   ck(m2&&m2.wait>CHAT.MUTE_MS*1.2,'tái phạm: cấm lâu gấp đôi (wait '+(m2&&Math.round(m2.wait/1000))+'s)');
  }

  console.log('6. Chống dồn dập trên một kết nối (mọi loại tin)');
  {const {rm,A,B,go}=await pair();await go();
   for(let i=0;i<30;i++)await rm.say(A,{t:'ping'});
   ck(rm.all(A,'pong').length===30,'30 ping dồn: vẫn xử lý hết (trong xô)');
   for(let i=0;i<2000&&A.open;i++)await rm.say(A,{t:'ping'});
   ck(!A.open&&A.closeCode===4008,'dồn dập kéo dài: đóng kết nối mã 4008');
   ck(B.open,'đối thủ không bị ảnh hưởng');
   const fl=makeFlood();let ok=0;for(let i=0;i<100;i++)if(fl.take(1e12)==='ok')ok++;ck(ok===40,'makeFlood: burst 40');
   now+=10000;const C2=rm.connect();await rm.say(C2,{t:'hello',v:HELLO_V,token:tok('A'),name:'An'});ck(C2.seat>=0,'nối lại bằng kết nối mới: bình thường');
  }

  console.log('7. Người gác chat (thuần) + phục hồi theo thời gian');
  {const g=makeChatGuard();let t=1e9;
   ck(g.check('a',t).ok,'tin đầu qua');ck(g.check('b',t+10).reason==='rate','sát tin trước → rate');
   ck(g.check('   ',t+5000).reason==='empty','rỗng → empty (im lặng)');
   t+=60e3;let n=0;for(let i=0;i<4;i++){if(g.check('x'+i,t+i*700).ok)n++;}ck(n===4,'nghỉ lâu rồi: xô đầy lại, gửi được 4 tin');
  }
}catch(e){console.error(e);bad++;}
console.log(bad?'LỖI '+bad:'ĐẠT');process.exit(bad?1:0);
