# Apply Slidev Loop Comments

Use this workflow when the user asks to apply Slidev Loop comments, resolve slide
feedback, or process `.slidev/comments.json`.

## Data Contract

Read comments from `.slidev/comments.json`.

The browser POST payload contains only fields observable in the rendered deck:

- `slideNo`: integer, 1-based rendered slide number.
- `elementText`: string, max 200 characters, captured from the clicked element.
- `selectorPath`: string, UI-only DOM path. Do not use this to locate markdown.
- `rect`: relative `{ x, y, w, h }` ratios against the Slidev slide container.
- `comment`: user feedback text.

Stored records additionally contain server-managed fields:

- `id`: stable comment id.
- `status`: `open`, `applied`, or `skipped`.
- `createdAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.
- `resolution`: `null` for open comments; required reason when skipped; optional
  summary when applied.

Only process records with `status: "open"`. Preserve all records for audit
history; never delete handled comments.

## Slide Location

Use `slideNo` as the hard locator. Do not infer a different slide unless the
file is obviously inconsistent and you can explain why.

Split `slides.md` into slides by horizontal separators:

- The first YAML frontmatter block at the top of the file is deck metadata and
  does not count as a slide.
- A slide separator is a line containing only `---`.
- The first content block after the deck frontmatter is slide 1.
- The Nth content block is slide N.

Example:

```md
---
title: Demo
---

# Intro

---

# Details
```

`# Intro` is slide 1. `# Details` is slide 2.

Within the target slide, use `elementText` as the soft locator. Match the text
against headings, paragraphs, list items, code labels, and layout content in the
slide source. Ignore `selectorPath` for source location; DOM paths do not map
reliably back to markdown.

## Processing Order

Process open comments in descending `slideNo`. This reduces page-number drift
when a comment inserts or removes slides.

For multiple comments on the same slide:

1. Read the original source for that slide once.
2. Resolve every comment target against that original source before editing.
3. Apply compatible edits.
4. If targets overlap or instructions conflict, apply the conservative change
   and mark the other comment `skipped` with a clear `resolution`.

After each individual comment is handled, immediately update that record's
`status`, `updatedAt`, and `resolution`. Do not wait until the end to batch all
status changes.

## Editing Rules

- Keep changes scoped to `slides.md` unless the comment explicitly requires a
  supporting asset or local data file.
- Style changes should use Slidev/UnoCSS classes or per-slide frontmatter. Do
  not add inline styles.
- If a comment asks for factual data, inspect the local repo first. Browse or
  otherwise verify external facts when needed before changing the slide.
- If you cannot confidently locate the target, mark the comment `skipped`.
- If the comment is ambiguous, mark it `skipped` unless there is a clearly safe
  minimal change.
- Do not guess across slides.

## Status Updates

For `applied`:

- Set `status` to `applied`.
- Set `updatedAt` to the current ISO timestamp.
- Set `resolution` to a short summary of the change, or `null` if the change is
  self-evident.

For `skipped`:

- Set `status` to `skipped`.
- Set `updatedAt` to the current ISO timestamp.
- Set `resolution` to a specific reason. This field is required for skipped
  comments.

## Verification

At minimum, report which comments were applied or skipped and why.

When the user asks for visual verification, or when a handled comment changes
layout, color, sizing, images, dense text, or other visual presentation, perform
PNG self-verification if the local project can run Slidev export.

Export only the touched slide numbers when possible:

```bash
npx slidev export --format png --range <slideNo>
```

Then inspect the generated PNG before finalizing the affected comments. Confirm
that the requested change is visible and that the slide has no obvious
regression such as clipped text, unreadable contrast, broken layout, missing
images, or unintended overflow.

If the PNG reveals a problem, fix the slide and export again when practical. If
you cannot run export or cannot inspect images in the current agent environment,
say so in the final report and rely on source-level checks instead. Do not mark
a visually risky comment `applied` solely because `slides.md` was edited; mark
it `skipped` when you cannot make or verify a confident change. Before marking a
comment `skipped`, revert any slide edits made only for that comment so skipped
means the slide was left untouched for that feedback item.
