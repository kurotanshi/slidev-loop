# 架構與 Slidev 整合機制

## 全貌

產品名 **Slidev Loop**：研究、生成、調整簡報的 agent 工作流，支援多家主流 coding agent。

```
packages/addon（npm: slidev-addon-loop）
├── global-top.vue        # 瀏覽器端：留言 overlay（跨頁持久、最上層 z-order）
├── vite.config.ts        # 伺服器端：註冊 comments middleware plugin
├── plugin/
│   ├── middleware.ts     # /__agent/comments 的 GET/POST/DELETE 處理
│   └── store.ts          # comments.json 讀寫（原子寫入、schema 驗證）
└── components/           # 留言 UI 子元件（列表、輸入框、pin 標記）

packages/agent-instructions   # 單一事實來源：agent 工作流指令（純 markdown，agent 無關）
├── create-deck.md            # 收集 → 提綱 → 生成 的工作流
├── apply-comments.md         # 留言定位與套用規則
└── slidev-authoring.md       # slidev 語法參考（引用/改造現有成熟 skills）

packages/agent-adapters       # 各家 agent 的薄轉接層（由 sync 腳本從上方生成）
├── claude/                   # Claude Code plugin（SKILL.md）
├── codex/                    # AGENTS.md 區塊 + custom prompts
├── cursor/                   # .cursor/rules + .cursor/commands
├── gemini/                   # GEMINI.md + .gemini/commands
└── copilot/                  # .github/copilot-instructions.md + prompt files

<使用者專案>/.slidev/comments.json   # 留言資料檔（gitignore 建議項）
```

關鍵設計決策：**留言機制是檔案協定，不綁任何一家 agent。** comments.json +
slides.md 都是磁碟上的純文字，任何能讀寫檔案的 coding agent 都能執行工作流；
agent 端的差異只剩「指令的派發格式」，以薄轉接層解決（見第 5 節）。

## 1. Addon 載入機制（與 Slidev 的接點一）

Slidev 的 addon 是一個 npm 套件，Slidev 在啟動時把「使用者專案、theme、各 addon」
視為多個 roots，聚合各 root 提供的 components、layouts、setup、樣式與設定。

發布要求（官方慣例）：

- 套件名以 `slidev-addon-` 開頭：`slidev-addon-loop`。
- `package.json` keywords 必須含 `"slidev-addon"` 與 `"slidev"`。
- `.vue` / `.ts` 原始檔可直接發布，Slidev 會自行編譯，毋需打包。

使用者啟用方式（headmatter，可省略 `slidev-addon-` 前綴）：

```yaml
---
addons:
  - loop
---
```

本地開發時 playground 以相對路徑掛載：`addons: ['../packages/addon']`。

## 2. 瀏覽器端：global-top.vue（接點二）

Slidev global layers 提供跨投影片持久的注入點，z-order 由上而下為：
NavControls → **Global Top** → Slide Top → 投影片內容 → Slide Bottom → Global Bottom。

我們用 `global-top.vue`，因為它是單一實例、跨頁持久、疊在投影片內容之上 —
正好承載留言模式的全域狀態與點擊攔截層。

```
global-top.vue 職責：
- 快捷鍵（暫定 c）切換留言模式
- 留言模式開啟時：鋪一層 capture-phase 點擊攔截 overlay
- 點擊 → 解析 event.target：擷取 textContent（截斷至 200 字）、CSS selector 路徑、
  getBoundingClientRect 相對座標
- 頁碼來源：runtime context `$nav.currentPage`（global layers 內可直接使用）
- 彈出輸入框 → POST /__agent/comments
- 渲染既有留言的 pin 標記（GET 載入，依頁碼過濾）
```

兩道防護：

- **僅 dev mode**：整個 overlay 以 `import.meta.env.DEV` 守門 — 保證不渲染、
  邏輯被 tree-shake。注意元件檔本身仍會被 Slidev 聚合編譯，因此 module top-level
  不得有副作用；Spike A 時順便跑 `slidev build` 確認產物行為乾淨。
- **僅留言模式**：未開啟時不掛任何 listener，對簡報零干擾。

### 已知風險與備案

官方 global layers 文件僅明確寫了「專案根目錄」可提供這些檔案；addon root 是否
同樣被聚合需要 Phase 0 spike 驗證（Slidev 對 components/layouts 是聚合多 roots 的，
global layers 大概率同理，但未見文件保證）。若不行，備案是安裝說明多一步：請使用者
在專案根目錄建立 `global-top.vue`，內容只有一行 re-export addon 的元件。

## 3. 伺服器端：vite.config.ts middleware(接點三)

Slidev 官方文件明載：「your vite.config.ts will be respected … and will be merged
with the Vite config provided by Slidev, your theme **and the addons**」。
addon 自帶的 `vite.config.ts` 會被合併進 dev server。

