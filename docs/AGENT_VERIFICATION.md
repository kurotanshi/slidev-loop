# Agent Verification Notes

## 2026-06-12 — Phase 3A Adapter Matrix

Scope: verify that generated Claude Code and Codex adapters can process the
canonical `apply-comments` workflow against the same minimal deck fixture.

Fixture:

- `slides.md` with three slides.
- One open `.slidev/comments.json` record on slide 2 targeting
  `# Original Heading` with the comment `Rename this heading to Adapter Verified`.
- Adapters generated with `slidev-loop init --agents <agent> --root <fixture>`.

Expected result for both agents:

- Rename slide 2 heading to `# Adapter Verified`.
- Preserve the comment record and mark it `status: "applied"`.
- Set `updatedAt` and a short `resolution`.
- Leave zero open comments.

Results:

| Agent | Adapter used | Result |
|---|---|---|
| Claude Code | `.claude/plugins/slidev-loop` loaded via `--plugin-dir` | Passed |
| Codex CLI | `AGENTS.md` + `.codex/prompts/slidev-loop/apply-comments.md` | Passed |

Observed behavior differences:

- Claude Code required the generated plugin directory to be loaded explicitly
  with `--plugin-dir` for the non-interactive verification run.
- Codex read `AGENTS.md` first, then followed the referenced prompt file. It
  initially used `rg --files` without hidden files, so `.codex/` and `.slidev/`
  were not listed until it read the explicit paths. The workflow still completed.
- Codex attempted a `git diff` in the temporary non-git fixture and received a
  non-fatal `not a git repository` error before finishing successfully.

Follow-up:

- README/install docs should show Claude Code users how to load or install the
  generated project plugin.
- Codex instructions may mention hidden `.slidev/` and `.codex/` paths directly,
  which already helped the run recover from hidden-file listing behavior.
