import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commentsMiddleware } from './middleware'
import { addComment, MAX_COMMENT_LENGTH, MAX_COMMENTS, readComments, resolveCommentsPath } from './store'

let root: string
let server: Server
let baseUrl: string

const payload = {
  slideNo: 1,
  elementText: 'Title',
  selectorPath: 'div.slidev-layout > h1',
  rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
  comment: 'Shorten this',
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'slidev-loop-middleware-'))
  server = createServer((req, res) => {
    commentsMiddleware(root)(req, res, () => {
      res.statusCode = 404
      res.end('not found')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve))
  const address = server.address()
  if (typeof address === 'string' || address === null) {
    throw new Error('Expected TCP server address')
  }
  baseUrl = `http://localhost:${address.port}`
})

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await rm(root, { recursive: true, force: true })
})

describe('comments middleware', () => {
  it('returns all comments', async () => {
    const comment = await addComment(root, payload)

    const response = await fetch(`${baseUrl}/`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.comments).toEqual([comment])
  })

  it('creates a comment from a valid POST payload', async () => {
    const response = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json()
    const file = await readComments(root)

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ ...payload, status: 'open', resolution: null })
    expect(file.comments).toHaveLength(1)
    expect(file.comments[0]).toEqual(body)
  })

  it('deletes a comment by id', async () => {
    const comment = await addComment(root, payload)

    const response = await fetch(`${baseUrl}/${comment.id}`, { method: 'DELETE' })
    const file = await readComments(root)

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(file.comments).toEqual([])
  })

  it('returns 404 when deleting an unknown comment', async () => {
    const response = await fetch(`${baseUrl}/missing`, { method: 'DELETE' })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toMatch(/not found/i)
  })

  it('returns 400 for malformed JSON', async () => {
    const response = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/invalid json/i)
  })

  it('returns 400 for missing fields and overlong comments', async () => {
    const missingField = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, comment: undefined }),
    })

    const overlong = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }),
    })

    expect(missingField.status).toBe(400)
    expect((await missingField.json()).error).toMatch(/comment/)
    expect(overlong.status).toBe(400)
    expect((await overlong.json()).error).toMatch(/comment/)
  })

  it('returns 400 when the total comments limit is reached', async () => {
    const writes = Array.from({ length: MAX_COMMENTS }, (_, index) =>
      addComment(root, {
        ...payload,
        elementText: `Title ${index}`,
        comment: `Comment ${index}`,
      }),
    )
    await Promise.all(writes)

    const response = await fetch(`${baseUrl}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/maximum number of comments/)
  })

  it('returns 500 for corrupt server-side comments state', async () => {
    const commentsPath = resolveCommentsPath(root)
    await mkdir(dirname(commentsPath), { recursive: true })
    await writeFile(commentsPath, '{not json', 'utf8')

    const response = await fetch(`${baseUrl}/`)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBeTruthy()
  })

  it('passes unsupported routes to next', async () => {
    const response = await fetch(`${baseUrl}/`, { method: 'PATCH' })

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('not found')
  })
})
