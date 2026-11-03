import { z } from 'zod'
import type { ProseSegment, Question } from '../model/schema.js'
import { Section } from '../model/schema.js'
import { anchorMarks, plainText } from './anchor.js'
import { allocatePoints } from './points.js'
import { ProposedMark, ProposedQuestion } from './proposal.js'
import { buildQuestion, buildStem, type Converted } from './toSection.js'

/*
 * 古文の大問。AI はルビ（親字と歴史的仮名遣いの読み）と、傍線部・小問を返す。
 * 仮名遣いの問いは、傍線部ごとの項目を持つ古文用の形で受け取る（文章の大問と共通の小問の形は変えない）。
 */

export const ClassicalQuestion = ProposedQuestion.extend({
  format: z.enum(['choice', 'extract', 'description', 'short', 'kana']).describe('記号選択・本文からの抜き出し・記述・短答・仮名遣い（歴史的仮名遣いを現代仮名遣いに直す）'),
  items: z.array(z.object({
    markKey: z.string().min(1).describe('項目の傍線部のキー（marks の key）'),
    answer: z.string().min(1).describe('現代仮名遣いのひらがな'),
  })).optional().describe('仮名遣い（kana）の問いだけ。傍線部ごとの項目'),
})

export const ClassicalProposal = z.object({
  ruby: z.array(z.object({
    base: z.string().min(1).describe('ルビを付ける漢字。本文のとおりに書き、送り仮名は含めない'),
    reading: z.string().min(1).describe('歴史的仮名遣いの読み（ひらがな）'),
  })).describe('中学生が読みにくい漢字に付けるルビ'),
  marks: z.array(ProposedMark),
  questions: z.array(ClassicalQuestion).min(1),
})
export type ClassicalProposal = z.infer<typeof ClassicalProposal>

const HIRAGANA = /^[ぁ-ゖー]+$/
const KANJI = /[㐀-鿿々]/

type Inline = Extract<ProseSegment, { kind: 'text' | 'ruby' | 'break' }>

/** ルビを外して地の文に戻す（作り直すときは、前のルビを外してから付け直す） */
function stripRuby(segments: ProseSegment[]): Inline[] {
  const out: Inline[] = []
  for (const s of segments.flatMap(s => (s.kind === 'mark' ? s.children : [s]))) {
    const text = s.kind === 'ruby' ? s.base : s.kind === 'text' ? s.text : null
    const last = out.at(-1)
    if (text !== null && last?.kind === 'text') out[out.length - 1] = { kind: 'text', text: last.text + text }
    else out.push(text !== null ? { kind: 'text', text } : s)
  }
  return out
}

/** 地の文の中の親字に、すべてルビを付ける。親字が本文にない・漢字がない、読みがひらがなでないものは理由を返す */
export function addRuby(segments: ProseSegment[], ruby: ClassicalProposal['ruby']): { segments: Inline[]; errors: string[] } {
  const errors: string[] = []
  let out = stripRuby(segments)
  for (const r of ruby) {
    if (!KANJI.test(r.base)) { errors.push(`ルビの親字「${r.base}」に漢字がない`); continue }
    if (!HIRAGANA.test(r.reading)) { errors.push(`ルビ「${r.base}（${r.reading}）」の読みがひらがなだけでない`); continue }
    let found = false
    out = out.flatMap(s => {
      if (s.kind !== 'text' || !s.text.includes(r.base)) return [s]
      found = true
      return s.text.split(r.base).flatMap((part, i): Inline[] => [
        ...(i > 0 ? [{ kind: 'ruby' as const, base: r.base, reading: r.reading }] : []),
        ...(part ? [{ kind: 'text' as const, text: part }] : []),
      ])
    })
    if (!found) errors.push(`ルビの親字「${r.base}」が本文にない（ほかのルビの中にあるときも付けられない）`)
  }
  return { segments: out, errors }
}

/** 古文の AI の返答を、大問に組み立てて検証する。subtotal は大問の配点の枠 */
export function toClassicalSection(base: Section, proposal: ClassicalProposal, pointStep: number, subtotal: number): Converted {
  if (base.passage?.kind !== 'prose') return { ok: false, errors: ['この大問は本文（文章）を持たない'] }
  const label = (i: number) => `問${i + 1}`
  const ruby = addRuby(base.passage.segments, proposal.ruby)
  if (ruby.errors.length) return { ok: false, errors: ruby.errors }
  const anchored = anchorMarks(ruby.segments, proposal.marks, i => `${base.id}-m${i + 1}`)
  if (!anchored.ok) return { ok: false, errors: anchored.errors }
  const passageText = plainText(anchored.segments)
  const errors: string[] = []

  const points = allocatePoints(proposal.questions.map(q => Math.min(5, Math.max(1, q.weight))), subtotal, pointStep)
  if (!points) errors.push(`小問が多すぎて、小計${subtotal}点を${pointStep}点刻みで配れない`)

  const questions = proposal.questions.map((p, i): Question => {
    const id = `${base.id}-q${i + 1}`
    const pts = points?.[i] ?? pointStep
    if (p.format !== 'kana') {
      const built = buildQuestion({ ...p, format: p.format }, id, label(i), anchored.ids, passageText, pts)
      errors.push(...built.errors)
      return built.question
    }
    // 仮名遣いの問い: 傍線部ごとの項目の答えはひらがなだけ。答えが見えないよう、その傍線部の中にはルビを付けない
    const stem = buildStem(p.stem, label(i), anchored.ids)
    errors.push(...stem.errors)
    if (!p.items?.length) errors.push(`${label(i)}: 仮名遣いの問いに項目（items）がない`)
    const items = (p.items ?? []).map(it => {
      const markId = anchored.ids.get(it.markKey)
      if (!markId) errors.push(`${label(i)}: 項目の傍線部${it.markKey}が marks にない`)
      if (!HIRAGANA.test(it.answer)) errors.push(`${label(i)}: 仮名遣いの答え「${it.answer}」がひらがなだけでない`)
      const mark = anchored.segments.find(s => s.kind === 'mark' && s.id === markId)
      if (mark?.kind === 'mark' && mark.children.some(c => c.kind === 'ruby')) errors.push(`${label(i)}: 仮名遣いを問う傍線部${it.markKey}の中にルビを付けている`)
      return { markId: markId ?? it.markKey, answer: it.answer }
    })
    return { id, format: 'kana', stem: stem.segments, items, points: pts, kanten: p.kanten, standard: p.standard }
  })

  const parsed = Section.safeParse({ ...base, passage: { ...base.passage, segments: anchored.segments }, questions })
  if (!parsed.success) for (const issue of parsed.error.issues) errors.push(issue.message)
  if (errors.length || !parsed.success) return { ok: false, errors }
  return {
    ok: true,
    section: parsed.data,
    rationales: proposal.questions.map((p, i) => ({ questionId: questions[i].id, rationale: p.rationale, standard: p.standard })),
  }
}
