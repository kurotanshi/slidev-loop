import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const port = Number(process.env.SLIDEV_LOOP_SMOKE_PORT ?? 4177)
const host = process.env.SLIDEV_LOOP_SMOKE_HOST ?? 'localhost'
const baseUrl = `http://${host}:${port}`
const commentsPath = join(process.cwd(), 'playground', '.slidev', 'comments.json')

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assertNear(actual: number, expected: number, label: string, tolerance = 4) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} expected ${expected} +/- ${tolerance}, received ${actual}`)
  }
}

function pinLocatorSelector(comment: string) {
  return `[data-testid="slidev-loop-pin"][title=${JSON.stringify(comment)}]`
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
  const deletedSmokeComment = `Smoke delete ${Date.now()}`
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

      await overlay.getByRole('button', { name: 'Comment' }).click()
      const heading = page.getByRole('heading', { name: 'Slidev Loop' })
      await heading.hover()
      await page.getByTestId('slidev-loop-hover-highlight').waitFor({ timeout: 10_000 })
      await heading.click()
      await page.getByTestId('slidev-loop-input').fill(smokeComment)
      await page.getByTestId('slidev-loop-form').getByRole('button', { name: 'Add' }).click()
      await page.getByTestId('slidev-loop-comments').getByText(smokeComment).waitFor({
        timeout: 10_000,
      })
      const smokePin = page.locator(pinLocatorSelector(smokeComment))
      await smokePin.waitFor({ timeout: 10_000 })
      const headingBox = await heading.boundingBox()
      const pinBox = await smokePin.boundingBox()
      if (!headingBox || !pinBox) {
        throw new Error('Could not read heading or pin geometry')
      }
      assertNear(pinBox.x, headingBox.x, 'pin x')
      assertNear(pinBox.y, headingBox.y, 'pin y')
      assertNear(pinBox.width, headingBox.width, 'pin width')
      assertNear(pinBox.height, headingBox.height, 'pin height')
      await heading.click()
      await markSmokeCommentApplied(smokeComment)
      await smokePin.waitFor({
        state: 'detached',
        timeout: 10_000,
      })

      await overlay.getByRole('button', { name: 'Comment' }).click()
      await heading.click()
      const input = page.getByTestId('slidev-loop-input')
      await input.fill(deletedSmokeComment)
      await page.getByText('Phase 0 integration spike').click()
      const preservedDraft = await input.inputValue()
      if (preservedDraft !== deletedSmokeComment) {
        throw new Error('Comment draft was reset by a stray slide click')
      }
      await page.getByTestId('slidev-loop-form').getByRole('button', { name: 'Add' }).click()

      const deletedRow = page.getByTestId('slidev-loop-comment-row').filter({
        hasText: deletedSmokeComment,
      })
      await deletedRow.waitFor({ timeout: 10_000 })
      await deletedRow.getByTestId('slidev-loop-delete-comment').click()
      await deletedRow.waitFor({ state: 'detached', timeout: 10_000 })
    } finally {
      await browser.close()
    }

    console.log('Smoke test passed: overlay rendered and comment API round-tripped.')
  } catch (error) {
    console.error(logs.join(''))
    throw error
  } finally {
    await cleanupSmokeComment(smokeComment).catch(() => undefined)
    await cleanupSmokeComment(deletedSmokeComment).catch(() => undefined)
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

async function markSmokeCommentApplied(smokeComment: string) {
  const raw = await readFile(commentsPath, 'utf8')
  const file = JSON.parse(raw)
  const comment = file.comments?.find(
    (candidate: { comment?: string }) => candidate.comment === smokeComment,
  )
  if (!comment) {
    throw new Error(`Smoke comment was not written to ${commentsPath}`)
  }

  comment.status = 'applied'
  comment.updatedAt = new Date().toISOString()
  await writeFile(commentsPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
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
