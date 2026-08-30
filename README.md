# simplegames

很多小遊戲 —— 一些看起來像小玩具、其實很好用的網頁小工具。

全部都是靜態網頁：開啟就能用，不必安裝、不用註冊、沒有後端。

首頁是 `index.html`，從那裡點進各個小工具。

| 小工具 | 說明 |
| --- | --- |
| [和弦墊 Chord Pad](chordpad/) | 用大按鈕彈和弦的伴奏樂器，替詩歌伴奏用（[說明](chordpad/README.md)） |
| [百葉窗 Blinds](blinds/) | 相機畫面後面的百葉窗，用手指撥開偷看。不拍照、不錄影（[說明](blinds/README.md)） |
| [霧鏡 Fog Mirror](fogmirror/) | 前鏡頭變成起霧的三溫暖鏡子；可擦開、畫圖、水珠合併流動，並依裝置重力改變方向（[說明](fogmirror/README.md)） |
| [三體沙盤 Threebody](threebody/) | 地月三體沙盤：拉格朗日點、馬蹄形軌道、零速度曲線、脈衝與目標規劃。同一條積分軌跡可以在會旋轉、跟著地球、與慣性三種座標系裡看（[說明](threebody/README.md)） |
| [雨窗 Rainpane](rainpane/) | 隔著一片玻璃看夜裡的林間小路。水滴的物理、同一場雨算出來的雨聲、雨越大遠處越看不清（[說明](rainpane/README.md)） |

## 本機執行

```sh
python3 -m http.server 8000
# 開 http://localhost:8000/
```

因為用了 ES modules，請用 `http://` 開啟（或 GitHub Pages），不要直接用 `file://`。
