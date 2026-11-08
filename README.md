# mp3tagging

純前端的 mp3 標籤校正工具。拖入手上的 mp3，輸入歌名、歌手（可加專輯），從 iTunes 或 MusicBrainz 搜尋，挑出正確的版本，就能補上歌名、歌手、專輯、年份、曲號、類型和封面，再下載修正後的檔案。

不需要後端、不需要安裝，單一 `index.html` 就能用。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 特色

- **檔案不上傳**：mp3 只在瀏覽器裡讀寫。只有你輸入的歌名、歌手、專輯，會送到搜尋服務。
- **兩個搜尋來源**：iTunes（封面品質好、有類型）和 MusicBrainz（社群資料庫、版本多）。
- **修改前後對照**：被改動的欄位會標成橘色，並顯示「原：…」，確認後才下載。
- **批次處理**：可一次拖入多首，左側清單顯示每首的修改狀態，並可一次下載全部已修改的檔案。
- **封面**：套用搜尋結果時一併抓封面，也可以移除或還原。
- **中文亂碼修復**：舊檔常把中文存成 Big5 或 GBK，可選編碼重新解讀。
- **不動音訊**：只重寫標籤，音訊資料位元組不變，原始檔案也不會被修改。
- **沒有外部相依**：ID3 讀寫是自己實作的小型模組，不依賴任何函式庫。

## 使用方式

1. 用瀏覽器開啟 `index.html`，或放到任何靜態網站空間。
2. 把 mp3 拖進左邊的框，或點擊選擇檔案。
3. 確認歌名、歌手，需要時填專輯名稱縮小範圍。沒有標籤時會從檔名猜，例如 `周杰倫 - 晴天.mp3`。
4. 選 iTunes 或 MusicBrainz，按「搜尋」，在結果中按「套用」。
5. 檢查標成橘色的欄位，按「下載修正後的檔案」。

側邊欄有兩個選項：

- **移除舊版 ID3v1 標籤**（預設開啟）：避免部分播放器讀到舊資料而蓋過新標籤。
- **下載時改檔名為「歌手 - 歌名.mp3」**。

## 支援與限制

- 只支援 **mp3**。m4a、flac 等格式尚未支援。
- 讀取 ID3v2.2、2.3、2.4；寫入一律輸出 **ID3v2.3**（文字用 UTF-16，大多數播放器和手機都能正確顯示中文）。
- 原標籤裡的壓縮或加密 frame 會被略過；其他不認得的 frame 在 v2.3 檔案中會保留，在 v2.4 檔案中只保留部分常用欄位（如碟號、作曲者、BPM、備註、歌詞）。
- MusicBrainz 限制約每秒一次請求，工具已自動排隊。
- 未支援 Deezer：它的 API 在純前端會被 CORS 擋住，需要自架 proxy。
- 套用結果時下載封面使用一般的 `fetch`。若封面伺服器擋掉你的瀏覽器，封面不會更新，但其他欄位照常套用。

## 資料來源

- iTunes Search API：Apple 提供的公開搜尋介面，以 JSONP 方式查詢。
- [MusicBrainz](https://musicbrainz.org/)：recording 搜尋。核心資料採 CC0 授權。
- [Cover Art Archive](https://coverartarchive.org/)：MusicBrainz 版本的封面。個別封面的權利歸原權利人。

使用這些服務時，請遵守各自的服務條款與流量限制。這個工具只用於整理你自己擁有的音樂檔案。

## 開發

需要 Node.js 與 Python 3，沒有任何 npm 套件。

```text
mp3tagging/
├── index.html            # 建置後的單一檔案（可直接部署）
├── src/
│   ├── index.src.html    # 介面與主程式
│   ├── id3.js            # ID3v2 讀寫
│   └── sources.js        # iTunes / MusicBrainz 結果轉換、檔名猜測
├── test/test.js          # 單元測試
├── build.py              # 把 id3.js、sources.js 內嵌進 index.html
├── LICENSE
└── README.md
```

```bash
git clone https://github.com/parrotchang/mp3tagging.git
cd mp3tagging

node test/test.js     # 執行測試
python3 build.py      # 修改 src/ 後重新產生 index.html
```

想用 GitHub Pages 架站，把 repo 設定為從主分支根目錄發佈即可，因為 `index.html` 已經是建置好的單一檔案。

## 貢獻

歡迎開 [issue](https://github.com/parrotchang/mp3tagging/issues) 或 pull request。送出前請先跑 `node test/test.js`，修改 `src/` 後記得執行 `python3 build.py` 讓 `index.html` 同步。

## 授權

以 [MIT License](LICENSE) 釋出。Copyright (c) 2026 Chang Chieh Lung.