```ts
// packages/addon/vite.config.ts（示意）
import { defineConfig } from 'vite'
import { commentsMiddleware } from './plugin/middleware'

export default defineConfig({
  plugins: [
    {
      name: 'slidev-addon-loop',
      apply: 'serve',                      // 僅 dev server，build 不載入
      configureServer(server) {
        server.middlewares.use('/__agent/comments', commentsMiddleware(server.config.root))
      },
    },
  ],
})
```

限制：不可重複加入 Slidev 內部已用的 plugin（@vitejs/plugin-vue、unocss/vite 等）—
我們的 plugin 是全新自訂的，不受影響。

API 介面：

| Method | Path | 行為 |
|---|---|---|
| GET | /__agent/comments | 回傳全部留言 |
| POST | /__agent/comments | 新增一筆（schema 驗證，拒絕超長/缺欄位） |
| DELETE | /__agent/comments/:id | 刪除單筆（使用者在 UI 撤回留言） |

寫入策略：寫到 `<專案根>/.slidev/comments.json`，採 write-temp-then-rename 原子寫入,
避免 agent 讀到半寫狀態。

實作注意點：

- temp 檔必須放在與 comments.json **同一目錄**（跨檔案系統的 rename 不是原子操作）。
- 壞 JSON 的復原策略：rename 成 `comments.json.bak` 後重新初始化，不 silent 覆蓋，
  保留現場供除錯。
- schema 驗證用 valibot 或 zod，欄位上限（comment 長度、elementText 200 字）定義為常數。
  另設**總留言數上限**（如 500）：`slidev --remote` 模式下此 API 暴露於區域網路，
  上限防止檔案被灌爆。
- Connect middleware 的 `server.middlewares.use('/__agent/comments', ...)` 會 strip
  路徑前綴，DELETE 的 `:id` 需自行從 `req.url` 解析。
- 併發策略分兩層。**同程序內**（同一 dev server 的多個 POST/DELETE）：
  store 內建單程序寫入 queue，所有寫入序列化、不互相覆蓋 — 成本低、必做，
  不接受純 last-write-wins。**跨程序**（agent 直接改磁碟檔 vs middleware）：
  MVP 接受 last-write-wins，但兩端都要縮小競態窗口 — middleware 每次寫入前
  重新讀檔合併、不在記憶體長期持有狀態；agent 端由 canonical 指令規定
  「每套用一筆立即更新該筆 status」而非最後整批改寫。跨程序檔案鎖延後到
  有實際毀損案例再做。store 測試須驗證並發寫入經 queue 後不遺失、不毀損。
- 留言狀態同步（Phase 2）：agent 標記 `applied` 改的是磁碟檔，不在 HMR 管轄內，
  overlay 的 pin 不會自己消失。由 middleware 以 Vite watcher 監看 comments.json，
  變更時 `server.ws.send` 推自訂事件通知 overlay 重新載入。

### 備案

若特定版本下 addon vite.config 合併失效，官方明載的替代路徑是使用者專案的
`setup/vite-plugins.ts` + `defineVitePluginsSetup` — 安裝說明多三行 code，產品照常成立。

## 4. 資料格式:comments.json

```json
{
  "version": 1,
  "comments": [
    {
      "id": "c_8f3a",
      "slideNo": 3,
      "elementText": "Why Vite is fast",
      "selectorPath": "div.slidev-layout > h1",
      "rect": { "x": 0.12, "y": 0.08, "w": 0.55, "h": 0.10 },
      "comment": "標題縮短到十個字以內",
      "createdAt": "2026-06-12T10:30:00Z",
      "updatedAt": "2026-06-12T10:30:00Z",
      "status": "open",
      "resolution": null
    }
  ]
}
```

- `slideNo` 是硬定位（agent 不會錯頁）；`elementText` 是軟定位（LLM 在單頁源碼內比對）。
- `selectorPath` 僅供未來 UI 使用（如 hover 高亮），**agent 不應依賴** —
  編譯後的 DOM path 無法映射回 markdown（見第 6 節），弱模型拿它定位反而會錯。
- `rect` 用相對比例（0–1），供未來 UI 重繪 pin 位置，與視窗尺寸解耦。
  注意基準是**投影片容器元素**而非 viewport：Slidev 以 `transform: scale()`
  縮放置中投影片，視窗有 letterbox，直接除以視窗寬高會得到錯的比例。
- `status: open | applied | skipped`，agent 處理後標記而非立即刪除，保留可追溯性；
  UI 只顯示 open。
- `createdAt` 由瀏覽器端產生；`updatedAt` 由每次寫入方（middleware 或 agent）更新。
- `resolution`（nullable 字串）：agent 標記時寫入處理說明 —
  **skipped 必填原因**（applied 可選填摘要），UI 歷史檢視與回報摘要直接引用，
  不必另外解析 agent 的對話輸出。

## 5. Agent 端：多 agent 指令層

### 5.1 單一事實來源 + 薄轉接層

工作流指令只寫一份（`packages/agent-instructions/`，純 markdown、不用任何
agent 專屬語法），再由 sync 腳本生成各家 agent 的原生格式。這是 open-slide
已驗證的模式（它以 canonical skills + 同步腳本同時支援 Claude Code、Cursor、
Codex、Gemini CLI）。

