import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initProject, parseAgents } from './generate.mjs'

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
      const canonical = await readFile(join(process.cwd(), 'packages/agent-instructions', name), 'utf8')
      const bundled = await readFile(join(process.cwd(), 'packages/cli/instructions', name), 'utf8')
      expect(bundled).toBe(canonical)
    }
  })

  it('parses and deduplicates supported agents', () => {
    expect(parseAgents('claude,codex,claude')).toEqual(['claude', 'codex'])
  })

  it('rejects unsupported agents', () => {
    expect(() => parseAgents('claude,unknown')).toThrow(/unsupported agent/i)
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
})
