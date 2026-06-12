# 任務清單

## Phase 0 — 技術驗證 spikes（半天，先做，結果決定架構走向）

- [ ] **Spike A：addon 的 global-top.vue 是否被聚合。**
      建最小 addon（只有一個印出 `$nav.currentPage` 的 global-top.vue），
      playground 以相對路徑掛載，確認 overlay 出現且 context 可用。
      順便跑 `slidev build` 確認 `import.meta.env.DEV` 守門後產物行為乾淨。
      失敗 → 改用「使用者專案根目錄 re-export」備案，更新 ARCHITECTURE.md。
- [ ] **Spike B：addon 的 vite.config.ts middleware 是否生效。**
      最小 plugin 回 `{"ok":true}`，curl `/__agent/comments` 確認 200。
      失敗 → 改用 `setup/vite-plugins.ts` 備案，更新 ARCHITECTURE.md。
- [ ] 記錄驗證時的 @slidev/cli 版本，定為 `engines.slidev` 下限
      （Slidev 官方版本宣告慣例；可另加 `@slidev/cli` peerDependency 補強 npm 層訊號）。

兩個 spike 可做在同一個最小 addon 內一次驗完。

## Phase 1 — MVP 閉環（核心交付，其餘都是打磨）

依 TDD 進行：store 與 middleware 先寫 Vitest 測試再實作。

- [ ] `plugin/store.ts`：comments.json 讀寫、schema 驗證（valibot/zod）、原子寫入
      （temp 檔與目標同目錄；壞 JSON rename 成 `.bak` 後重新初始化，不 silent 覆蓋）
      - 測試：空檔初始化／新增／刪除／壞 JSON 復原／併發寫入不毀損
- [ ] `plugin/middleware.ts`：GET / POST / DELETE 處理
      （注意 Connect 會 strip 路徑前綴，DELETE 的 `:id` 需自行從 `req.url` 解析；
      用 Node 原生 req/res 型別寫，測試不需起 Vite；
      每次寫入前重新讀檔合併，不在記憶體長期持有狀態）
      - 測試:正常流程、缺欄位 400、超長內容 400、超過總留言數上限 400
- [ ] `global-top.vue` 最小版：快捷鍵切換留言模式、capture-phase 點擊攔截、
      `prompt()` 輸入留言（先不做漂亮 UI）、POST 寫入
      - 實測快捷鍵與 Slidev 內建快捷鍵不衝突（留言模式開啟時不可觸發翻頁等行為）
      - rect 以**投影片容器元素**為基準計算，不是 viewport
        （Slidev 用 transform: scale 縮放置中，直接除視窗寬高比例會錯）
- [ ] `agent-instructions/apply-comments.md`（canonical）：定位規則、UnoCSS 樣式慣例、
      skipped 處理、回報格式；先以 Claude Code SKILL.md 形式手動驗證
      - 定位規則附具體範例（`---` 分頁、headmatter 不算頁），
        避免弱模型對抽象描述數錯頁
      - 套用順序規則：依 slideNo 由大到小處理（避免增刪頁造成後續留言頁碼漂移）；
        每套用一筆立即標記該筆 status，不要最後整批改寫
- [ ] playground：3 頁測試 deck，手動跑通完整閉環
      （留言 → /apply-comments → HMR 更新 → 留言標記 applied）

**Phase 1 驗收標準：PRD 使用者故事 1–4 全數通過（以 Claude Code 驗證）。**

## Phase 2 — UI 打磨

- [ ] 留言輸入框元件取代 `prompt()`（Vue 元件、Escape 取消、Enter 送出）
- [ ] 既有留言 pin 標記渲染（依 rect 相對座標、依頁碼過濾）
- [ ] comments.json 變更推播：middleware 以 Vite watcher 監看檔案，
      `server.ws.send` 推自訂事件通知 overlay 重新載入
      （agent 標記 applied 後 pin 即時消失，不需重新整理頁面）
- [ ] 留言列表側欄：檢視全部 open 留言、單筆撤回（DELETE）
- [ ] 留言模式的視覺提示（游標樣式、hover 高亮目標元素）
- [ ] applied/skipped 留言的歷史檢視（可選）

## Phase 3 — Agent 整合層（多 agent 支援）

- [ ] `agent-instructions/create-deck.md`（canonical）：收集 → 提綱 → 生成 → 交接
      四步工作流；slidev 語法部分引用現有成熟 skills，不重造
- [ ] sync 腳本：從 canonical 指令生成各家轉接檔
      - [ ] Claude Code：plugin（plugin.json + SKILL.md + marketplace 結構）
      - [ ] Codex：AGENTS.md 區塊 + custom prompts
      - [ ] Cursor：.cursor/rules + .cursor/commands
      - [ ] Gemini CLI：GEMINI.md + .gemini/commands
      - [ ] Copilot：.github/copilot-instructions.md + prompt files
- [ ] `npx slidev-loop init --agents <list>`：把轉接檔寫入使用者專案
- [ ] 各家 agent 實測 apply-comments 閉環（至少 Claude Code、Codex、Cursor 三家），
      記錄行為差異到 troubleshooting
- [ ] `/apply-comments` 加入可選的 PNG 自我驗證步驟

## Phase 4 — 發布與相容性

- [ ] npm 發布 `slidev-addon-loop`（keywords: slidev-addon, slidev）
      與 `slidev-loop`（init CLI + canonical 指令）
- [ ] CI：Vitest + playground 對 @slidev/cli@latest 煙霧測試 +
      轉接檔與 canonical 來源一致性檢查
- [ ] README 完整化：GIF demo、各家 agent 的安裝段落、troubleshooting
      （spike 備案的啟用方式）
- [ ] 發到 Slidev discussions / awesome-slidev 曝光

## Phase 5 — MCP server（roadmap）

- [ ] 基於 `@slidev/parser` 的結構化工具：list_comments / get_slide /
      update_slide / resolve_comment / export_png
- [ ] 目標 client：Claude Desktop、ChatGPT 等無檔案系統存取環境
- [ ] 觸發條件：檔案協定閉環在 CLI agents 上驗證成功後

## 刻意不做（見 PRD 非目標）

- 畫布式所見即所得編輯器
- 逐元素 source mapping
- slidev 語法教學內容本體（引用現有 skills）
