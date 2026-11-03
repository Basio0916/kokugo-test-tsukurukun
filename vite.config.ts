/// <reference types="vitest/config" />
import { Readable } from 'node:stream'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 手元の開発サーバーで、Vercel の関数（api/）と同じ処理を出す
const API_ROUTES: Record<string, [string, string]> = {
  '/api/draft-section': ['/src/ai/draft.ts', 'handleDraftRequest'],
  '/api/draft-kanji': ['/src/ai/kanjiDraft.ts', 'handleKanjiDraftRequest'],
  '/api/draft-grammar': ['/src/ai/grammarDraft.ts', 'handleGrammarDraftRequest'],
  '/api/draft-question': ['/src/ai/questionDraft.ts', 'handleQuestionDraftRequest'],
  '/api/chat': ['/src/ai/chat.ts', 'handleChatRequest'],
}

function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      for (const [path, [file, name]] of Object.entries(API_ROUTES)) {
        server.middlewares.use(path, async (req, res) => {
          const handler = (await server.ssrLoadModule(file))[name] as (request: Request) => Promise<Response>
          const request = new Request(`http://localhost${req.url ?? ''}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'POST' ? (Readable.toWeb(req) as ReadableStream) : undefined,
            duplex: 'half',
          } as RequestInit)
          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), devApi()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
