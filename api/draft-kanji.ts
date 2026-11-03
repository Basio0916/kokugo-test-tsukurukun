import { handleKanjiDraftRequest } from '../src/ai/kanjiDraft.js'

// 生成に数十秒かかるので、Hobby の上限まで待てるようにする
export const config = { maxDuration: 300 }

export function POST(request: Request): Promise<Response> {
  return handleKanjiDraftRequest(request)
}
