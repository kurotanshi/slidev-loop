import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export const COMMENTS_VERSION = 1
export const MAX_ELEMENT_TEXT_LENGTH = 200
export const MAX_SELECTOR_PATH_LENGTH = 1_000
export const MAX_COMMENT_LENGTH = 2_000
export const MAX_RESOLUTION_LENGTH = 2_000
export const MAX_COMMENTS = 500

const rectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  })
  .strict()

export const commentPayloadSchema = z
  .object({
    slideNo: z.number().int().positive(),
    elementText: z.string().min(1).max(MAX_ELEMENT_TEXT_LENGTH),
    selectorPath: z.string().min(1).max(MAX_SELECTOR_PATH_LENGTH),
    rect: rectSchema,
    comment: z.string().min(1).max(MAX_COMMENT_LENGTH),
  })
  .strict()

export const storedCommentSchema = commentPayloadSchema
  .extend({
    id: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    status: z.enum(['open', 'applied', 'skipped']),
    resolution: z.string().min(1).max(MAX_RESOLUTION_LENGTH).nullable(),
  })
  .superRefine((comment, context) => {
    if (comment.status === 'skipped' && comment.resolution === null) {
      context.addIssue({
        code: 'custom',
        path: ['resolution'],
        message: 'resolution is required when status is skipped',
      })
    }
  })

export const commentsFileSchema = z
  .object({
    version: z.literal(COMMENTS_VERSION),
    comments: z.array(storedCommentSchema).max(MAX_COMMENTS),
  })
  .strict()

export type CommentPayload = z.infer<typeof commentPayloadSchema>
export type StoredComment = z.infer<typeof storedCommentSchema>
export type CommentsFile = z.infer<typeof commentsFileSchema>

type CommentPatch = {
  status?: StoredComment['status']
  resolution?: string | null
}

export class StoreValidationError extends Error {
  name = 'StoreValidationError'
}

const writeQueues = new Map<string, Promise<unknown>>()

export function resolveCommentsPath(projectRoot: string) {
  return join(projectRoot, '.slidev', 'comments.json')
}

export async function readComments(projectRoot: string): Promise<CommentsFile> {
  const commentsPath = resolveCommentsPath(projectRoot)

  try {
    const raw = await readFile(commentsPath, 'utf8')
    return commentsFileSchema.parse(JSON.parse(raw))
  } catch (error) {
    if (isMissingFileError(error)) {
      return createEmptyCommentsFile()
    }

    throw error
  }
}

export async function addComment(
  projectRoot: string,
  input: unknown,
): Promise<StoredComment> {
  const commentsPath = resolveCommentsPath(projectRoot)
  return withWriteQueue(commentsPath, async () => {
    const payload = commentPayloadSchema.parse(input)
    const file = await readCommentsForWrite(projectRoot)

    if (file.comments.length >= MAX_COMMENTS) {
      throw new StoreValidationError(
        `Cannot add comment: maximum number of comments (${MAX_COMMENTS}) reached`,
      )
    }

    const now = new Date().toISOString()
    const comment: StoredComment = {
      ...payload,
      id: createCommentId(),
      createdAt: now,
      updatedAt: now,
      status: 'open',
      resolution: null,
    }

    const nextFile = commentsFileSchema.parse({
      ...file,
      comments: [...file.comments, comment],
    })
    await writeCommentsFile(commentsPath, nextFile)
    return comment
  })
}

export async function deleteComment(projectRoot: string, id: string): Promise<boolean> {
  const commentsPath = resolveCommentsPath(projectRoot)
  return withWriteQueue(commentsPath, async () => {
    const file = await readCommentsForWrite(projectRoot)
    const nextComments = file.comments.filter((comment) => comment.id !== id)

    if (nextComments.length === file.comments.length) {
      return false
    }

    await writeCommentsFile(commentsPath, { ...file, comments: nextComments })
    return true
  })
}

export async function updateComment(
  projectRoot: string,
  id: string,
  patch: CommentPatch,
): Promise<StoredComment> {
  const commentsPath = resolveCommentsPath(projectRoot)
  return withWriteQueue(commentsPath, async () => {
    const file = await readCommentsForWrite(projectRoot)
    const index = file.comments.findIndex((comment) => comment.id === id)

    if (index === -1) {
      throw new Error(`Comment not found: ${id}`)
    }

    const updated = storedCommentSchema.parse({
      ...file.comments[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    })
    const comments = file.comments.slice()
    comments[index] = updated
    await writeCommentsFile(commentsPath, { ...file, comments })
    return updated
  })
}

function createEmptyCommentsFile(): CommentsFile {
  return { version: COMMENTS_VERSION, comments: [] }
}

async function readCommentsForWrite(projectRoot: string): Promise<CommentsFile> {
  const commentsPath = resolveCommentsPath(projectRoot)

  try {
    return await readComments(projectRoot)
  } catch {
    const backupPath = `${commentsPath}.bak`
    await mkdir(dirname(commentsPath), { recursive: true })
    await rm(backupPath, { force: true })
    await rename(commentsPath, backupPath)
    return createEmptyCommentsFile()
  }
}

async function writeCommentsFile(commentsPath: string, file: CommentsFile) {
  const data = `${JSON.stringify(commentsFileSchema.parse(file), null, 2)}\n`
  const directory = dirname(commentsPath)
  const tempPath = join(directory, `.comments.${process.pid}.${randomUUID()}.tmp`)

  await mkdir(directory, { recursive: true })
  await writeFile(tempPath, data, 'utf8')
  await rename(tempPath, commentsPath)
}

async function withWriteQueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(task)
  const tracked = next
    .catch(() => undefined)
    .finally(() => {
      if (writeQueues.get(key) === tracked) {
        writeQueues.delete(key)
      }
    })
  writeQueues.set(key, tracked)
  return next
}

function createCommentId() {
  return `c_${randomUUID().replaceAll('-', '').slice(0, 12)}`
}

function isMissingFileError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
