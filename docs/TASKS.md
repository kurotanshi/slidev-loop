# 任務清單

## Phase 0 — 技術驗證 spikes（半天，先做，結果決定架構走向）

產物不是「驗過就丟」的手動測試，而是**可重跑的 smoke test** —
Slidev 升版時同一套腳本直接再跑（Phase 4 的 CI 煙霧測試沿用它）：

- [ ] 最小 addon：只含印出 `$nav.currentPage` 的 `global-top.vue` +
      回 `{"ok":true}` 的 `vite.config.ts` middleware
- [ ] `playground/slides.md`：3 頁測試 deck，以相對路徑掛載 addon
- [ ] smoke script（`scripts/smoke.ts`）：啟 dev server →
      curl `/__agent/comments` 確認 200 → Playwright 確認 overlay 文案出現。
      此時一併把 `"smoke": "tsx scripts/smoke.ts"` 掛上根 package.json、
      加入 tsx 與 playwright devDependencies（腳本存在前不掛 script，
      package.json 保持誠實）
- [ ] **Spike A：addon 的 global-top.vue 是否被聚合。**
      smoke script 的 overlay 檢查即驗證；順便跑 `slidev build`
      確認 `import.meta.env.DEV` 守門後產物行為乾淨。
      失敗 → 改用「使用者專案根目錄 re-export」備案。
- [ ] **Spike B：addon 的 vite.config.ts middleware 是否生效。**
      smoke script 的 curl 檢查即驗證。
      失敗 → 改用 `setup/vite-plugins.ts` 備案。
- [ ] 記錄驗證時的 @slidev/cli 版本

## Phase 0.5 — 架構文件修正

- [ ] 依 spike 結果更新 ARCHITECTURE.md：成功則把「待驗證」改為「已驗證（記錄版本）」；
      失敗則套用對應備案並改寫整合章節
- [ ] 定 `engines.slidev` 下限（= spike 驗證版本；Slidev 官方版本宣告慣例）；
      可另加 `@slidev/cli` peerDependency 補強 npm 層訊號

## Phase 1 — MVP 閉環（核心交付，1A → 1D 依序）

### Phase 1A — schema 定稿 + canonical 指令草案（先於任何實作）

apply-comments 工作流會反過來決定 comments schema（agent 需要哪些欄位、
怎麼回寫 skipped 原因、如何批次處理），所以先寫指令、再寫 code。

- [ ] comments schema 定稿，**兩個 schema 分開**：client POST payload
      （slideNo / elementText / selectorPath / rect / comment）與
      stored record（payload + 伺服器端生成的 id / status / createdAt /
      updatedAt / resolution，skipped 必填原因）、欄位上限常數、總留言數上限
- [ ] `agent-instructions/apply-comments.md` 草案（canonical）：定位規則、
      UnoCSS 樣式慣例、skipped 處理（原因寫入 `resolution`）、回報格式
      - 定位規則附具體範例（`---` 分頁、headmatter 不算頁），
        避免弱模型對抽象描述數錯頁
      - 套用順序規則：依 slideNo 由大到小處理（避免增刪頁造成後續留言頁碼漂移）；
        同頁多則留言先以原始源碼完成全部定位、再套用修改；
        每套用一筆立即標記該筆 status，不要最後整批改寫

### Phase 1B — store（TDD）

- [ ] `plugin/store.ts`：comments.json 讀寫、schema 驗證（valibot/zod）、原子寫入
      （temp 檔與目標同目錄；壞 JSON rename 成 `.bak` 後重新初始化，不 silent 覆蓋）、
      **單程序寫入 queue**（同一 dev server 內的並發寫入序列化，不互相覆蓋；
      跨程序鎖延後，見 ARCHITECTURE.md 併發策略）
      - 測試：空檔初始化／新增／刪除／壞 JSON 復原／
        並發寫入經 queue 序列化後不遺失、不毀損

### Phase 1C — middleware（TDD）

- [ ] `plugin/middleware.ts`：GET / POST / DELETE 處理
      （注意 Connect 會 strip 路徑前綴，DELETE 的 `:id` 需自行從 `req.url` 解析；
      用 Node 原生 req/res 型別寫，測試不需起 Vite；
      每次寫入前重新讀檔合併，不在記憶體長期持有狀態）
      - 測試:正常流程、缺欄位 400、超長內容 400、超過總留言數上限 400

