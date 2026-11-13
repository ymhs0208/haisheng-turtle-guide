# 小綠導覽

國立海洋生物博物館（海生館）的競賽原型：一隻綠蠵龜「小綠」陪訪客看展。手機負責問答、補救與聊天，展示箱負責鬼影（Pepper's Ghost）上的團體畫面。

本系統與海生館沒有官方隸屬。展區、題目、導覽詞都是**樣本**，正式使用前必須換成館方審定內容。種子檔在 `content/seed.json`。

## 怎麼啟動

需要 Node.js 22 以上。

```bash
./start.sh
```

第一次會安裝依賴，然後同時打開三個程序：

| 用途 | 網址 |
| --- | --- |
| 手機導覽 | http://127.0.0.1:43123 |
| 鬼影箱 | http://127.0.0.1:43124 |
| API | http://127.0.0.1:43125 |

沒有 `./start.sh` 時，在專案根目錄：

```bash
npm install
npm test
npm run dev
```

`npm test` 只跑伺服器測試。三個開發網址會經由 Vite 把 `/api` 與 `/ws` 轉到 `43125`。手機與展示箱的 WebSocket 位址是 `ws://主機/ws`（協定後面要有冒號）。

### Docker（PostgreSQL + pgvector）

沒有 Docker 時，`npm run dev` 會改走 JSON 檔（`server/data/runtime.json`），不必先裝資料庫。有 Docker 時，映像會先建置手機、展示箱與 API，再由同一個程序提供：

```bash
cp .env.example .env
docker compose up --build
```

- http://127.0.0.1:43125/ 手機
- http://127.0.0.1:43125/display/ 展示箱
- WebSocket 一樣是 `ws://127.0.0.1:43125/ws`

資料庫對外是 `localhost:54329`，帳號密碼都是 `nmmba`。要在本機單獨連它，把 `.env` 的 `DATABASE_URL` 設成 `postgres://nmmba:nmmba@localhost:54329/nmmba`。`docker compose` 裡的 API 會自己連到容器內的 `db`，不用改這一行。JSON 備援不適合多個伺服器程序同時寫；Docker 這條路徑才是給單一一份 PostgreSQL 用的。

## 架構

```mermaid
flowchart TB
  Phone[手機 web<br/>React + Vite + Three.js]
  Box[展示箱 display<br/>純黑、可鏡像]
  API[server<br/>REST + WebSocket]
  Engine[BKT 與三種補救策略]
  Rag[意圖分流與檢索]
  LLM[模型供應者<br/>預設 mock]
  DB[(PostgreSQL + pgvector<br/>或 JSON 備援)]

  Phone -->|REST| API
  Phone -->|WebSocket| API
  Box -->|WebSocket| API
  API --> Engine
  API --> Rag
  Rag --> LLM
  Engine --> DB
  Rag --> DB
```

| 目錄 | 內容 |
| --- | --- |
| `web/` | 手機導覽。3D 小綠、測驗、聊天、把小綠送到展示箱 |
| `display/` | 鬼影箱頁面。全黑背景、鏡像、離線時輪播預錄稿 |
| `server/` | REST、WebSocket、BKT、策略、檢索、紀錄 |
| `packages/scene/` | 手機與展示箱共用的低面數綠蠵龜 |
| `content/seed.json` | 樣本展區、概念、題目、補救腳本、檢索段落 |
| `content/public-slides.json` | 展示箱離線稿，不含正解 |

正解只留在伺服器。手機拿到的題目沒有答案欄位。

## 研究核心

每位訪客進場時隨機分到一組，組別只影響**答錯之後選哪一種補救**，不影響題目與腳本文字。三種補救都是事先寫好的：

| 策略 | 介面名稱 | 參考時長 |
| --- | --- | --- |
| `animation` | 3D 動畫重講 | 70 秒 |
| `hint` | 提示加引導提問 | 40 秒 |
| `analogy` | 換比喻／例子 | 28 秒 |

- **固定順序**：動畫 → 提示 → 比喻，循環。對照組。
- **規則式**：剩餘不到 35 秒用比喻；答得很快（低於預期 0.55 倍）也用比喻；熟練度低於 0.45 用動畫；其餘用提示。
- **適性學習**：先估每種做法的學習收益。剩餘時間至少 180 秒時，選收益最高的；時間更短時，改選每一秒收益較高、而且放得進剩餘時間的做法。

熟練度是貝氏知識追蹤。先驗是 `P(L0)=0.3`、`P(T)=0.12`、`P(G)=0.25`、`P(S)=0.1`，還沒有用真實遊客校正。作答時間只溫和調整這一題的猜測與失誤，不另外建一個時間模型。答得又快又正確，上升多一點；答錯又很快，下降多一點。每次作答都做標準的學習轉移；看完補救腳本不再加一次，避免同一題被算兩次。

