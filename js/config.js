'use strict';
/* [CONFIG] Hằng số: luật, màu, ánh sáng, thông số animation. Chỉnh giao diện/cảm giác ở đây. */
const CFG={
  N:9,                 /* bàn N x N ô */
  PITCH:1.2,           /* bước giữa hai ô */
  CELL:1.1,            /* cạnh ô (khe giữa hai ô = PITCH - CELL) */
  CELL_H:.2,           /* độ dày ô; mặt ô nằm ở CELL_H/2 */
  WALLS:10,            /* số tường mỗi bên */
  MAX_PLY:300,         /* máy đấu máy: quá số nước này thì hòa */
  PVE_DELAY:600,       /* đấu với máy: máy "suy nghĩ" bao lâu (ms) trước khi đi */

  /* Hai bên chơi. glow=true: mặt vẽ bằng emissiveMap (cần cho thân đen, vì đen nhân gì cũng vẫn đen) */
  PLAYERS:[
    {name:'Trắng',sym:'○',body:0xe9e5db,faceBg:'#ffffff',faceFg:'#16161b',glow:false},
    {name:'Đen',  sym:'●',body:0x1b1b21,faceBg:'#000000',faceFg:'#ffffff',glow:true}
  ],

  BOARD:{
    frame:0x2e1c10,                         /* viền gỗ tối */
    edge:[0xece8de,0x14141a],               /* dải ngà (đích của Trắng) / dải đen (đích của Đen) */
    woodLight:[['#dcb67f',11],['#d3ab72',23]],   /* [màu, hạt giống vân gỗ] */
    woodDark:[['#8d5b33',37],['#7f4f2b',51]],
    goalWood:[                              /* ô đích: [0] đích của Trắng (hàng đầu) sáng hẳn, [1] đích của Đen (hàng cuối) tối hẳn */
      [['#f4e4bf',61],['#ebd6a3',73]],
      [['#3d2312',83],['#31200f',97]]
    ],
    hint:0x35c46a,                          /* ô đi được: lớp phủ xanh lá phẳng (không ăn đèn/bóng nên đều màu) */
    hintOpacity:.45,                        /* độ đậm tối đa của lớp phủ */
    arrowSize:.75,                          /* cỡ mũi tên phím trên ô gợi ý (so với cạnh ô) */
    arrowOpacity:.8,                        /* độ đậm tối đa của mũi tên */
    hintFade:9,                           /* tốc độ fade in/out (càng lớn càng nhanh) */
    ghostItem:0xffa21f,                     /* tường của đối thủ đang được chọn làm mục tiêu búa / cuốc chim: cam sáng */
    ghostOk:0x3db8ff,                       /* tường "ma" đặt được: xanh da trời phát sáng */
    ghostBad:0xe8392f,                     /* tường "ma" đặt sai chỗ */
    shadowOpacity:.35
  },

  /* Địa hình chế độ Hỗn Loạn (view/terrain.js). Thiếu khóa nào thì dùng mặc định trong terrain.js. */
  TERRAIN:{
    stoneH:.7,                 /* cao khối đá trên mặt ô; quân cờ cao ≈ .7 */
    tufts:7,tuftBlades:5,      /* số cụm cỏ mỗi ô và số lưỡi mỗi cụm (±1) */
    bladeH:[.4,.75],           /* khoảng cao lưỡi cỏ */
    sway:.34,swaySpeed:1.2,    /* biên độ ngọn cỏ khi gió thổi và tốc độ */
    anim:true,                 /* false: tắt chuyển động liên tục (cỏ, nước, cổng) để đỡ tốn pin */
    gateColor:0x7b3fd0,        /* màu tím của lõi cổng */
    gateColor2:0x2fd2ff,       /* màu xanh của lõi cổng */
    gateBack:.3                /* dịch sprite cổng ra xa camera để quân đứng trên ô cổng không bị cắt ngang */
  },



  /* Người chặn đường (view/blocker.js): nhân vật vàng "Crash Test Dummy" bay từ trời xuống đáp vào một choke point (ô chặn đường nhiều nhất), đứng đó vài nước rồi chạy ra mép bàn
     nhảy xuống (không có đường thì bay vút lên). Lúc bay có lửa phản lực ở hai chân. Cả hai bên tạm dừng (S.event) và camera khóa vào nhân vật này khi nó diễn.
     Ô bị chiếm được ghi vào S.blocker (core.js coi như đá). Lịch xuất hiện: js/blocker-plan.js.
     CHỈ có ở chế độ Hỗn Loạn (online, do SERVER chạy lịch: ruleset 'chaos'.blockerPlan trong core.js). Classic (và mọi ván offline) KHÔNG BAO GIỜ có người chặn đường. */
  BLOCKER:{
    /* Model = Y HỆT quân cờ (cùng cỡ CFG.PAWN.scale, cùng hình), chỉ khác màu + hiệu ứng */
    color:'#FFD700',glowColor:0xffb400,      /* màu thân vàng; màu phát sáng */
    sym:{glow:.35,cycle:2.2,flash:.8},       /* phát sáng nhấp nháy: độ sáng tối đa, chu kỳ nhấp nháy (giây), độ bùng sáng lúc đứng vào ô */
    blinkIdle:true,                          /* false: đứng yên thì biểu tượng không nhấp nháy (đỡ vẽ liên tục, tiết kiệm pin) */
    delay:1,                                 /* chờ sau khi hai quân đứng yên rồi mới bắt đầu sự kiện */

    /* LỊCH (đơn vị: nước đi, mỗi bên đi một nước = 1; mỗi khoảng là số nguyên ngẫu nhiên trong [min,max]) */
    auto:true,                               /* chỉ để thử (cần S.chaos): tự xuất hiện theo lịch plan bên dưới ở ván không online. Ván thật: server quyết định, không đọc cờ này */
    plan:{first:[20,30],stay:[5,7],gap:[20,30]},   /* đầu ván đợi first nước → ở lại stay nước → trống gap nước → quay lại, lặp mãi */

    /* VÀO SÂN: bay từ một điểm ngẫu nhiên trên trời, lượn tới trên đầu ô rồi hạ xuống đáp */
    fly:{dist:[10,14],up:[6,8],              /* điểm xuất phát (xa): cách ô đích ngang [min,max], cao [min,max] so với mặt ô */
         hover:2.8,                          /* độ cao điểm "treo" ngay trên ô: bay tới đây trước rồi mới hạ thẳng đứng xuống */
         speed:3.6,min:2.8,max:4.8,          /* chặng bay tới điểm treo: tốc độ (đơn vị/giây), thời gian kẹp trong [min,max] giây (phanh dần) */
         descend:2.4,                        /* giây hạ thẳng đứng từ điểm treo xuống ô (chậm lúc bắt đầu và lúc chạm đất) */
         lean:.35,                           /* độ chúi người theo hướng bay (rad) */
         land:.45},                          /* giây nhún lúc chạm đất */

    /* LỬA PHẢN LỰC ở hai chân (chỉ cháy lúc bay) */
    jet:{len:.9,r:.075,flick:.25,            /* chiều dài ngọn lửa (đơn vị model), bán kính gốc, độ chập chờn */
         core:0xfff3b0,flame:0xff6a10,       /* màu lõi, màu ngoài */
         sparks:true,rate:90,max:140,        /* tia lửa rơi: bật/tắt, số hạt phát ra mỗi giây, trần số hạt cùng lúc */
         life:[.3,.6],size:.12},             /* tuổi thọ hạt (giây), cỡ hạt */

    /* CHẠY (đường ra mép bàn lúc rời đi) */
    speed:2.3,stride:.85,lean:.1,            /* tốc độ chạy (đơn vị/giây), độ dài một nhịp chân, độ chúi người */
    arrive:{dur:.9,hop:.14},                 /* khựng lại nhảy một cái khi vào ô */
    hold:1.6,                                /* đứng yên cho người chơi nhìn trước khi trả quyền chơi */

    /* RỜI ĐI: chạy ra một ô mép bàn rồi nhảy xuống. Không có đường (bị tường/quân vây kín) thì bay vút lên. */
    exit:{near:2,                            /* chọn ngẫu nhiên trong các ô mép có đường chạy không dài hơn ô mép gần nhất quá chừng này ô */
          jump:{vy:3.0,vx:.9,g:12,flip:4,fall:7},   /* cú nhảy: vận tốc lên, vận tốc ra ngoài (x tốc độ chạy), trọng lực, tốc độ lộn (rad/giây), rơi sâu bao nhiêu thì biến mất */
          rise:{charge:.8,acc:5,top:16}},  /* bay lên: giây nén người + nhóm lửa, gia tốc, độ cao thì biến mất */

    cam:{dist:6.2,pitch:.42,look:.45,        /* camera khóa: khoảng cách, góc nghiêng, độ cao điểm nhìn */
         rate:{pos:1.6,ang:1.8,yaw:.9}},     /* độ nhanh làm mượt khi khóa (càng nhỏ càng chậm, đỡ chóng mặt): điểm nhìn đi theo · nghiêng/khoảng cách · xoay quanh */
    key:true                                 /* phím B: gọi / đuổi người chặn đường (để thử; đặt false khi phát hành) */
  },

  LIGHT:{
    hemi:[0xffffff,0x7a6a5a,.45],
    sun:[0xfff0dc,.8],sunPos:[5,10,6],
    fill:[0xdde6ff,.25],fillPos:[-6,5,-5],
    shadowSize:2048
  },

  PAWN:{
    R:.4,H:.5,scale:.55,pivot:.44,          /* kích thước thân Lathe, tỉ lệ quân, độ cao trục xoay (tâm thân) */
    roughness:.8,                           /* quân nhám */
    landJitter:.1,                          /* đáp lệch tâm ô tối đa */
    yawJitter:.4,                           /* hướng mặt lúc đáp lệch tối đa (rad) */
    sway:.2,                                /* nhún nghiêng sang hai bên khi đi (rad) */
    plant:.7,                               /* 1 = chân bám đất khi nghiêng, 0 = cả người trượt theo */
    bob:.035,                               /* nhún lên xuống theo từng bước */
    lieY:.14,                               /* độ cao tâm thân khi nằm ngửa/sấp trên sàn (ngã) */
    lieYSide:.21,                           /* ... khi nằm nghiêng một bên (thân dày hơn theo chiều ngang) */
    /* Ngã + trượt băng. Mỗi lần bốc ngẫu nhiên: kiểu ngã (ngửa / sấp / nghiêng), kiểu trượt (xoay tròn / lăn / trượt thẳng lắc lư), độ chậm dần,
       độ lệch quỹ đạo, điểm dừng lệch tâm ô, thời lượng mỗi pha (±var). Bẫy hất cũng dùng đúng khung này (n=0 ô trượt): đáp xuống → ngã → nằm im → đứng dậy. */
    slip:{fall:.42,hop:.42,rest:.45,rise:.7,var:.18,      /* giây: ngã · mỗi ô trượt · nằm im · đứng dậy; var = biên độ ngẫu nhiên ±% của từng pha */
          power:[1.3,2.1],                                /* > 1 = chậm dần như có ma sát; mỗi lần một giá trị */
          sty:[.45,.3,.25],                               /* tỉ lệ kiểu ngã: ngửa · sấp · nghiêng */
          mode:[.35,.3,.35],                              /* tỉ lệ kiểu trượt: xoay tròn · lăn quanh thân · trượt thẳng lắc lư */
          drift:.09,stopJit:.07,                          /* lệch ngang tối đa của quỹ đạo · điểm dừng lệch tâm ô tối đa */
          landFall:.32},                                  /* thời gian ngã khi vừa đáp từ cú bay (không có đà trượt) */
    land:{squash:.1,per:.09,max:.3},        /* nhún khi đáp sau cú nhảy: độ bẹp = squash + per × độ cao bay, tối đa max */
    wade:{depth:.065,k:190,damp:15,airFull:.06,airNone:.3},   /* lún xuống nước: độ sâu (đáy nước ở .03 dưới mặt .1 → .07 là chạm đáy) · độ cứng/giảm chấn lò xo · độ cao bay (so với mặt ô) còn lún đủ / hết lún */
    launch:{air:2.1,dur:1.1,flips:2},       /* bị bẫy hất: độ cao cung bay, thời gian bay (cộng thêm theo quãng đường), số vòng lộn */
    blink:{out:.5,gap:.14,in:.62,rise:1.0,turns:2}   /* dịch chuyển cổng: giây xoáy lên + co thành tia · khoảng tia sáng nối hai cổng · giây rơi xuống + hiện lại; độ cao bay, số vòng xoáy */
  },

  /* Dấu nổi trên ô đặc biệt (view/marks.js): X đỏ trên cổng bị chặn, ✓ xanh / ! đỏ trên bẫy; tia sáng nối hai cổng khi dịch chuyển */
  /* Rương và vật phẩm (Hỗn Loạn; luật ở core.js). icon = biểu tượng trên ô/túi đồ; wait = thời gian quân đứng chờ lúc rương mở (rồi mới bước vào ô);
     reveal = lúc món quà hiện ra (tính từ khi rương bắt đầu mở); popHold = quà lơ lửng bao lâu */
  ITEMS:{
    brick:{icon:'🧱',name:'Cục gạch',tip:'+1 tường'},
    boots:{icon:'👟',name:'Đôi giày',tip:'Thêm một lượt, chỉ để đi quân (miễn phí, không tốn lượt)'},
    glove:{icon:'🧤',name:'Găng tay',tip:'Cướp 1 tường của đối thủ (khi họ còn ít nhất 2 tường). Tốn một lượt'},
    hammer:{icon:'🔨',name:'Búa',tip:'Tháo một tường của đối thủ, trả lại cho họ. Tốn một lượt'},
    pick:{icon:'⛏️',name:'Cuốc chim',tip:'Phá hẳn một tường của đối thủ: khe đó không ai xây lại được. Tốn một lượt'}
  },
  CHEST:{wait:1.55,reveal:.5,popHold:1.0},
  MARK:{
    size:.55,popIn:.32,fadeOut:.2,          /* cỡ dấu (đơn vị thế giới), thời gian bật ra (phóng quá cỡ rồi về đúng cỡ) / mờ dần */
    gateY:1.25,trapY:1.0,seenY:1.35,                   /* độ cao dấu so với mặt ô */
    beamY:.45,beamColor:0x58d4ff            /* tia sáng cổng: độ cao, màu quầng */
  },

  WALL:{
    height:.5,restY:.255,ghostY:.35,
    ghost:{speed:.8,glow:[.8,1.6],alpha:[.5,.78]},   /* tường "ma" thở: nhịp/giây, độ sáng phát ra [min,max], độ đậm [min,max] */
    drop:[2.2,3],                           /* độ cao rơi ngẫu nhiên [min,max] */
    gravity:20,
    bounce:[.2,.35],                        /* hệ số nảy ngẫu nhiên [min,max] */
    stopSpeed:1.1,                          /* nảy yếu hơn mức này thì dừng hẳn */
    roughness:.35,metalness:.05
  },

  /* Thanh khả năng thắng (xem eval.js). Các số này được fit trên ~12.000 thế cờ từ ván máy đấu máy; chỉnh tay thì xem ghi chú từng dòng. */
  EVAL:{
    depth:3,      /* tìm kiếm mấy nước (ply). 3 ≈ 4ms/thế; 4 chậm gấp ~4 lần mà gần như không chính xác hơn */
    nodes:4000,   /* trần số nút tìm kiếm cho mỗi lần chấm (chống đơ máy yếu); hết ngân sách thì dùng độ sâu trước đó */
    top:6,        /* mỗi nút chỉ thử tối đa chừng này tường "đáng đặt nhất" (bên trong cây) */
    topRoot:8,    /* như trên nhưng cho nút gốc */
    tempo:.5,     /* lợi thế của bên có lượt, tính bằng bước đi (đúng cho cuộc đua thuần túy) */
    wallA:2.1,    /* giá trị của tường dư: w tường đáng  wallA*w + wallB*w²  bước đi (wallB âm = càng nhiều càng giảm dần) */
    wallB:-.16,
    kZero:.33,    /* độ "mờ" của đường cong xác suất khi bên đang thua HẾT tường: nhỏ = dẫn 1-2 bước là gần chắc thắng (vẫn chừa chỗ cho hai quân cản nhau) */
    k0:.55,       /* độ mờ khi bên thua còn tường: k = k0 + kWall * (số tường bên thua còn) */
    kWall:.77,    /* mỗi tường bên thua còn giữ làm đường cong mờ thêm chừng này (còn tường = còn đường lật kèo) */
    max:.99       /* chặn trên của xác suất khi ván chưa kết thúc: 99% / 1% */
  },

  /* Hai AI có "tính cách" (js/ai/attacker.js, defender.js). Mỗi ván mỗi AI bốc ngẫu nhiên một bộ tính cách trong các khoảng dưới đây
     (dạng [min,max] = số ngẫu nhiên trong khoảng; dạng [[giá trị, trọng số],...] = chọn có trọng số). Khoảng càng hẹp thì càng ít đổi gió.
     Đơn vị "bước" = số ô đường đi. net của một tường = (đối thủ phải đi thêm) - (mình phải đi thêm); đặt tường tốn một lượt nên net=1 là hòa vốn. */
  AI:{
    biet:{                                      /* Mr. Biết: boss tìm kiếm sâu + đọc đối thủ + chọn nước mềm cho khó đoán */
      depth:8,nodes:30000,ms:500,msMain:160,    /* trần tìm kiếm: độ sâu tối đa, số nút, thời gian (ms) mỗi nước; msMain = trần khi buộc phải chạy ở luồng chính (không có Worker) */
      topRoot:12,top:6,top2:4,                  /* số tường thử ở gốc / nút trong (còn >= 3 nước) / nút gần lá */
      wallA:4,wallR:.85,tempo:.5,             /* tường dư thứ k đáng A*R^(k-1) bước đi (R<1: càng nhiều càng rẻ), lợi thế người có lượt */
      jitter:.12,                               /* mỗi ván giá trị tường lệch ngẫu nhiên ± chừng này (tỉ lệ) */
      rep:.8,                                   /* phạt mỗi lần lặp lại thế cờ cũ (bước đi) */
      margin:.3,temp:.25,openBoost:2,openPly:8, /* chọn mềm giữa các nước kém nước tốt nhất < margin bước; mở màn margin x openBoost */
      effPrior:1.6,effK:2,effLo:.6,effHi:1.4    /* đọc đối thủ: hiệu quả trung bình dự kiến mỗi tường, độ tin vào dự kiến, biên điều chỉnh */
    },
    mirror:{                                    /* Mr. Bắt Chước: chơi gương đối xứng, chỉ ra đòn thật khi thấy sơ hở */
      loyal:[.85,1],                            /* xác suất mỗi lượt chịu bắt chước (còn lại: đi ngắn nhất) */
      strike:[[2,.3],[3,.45],[4,.25]],          /* có tường lời >= số bước này (đã trừ phần mình chậm) thì bỏ gương mà đặt luôn */
      panic:[[2,.4],[3,.6]],                    /* đối thủ cách đích <= số này thì thôi chơi gương, đặt tường cản */
      tol:[0,1.5]                               /* tường đối xứng làm mình thiệt hơn đối thủ quá số bước này thì bỏ qua */
    },
    keeper:{                                    /* Mr. Thủ Môn: chạy nước rút, giữ tường, đóng cổng khi đối thủ áp sát vạch đích */
      zone:[[6,.3],[7,.4],[8,.3]],              /* đối thủ cách đích <= số này bước thì bắt đầu đóng cổng */
      homeW:[.5,1.5],                           /* thưởng cho tường ngang sát hàng nhà (<= 2 hàng) */
      linkW:[.3,1.2],                           /* thưởng cho tường nối với tường khác / mép bàn (hàng rào liền) */
      need:[[2,.7],[3,.3]],                     /* tường phải lời >= số bước này (đã trừ phần mình chậm) mới chịu đặt */
      reserve:[[0,.7],[1,.3]],                  /* số tường giữ lại, chỉ xả khi đối thủ cách đích <= 2 bước */
      lead:[[2,.3],[3,.7]],                     /* dẫn trước đối thủ chừng này bước thì khỏi đóng cổng, cứ chạy */
      temp:[.15,.5]                             /* nhiệt độ chọn giữa 3 tường tốt nhất */
    },
    control:{                                   /* Mr. Kiểm Soát: dựng cụm tường giữa bàn trước, rồi ứng biến (mỗi ván bốc một tính cách) */
      open:[[0,.4],[1,.4],[2,.2]],              /* số nước đi quân trước khi bắt đầu dựng thế trận */
      claim:[[2,.3],[3,.45],[4,.25]],           /* số tường muốn dựng ở trung tâm */
      radius:[2.5,3.5],                         /* \"trung tâm\" rộng tới đâu (khoảng cách Manhattan từ nút giữa bàn; tường sát tâm = 1) */
      centerW:[.5,1.1],                         /* thưởng độ gần tâm khi dựng thế trận */
      chainW:[.3,.9],                           /* thưởng cho tường chạm vào tường của chính mình (cụm liền khối) */
      cap:[[0,.7],[1,.3]],                      /* tường dựng thế trận được làm mình chậm tối đa mấy bước */
      safe:[[4,.5],[5,.5]],                     /* chỉ dựng thế trận khi đối thủ còn cách đích >= số bước này */
      need:[[1,.4],[2,.5],[3,.1]],              /* ứng biến: tường phải lời >= số này (bị bỏ lại thì giảm 1) */
      reserve:[[0,.5],[1,.5]],                  /* số tường giữ lại cho lúc đối thủ cận đích */
      lead:[[2,.5],[3,.5]],                     /* dẫn trước chừng này bước thì khỏi đặt tường, cứ chạy */
      temp:[.15,.5]                             /* nhiệt độ chọn giữa 3 tường tốt nhất */
    },
    gambler:{                                   /* Mr. Con Bạc: mỗi ván cược một kiểu — all-in ném tường sớm, hoặc keo kiệt rồi xả liều */
      mode:[['allin',.5],['miser',.5]],         /* tỉ lệ hai kiểu cược */
      open:[[0,.6],[1,.4]],                     /* (all-in) số nước đi quân trước khi bắt đầu ném tường */
      cap:[[1,.5],[2,.5]],                      /* (all-in) chấp nhận tự chậm tối đa mấy bước cho mỗi tường */
      need:[[1,.6],[2,.4]],                     /* (all-in) tường phải lời (net) >= số này mới ném */
      lead:[[3,.5],[4,.5]],                     /* (all-in) dẫn trước chừng này bước thì thôi cược, chạy về */
      trigger:[[2,.5],[3,.5]],                  /* (keo kiệt) đối thủ cách đích <= số này thì bắt đầu xả */
      tilt:[[3,.5],[4,.5]],                     /* (keo kiệt) mình bị bỏ lại >= số bước này thì xả gỡ gạc */
      yolo:[.04,.14],                           /* xác suất mỗi lượt \"thấy hên là đánh\" tường lời >= 2 bước */
      temp:[.2,.7]                              /* nhiệt độ chọn giữa 3 tường tốt nhất */
    },
    thug:{                                      /* Mr. Lưu Manh: hợm hĩnh, sát mặt, hay chọc (mỗi ván bốc một tính cách trong các khoảng này) */
      opening:[[0,.55],[1,.3],[2,.15]],         /* số nước đi quân khoe mẽ trước khi dựng tường */
      swagger:[0,.15],                          /* xác suất mỗi lượt đi dạo một bước thay vì đặt tường */
      lead:[[1,.4],[2,.4],[3,.2]],             /* dẫn trước đối thủ chừng này bước thì chạy về đích (99 = cứ chọc đến hết tường) */
      near:[.05,.4],                            /* ưu tiên tường gần quân đối thủ (mỗi ô khoảng cách trừ bấy nhiêu điểm) */
      headW:[0,1.2],                            /* thưởng cho tường chặn đúng 1-2 bước kế tiếp của đối thủ */
      selfW:[1,1.8],                            /* mỗi bước mình bị chậm trừ bấy nhiêu điểm (càng cao càng giữ đường mình thoáng) */
      cap:[[0,.3],[1,.4],[2,.3]],               /* bỏ tường nào làm đường mình dài thêm quá số bước này */
      temp:[.15,.6]                             /* nhiệt độ chọn giữa 4 tường tốt nhất: cao = khó đoán hơn */
    },
    attacker:{                                  /* Mr. Lấn Ép: dồn tường để kéo dài đường đối thủ */
      opening:[0,2],                            /* số nước đi quân đầu tiên trước khi bắt đầu đặt tường */
      need:[[1,.2],[2,.55],[3,.25]],            /* "giá trị" tối thiểu của tường để chịu đặt (1 = đặt cả tường hòa vốn để quấy rối) */
      selfCap:[[0,.65],[1,.35]],                /* tường được phép làm đường mình dài thêm tối đa bao nhiêu bước */
      eager:[.8,1],                             /* xác suất chịu đặt khi có tường đạt chuẩn (còn lại: đi bộ, đánh lạc hướng) */
      linkW:[0,1.2],                            /* thưởng cho tường nối liền với tường/mép bàn (xây hàng rào dài) */
      lineW:[.6,1.6],                           /* thưởng thêm cho tường nối THẲNG HÀNG vào tường của chính mình (rào dài một mạch) */
      temp:[.2,.7],                             /* nhiệt độ chọn giữa các tường tốt nhất: cao = khó đoán hơn */
      selfW:1.4,                                /* mỗi bước mình bị chậm trừ bấy nhiêu điểm (>1 = giữ đường mình thoáng) */
      gambit:.07                                /* xác suất mỗi lượt chọn tường hạng 2-3 thay vì hạng 1 */
    },
    defender:{                                  /* Mr. Nhây Nhưa: giữ tường, phản công, đi quân thông minh */
      reserve:[[1,.3],[2,.45],[3,.25]],         /* số tường giữ lại cho tình huống cần thiết (không dùng chủ động) */
      counterNeed:[[1,.6],[2,.4]],             /* khi bị đặt tường: giá trị tối thiểu của tường phản công */
      danger:[[2,.3],[3,.5],[4,.2]],            /* đối thủ cách đích <= số này thì bắt đầu đặt tường kể cả khi chưa bị đặt tường */
      linkW:[.3,1.3],                           /* thưởng cho tường nối với tường sẵn có (tận dụng tường của đối thủ) */
      newLinkW:[1.5,2.6],                       /* thưởng thêm khi nối đúng vào tường đối thủ vừa đặt (phá bẫy) */
      vulnW:[.7,1.3],                           /* trọng số "né chỗ dễ bị chặn" khi chọn nước đi */
      temp:[.15,.5],
      feint:.03                                 /* xác suất mỗi lượt bỏ qua phản công để đi bộ (khó đoán hơn) */
    }
  },

  /* Pháo bông khi thắng. Tổng hạt = bursts * per (nên giữ dưới ~600 cho nhẹ). */
  FX:{
    bursts:7,per:64,                        /* số đợt nổ, số hạt mỗi đợt */
    wait:.55,span:2.6,                      /* đợi quân đáp xong rồi mới nổ; các đợt nổ rải đều trong span giây */
    speed:[1.7,3.4],life:[1.5,2.5],         /* tốc độ bung ra, thời gian sống của hạt (giây) */
    size:[.16,.32],                         /* kích thước hạt (đơn vị thế giới) */
    height:[.9,2.6],spread:1,               /* độ cao tâm nổ so với mặt bàn, độ lệch ngang quanh quân */
    drag:2.2,gravity:4.8,                   /* cản gió (bung nhanh rồi chậm lại), trọng lực */
    palette:[0xff4d6d,0xffd23f,0x3ddc97,0x4cc9f0,0xb388ff,0xff9f1c,0xffffff,0xff6ad5]
  },

  /* Ăn mừng khi chạm ô đích (xem Pawns.celStart/celStep). Mỗi lần bốc thăm đều nhau một trong 4 kiểu. */
  CELEB:{
    kinds:['flip','hiphop','bounce','run'],  /* mỗi kiểu 25% */
    force:null,                              /* đặt 'flip' | 'hiphop' | 'bounce' | 'run' để luôn xem một kiểu (thử/chỉnh) */
    dur:{flip:1.4,hiphop:3.2,bounce:3,run:3},   /* thời lượng từng kiểu (giây) */
    flip:{air:1.1},                          /* lộn một vòng tại chỗ: độ cao bay */
    hiphop:{turns:4,drop:.16,swing:9,legAmp:.8},   /* trồng cây chuối: số vòng xoay, hạ thân cho đầu chạm sàn, nhịp và biên độ chân (rad) */
    bounce:{hops:5,h:.4,squash:.3},          /* nảy cà tưng: số lần nảy, độ cao, độ bẹp lúc chạm đất */
    run:{radius:.3,laps:4,lean:.25,cadence:17}   /* chạy vòng quanh tâm ô: bán kính (< .33 để không ra khỏi ô), số vòng, độ nghiêng vào trong, nhịp chân */
  },

  /* Nhãn chất lượng nước đi (xem review.js, view/badges.js). Mọi ngưỡng là "mất bao nhiêu điểm xác suất thắng so với nước tốt nhất" (0.05 = 5%). */
  REVIEW:{
    walls:8,        /* mỗi lần chấm: thử mọi nước đi quân + chừng này tường đáng đặt nhất (+ chính nước đã đi) để tìm "nước tốt nhất" */
    bookPly:4,      /* những nước đầu ván (mỗi bên 2 nước) mà đi quân gần tối ưu thì gọi là "sách giáo khoa" */
    t:{
      book:.03,     /* nước khai cuộc: mất tối đa bấy nhiêu vẫn là sách giáo khoa */
      top:.01,      /* điều kiện "gần như nước tốt nhất" để xét Thiên tài / Chính xác duy nhất */
      gap:.12,      /* nước tốt nhất phải hơn nước thứ hai ít nhất bấy nhiêu (tức gần như là nước duy nhất) */
      swing:.12,    /* Thiên tài: nước đó còn phải đẩy xác suất thắng của mình lên ít nhất bấy nhiêu so với trước khi đi */
      best:.005,excellent:.02,good:.05,ok:.09,   /* các mức mất điểm: Tốt nhất / Xuất sắc / Tốt / Ổn */
      /* Thế đã phân thắng bại (theo chess.com / Lichess / Duolingo: khi đã thắng hoặc thua hẳn, mất thêm điểm không còn ý nghĩa): */
      lost:.08,won:.92,           /* xác suất ngoài khoảng [lost, won] coi như "đã định": mọi giá trị trong vùng đó được xem là bằng nhau */
      aliveFrom:.08,aliveTo:.35,  /* nước tốt nhất còn <= aliveFrom: đã thua, không trách ai; >= aliveTo: trách đủ; ở giữa tăng dần mượt */
      lead:{best:.5,excellent:1.5,good:3,ok:6},   /* khi cả nước tốt nhất lẫn nước đã đi đều thắng chắc: số bước đi lãng phí tối đa cho Tốt nhất / Xuất sắc / Tốt / Ổn (quá mức đó: Thiếu chính xác) */
      flat:.005,                  /* mọi nước ứng viên chênh nhau không quá mức này: không có lựa chọn nào đáng kể, không gán nhãn */
      brilMin:.30,greatMin:.12,   /* sau nước đi mà vẫn dưới mức này thì không được gọi Thiên tài / Chính xác duy nhất (chess.com: không được ở thế xấu) */
      inacc:.15,mistake:.30,                     /* từ .09: Thiếu chính xác; từ .15: Sai lầm; từ .30: Sai lầm nghiêm trọng */
      missPrev:.12,missBest:.55                  /* Bỏ lỡ: đối thủ vừa sai lầm (mất >= missPrev) mà mình không tận dụng dù có nước giữ được >= missBest */
    },
    /* Hiển thị sprite: tồn tại life giây (máy đấu máy nhanh thì ngắn lại theo S.delay), fade in/out trong lượt đó */
    debug:false,    /* true: in ra console bảng chi tiết cho mỗi nước đi (best, played, before, loss, nhãn...) để dò lỗi gán nhãn */
    life:2.4,in:.25,out:.45,
    pawnY:1.3,wallY:1.15,size:1,rise:.15,    /* độ cao trên đầu quân / trên tường, kích thước (đơn vị thế giới), độ trôi lên */
    dly:{move:.15,wall:.5},                  /* chờ bao lâu mới hiện (tường cần thời gian rơi xuống) */
    labels:{
      brilliant:{name:'Thiên tài',color:'#1baca6',icon:'!!'},
      great:{name:'Chính xác duy nhất',color:'#5c8bb0',icon:'!'},
      best:{name:'Tốt nhất',color:'#96bc4b',icon:'star'},
      excellent:{name:'Xuất sắc',color:'#7fb04a',icon:'thumb'},
      good:{name:'Tốt',color:'#97af8b',icon:'check'},
      ok:{name:'Ổn',color:'#9b9ba3',icon:'eq'},
      book:{name:'Sách giáo khoa',color:'#a88865',icon:'book'},
      inaccuracy:{name:'Thiếu chính xác',color:'#f7c631',icon:'?!'},
      mistake:{name:'Sai lầm',color:'#e58f2a',icon:'?'},
      miss:{name:'Bỏ lỡ',color:'#ee6b5c',icon:'x'},
      blunder:{name:'Sai lầm nghiêm trọng',color:'#ca3431',icon:'??'},
      hopeless:{name:'Hết cách',color:'#7d8fa3',icon:'sad'},        /* hết cửa thắng, mọi nước như nhau: mặt khóc (xám xanh, không dùng đỏ để khỏi giống nhãn lỗi) */
      forced:{name:'Nước ép buộc',color:'#9b9ba3',icon:'arrow'}     /* chỉ có đúng một nước đi */
    }
  },

  CAM:{pitch:.955,dist:14.1,minPitch:.35,maxPitch:1.45,minZoom:.6,maxZoom:1.6,
       followDist:7,followPitch:.5,followLook:.35,
       faceDist:5.5,facePitch:.3}   /* khi thắng: camera lia ra trước mặt quân thắng, gần hơn và thấp hơn */   /* chế độ bám theo quân: khoảng cách, góc nghiêng, độ cao điểm nhìn */
};