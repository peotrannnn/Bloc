/* [SERVER/LOBBY] Durable Object duy nhất (tên 'main'): giữ danh sách phòng công khai đang chờ và ghép người vào tự động.
   Danh sách để trong bộ nhớ và ghi xuống storage sau mỗi thay đổi; mọi thay đổi chạy đồng bộ (không await giữa lúc đọc và sửa) nên
   hai người bấm "vào tự động" cùng lúc không bao giờ nhận cùng một phòng, cũng không cùng tạo hai phòng khi chưa có phòng nào.
     POST /add {code,mode[,biome]}    phòng công khai đang chờ (Worker gọi khi tạo, Room gọi khi chủ phòng nối lại)
     POST /remove {code}      phòng đủ người / chủ phòng rời / hết hạn
     POST /quick {mode[,biome]}       → {code, created}: lấy phòng chờ lâu nhất; chưa có thì tự tạo phòng công khai và đăng ký luôn */
import {DurableObject} from 'cloudflare:workers';
import {CODE,MODES,newCode,pickBiome} from './codes.js';
import {prune,add,remove,take} from './lobby-logic.js';

export class Lobby extends DurableObject{
  constructor(ctx,env){
    super(ctx,env);
    this.q=[];
    ctx.blockConcurrencyWhile(async()=>{this.q=(await ctx.storage.get('q'))||[];});
  }
  save(){void this.ctx.storage.put('q',this.q);}

  async quick(mode,biome){
    const now=Date.now();
    this.q=prune(this.q,now);
    const t=take(this.q,mode,now,biome);
    if(t.code){this.q=t.q;this.save();return{code:t.code,created:false};}
    for(let i=0;i<5;i++){
      const code=newCode();
      this.q=add(this.q,{code,mode,biome},now);   /* đăng ký TRƯỚC khi chờ tạo phòng, để người đến ngay sau đó thấy và ghép vào */
      const r=await this.env.ROOM.get(this.env.ROOM.idFromName(code)).fetch('https://room/init',{method:'POST',body:JSON.stringify({mode,visibility:'public',code,biome})});
      if(r.status===200){this.save();return{code,created:true};}
      this.q=remove(this.q,code);
      if(r.status!==409)break;
    }
    this.save();return null;
  }

  async fetch(req){
    const path=new URL(req.url).pathname;let b={};
    try{b=await req.json();}catch(e){}
    const now=Date.now();
    if(path==='/add'){
      if(CODE.test(b.code)&&MODES.includes(b.mode)&&pickBiome(b.mode,b.biome)!==undefined){this.q=add(prune(this.q,now),b,now);this.save();}
      return new Response('ok');
    }
    if(path==='/remove'){
      if(typeof b.code==='string'){this.q=remove(this.q,b.code);this.save();}
      return new Response('ok');
    }
    if(path==='/quick'){
      const biome=pickBiome(b.mode,b.biome);
      if(!MODES.includes(b.mode)||biome===undefined)return new Response('bad',{status:400});
      const r=await this.quick(b.mode,biome);
      return r?new Response(JSON.stringify(r),{headers:{'Content-Type':'application/json'}}):new Response('busy',{status:503});
    }
    return new Response('Not found',{status:404});
  }
}
