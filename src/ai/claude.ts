import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { retryPrompt } from './prompt.js'
import type { Converted } from './toSection.js'

/*
 * サーバー側で Claude に大問を作ってもらう共通の流れ。
 * 返答の形を構造化出力で縛り、変換・検証に通らなければ、理由を添えて一度だけ作り直してもらう。
 */

// 使うモデルは環境変数 DRAFT_MODEL で切り替えられる
const model = () => process.env.DRAFT_MODEL ?? 'claude-opus-5-5'

async function ask<T>(client: Anthropic, schema: z.ZodType<T>, system: string, content: string) {
  // Haiku には拒否されたときのサーバー側のフォールバックがない
  const fallback = model().startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
  const response = await client.beta.messages.parse({
    model: model(),
    max_tokens: 16000,
    ...fallback,
    output_config: { effort: 'high', format: zodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content }],
  })
  if (response.stop_reason === 'refusal') return { ok: false as const, errors: ['AI が作成を断りました'] }
  if (response.stop_reason === 'max_tokens') return { ok: false as const, errors: ['AI の返答が長すぎて途中で切れました'] }
  if (!response.parsed_output) return { ok: false as const, errors: ['AI の返答を読み取れませんでした'] }
  return { ok: true as const, proposal: response.parsed_output as T, usage: response.usage }
}

type DraftJob<T> = {
  label: string
  schema: z.ZodType<T>
  system: string
  prompt: string
  convert: (proposal: T) => Converted
}

export async function draftWithRetry<T>(job: DraftJob<T>, client = new Anthropic()): Promise<Converted> {
  let content = job.prompt
  let errors: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now()
    const answer = await ask(client, job.schema, job.system, content)
    if (!answer.ok) return { ok: false, errors: answer.errors }
    const converted = job.convert(answer.proposal)
    const { input_tokens, output_tokens } = answer.usage
    console.info(`[draft] ${model()} ${job.label} 試行${attempt + 1} ${Date.now() - started}ms 入力${input_tokens} 出力${output_tokens} ${converted.ok ? '通過' : converted.errors.join(' / ')}`)
    if (converted.ok) return converted
    errors = converted.errors
    content = `${job.prompt}\n\n${retryPrompt(JSON.stringify(answer.proposal, null, 2), errors)}`
  }
  return { ok: false, errors }
}

/** サーバー側の関数の本体の形。要求を検証し、例外は画面に出せる理由にする（Vercel の関数と手元の開発サーバーの両方から使う） */
export function jsonHandler<R>(schema: z.ZodType<R>, run: (request: R) => Promise<unknown>) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return Response.json({ ok: false, errors: ['POST で送ってください'] }, { status: 405 })
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ ok: false, errors: ['送られた大問のデータが不正です'] }, { status: 400 })
    try {
      return Response.json(await run(parsed.data))
    } catch (error) {
      console.error(error)
      const detail = error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : String(error)
      const message = error instanceof Anthropic.APIError ? `AI の呼び出しに失敗しました（${error.status ?? '接続できません'}）` : `サーバーでエラーが起きました（${detail}）`
      return Response.json({ ok: false, errors: [message] }, { status: 502 })
    }
  }
}
