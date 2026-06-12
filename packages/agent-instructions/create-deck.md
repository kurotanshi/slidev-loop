# Create a Slidev Deck

Use this workflow when the user asks to create a new Slidev deck, draft a
presentation, or turn local project knowledge into slides.

## Outcome

Create or update `slides.md` for a Slidev presentation. Work research-first:
collect context, propose an outline, wait for user confirmation, then generate
the deck.

## Research Rules

- Read local repository files and docs before drafting technical content.
- If the requested topic depends on current external facts, verify them with an
  appropriate source before writing slides.
- Prefer concrete details from the user's project over generic explanation.
- Do not invent product claims, metrics, dates, APIs, or architecture details.
  If a fact cannot be verified, omit it or mark it as an assumption in the
  outline.

## Workflow

### 1. Collect

Identify the deck goal, audience, tone, and target length. If the user did not
specify these, make conservative assumptions and state them briefly.

Inspect relevant local files. For a repository-focused deck, prioritize:

- `README.md`
- `docs/`
- package manifests and config files
- source directories that match the requested topic
- existing `slides.md`, if present

### 2. Outline

Before editing `slides.md`, present a concise outline:

- deck title
- target audience
- slide list with one sentence per slide
- any assumptions or missing facts

Ask for confirmation unless the user explicitly requested autonomous execution.
If the user asked not to wait, proceed after writing the outline.

### 3. Generate

Create a valid Slidev `slides.md`:

- Start with YAML frontmatter.
- Separate slides with a line containing only `---`.
- Use Slidev markdown conventions and UnoCSS utility classes.
- Keep slide text concise; prefer one core idea per slide.
- Use speaker notes only when they materially help the presenter.
- Do not add inline styles. Use classes, layouts, or frontmatter.
- Do not use advanced Slidev features unless they improve the deck and are easy
  to maintain.

If an existing `slides.md` is present, preserve user-authored content unless the
request clearly asks for a rewrite.

### 4. Hand Off

After generating the deck:

- Summarize what was created or changed.
- Tell the user how to run the deck, usually `pnpm dev`, `npm run dev`, or
  `npx slidev slides.md` depending on the project.
- Invite the user to open the Slidev dev server and use Slidev Loop comments for
  visual feedback.

## Slidev Syntax Source

Do not recreate a full Slidev tutorial in this workflow. Use the project's
existing Slidev setup and established Slidev conventions. When deeper syntax is
needed, rely on mature Slidev references or installed Slidev skills rather than
inventing new conventions.
