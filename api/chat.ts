import { handleChatRequest } from '../src/ai/chat.js'

// 会話の返答は十数秒〜数十秒かかるので、Hobby の上限まで待てるようにする
export const config = { maxDuration: 300 }

export function POST(request: Request): Promise<Response> {
  return handleChatRequest(request)
}
