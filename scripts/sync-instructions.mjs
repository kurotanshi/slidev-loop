import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const instructionNames = ['apply-comments.md', 'create-deck.md']

for (const name of instructionNames) {
  const source = join(root, 'packages/agent-instructions', name)
  const target = join(root, 'packages/cli/instructions', name)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
  console.log(`synced ${name}`)
}
