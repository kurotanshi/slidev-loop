import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const instructionNames = ['apply-comments.md', 'create-deck.md']
let failed = false

for (const name of instructionNames) {
  const canonical = await readFile(join(root, 'packages/agent-instructions', name), 'utf8')
  const bundled = await readFile(join(root, 'packages/cli/instructions', name), 'utf8')

  if (bundled !== canonical) {
    console.error(`${name} is out of sync. Run pnpm sync:instructions.`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}

console.log('instruction copies are in sync')
