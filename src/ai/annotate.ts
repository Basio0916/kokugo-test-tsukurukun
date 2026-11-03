import { z } from 'zod'
import { readLine } from '../model/kanbun.js'
import { draftWithRetry, jsonHandler } from './claude.js'
import { ANNOTATE_KANBUN_PROMPT, ANNOTATE_RUBY_PROMPT, annotateKanbunPrompt, annotateRubyPrompt } from './prompt.js'

/*
 * 本文を直して外れたものを AI に付け直してもらう。漢文は直した句の訓読、古文は直した箇所のルビ。
 * サーバー関数の数を抑えるため、一つの呼び出しで種類を分ける。
 */

export const AnnotateRequest = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('kanbun'),
    title: z.string(),
    author: z.string(),
    // すべての句の白文と、訓読を付け直す句の番号
    lines: z.array(z.string().min(1)).min(1),
    targets: z.array(z.number().int().nonnegative()).min(1),
  }),
  z.object({
    kind: z.literal('ruby'),
    // 直した後の本文（ルビの親字をつないだ文字列）と、直した箇所、外れたルビの親字
    passage: z.string().min(1),
    changes: z.array(z.object({ before: z.string(), after: z.string() })),
    lost: z.array(z.string()),
  }),
])
export type AnnotateRequest = z.infer<typeof AnnotateRequest>

const KanbunAnswer = z.object({
  lines: z.array(z.object({
    index: z.number().int().describe('句の番号（0 から）'),
    notation: z.string().min(1).describe('その句の訓読。字(送り仮名)[返り点] の記法'),
  })),
})
const RubyAnswer = z.object({
  ruby: z.array(z.object({
    base: z.string().min(1).describe('ルビを付ける漢字。本文のとおりに書き、送り仮名は含めない'),
    reading: z.string().min(1).describe('歴史的仮名遣いの読み（ひらがな）'),
  })),
})

export type AnnotateResponse =
  | { ok: true; lines?: Array<{ index: number; notation: string }>; ruby?: Array<{ base: string; reading: string }> }
  | { ok: false; errors: string[] }

const HIRAGANA = /^[ぁ-ゖー]+$/
const KANJI = /[㐀-鿿々]/

/** 漢文: 付け直す句がそろい、どの句も白文と一字も違わず返り点の対応がとれているか */
export function checkKanbunLines(lines: string[], targets: number[], answer: z.infer<typeof KanbunAnswer>): AnnotateResponse {
  const errors: string[] = []
  const got = answer.lines.map(l => l.index)
  if (got.length !== targets.length || !targets.every(t => got.includes(t))) errors.push(`付け直す句は ${targets.join('、')} 番で、それぞれ一つずつ書く（今は ${got.join('、') || 'なし'} 番）`)
  for (const l of answer.lines) {
    if (lines[l.index] === undefined) continue
    const r = readLine(l.notation, lines[l.index])
    if (!r.ok) errors.push(...r.errors)
  }
  return errors.length ? { ok: false, errors } : { ok: true, lines: answer.lines }
}

/** 古文: 親字が本文にあり漢字を含み、読みがひらがなだけか */
export function checkRuby(passage: string, answer: z.infer<typeof RubyAnswer>): AnnotateResponse {
  const errors = answer.ruby.flatMap(r => [
    ...(passage.includes(r.base) ? [] : [`ルビの親字「${r.base}」が本文にない`]),
    ...(KANJI.test(r.base) ? [] : [`ルビの親字「${r.base}」に漢字がない`]),
    ...(HIRAGANA.test(r.reading) ? [] : [`ルビ「${r.base}（${r.reading}）」の読みがひらがなだけでない`]),
  ])
  return errors.length ? { ok: false, errors } : { ok: true, ruby: answer.ruby }
}

export async function annotate(request: AnnotateRequest): Promise<AnnotateResponse> {
  if (request.kind === 'kanbun') {
    return draftWithRetry({
      label: '訓読の付け直し', schema: KanbunAnswer, system: ANNOTATE_KANBUN_PROMPT, effort: 'medium',
      prompt: annotateKanbunPrompt(request),
      convert: answer => checkKanbunLines(request.lines, request.targets, answer),
    })
  }
  return draftWithRetry({
    label: 'ルビの付け直し', schema: RubyAnswer, system: ANNOTATE_RUBY_PROMPT, effort: 'medium',
    prompt: annotateRubyPrompt(request),
    convert: answer => checkRuby(request.passage, answer),
  })
}

export const handleAnnotateRequest = jsonHandler(AnnotateRequest, annotate)
