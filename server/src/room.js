/* [SERVER/ROOM] Durable Object của một phòng: chỉ là lớp mỏng nối Cloudflare (WebSocket Hibernation + storage + alarm)
   với RoomLogic. Toàn bộ quy tắc nằm trong room-logic.js để chạy thử được bằng Node mà không cần Cloudflare. */
import {DurableObject} from 'cloudflare:workers';
import {RoomLogic} from './room-logic.js';

export class Room extends DurableObject{
  constructor(ctx,env){
    super(ctx,env);
    this.logic=new RoomLogic({
      load:()=>this.ctx.storage.get('g'),
      save:g=>this.ctx.storage.put('g',g),
      send:(ws,m)=>{try{ws.send(JSON.stringify(m));}catch(e){}},
      conns:()=>this.ctx.getWebSockets(),
      getSeat:ws=>{const a=ws.deserializeAttachment();return a&&Number.isInteger(a.slot)?a.slot:-1;},
      setSeat:(ws,slot)=>ws.serializeAttachment({slot}),
      close:(ws,code,reason)=>{try{ws.close(code,reason);}catch(e){}},
      alarm:ms=>this.ctx.storage.setAlarm(Date.now()+ms),
      wipe:()=>this.ctx.storage.deleteAll()
    });
  }
  async fetch(req){
    const url=new URL(req.url);
    if(url.pathname==='/init'&&req.method==='POST'){            /* chỉ Worker gọi (từ /create); /ws của người chơi không bao giờ tới đường này */
      let o;try{o=await req.json();}catch(e){return new Response('bad',{status:400});}
      return new Response(null,{status:(await this.logic.init(o))?200:409});
    }
    if(req.headers.get('Upgrade')!=='websocket')return new Response('Expected websocket',{status:426});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server);
    if(!await this.logic.exists()){                             /* mã chưa được tạo: trình duyệt không đọc được mã HTTP lỗi, nên nhận rồi báo bằng tin nhắn + mã đóng 4004 */
      try{server.send(JSON.stringify({t:'error',reason:'noroom'}));server.close(4004,'noroom');}catch(e){}
    }   /* Hibernation API: phòng không tốn tiền "thời gian chạy" khi hai người đang nghĩ */
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,msg){await this.logic.onMessage(ws,msg);}
  async webSocketClose(ws){await this.logic.onClose(ws);}
  async webSocketError(ws){await this.logic.onClose(ws);}
  async alarm(){await this.logic.onAlarm();}
}

