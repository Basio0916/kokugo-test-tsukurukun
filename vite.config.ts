/// <reference types="vitest/config" />
import { Readable } from 'node:stream'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 手元の開発サーバーで、Vercel の関数（api/）と同じ処理を /api/draft-section に出す
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      server.middlewares.use('/api/draft-section', async (req, res) => {
        const { handleDraftRequest } = await server.ssrLoadModule('/src/ai/draft.ts')
        const request = new Request(`http://localhost${req.url ?? ''}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method === 'POST' ? (Readable.toWeb(req) as ReadableStream) : undefined,
          duplex: 'half',
        } as RequestInit)
        const response: Response = await handleDraftRequest(request)
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devApi()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
