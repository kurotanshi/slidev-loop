import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addComment,
  deleteComment,
  MAX_COMMENT_LENGTH,
  MAX_COMMENTS,
  MAX_ELEMENT_TEXT_LENGTH,
  readComments,
  resolveCommentsPath,
  updateComment,
} from './store'

let root: string

const payload = {
  slideNo: 2,
  elementText: 'Important title',
  selectorPath: 'div.slidev-layout > h1',
  rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
  comment: 'Make this shorter',
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'slidev-loop-store-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('comments store', () => {
  it('returns an empty file for a missing comments file without writing', async () => {
    const file = await readComments(root)

    expect(file).toEqual({ version: 1, comments: [] })
    await expect(stat(resolveCommentsPath(root))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('adds a validated comment with server-owned fields', async () => {
    const comment = await addComment(root, payload)
    const file = await readComments(root)

    expect(comment).toMatchObject({
      ...payload,
      status: 'open',
      resolution: null,
    })
    expect(comment.id).toMatch(/^c_/)
    expect(Date.parse(comment.createdAt)).not.toBeNaN()
    expect(comment.updatedAt).toBe(comment.createdAt)
    expect(file.comments).toHaveLength(1)
    expect(file.comments[0]).toEqual(comment)
  })

  it('rejects invalid payloads and extra client-owned fields', async () => {
    await expect(
      addComment(root, {
        ...payload,
        id: 'client-controlled',
      } as never),
    ).rejects.toThrow(/Unrecognized key/)

    await expect(
      addComment(root, {
        ...payload,
        elementText: 'x'.repeat(MAX_ELEMENT_TEXT_LENGTH + 1),
      }),
    ).rejects.toThrow(/elementText/)

    await expect(
      addComment(root, {
        ...payload,
        comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1),
      }),
    ).rejects.toThrow(/comment/)
  })

  it('deletes one comment by id', async () => {
    const first = await addComment(root, { ...payload, comment: 'first' })
    const second = await addComment(root, { ...payload, comment: 'second' })

    const deleted = await deleteComment(root, first.id)
    const file = await readComments(root)

    expect(deleted).toBe(true)
    expect(file.comments.map((comment) => comment.id)).toEqual([second.id])
    await expect(deleteComment(root, first.id)).resolves.toBe(false)
  })

  it('updates handled comment status and resolution', async () => {
    const comment = await addComment(root, payload)

    const skipped = await updateComment(root, comment.id, {
      status: 'skipped',
      resolution: 'Target text was not found on slide 2.',
    })

    expect(skipped.status).toBe('skipped')
    expect(skipped.resolution).toBe('Target text was not found on slide 2.')
    expect(Date.parse(skipped.updatedAt)).toBeGreaterThanOrEqual(Date.parse(comment.updatedAt))

    await expect(
      updateComment(root, comment.id, {
        status: 'skipped',
        resolution: null,
      }),
    ).rejects.toThrow(/resolution/)
  })

  it('backs up a corrupt file before reinitializing during a write', async () => {
    const commentsPath = resolveCommentsPath(root)
    await addComment(root, payload)
    await writeFile(commentsPath, '{not json', 'utf8')

    const comment = await addComment(root, { ...payload, comment: 'after repair' })
    const file = await readComments(root)
    const backup = await readFile(`${commentsPath}.bak`, 'utf8')

    expect(file.comments).toEqual([comment])
    expect(backup).toBe('{not json')
  })

  it('does not lose a concurrent write when a missing file is read', async () => {
    const [fileFromRead, comment] = await Promise.all([readComments(root), addComment(root, payload)])
    const fileAfterWrite = await readComments(root)

    expect(fileFromRead).toEqual({ version: 1, comments: [] })
    expect(fileAfterWrite.comments).toEqual([comment])
  })

  it('serializes concurrent writes without losing comments', async () => {
    const writes = Array.from({ length: 25 }, (_, index) =>
      addComment(root, {
        ...payload,
        elementText: `Title ${index}`,
        comment: `Comment ${index}`,
      }),
    )

    const comments = await Promise.all(writes)
    const file = await readComments(root)

    expect(file.comments).toHaveLength(25)
    expect(new Set(file.comments.map((comment) => comment.id)).size).toBe(25)
    expect(file.comments.map((comment) => comment.comment).sort()).toEqual(
      comments.map((comment) => comment.comment).sort(),
    )
  })

  it('enforces the total comments limit', async () => {
    const writes = Array.from({ length: MAX_COMMENTS }, (_, index) =>
      addComment(root, {
        ...payload,
        elementText: `Title ${index}`,
        comment: `Comment ${index}`,
      }),
    )
    await Promise.all(writes)

    await expect(addComment(root, payload)).rejects.toThrow(/maximum number of comments/)
  })
})
