Bỏ file nhạc nền (.mp3) vào audio/music/ rồi khai tên file trong CONF.music ở js/audio.js (mặc định: music/01.mp3, 02.mp3, 03.mp3).
Nén gợi ý: ffmpeg -i in.wav -b:a 112k -map_metadata -1 -af loudnorm=I=-20:TP=-2:LRA=7 audio/music/01.mp3
