import { commentsMiddleware } from './plugin/middleware'

export default {
  plugins: [
    {
      name: 'slidev-addon-loop',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/__agent/comments', commentsMiddleware(server.config.root))
      },
    },
  ],
}
