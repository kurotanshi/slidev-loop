#!/usr/bin/env node
import { initProject, parseAgents } from '../src/generate.mjs'

function printUsage() {
  console.log(`Usage:
  slidev-loop init --agents <claude,codex> [--root <dir>]

Examples:
  slidev-loop init --agents claude,codex
  slidev-loop init --agents claude --root ./my-slidev-deck`)
}

async function main(argv) {
  const [command, ...args] = argv

  if (!command || command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (command !== 'init') {
    throw new Error(`Unknown command: ${command}`)
  }

  let agentsValue = ''
  let root = process.cwd()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--agents') {
      agentsValue = args[index + 1] ?? ''
      index += 1
      continue
    }
    if (arg === '--root') {
      root = args[index + 1] ?? ''
      index += 1
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }

  const agents = parseAgents(agentsValue)
  const written = await initProject({ projectRoot: root, agents })

  for (const path of written) {
    console.log(`wrote ${path}`)
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