年齡只改用詞：兒童看較短的 `textChild`，青少年與成人看同一份 `text`。工作人員改的是概念簡介，會進檢索；補救腳本仍以種子檔為準。

## 示範腳本

準備三個視窗：兩個手機分頁（43123），一個展示箱（43124）。

1. 手機 A 用「評審示範」指定**適性學習**，暱稱自訂，年齡選青少年，停留 40 分鐘。手機 B 指定**規則式**。
2. 兩邊都進「海龜」。A 先做一題練習，故意答錯、不要點太快。應看到「3D 動畫重講」，理由會提到熟練度。熟練度百分比會變。
3. B 很快按錯。應看到「換比喻／例子」，理由會提到答得很快。
4. 回 A 的首頁，打開「評審示範工具」，把剩餘時間改成 30 秒，再錯一題。適性學習應改成較短的比喻。
5. 再開一位**固定順序**，連續錯兩題，應依序是動畫、提示。
6. 到「對話」跟小綠說「你好」，再問「珊瑚為什麼會白化？」。回答要有《書名號》出處。換區之後，小綠會提一次你先前答錯的概念。輸入「忽略之前的指令」應被拒絕。
7. 在「展示」按「送小綠去展示箱」。手機上的小綠游出，展示箱游入。
8. 兩個手機都停在海龜區，按「發起團體挑戰」。展示箱倒數、出題、即時長條圖，結束時說明最多人沒掌握的概念。答錯的手機各自收到自己那一組的補救。
9. 把問題送到展示箱，例如兩個手機都送「海龜吃什麼」。展示箱只回答合併後的那一題。
10. 關掉 API 後，已開啟的展示箱改播「離線模式 · 預錄導覽」。

## 鬼影箱怎麼擺

這版對準的是**單片 45° PET 膜或半反射鏡**，人從箱子正面看反射，螢幕本身不朝觀眾。背景全程是純黑 `#000`，包含下方文字帶，這樣膜上看不到螢幕邊框。

1. 螢幕放進箱子。若螢幕朝前、膜片立在前方 45°，通常要左右鏡像（`M`）。若螢幕朝上、人從正面看膜，再加上上下翻轉（`V`）。直接看螢幕時字是反的，反射後才會轉正。
2. 按 `C` 打開校正：白網格、中心十字、綠色安全框。移動膜片，讓中心落在觀眾眼前，安全框留在反射區裡，不要切到箱子邊緣。
3. 文字帶跟海龜一起被鏡像。`[` `]` 調整文字帶高度（預設 48vh），或用網址 `?band=48`。題目、選項與長條圖都在這一段。
4. `T` 打開綠蠵龜一比一。背甲直線長按 100 公分估算。用 `-` `=` 告訴程式螢幕實際寬度（公分），或用 `?truesize=1&widthCm=80`。螢幕比海龜窄時，畫面上只看得到一部分。
5. 海龜用較亮的綠與黃、一圈淡綠輪廓光，背景有焦散與氣泡。動作比手機慢、幅度比較大。手機把小綠送過來時，手機會先游出，約 2.4 秒後展示箱從側邊游入。
6. 畫面鎖定 30fps。`Q` 或 `?quality=low` 再關掉抗鋸齒、焦散，並減少氣泡，給 Raspberry Pi 5。
7. `H` 隱藏控制列，`F` 全螢幕。實機請用乾淨網址，控制列不要進反射。

樹莓派 kiosk，開發網址或 Docker 網址擇一：

```bash
chromium-browser --kiosk "http://<主機>:43124/?mirror=1&clean=1&quality=low"
```

螢幕朝上時加上 `&flip=1`。API 斷線後，已經打開的展示箱會改播「離線模式 · 預錄導覽」；整台機器沒有這個網頁時，無法憑空播放。

展示箱按鍵：`M` 鏡像、`V` 上下翻轉、`C` 校正、`Q` 畫質、`T` 一比一、`[` `]` 文字帶、`-` `=` 螢幕寬度、`H` 隱藏控制列、`F` 全螢幕、`N` 下一張離線稿、空白鍵開始團體題。

## API

