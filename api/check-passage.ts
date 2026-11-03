import { handlePassageCheckRequest } from '../src/ai/passageCheck.js'

// 確かめるのに十数秒かかるので、Hobby の上限まで待てるようにする
export const config = { maxDuration: 300 }

export function POST(request: Request): Promise<Response> {
  return handlePassageCheckRequest(request)
}
