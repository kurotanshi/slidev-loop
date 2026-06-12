import { spawn } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const port = Number(process.env.SLIDEV_LOOP_SMOKE_PORT ?? 4177)
const host = process.env.SLIDEV_LOOP_SMOKE_HOST ?? 'localhost'
const baseUrl = `http://${host}:${port}`

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(timeoutMs = 30_000) {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }

    await wait(500)
  }

  throw new Error(`Slidev dev server did not start at ${baseUrl}: ${String(lastError)}`)
}

async function main() {
  const smokeComment = `Smoke comment ${Date.now()}`
  const child = spawn(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['-C', 'playground', 'exec', 'slidev', 'slides.md', '--port', String(port)],
    {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    },
  )

  const logs: string[] = []
  child.stdout.on('data', (chunk) => logs.push(String(chunk)))
  child.stderr.on('data', (chunk) => logs.push(String(chunk)))

  try {
    await waitForServer()

    const apiResponse = await fetch(`${baseUrl}/__agent/comments`)
    if (!apiResponse.ok) {
      throw new Error(`/__agent/comments returned ${apiResponse.status}`)
    }

    const apiBody = await apiResponse.json()
    if (apiBody?.version !== 1 || !Array.isArray(apiBody?.comments)) {
      throw new Error(
        `/__agent/comments returned unexpected body: ${JSON.stringify(apiBody)}`,
      )
    }

    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(baseUrl, { waitUntil: 'networkidle' })
      const overlay = page.getByTestId('slidev-loop-overlay')
      await overlay.waitFor({ timeout: 10_000 })
      await overlay.getByText('Slidev Loop').waitFor({ timeout: 10_000 })

      page.once('dialog', async (dialog) => {
        await dialog.accept(smokeComment)
      })
      await overlay.getByRole('button', { name: 'Comment' }).click()
      await page.getByRole('heading', { name: 'Slidev Loop' }).click()
      await page.getByTestId('slidev-loop-comments').getByText(smokeComment).waitFor({
        timeout: 10_000,
      })
    } finally {
      await browser.close()
    }

    console.log('Smoke test passed: overlay rendered and comment API round-tripped.')
  } catch (error) {
    console.error(logs.join(''))
    throw error
  } finally {
    await cleanupSmokeComment(smokeComment).catch(() => undefined)
    stopProcessTree(child)
  }
}

async function cleanupSmokeComment(smokeComment: string) {
  const cleanupResponse = await fetch(`${baseUrl}/__agent/comments`)
  if (!cleanupResponse.ok) return
  const cleanupBody = await cleanupResponse.json()
  const createdComment = cleanupBody.comments?.find(
    (comment: { comment?: string }) => comment.comment === smokeComment,
  )
  if (createdComment?.id) {
    await fetch(`${baseUrl}/__agent/comments/${createdComment.id}`, { method: 'DELETE' })
  }
}

function stopProcessTree(child: ReturnType<typeof spawn>) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    child.kill('SIGTERM')
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
