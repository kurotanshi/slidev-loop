# Slidev Loop

讓 Slidev 擁有 open-slide 式的回饋迴路：用自然語言**收集資料、生成簡報**，
再於瀏覽器中對投影片元素留言，由 AI agent 讀取留言、修改 `slides.md`，
透過 HMR 即時看到結果。

目前已支援並實測 **Claude Code** 與 **Codex**；Cursor、Gemini CLI、Copilot
在 roadmap 上（Phase 3B）。留言機制本身是檔案協定，不綁定任何一家 agent。

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
任何能讀寫檔案的 coding agent 都能參與，不綁定任何一家。agent 改動
comments.json 時，dev server 會透過 Vite ws 推播通知 overlay — 已處理的留言
pin 即時消失，不需重新整理頁面。

## 快速開始

> 尚未發布到 npm（發布為 Phase 4），目前以本 repo 的 playground 試用。

```bash
pnpm install
pnpm dev          # 啟動 playground deck（預設 http://localhost:3030）
```

1. 在瀏覽器中按 `c`（或右上角 **Comment** 鈕）進入留言模式，
   hover 會高亮可留言的元素。
2. 點擊投影片上的任意元素，輸入留言（Enter 送出、Esc 取消）。
   留言落地到 `playground/.slidev/comments.json`，重新整理後仍在。
3. 生成 agent 轉接檔（發布後等價於 `npx slidev-loop init`）：

   ```bash
   node packages/cli/bin/slidev-loop.mjs init --agents claude,codex --root playground
   ```

4. 請 agent 套用留言：
   - **Claude Code**：載入生成的 plugin（`--plugin-dir .claude/plugins/slidev-loop`，
     正式安裝流程於 Phase 4 定案）後執行 `slidev-loop-apply-comments` skill。
   - **Codex**：直接說「套用投影片留言」，它會循 `AGENTS.md` 找到工作流。

   agent 修改 `slides.md` 後 HMR 即時更新畫面，留言被標記 `applied`、pin 即時消失；
   無法定位或語意模糊的留言會標記 `skipped` 並在 `resolution` 寫明原因，不會亂改。

開發驗證：

```bash
pnpm test     # 單元測試（store / middleware / CLI 生成器）
pnpm smoke    # dev server + 留言 API + Playwright overlay 整合檢查
```

## 專案結構

```
packages/addon/               # slidev-addon-loop（Slidev addon 本體）
                              #   - global-top.vue：留言 overlay（留言模式、pin、側欄、即時更新）
                              #   - vite.config.ts + plugin/：dev server middleware
                              #     （/__agent/comments API、原子寫入、schema 驗證、變更推播）
packages/agent-instructions/  # 單一事實來源：工作流指令（純 markdown、agent 無關）
packages/cli/                 # slidev-loop init CLI：把 canonical 指令轉成各家
                              #   agent 格式寫入使用者專案；instructions/ 是發布用副本，
                              #   由 pnpm sync:instructions 同步、測試擋漂移
playground/                   # 本地測試 deck（workspace dependency 掛載 addon）
scripts/                      # smoke.ts（整合煙霧測試）、sync-instructions.mjs
docs/                         # 規劃文件與驗證紀錄
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

2. **瀏覽器端**：addon 提供 `global-top.vue`，Slidev 會把它疊在所有投影片之上且跨頁持久
   （已於 @slidev/cli 52.16.0 實測）。透過 `$nav.currentPage` 取得頁碼，
   以 `import.meta.env.DEV` 限制只在開發模式出現。

3. **伺服器端**：addon 自帶 `vite.config.ts`，會與使用者專案、theme 的設定合併
   （官方文件明載，已於 52.16.0 實測）。我們在其中註冊一個自訂 Vite plugin，
   用 `configureServer` 掛 middleware，提供 `/__agent/comments` 的讀寫 API，
   把留言落地到專案的 `.slidev/comments.json`，並監看該檔案、變更時推播給 overlay。

4. **Agent 端**：工作流指令以單一事實來源維護，由 `slidev-loop init --agents <list>`
   轉成各家 agent 原生格式寫入專案 — 目前支援 Claude Code（plugin + SKILL.md）與
   Codex（AGENTS.md 管理區塊 + prompt 檔），Cursor / Gemini CLI / Copilot 規劃於
   Phase 3B。agent 利用每筆留言的「頁碼 + 元素文字」在 `slides.md` 中定位
   （`---` 分頁，逐頁對應），套用修改後標記留言；可選用
   `slidev export --format png --range N` 自我驗證渲染結果。

## 規劃文件

- [docs/PRD.md](docs/PRD.md) — 產品需求：問題、目標、MVP 範圍、風險
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 架構與 Slidev 整合機制詳解
- [docs/TASKS.md](docs/TASKS.md) — 分階段任務清單與進度
- [docs/AGENT_VERIFICATION.md](docs/AGENT_VERIFICATION.md) — 驗收與 agent 實測紀錄

## 狀態

- **Phase 0–1（技術驗證 + MVP 閉環）：完成**，PRD 使用者故事 1–4 驗收通過
  （見 [驗證紀錄](docs/AGENT_VERIFICATION.md)）
- **Phase 2（UI 打磨）：完成** — 輸入框元件、pin 標記、側欄、變更即時推播
  （歷史檢視為可選待辦）
- **Phase 3A（agent 整合最小矩陣）：完成** — Claude Code 與 Codex adapter
  實測通過
- **進行中**：Phase 3B（Cursor / Gemini CLI / Copilot 轉接層 + CI drift check）、
  Phase 4（npm 發布）
