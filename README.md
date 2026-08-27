# simplegames

很多小遊戲 —— 一些看起來像小玩具、其實很好用的網頁小工具。

全部都是靜態網頁：開啟就能用，不必安裝、不用註冊、沒有後端。

首頁是 `index.html`，從那裡點進各個小工具。

| 小工具 | 說明 |
| --- | --- |
| [和弦墊 Chord Pad](chordpad/) | 用大按鈕彈和弦的伴奏樂器，替詩歌伴奏用（[說明](chordpad/README.md)） |
| [百葉窗 Blinds](blinds/) | 相機畫面後面的百葉窗，用手指撥開偷看。不拍照、不錄影（[說明](blinds/README.md)） |

## 本機執行

```sh
python3 -m http.server 8000
# 開 http://localhost:8000/
```

因為用了 ES modules，請用 `http://` 開啟（或 GitHub Pages），不要直接用 `file://`。
