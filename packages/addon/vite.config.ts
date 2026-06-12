import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { commentsMiddleware } from './plugin/middleware'
import { resolveCommentsPath } from './plugin/store'

const commentsChangedEvent = 'slidev-loop:comments-changed'

export default {
  plugins: [
    {
      name: 'slidev-addon-loop',
      apply: 'serve',
      configureServer(server) {
        const commentsPath = resolveCommentsPath(server.config.root)
        const normalizedCommentsPath = resolve(commentsPath)

        mkdirSync(dirname(commentsPath), { recursive: true })
        server.watcher.add(commentsPath)
        server.watcher.on('add', notifyCommentsChanged)
        server.watcher.on('change', notifyCommentsChanged)
        server.watcher.on('unlink', notifyCommentsChanged)

        server.middlewares.use('/__agent/comments', commentsMiddleware(server.config.root))

        function notifyCommentsChanged(changedPath: string) {
          if (resolve(changedPath) !== normalizedCommentsPath) return
          server.ws.send({ type: 'custom', event: commentsChangedEvent })
        }
      },
    },
  ],
}
