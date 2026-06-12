import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const supportedAgents = new Set(['claude', 'codex'])
const managedStart = '<!-- slidev-loop:start -->'
const managedEnd = '<!-- slidev-loop:end -->'

const repoInstructionDirectory = fileURLToPath(
  new URL('../../agent-instructions/', import.meta.url),
)
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const bundledInstructionDirectory = fileURLToPath(new URL('../instructions/', import.meta.url))

export function parseAgents(value) {
  if (!value.trim()) {
    throw new Error('Missing --agents value')
  }

  const agents = value
    .split(',')
    .map((agent) => agent.trim().toLowerCase())
    .filter(Boolean)

  for (const agent of agents) {
    if (!supportedAgents.has(agent)) {
      throw new Error(`Unsupported agent "${agent}". Supported agents: claude, codex`)
    }
  }

  return [...new Set(agents)]
}

export async function initProject({ projectRoot, agents }) {
  const instructions = await readCanonicalInstructions()
  const writes = []

  for (const agent of agents) {
    if (agent === 'claude') {
      writes.push(...renderClaudeFiles(instructions))
    }
    if (agent === 'codex') {
      writes.push(...(await renderCodexFiles(projectRoot, instructions)))
    }
  }

  const written = []
  for (const file of writes) {
    const absolutePath = join(projectRoot, file.path)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, file.content, 'utf8')
    written.push(file.path)
  }

  return written
}

export async function readCanonicalInstructions() {
  const applyComments = await readInstruction('apply-comments.md')
  const createDeck = await readInstruction('create-deck.md')

  return { applyComments, createDeck }
}

async function readInstruction(filename) {
  if (await isWorkspaceSourceCheckout()) {
    return await readFile(join(repoInstructionDirectory, filename), 'utf8')
  }

  return readFile(join(bundledInstructionDirectory, filename), 'utf8')
}

async function isWorkspaceSourceCheckout() {
  try {
    await access(join(repoRoot, 'pnpm-workspace.yaml'))
    await access(join(repoRoot, 'packages/agent-instructions'))
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
    if (packageJson.name !== 'slidev-loop-monorepo') return false
    return true
  } catch {
    return false
  }
}

function renderClaudeFiles(instructions) {
  return [
    {
      path: '.claude/plugins/slidev-loop/.claude-plugin/plugin.json',
      content: `${JSON.stringify(
        {
          name: 'slidev-loop',
          version: '0.0.0',
          description: 'Slidev Loop workflows for creating decks and applying slide comments.',
          author: {
            name: 'Slidev Loop',
          },
          skills: [
            './skills/slidev-loop-create-deck',
            './skills/slidev-loop-apply-comments',
          ],
        },
        null,
        2,
      )}\n`,
    },
    {
      path: '.claude/plugins/slidev-loop/skills/slidev-loop-create-deck/SKILL.md',
      content: renderSkill({
        name: 'slidev-loop-create-deck',
        description: 'Create a Slidev deck through a research-first outline and generation workflow.',
        body: instructions.createDeck,
      }),
    },
    {
      path: '.claude/plugins/slidev-loop/skills/slidev-loop-apply-comments/SKILL.md',
      content: renderSkill({
        name: 'slidev-loop-apply-comments',
        description: 'Apply Slidev Loop comments from .slidev/comments.json to slides.md.',
        body: instructions.applyComments,
      }),
    },
  ]
}

async function renderCodexFiles(projectRoot, instructions) {
  const agentsPath = join(projectRoot, 'AGENTS.md')
  const existingAgents = await readOptionalFile(agentsPath)
  const agentsBlock = renderCodexAgentsBlock()

  return [
    {
      path: 'AGENTS.md',
      content: replaceManagedBlock(existingAgents, agentsBlock),
    },
    {
      path: '.codex/prompts/slidev-loop/create-deck.md',
      content: instructions.createDeck,
    },
    {
      path: '.codex/prompts/slidev-loop/apply-comments.md',
      content: instructions.applyComments,
    },
  ]
}

function renderSkill({ name, description, body }) {
  const bodyWithoutTitle = body.replace(/^# .*\n+/, '')
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${bodyWithoutTitle}`
}

function renderCodexAgentsBlock() {
  return `${managedStart}
## Slidev Loop

Use these workflows when the user asks to create a Slidev deck or apply rendered
slide feedback:

- Create a deck: read \`.codex/prompts/slidev-loop/create-deck.md\`.
- Apply comments: read \`.codex/prompts/slidev-loop/apply-comments.md\`.

Slidev Loop comments are stored in \`.slidev/comments.json\`. Preserve handled
records for audit history; mark them \`applied\` or \`skipped\` instead of
deleting them.
${managedEnd}`
}

function replaceManagedBlock(existing, block) {
  if (!existing.trim()) return `${block}\n`

  const start = existing.indexOf(managedStart)
  const end = existing.indexOf(managedEnd)
  if ((start === -1) !== (end === -1)) {
    throw new Error('AGENTS.md contains an incomplete Slidev Loop managed block')
  }
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start).trimEnd()
    const after = existing.slice(end + managedEnd.length).trimStart()
    return [before, block, after].filter(Boolean).join('\n\n') + '\n'
  }

  return `${existing.trimEnd()}\n\n${block}\n`
}

async function readOptionalFile(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return ''
    throw error
  }
}
