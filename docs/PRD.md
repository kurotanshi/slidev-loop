# PRD — Slidev Loop

## 問題

Slidev 生態已有成熟的「agent 生成投影片」方案（官方 slidev skill、社群 MCP servers），
但缺少 open-slide 式的**視覺回饋迴路**：使用者看著渲染後的投影片，直接對某個元素留言
（「這個標題太長」「換成深色背景」），由 agent 套用修改。目前的迭代方式只能在編輯器裡
描述「第幾頁的哪段文字」，溝通成本高、定位不精準。

## 目標

產品名 **Slidev Loop**：在 Slidev 上提供「收集 → 生成 → 調整」的完整 agent 工作流。

1. 在 Slidev dev mode 中提供留言 overlay：點擊任意元素即可留言。
2. 留言以結構化格式落地到專案目錄，包含足夠的定位資訊（頁碼、元素文字、DOM 路徑）。
3. 提供 `/apply-comments` 工作流：讀留言 → 修改 `slides.md` → 標記留言
   （`applied` / `skipped`），形成「留言 → agent 修改 → HMR 即時呈現」的閉環。
4. 提供 research-first 的 `/create-deck` 工作流：agent 先收集資料（讀 repo 程式碼、
   本地文件、網路查證），提綱確認後才生成 `slides.md`。
5. **多 agent 相容**：工作流指令以單一事實來源維護，透過薄轉接層派發給
   Claude Code、Codex、Cursor、Gemini CLI、Copilot 等主流 coding agent；
   留言機制本身是檔案協定，不綁定任何一家。
6. 以標準 Slidev addon 形式發布，安裝成本為 headmatter 一行 + npm install +
   `npx slidev-loop init`。

## 非目標

- **不做**所見即所得的畫布編輯器（拖拉改字型/顏色）。Slidev 的版面由 Markdown +
  layout + UnoCSS 決定，沒有絕對定位畫布模型；樣式調整交給 agent 透過 UnoCSS class 完成。
- **不重造** slidev 語法教學內容。`/create-deck` 的語法規範引用現有成熟方案
  （antfu 官方 slidev skill / marcoshaber99/slidev-skills），本專案只新增
  收集與提綱的工作流框架。
- **MVP 不做** MCP server。CLI 型 agent（Claude Code、Codex、Cursor、Gemini CLI）
  都能直接讀寫檔案，檔案協定已覆蓋；MCP 列為 Phase 5 roadmap，目的是覆蓋
  Claude Desktop、ChatGPT 等無檔案系統存取的 client。
- **不做**逐元素的 markdown source mapping。逐頁定位 + 元素文字內容已足夠讓
  LLM 在單頁源碼內準確定位。

## 使用者輪廓

- 已在用 Slidev 的開發者，想用 Claude Code / Cursor 迭代投影片。
- 用 agent 生成了第一版 deck、需要快速視覺化修改回饋的使用者。

## 使用者故事

### MVP（Phase 1 驗收範圍）

1. 我在 dev mode 按快捷鍵進入留言模式，點擊投影片上的標題，輸入「縮短成十個字以內」。
2. 我對同一頁再留兩則留言，留言被記錄且重新整理頁面後仍在。
3. 我在 Claude Code 執行 `/apply-comments`，agent 逐筆套用修改、回報每筆的處理結果，
   瀏覽器透過 HMR 即時更新，留言被標記為 `applied`、UI 不再顯示（保留於檔案中可追溯）。
4. agent 對不確定的留言（語意模糊、找不到對應元素）會回報並跳過，不會亂改。

### MVP 之後（Phase 3A）

5. 我請 agent「做一份介紹本 repo auth 模組的簡報」，它先讀程式碼、給我大綱確認，
   才生成 slides.md（research-first）。
6. 我用的是 Codex（或 Cursor / Gemini CLI）而非 Claude Code，跑過
   `npx slidev-loop init --agents codex` 後，對 agent 說「套用投影片留言」
   能得到與 Claude Code 相同的工作流行為。

## 成功指標

- 從留言到看到修改結果 < 1 分鐘（單則留言）。
- agent 定位錯頁率 ≈ 0（頁碼是硬資訊）；單頁內定位錯誤率 < 5%。
- 安裝步驟 ≤ 3 步（npm install、headmatter 一行、安裝 Claude Code plugin）。

## 風險

| 風險 | 影響 | 對策 |
|---|---|---|
| addon 提供的 `global-top.vue` 不被 Slidev 聚合（官方文件只明確寫了專案根目錄） | 高 — overlay 無法以 addon 形式注入 | Phase 0 spike 驗證；備案：要求使用者在專案根目錄放一行 re-export 的 `global-top.vue` |
| addon 的 `vite.config.ts` 合併行為在新版變動 | 高 — middleware 掛不上 | Phase 0 spike 驗證；備案：使用者專案 `setup/vite-plugins.ts` 以 `defineVitePluginsSetup` 註冊（官方文件明載支援） |
| Slidev major version 升版頻繁（目前 v52.x） | 中 — API 漂移 | `engines.slidev` 設寬鬆範圍，CI 對最新版跑 playground 煙霧測試 |
| 點擊攔截與投影片本身的互動元件衝突 | 中 | 留言模式為顯式開關（快捷鍵），開啟時以 capture-phase listener + overlay 攔截，關閉時零干擾 |
| 各家 agent 的指令格式各自演進，轉接層漂移 | 中 | 指令內容只存在於單一事實來源，轉接檔由 sync 腳本生成、不手寫邏輯；CI 驗證生成物與來源一致 |
| 各家 agent 能力參差（弱模型亂改 slides.md） | 中 | canonical 指令明確規定「不確定就 skipped、不猜測」；comments.json 的 status 機制讓所有修改可追溯；建議使用者用 git 管理 deck |
