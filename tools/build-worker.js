#!/usr/bin/env node
'use strict';
/* Gộp mã của worker (config, util, state, core, rules, registry, tools, biet + phần nhận tin trong worker.js) thành MỘT chuỗi
   trong js/ai/worker-src.js. Nhờ vậy client.js có thể tạo Worker từ Blob, chạy được cả khi mở index.html bằng file://
   (Worker kiểu đường dẫn bị Chrome chặn ở file://, Worker kiểu Blob thì không).
   PHẢI chạy lại sau khi sửa bất kỳ file nào dưới đây:   node tools/build-worker.js
   (Mở qua http://localhost hoặc GitHub Pages thì client.js dùng thẳng js/ai/worker.js nên không cần build.) */
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const parts=['js/config.js','js/util.js','js/state.js','js/core.js','js/rules.js','js/ai/registry.js','js/ai/tools.js','js/ai/biet.js'];
let src=parts.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n;\n');
const w=fs.readFileSync(path.join(root,'js/ai/worker.js'),'utf8').replace(/^importScripts\([^)]*\);?\s*$/m,'');
src+='\n;\n'+w;
fs.writeFileSync(path.join(root,'js/ai/worker-src.js'),
  "'use strict';\n/* TỰ SINH bởi tools/build-worker.js — đừng sửa tay. */\nconst AI_WORKER_SRC="+JSON.stringify(src)+";\n");
console.log('worker-src.js:',(src.length/1024).toFixed(1),'KB');
