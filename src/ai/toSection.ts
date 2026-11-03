import { stem } from '../model/notation.js'
import { Section, type Question, type StemSegment } from '../model/schema.js'
import { anchorMarks, plainText } from './anchor.js'
import { allocatePoints } from './points.js'
import type { SectionProposal } from './proposal.js'

/*
 * AI の返答を、テストのデータの大問に組み立てて検証する。
 * 通らなかった理由は、AI にそのまま返して作り直してもらえる日本語で返す。
 */

export type Rationale = { questionId: string; rationale: string; standard: string }

export type Converted =
  | { ok: true; section: Section; rationales: Rationale[] }
  | { ok: false; errors: string[] }

// 問い文に番号・記号を文字で書いた印（記法を使っていない）
const WRITTEN_NUMBER = /[①-⑳]|[ア-オ][〜～-][イ-カ]|傍線部[0-9０-９一二三四五六七八九]/

/** subtotal は大問の配点の枠。小問の配点は、この合計になるように割り振る */
export function toSection(base: Section, proposal: SectionProposal, pointStep: number, subtotal: number): Converted {
  if (base.passage?.kind !== 'prose') return { ok: false, errors: ['この大問は本文（文章）を持たない'] }
  const errors: string[] = []
  const label = (i: number) => `問${i + 1}`

  const anchored = anchorMarks(base.passage.segments, proposal.marks, i => `${base.id}-m${i + 1}`)
  if (!anchored.ok) return { ok: false, errors: anchored.errors }
  const passageText = plainText(anchored.segments)

  const points = allocatePoints(proposal.questions.map(q => Math.min(5, Math.max(1, q.weight))), subtotal, pointStep)
  if (!points) errors.push(`小問が多すぎて、小計${subtotal}点を${pointStep}点刻みで配れない`)

  const questions = proposal.questions.map((p, i): Question => {
    if (WRITTEN_NUMBER.test(p.stem)) errors.push(`${label(i)}: 問い文に番号や記号を文字で書いている（{傍線部:A}・{範囲} の記法を使う）`)
    const segments: StemSegment[] = stem(p.stem).map(s => {
      if (s.kind !== 'markRef') return s
      const id = anchored.ids.get(s.id)
      if (!id) errors.push(`${label(i)}: 問い文が参照する傍線部${s.id}が marks にない`)
      return { ...s, id: id ?? s.id }
    })
    // 正答は番号ではなく選択肢の文で受け取る（番号だと 0 と 1 のどちらから数えたかで一つずれても、検証で見つからない）
    const correct = p.correctChoice === undefined ? -1 : (p.choices ?? []).indexOf(p.correctChoice)
    if (p.format === 'choice' && correct === -1) errors.push(`${label(i)}: 正答（correctChoice）が選択肢のどれとも一致しない（選択肢の文をそのまま書く）`)
    if (p.format === 'extract' && p.answer && !passageText.includes(p.answer)) errors.push(`${label(i)}: 抜き出しの答え「${p.answer}」が本文にない`)
    if (p.format !== 'choice' && !p.answer) errors.push(`${label(i)}: 正答・模範解答（answer）がない`)
    return {
      id: `${base.id}-q${i + 1}`,
      format: p.format,
      stem: segments,
      ...(p.choices && { choices: p.choices }),
      ...(correct !== -1 && { correct }),
      ...(p.charLimit !== undefined && { charLimit: p.charLimit }),
      ...(p.answer && { answer: p.answer }),
      ...(p.rubric && { rubric: p.rubric }),
      points: points?.[i] ?? pointStep,
      kanten: p.kanten,
      standard: p.standard,
    }
  })

  const parsed = Section.safeParse({ ...base, passage: { ...base.passage, segments: anchored.segments }, questions })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [where, index] = issue.path
      errors.push(where === 'questions' && typeof index === 'number' ? `${label(index)}: ${issue.message}` : issue.message)
    }
  }
  if (errors.length || !parsed.success) return { ok: false, errors }
  return {
    ok: true,
    section: parsed.data,
    rationales: proposal.questions.map((p, i) => ({ questionId: questions[i].id, rationale: p.rationale, standard: p.standard })),
  }
}
