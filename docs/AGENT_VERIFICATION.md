# Agent 驗證紀錄

## 2026-06-12 — Phase 1 Playground 閉環驗收

範圍：用 playground 驗證 PRD MVP 使用者故事 1–4，以及 `apply-comments.md`
以 Claude Code `SKILL.md` 形式執行時的完整閉環。

驗證環境：

- Slidev dev server：`playground/slides.md`
- 留言來源：實際透過 overlay 建立，不手寫 payload
- Agent：本機 Claude Code CLI（`claude -p`）
- Skill 來源：臨時 Claude Code skill，內容取自 canonical
  `packages/agent-instructions/apply-comments.md`

結果：

| PRD 故事 | 驗證結果 |
|---|---|
| 故事 1：留言模式點擊標題並輸入留言 | 通過。overlay 產生 open comment，欄位包含 slideNo、elementText、selectorPath、rect、comment。 |
| 故事 2：同頁多留言、重新整理後仍在 | 通過。留言落地於 `.slidev/comments.json`，重新載入後仍可由 overlay 讀回。 |
| 故事 3：Claude Code 套用留言、HMR 更新、標記 applied | 通過。同一個 browser session 未重整即看到標題更新，pin 因 status 改為 applied 即時消失。 |
| 故事 4：不確定留言 skipped，不亂改 | 通過。既有測試留言找不到 elementText 時被標記 skipped，resolution 寫明原因。 |

補充：驗證期間造成的 playground 標題改字已還原，只保留 runtime
`.slidev/comments.json` 的本機驗證紀錄；該檔案不進 git。

## 2026-06-12 — Phase 3A Adapter 矩陣

範圍：確認生成出的 Claude Code 與 Codex adapter 都能對同一個最小 deck fixture
執行 canonical `apply-comments` 工作流。

fixture：

- `slides.md` 三頁。
- `.slidev/comments.json` 有一筆 open comment，位於第 2 頁，目標為
  `# Original Heading`，留言為 `Rename this heading to Adapter Verified`。
- adapter 由 `slidev-loop init --agents <agent> --root <fixture>` 產生。

兩家 agent 的預期結果：

- 將第 2 頁標題改為 `# Adapter Verified`。
- 保留 comment record，並標記 `status: "applied"`。
- 更新 `updatedAt` 與短 `resolution`。
- 留下 0 筆 open comments。

結果：

| Agent | 使用的 adapter | 結果 |
|---|---|---|
| Claude Code | `.claude/plugins/slidev-loop`，非互動驗證時以 `--plugin-dir` 載入 | 通過 |
| Codex CLI | `AGENTS.md` + `.codex/prompts/slidev-loop/apply-comments.md` | 通過 |

觀察到的行為差異：

- Claude Code 在非互動驗證時需要用 `--plugin-dir` 明確載入生成的 plugin 目錄。
- Codex 先讀 `AGENTS.md`，再依指示讀 prompt file。它一開始用 `rg --files`
  沒列出 hidden paths，因此 `.codex/` 和 `.slidev/` 沒出現在第一輪清單；但因
  AGENTS.md 已明確寫出路徑，後續仍成功讀到檔案並完成工作流。
- Codex 在 temporary non-git fixture 中嘗試 `git diff`，收到 non-fatal
  `not a git repository` 錯誤後仍成功收尾。

後續：

- README/install docs 需要說明 Claude Code 使用者如何載入或安裝生成的 project plugin。
- Codex 指令應繼續明確點出 hidden `.slidev/` 與 `.codex/` 路徑；本次驗證證明這能降低 hidden-file listing 行為造成的摩擦。