### Phase 1D — 最小 overlay，跑通閉環

- [ ] `global-top.vue` 最小版：快捷鍵切換留言模式、capture-phase 點擊攔截、
      `prompt()` 輸入留言、POST 寫入。
      **UI 可以醜，資料品質不能欠債** — 第一版點擊就收齊全部欄位：
      `slideNo`、`elementText`（截斷）、`selectorPath`、`rect` 相對座標、`comment`，
      後續 pin 渲染與 agent 定位直接沿用，不再改資料模型
      - rect 以**投影片容器元素**為基準計算，不是 viewport
        （Slidev 用 transform: scale 縮放置中，直接除視窗寬高比例會錯）
      - 實測快捷鍵與 Slidev 內建快捷鍵不衝突（留言模式開啟時不可觸發翻頁等行為）
- [ ] 極簡留言顯示：載入時 GET 既有留言、依頁碼過濾渲染最簡標記
      （只顯示 `open` — 撐起 PRD 故事 2「重新整理後仍在」與
      故事 3「applied 後不再顯示」；重新整理後生效即可，
      不重整即時消失靠 Phase 2 的 ws 推播）
- [ ] apply-comments.md 以 Claude Code SKILL.md 形式手動驗證，
      在 playground 跑通完整閉環（留言 → /apply-comments → HMR 更新 → 標記 applied）

**Phase 1 驗收標準：PRD 使用者故事 1–4 全數通過（以 Claude Code 驗證）。**

### Phase 1.5 — dogfood

- [ ] 用一份真實簡報（非 playground 玩具 deck）跑完整工作流，
      記錄摩擦點與指令誤判案例，回饋到 apply-comments.md 與 schema

## Phase 2 — UI 打磨

- [ ] 留言輸入框元件取代 `prompt()`（Vue 元件、Escape 取消、Enter 送出）
- [ ] pin 標記打磨：取代 1D 的最簡標記，依 rect 相對座標精確定位、視覺樣式
- [ ] comments.json 變更推播：middleware 以 Vite watcher 監看檔案，
      `server.ws.send` 推自訂事件通知 overlay 重新載入
      （agent 標記 applied 後 pin 即時消失，不需重新整理頁面）
- [ ] 留言列表側欄：檢視全部 open 留言、單筆撤回（DELETE）
- [ ] 留言模式的視覺提示（游標樣式、hover 高亮目標元素）
- [ ] applied/skipped 留言的歷史檢視（顯示 `resolution`，可選）

## Phase 3A — Agent 整合最小矩陣（先證明 canonical → adapter 可行）

- [ ] `agent-instructions/create-deck.md`（canonical）：收集 → 提綱 → 生成 → 交接
      四步工作流；slidev 語法部分引用現有成熟 skills，不重造
- [ ] sync 腳本最小版：只生成兩家 —
      - [ ] Claude Code：plugin（plugin.json + SKILL.md + marketplace 結構）
      - [ ] Codex：AGENTS.md 區塊 + custom prompts
- [ ] `npx slidev-loop init --agents <list>` 最小版：寫入上述兩家轉接檔
- [ ] Claude Code、Codex 兩家實測 apply-comments 閉環，記錄行為差異

## Phase 3B — 擴大 agent 矩陣

- [ ] sync 腳本擴充：
      - [ ] Cursor：.cursor/rules + .cursor/commands
      - [ ] Gemini CLI：GEMINI.md + .gemini/commands
      - [ ] Copilot：.github/copilot-instructions.md + prompt files
- [ ] CI：轉接檔與 canonical 來源一致性檢查（drift check）
- [ ] 至少 Cursor 實測閉環，行為差異記錄到 troubleshooting
- [ ] `/apply-comments` 加入可選的 PNG 自我驗證步驟

## Phase 4 — 發布與相容性

- [ ] npm 發布 `slidev-addon-loop`（keywords: slidev-addon, slidev）
      與 `slidev-loop`（init CLI + canonical 指令）
- [ ] CI：Vitest + Phase 0 smoke script 對 @slidev/cli@latest 跑煙霧測試 +
      Phase 3B 的 drift check
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
