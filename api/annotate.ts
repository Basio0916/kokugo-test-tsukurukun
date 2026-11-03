import { handleAnnotateRequest } from '../src/ai/annotate.js'

// 付け直すのに十数秒かかるので、Hobby の上限まで待てるようにする
export const config = { maxDuration: 300 }

export function POST(request: Request): Promise<Response> {
  return handleAnnotateRequest(request)
}
