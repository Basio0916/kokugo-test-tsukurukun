import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { findGroup, splitStandard, standardText } from '../catalog/catalog.js'
import { Grade } from '../catalog/schema.js'
import { PointStep, Section } from '../model/schema.js'
import { plainText } from './anchor.js'
import { retryPrompt, SYSTEM_PROMPT, userPrompt } from './prompt.js'
import { SectionProposal } from './proposal.js'
import { toSection, type Rationale } from './toSection.js'

/* サーバー側で、大問の小問を Claude に作ってもらう。検証に通らなければ、理由を添えて一度だけ作り直してもらう */

export const DraftRequest = z.object({
  grade: Grade,
  material: z.string().min(1),
  pointStep: PointStep,
  // 大問の配点の枠。小問の配点はこの合計になるように割り振る
  subtotal: z.number().positive(),
  section: Section,
})
export type DraftRequest = z.infer<typeof DraftRequest>

export type DraftedRationale = Rationale & { inUnit: boolean }
export type DraftResponse =
  | { ok: true; section: Section; rationales: DraftedRationale[] }
  | { ok: false; errors: string[] }

// 使うモデルは環境変数 DRAFT_MODEL で切り替えられる
const model = () => process.env.DRAFT_MODEL ?? 'claude-opus-5-5'

async function ask(client: Anthropic, content: string) {
  // Haiku には拒否されたときのサーバー側のフォールバックがない
  const fallback = model().startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
  const response = await client.beta.messages.parse({
    model: model(),
    max_tokens: 16000,
    ...fallback,
    output_config: { effort: 'high', format: zodOutputFormat(SectionProposal) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  })
  if (response.stop_reason === 'refusal') return { errors: ['AI が作成を断りました'] }
  if (response.stop_reason === 'max_tokens') return { errors: ['AI の返答が長すぎて途中で切れました'] }
  if (!response.parsed_output) return { errors: ['AI の返答を読み取れませんでした'] }
  return { proposal: response.parsed_output, usage: response.usage }
}

export async function draftSection(request: DraftRequest, client = new Anthropic()): Promise<DraftResponse> {
  const { grade, material, pointStep, subtotal, section } = request
  const group = findGroup(grade, material)
  if (!group) return { ok: false, errors: [`単元データに「${material}」がありません`] }
  if (section.passage?.kind !== 'prose') return { ok: false, errors: ['この大問は本文（文章）を持たない'] }

  const first = userPrompt({
    grade, material, pointStep, subtotal,
    standards: group.standards.map(code => ({ code, text: standardText(grade, code) ?? '' })),
    instruction: section.instruction,
    passage: plainText(section.passage.segments),
    source: section.passage.source,
  })

  let content = first
  let errors: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now()
    const answer = await ask(client, content)
    if (!answer.proposal) return { ok: false, errors: answer.errors }
    const converted = toSection(section, answer.proposal, pointStep, subtotal)
    const { input_tokens, output_tokens } = answer.usage
    console.info(`[draft-section] ${model()} ${material} 試行${attempt + 1} ${Date.now() - started}ms 入力${input_tokens} 出力${output_tokens} ${converted.ok ? '通過' : converted.errors.join(' / ')}`)
    if (converted.ok) {
      const unit = new Set(group.standards)
      return {
        ok: true,
        section: converted.section,
        rationales: converted.rationales.map(r => ({ ...r, inUnit: splitStandard(r.standard).every(c => unit.has(c)) })),
      }
    }
    errors = converted.errors
    content = `${first}\n\n${retryPrompt(JSON.stringify(answer.proposal, null, 2), errors)}`
  }
  return { ok: false, errors }
}

/** サーバー側の関数の本体。Vercel の関数と、手元の開発サーバーの両方から使う */
export async function handleDraftRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ ok: false, errors: ['POST で送ってください'] }, { status: 405 })
  const parsed = DraftRequest.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ ok: false, errors: ['送られた大問のデータが不正です'] }, { status: 400 })
  try {
    return Response.json(await draftSection(parsed.data))
  } catch (error) {
    console.error(error)
    const detail = error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : String(error)
    const message = error instanceof Anthropic.APIError ? `AI の呼び出しに失敗しました（${error.status ?? '接続できません'}）` : `サーバーでエラーが起きました（${detail}）`
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
