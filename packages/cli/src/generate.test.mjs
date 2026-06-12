import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initProject, parseAgents } from './generate.mjs'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const execFileAsync = promisify(execFile)

let root

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'slidev-loop-cli-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('slidev-loop init generator', () => {
  it('keeps packaged instruction copies in sync with canonical instructions', async () => {
    const instructionNames = ['apply-comments.md', 'create-deck.md']

    for (const name of instructionNames) {
      const canonical = await readFile(join(repoRoot, 'packages/agent-instructions', name), 'utf8')
      const bundled = await readFile(join(repoRoot, 'packages/cli/instructions', name), 'utf8')
      expect(bundled).toBe(canonical)
    }
  })

  it('parses and deduplicates supported agents', () => {
    expect(parseAgents('claude,codex,cursor,gemini,copilot,claude')).toEqual([
      'claude',
      'codex',
      'cursor',
      'gemini',
      'copilot',
    ])
  })

  it('rejects unsupported agents', () => {
    expect(() => parseAgents('claude,unknown')).toThrow(/unsupported agent/i)
  })

  it('reports missing CLI option values', async () => {
    const binPath = join(repoRoot, 'packages/cli/bin/slidev-loop.mjs')

    await expect(execFileAsync('node', [binPath, 'init', '--root'])).rejects.toMatchObject({
      stderr: expect.stringContaining('Missing value for --root'),
    })
    await expect(execFileAsync('node', [binPath, 'init', '--agents'])).rejects.toMatchObject({
      stderr: expect.stringContaining('Missing value for --agents'),
    })
  })

  it('rejects incomplete managed blocks instead of duplicating markers', async () => {
    await writeFile(join(root, 'AGENTS.md'), '<!-- slidev-loop:start -->\nold block\n', 'utf8')

    await expect(initProject({ projectRoot: root, agents: ['codex'] })).rejects.toThrow(
      /incomplete slidev loop managed block/i,
    )

    await writeFile(join(root, 'GEMINI.md'), '<!-- slidev-loop:end -->\nold block\n', 'utf8')
    await expect(initProject({ projectRoot: root, agents: ['gemini'] })).rejects.toThrow(
      /GEMINI.md contains an incomplete slidev loop managed block/i,
    )
  })

  it('writes Claude Code plugin skills from canonical instructions', async () => {
    const written = await initProject({ projectRoot: root, agents: ['claude'] })

    expect(written).toEqual([
      '.claude/plugins/slidev-loop/.claude-plugin/plugin.json',
      '.claude/plugins/slidev-loop/skills/slidev-loop-create-deck/SKILL.md',
      '.claude/plugins/slidev-loop/skills/slidev-loop-apply-comments/SKILL.md',
    ])

    const manifest = JSON.parse(
      await readFile(
        join(root, '.claude/plugins/slidev-loop/.claude-plugin/plugin.json'),
        'utf8',
      ),
    )
    expect(manifest.skills).toEqual([
      './skills/slidev-loop-create-deck',
      './skills/slidev-loop-apply-comments',
    ])

    const skill = await readFile(
      join(root, '.claude/plugins/slidev-loop/skills/slidev-loop-apply-comments/SKILL.md'),
      'utf8',
    )
    expect(skill).toContain('name: slidev-loop-apply-comments')
    expect(skill).toContain('Read comments from `.slidev/comments.json`.')
  })

  it('writes Codex AGENTS.md block and prompt files idempotently', async () => {
    await initProject({ projectRoot: root, agents: ['codex'] })
    await initProject({ projectRoot: root, agents: ['codex'] })

    const agents = await readFile(join(root, 'AGENTS.md'), 'utf8')
    expect(agents.match(/slidev-loop:start/g)).toHaveLength(1)
    expect(agents).toContain('.codex/prompts/slidev-loop/apply-comments.md')

    const prompt = await readFile(
      join(root, '.codex/prompts/slidev-loop/create-deck.md'),
      'utf8',
    )
    expect(prompt).toContain('Create a Slidev Deck')
    expect(prompt).toContain('research-first')
  })

  it('writes Cursor rules and command prompts', async () => {
    const written = await initProject({ projectRoot: root, agents: ['cursor'] })

    expect(written).toEqual([
      '.cursor/rules/slidev-loop.mdc',
      '.cursor/commands/slidev-loop-create-deck.md',
      '.cursor/commands/slidev-loop-apply-comments.md',
    ])

    const rule = await readFile(join(root, '.cursor/rules/slidev-loop.mdc'), 'utf8')
    expect(rule).toContain('alwaysApply: false')
    expect(rule).toContain('.cursor/commands/slidev-loop-apply-comments.md')

    const command = await readFile(
      join(root, '.cursor/commands/slidev-loop-apply-comments.md'),
      'utf8',
    )
    expect(command).toContain('Apply Slidev Loop Comments')
    expect(command).toContain('Read comments from `.slidev/comments.json`.')
  })

  it('writes Gemini managed instructions and TOML slash commands idempotently', async () => {
    await initProject({ projectRoot: root, agents: ['gemini'] })
    await initProject({ projectRoot: root, agents: ['gemini'] })

    const gemini = await readFile(join(root, 'GEMINI.md'), 'utf8')
    expect(gemini.match(/slidev-loop:start/g)).toHaveLength(1)
    expect(gemini).toContain('/slidev-loop:apply-comments')

    const command = await readFile(
      join(root, '.gemini/commands/slidev-loop/apply-comments.toml'),
      'utf8',
    )
    expect(command).toMatch(/^prompt = "/)
    expect(command).toContain('Apply Slidev Loop Comments')
  })

  it('writes Copilot instructions and prompt files idempotently', async () => {
    await initProject({ projectRoot: root, agents: ['copilot'] })
    await initProject({ projectRoot: root, agents: ['copilot'] })

    const instructions = await readFile(join(root, '.github/copilot-instructions.md'), 'utf8')
    expect(instructions.match(/slidev-loop:start/g)).toHaveLength(1)
    expect(instructions).toContain('.github/prompts/slidev-loop-apply-comments.prompt.md')

    const prompt = await readFile(
      join(root, '.github/prompts/slidev-loop-create-deck.prompt.md'),
      'utf8',
    )
    expect(prompt).toContain('Create a Slidev Deck')
    expect(prompt).toContain('research-first')
  })
})
