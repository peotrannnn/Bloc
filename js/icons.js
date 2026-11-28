'use strict';
/* Bộ biểu tượng SVG kiểu terminal (thay emoji): lưới 24×24, nét 2, đầu vuông, góc nhọn, đơn sắc.
   Màu = màu chữ xung quanh (currentColor), nên tự đổi theo biome / mức cảnh báo. Mọi hình đều là đường path (không rect/circle) để
   cùng một dữ liệu vừa chèn được vào HTML (Icons.svg) vừa vẽ được lên canvas (Icons.draw, dùng cho huy hiệu quà nổi trong 3D).
   rot = xoay cả hình quanh tâm (búa, cuốc chim vẽ thẳng đứng rồi xoay 45°).
   Trong chuỗi chữ hiển thị dùng ký hiệu [[tên]] (vd '[[grass]] ẩn trong cỏ'); Icons.text() đổi thành SVG và vẫn chống chèn HTML. */
const Icons={
  D:{
    'view':{d:["M2.5 6h13v12h-13z", "M15.5 10l6-3v10l-6-3"]},
    'eval':{d:["M4 12h4v8h-4z", "M10 4h4v16h-4z", "M16 9h4v11h-4z"]},
    'chat':{d:["M3 4h18v13h-10l-5 4v-4H3z", "M7 9h10M7 12.5h6"]},
    'guide':{d:["M12 6L8 4H2v15h6l4 2 4-2h6V4h-6z", "M12 6v15"]},
    'settings':{d:["M3 6h3M12 6h9M3 12h9M18 12h3M3 18h5M14 18h7", "M6 4h6v4h-6z", "M12 10h6v4h-6z", "M8 16h6v4h-6z"]},
    'home':{d:["M2 11l10-8 10 8", "M5 9v12h14V9", "M10 21v-6h4v6"]},
    'bell':{d:["M6 18v-8l3-5h6l3 5v8", "M4 18h16", "M10 21h4"]},
    'bell-off':{d:["M6 18v-8l3-5h6l3 5v8", "M4 18h16", "M10 21h4", "M3 3l18 18"]},
    'brick':{d:["M2.5 6h19v12h-19z", "M2.5 12h19M9 6v6M15 12v6"]},
    'boots':{d:["M9 3h7v7l6 4v6H9z", "M9 16h13", "M2 7h4M2 11h4"]},
    'glove':{d:["M7 21v-5l-4-4V9h2l3 3V5h3V3h3v1h3v3h3v9l-3 5z", "M11 5v5M14 4v6M17 7v3"]},
    'hammer':{d:["M5 2h14v6h-14z", "M10.5 8h3v13h-3z"],rot:45},
    'pickaxe':{d:["M2 11l5-6h10l5 6", "M10.5 5h3v16h-3z"],rot:45},
    'barrier':{d:["M3 6h18v7h-18z", "M8 6l-2 7M13 6l-2 7M18 6l-2 7", "M6 13v8M18 13v8"]},
    'timer':{d:["M4 13a8 8 0 1 0 16 0a8 8 0 1 0 -16 0", "M12 9v4l3 2", "M9 2h6"]},
    'grass':{d:["M12 21V4M12 15l-6-8M12 12l6-7M3 21h18"]},
    'ban':{d:["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M5.6 5.6l12.8 12.8"]},
    'anchor':{d:["M10 4.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M12 6.5V21M8 9h8M3 13l4 6h10l4-6"]},
    'hourglass':{d:["M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4"]},
    'volume-x':{d:["M3 9h4l5-4v14l-5-4H3z", "M16 9l5 6M21 9l-5 6"]},
  },
  esc:t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  /* Thẻ <svg> cỡ 1em (css .ico), cls = lớp thêm nếu cần */
  svg(n,cls){
    const o=this.D[n];if(!o)return'';
    const p=o.d.map(d=>'<path d="'+d+'"/>').join('');
    return'<svg class="ico'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" aria-hidden="true">'+(o.rot?'<g transform="rotate('+o.rot+' 12 12)">'+p+'</g>':p)+'</svg>';
  },
  /* Chữ có chèn [[tên]] → HTML an toàn */
  text(t){return this.esc(t).replace(/\[\[([\w-]+)\]\]/g,(m,n)=>this.D[n]?this.svg(n):'');},
  /* Bỏ ký hiệu [[tên]] (cho tooltip chữ thuần) */
  plain(t){return String(t).replace(/\[\[[\w-]+\]\]\s?/g,'');},
  /* Vẽ lên canvas 2D: tâm (cx,cy), cỡ size (px) */
  draw(g,n,cx,cy,size,color){
    const o=this.D[n];if(!o)return;
    g.save();g.translate(cx-size/2,cy-size/2);g.scale(size/24,size/24);
    if(o.rot){g.translate(12,12);g.rotate(o.rot*Math.PI/180);g.translate(-12,-12);}
    g.strokeStyle=color;g.lineWidth=2;g.lineCap='square';g.lineJoin='miter';
    for(const d of o.d)g.stroke(new Path2D(d));
    g.restore();
  }
};
