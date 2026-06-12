import type { IncomingMessage, ServerResponse } from 'node:http'
import { ZodError } from 'zod'
import { addComment, deleteComment, readComments, StoreValidationError } from './store'

type NextFunction = () => void

const MAX_BODY_BYTES = 64 * 1024

class BadRequestError extends Error {
  name = 'BadRequestError'
}

export function commentsMiddleware(projectRoot: string) {
  return async function handleCommentsRequest(
    req: IncomingMessage,
    res: ServerResponse,
    next?: NextFunction,
  ) {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (req.method === 'GET' && url.pathname === '/') {
        sendJson(res, 200, await readComments(projectRoot))
        return
      }

      if (req.method === 'POST' && url.pathname === '/') {
        const body = await readJsonBody(req)
        const comment = await addComment(projectRoot, body)
        sendJson(res, 201, comment)
        return
      }

      if (req.method === 'DELETE') {
        const id = decodeCommentId(url.pathname)
        if (id === null) {
          sendJson(res, 404, { error: 'Comment not found' })
          return
        }

        const deleted = await deleteComment(projectRoot, id)
        if (!deleted) {
          sendJson(res, 404, { error: 'Comment not found' })
          return
        }

        res.statusCode = 204
        res.end()
        return
      }

      if (next) {
        next()
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const statusCode = isClientError(error) ? 400 : 500
      sendJson(res, statusCode, { error: message })
    }
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > MAX_BODY_BYTES) {
      throw new BadRequestError(`Request body is too large; limit is ${MAX_BODY_BYTES} bytes`)
    }
    chunks.push(buffer)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(raw)
  } catch {
    throw new BadRequestError('Invalid JSON body')
  }
}

function decodeCommentId(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 1) {
    return null
  }
  return decodeURIComponent(parts[0])
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(`${JSON.stringify(body)}\n`)
}

function isClientError(error: unknown) {
  return error instanceof ZodError ||
    error instanceof BadRequestError ||
    error instanceof StoreValidationError
}