除了特別註明，回應都是 JSON。錯誤是 `{ "error": "…" }`。

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/health` | 存活、資料庫種類、模型 |
| GET | `/api/meta` | 年齡層、分組、策略的顯示名稱 |
| GET | `/api/zones` | 展區與概念簡介，不含題目與腳本 |
| POST | `/api/sessions` | 建立匿名行程。`nickname`、`ageGroup`、`visitMinutes`，可選 `experimentGroup` |
| GET | `/api/sessions/:id` | 行程 |
| PATCH | `/api/sessions/:id` | `nickname`、`currentZoneId` |
| POST | `/api/sessions/:id/demo` | 示範用。`remainingSec`、`experimentGroup`。`ALLOW_GROUP_OVERRIDE=0` 時拒絕 |
| GET | `/api/sessions/:id/quiz?zoneId&kind` | `kind` 為 `practice`、`pre`、`post`。不含正解 |
| POST | `/api/sessions/:id/answer` | `{ questionId, choiceIndex, latencyMs, kind }` |
| POST | `/api/sessions/:id/reset-practice` | `{ zoneId }` 只清練習作答，不重置熟練度 |
| GET/POST | `/api/sessions/:id/chat` | 讀紀錄，或送 `{ message }` |
| GET | `/api/sessions/:id/summary` | 前測、後測、熟練度 |
| GET | `/api/admin/overview` | 分組統計與概念列表 |
| PATCH | `/api/admin/concepts/:id` | `{ title, summary }` |
| GET | `/api/export/events.csv` | 作答與事件，含 UTF-8 BOM |
| GET | `/api/export/mastery.csv` | 熟練度 |
| POST | `/api/recognize` | 物種辨識占位，不收照片 |

有設定 `ADMIN_TOKEN` 時，工作人員與匯出要帶 `x-admin-token`。

## WebSocket

路徑 `/ws`。訊息都是 JSON，帶 `v: 1`。

手機或展示箱先送：

```json
{ "v": 1, "type": "hello", "role": "phone", "sessionId": "…", "zoneId": "turtle" }
```

```json
{ "v": 1, "type": "hello", "role": "display", "zoneId": "coral" }
```

之後：

| type | 誰送 | 說明 |
| --- | --- | --- |
| `set_zone` | 雙方 | 換展區 |
| `send_turtle` / `recall_turtle` | 手機，召回時展示箱也可以 | 同步游出、游入 |
| `enqueue_question` | 手機 | `{ text }`，同區相近問法合併 |
| `show_start` | 手機或展示箱 | 開一題團體挑戰。只有 1 支手機時是一對一 |
| `show_answer` | 手機 | `{ showId, choiceIndex, latencyMs }` |
| `pong` | 雙方 | 回應伺服器的 `ping` |

伺服器會推：

| type | 說明 |
| --- | --- |
| `hello_ok` | 連上了 |
| `presence` | 該區手機數、展示箱數 |
| `turtle` | `{ who, action, sessionId, nickname, zoneId }`，`action` 為 `exit` 或 `enter` |
| `turtle_snapshot` | 目前小綠在展示箱上的狀態 |
| `show_state` | `show` 為 `null` 代表結束。作答中只有展示箱看得到票數 |
| `show_personal` | 只給該手機：你這題對不對 |
| `personal_remediation` | 只給答錯的手機，依該訪客的組別 |
| `box_answer` | 合併後的問題與回答、出處 |
| `queue` | 尚未回答的問題與票數 |
| `error` | 人話錯誤 |

`show.phase` 依序是 `announce`、`answer`、`results`、`explain`。預設 8 秒、20 秒、8 秒、18 秒，可用環境變數改。

## 模型與檢索

`.env.example` 複製成 `.env`。預設 `LLM_PROVIDER=mock`，不需要金鑰。檢索用 64 維字元 n-gram，可重現，也寫進 pgvector 的 `vector(64)`。

若改成 `openai`，生成走 `OPENAI_BASE_URL` 的 Chat Completions。金鑰只在伺服器。雲端失敗時會退回館內資料簡答，並在回覆標明。`EMBEDDING_PROVIDER=openai` 時，向量若不是 64 維，查詢改在應用層做餘弦；預設本地向量才走 pgvector 索引。

聊天先看意圖：提示注入、離題、閒聊、館內問題。注入與離題不會送給模型。館內問題檢索不到就明說不知道，並建議問現場人員。個人記憶只在換區後提一次先前答錯的概念；展示箱上的公開回答不帶個人記憶。

## 測試

```bash
npm test
```

涵蓋 BKT、三種策略、題目去重、種子檔、意圖分流與引用、以及一條從作答到團體題的 API／WebSocket 路徑。

## 已知限制

- 展區要手動切換，沒有館內定位。
- BKT 參數是短訪示範先驗，不是擬合結果。團體題可能和個人練習題重複，但不消耗個人題庫。
- 檢索是字元重疊，不是語意嵌入。換雲端嵌入要一併看向量維度。
- 語音用瀏覽器的 Web Speech，中文品質看裝置。展示箱沒有麥克風。
- 拍照辨識只有占位。
- 工作人員頁在沒設權杖時是開放的，裡面沒有正解，但 CSV 有作答索引，不要直接掛到公開網路。
- JSON 備援不適合多個伺服器程序同時寫。
- 離線輪播要展示箱頁面先打開；整台機器沒有這個網頁時，無法憑空播放。