| Agent | 派發格式 | 觸發方式 |
|---|---|---|
| Claude Code | plugin（SKILL.md） | `/create-deck`、`/apply-comments` |
| Codex CLI | `AGENTS.md` 區塊 + custom prompts | 自然語言或 prompt 指令 |
| Cursor | `.cursor/rules/*.mdc` + `.cursor/commands/` | 自然語言或 command |
| Gemini CLI | `GEMINI.md` + `.gemini/commands/*.toml` | 自然語言或 command |
| GitHub Copilot | `.github/copilot-instructions.md` + prompt files | 自然語言或 prompt |

最低公分母是 **AGENTS.md**（Codex、Cursor、Gemini CLI 等多家已支援的浮現中標準）：
即使某家 agent 沒有 slash command 機制，只要它讀 AGENTS.md，使用者說一句
「套用投影片留言」它就知道完整流程。各家格式由 `npx slidev-loop init --agents
claude,codex,cursor` 一次寫入使用者專案。

各轉接檔內容刻意極薄：一段觸發描述 + 指向（或內嵌）canonical 指令全文，
不在轉接層寫任何邏輯，避免多份漂移。

### 5.2 /create-deck：research-first 生成工作流

執行者是通用 coding agent，收集資料是其原生能力（網路搜尋、讀 repo 程式碼、
讀本地文件、MCP 資料源），不需 addon 支援。canonical 指令規定四步：

1. **收集**：依題目讀取相關程式碼/文件，必要時上網查證；技術簡報以 repo 內
   真實程式碼與架構為素材。
2. **提綱**：先產出大綱與每頁一句話摘要，請使用者確認方向（最便宜的修正點）。
3. **生成**：照大綱產出 `slides.md`。slidev 語法規範引用現有成熟內容
   （antfu 官方 slidev skill / marcoshaber99/slidev-skills），不重造。
4. **交接**：提示使用者啟動 dev server 進入留言調整迴路。

### 5.3 /apply-comments：套用留言工作流

1. 讀 `.slidev/comments.json`，取所有 `status: open` 的留言，
   **依 `slideNo` 由大到小排序**後處理 — 結構變動（增刪頁）只影響其後的頁碼，
   倒序處理可避免先套用的修改讓後續留言的 `slideNo` 漂移。
2. 讀 `slides.md`。定位規則：投影片以「前後空行包圍的 `---`」分隔，第一個 YAML 區塊為
   headmatter（不算頁）；第 N 頁 = 第 N 個分隔區段。用留言的 `elementText` 在該頁
   源碼內找到對應行。
3. 逐筆套用修改。樣式類修改用 UnoCSS class 或 per-slide frontmatter 表達，
   不引入 inline style。留言若要求補充事實/數據，agent 先收集查證再寫入
   （調整階段同樣可觸發資料收集）。
4. 無法定位或語意模糊的留言：標記 `skipped`、把原因寫入 `resolution` 欄位
   並在回報中說明，不猜測。
5. （可選驗證）`npx slidev export --format png --range <slideNo>` 渲染該頁，
   目視確認後再結案。
6. **每套用一筆立即把該筆標記 `applied`**（而非最後整批改寫 —
   縮小與 middleware 寫入的競態窗口，見第 3 節併發策略），全部處理完回報摘要。

### 5.4 MCP server（roadmap，非 MVP）

CLI 型 agent 走檔案協定即可；MCP server 的價值在於覆蓋**無檔案系統存取的
client**（Claude Desktop、ChatGPT 等）並提供跨家統一的工具介面
（list_comments / get_slide / update_slide / resolve_comment / export_png）。
列為 Phase 5，等檔案協定閉環驗證後再做；屆時可基於 `@slidev/parser` 實作
結構化讀寫。

## 6. 為什麼不做逐元素 source mapping

Slidev 的 parser 提供逐頁的源碼行號對應，但 markdown 編譯成 Vue 後，DOM 元素無法
精確映射回 markdown span。我們刻意不解這個問題：留言帶「頁碼 + 元素文字」交給 LLM
在單頁範圍（通常 < 30 行）內定位，正是語言模型擅長且穩定的任務。open-slide 的
comment 工作流本質上也是同一邏輯。

## 7. 版本相容策略

- 最低 Slidev 版本以 **`engines.slidev`** 宣告（如 `"engines": { "slidev": ">=52.0.0" }`）。
  這是 Slidev 官方慣例（theme 與 addon 同一機制，見 write-theme / write-addon 文件）：
  檢查者是 Slidev CLI 本身而非 npm，版本不符時會直接對使用者顯示錯誤。
  實際下限由 Phase 0 spike 驗證時的版本決定。
- 可選補強：另加 `@slidev/cli` 到 `peerDependencies`，讓 npm 層也有版本訊號；
  但 `engines.slidev` 為主、不可省略。
- playground 對 `@slidev/cli@latest` 跑煙霧測試（dev server 起得來、middleware 回 200、
  overlay 元件掛載成功），major 升版破壞接點時 CI 先知道。
