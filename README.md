# Slidev Loop

讓 Slidev 擁有 open-slide 式的回饋迴路：用自然語言**收集資料、生成簡報**，
再於瀏覽器中對投影片元素留言，由 AI agent 讀取留言、修改 `slides.md`，
透過 HMR 即時看到結果。支援 Claude Code、Codex、Cursor、Gemini CLI 等主流 coding agent。

## 三段工作流

1. **收集**：agent 讀 repo 程式碼、本地文件、網路查證（通用 agent 原生能力）
2. **生成**：提綱確認後產出 `slides.md`
3. **調整**：瀏覽器留言 → agent 套用 → HMR 即時呈現（本專案新造的核心迴路）

```
瀏覽器（dev mode）                     磁碟                        Agent（任一家）
┌──────────────────┐    POST     ┌──────────────────┐   讀取    ┌──────────────────┐
│ 留言 overlay      │ ──────────► │ .slidev/         │ ────────► │ apply-comments   │
│ (global-top.vue) │             │ comments.json    │           │ 工作流            │
└──────────────────┘             └──────────────────┘           └────────┬─────────┘
        ▲                                                                │ 編輯
        │              Vite HMR                                          ▼
        └─────────────────────────────────────────────────────── slides.md
```

留言機制是**檔案協定**：comments.json 與 slides.md 都是磁碟上的純文字，
任何能讀寫檔案的 coding agent 都能參與，不綁定任何一家。

## 專案結構

```
packages/addon/               # slidev-addon-loop（npm 套件）
                              #   - global-top.vue：留言 overlay UI
                              #   - vite.config.ts：dev server middleware（留言讀寫 API）
packages/agent-instructions/  # 單一事實來源：工作流指令（純 markdown）
packages/agent-adapters/      # 各家 agent 轉接層（Claude Code plugin、AGENTS.md、
                              #   .cursor/、.gemini/ 等，由 sync 腳本生成）
playground/                   # 本地測試用 Slidev deck
docs/                         # 規劃文件
```

## 與 Slidev 的整合方式（摘要）

詳見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

1. **以標準 addon 形式發布**：套件名 `slidev-addon-loop`，package.json 帶
   `"slidev-addon"` 與 `"slidev"` keywords。使用者在 `slides.md` headmatter 啟用：

   ```yaml
   ---
   addons:
     - loop
   ---
   ```

2. **瀏覽器端**：addon 提供 `global-top.vue`，Slidev 會把它疊在所有投影片之上且跨頁持久。
   透過 `$nav.currentPage` 取得頁碼，以 `import.meta.env.DEV` 限制只在開發模式出現。

3. **伺服器端**：addon 自帶 `vite.config.ts`，Slidev 官方文件明載會與使用者專案、theme
   的設定合併。我們在其中註冊一個自訂 Vite plugin，用 `configureServer` 掛 middleware，
   提供 `/__agent/comments` 的讀寫 API，把留言落地到專案的 `.slidev/comments.json`。

4. **Agent 端**：工作流指令以單一事實來源維護，sync 腳本生成各家格式
   （Claude Code plugin、AGENTS.md、.cursor/rules、GEMINI.md、copilot-instructions），
   `npx slidev-loop init --agents <list>` 一次寫入專案。agent 利用每筆留言的
   「頁碼 + 元素文字」在 `slides.md` 中定位（`---` 分頁，逐頁對應），套用修改後
   標記留言；可選用 `slidev export --format png --range N` 自我驗證渲染結果。

## 規劃文件

- [docs/PRD.md](docs/PRD.md) — 產品需求：問題、目標、MVP 範圍、風險
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 架構與 Slidev 整合機制詳解
- [docs/TASKS.md](docs/TASKS.md) — 分階段任務清單（含 Phase 0 技術驗證 spikes）

## 狀態

規劃階段。實作前須先完成 docs/TASKS.md 的 Phase 0 spikes（兩項整合假設驗證）。
