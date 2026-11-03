import { z } from 'zod'
import { lineText, readLine, wrapMarks } from '../model/kanbun.js'
import { Section, type KanbunChar } from '../model/schema.js'
import { allocatePoints } from './points.js'
import { ProposedMark, ProposedQuestion, Suggestions } from './proposal.js'
import { buildQuestion, type Converted } from './toSection.js'

/*
 * 漢文の大問。AI は一句ごとの訓読を「字(送り仮名)[返り点]」の記法で返し、システムが読んで白文と一致するか、
 * 返り点の対応がとれるかを確かめる。傍線部は句の中の字の引用で受け取る。
 */

export const KanbunProposal = z.object({
  lines: z.array(z.string().min(1)).min(1).describe('一句（白文の一行）ごとの訓読。字(送り仮名)[返り点] の記法で、白文と同じ順・同じ数'),
  marks: z.array(ProposedMark),
  questions: z.array(ProposedQuestion).min(1),
  suggestions: Suggestions,
})
export type KanbunProposal = z.infer<typeof KanbunProposal>

/** 漢文の AI の返答を、大問に組み立てて検証する。subtotal は大問の配点の枠 */
export function toKanbunSection(base: Section, proposal: KanbunProposal, pointStep: number, subtotal: number): Converted {
  const passage = base.passage
  if (passage?.kind !== 'kanbun') return { ok: false, errors: ['この大問は漢文の本文を持たない'] }
  const whites = passage.lines.map(lineText)
  if (proposal.lines.length !== whites.length) return { ok: false, errors: [`lines の句の数が${proposal.lines.length}になっている（白文は${whites.length}句）`] }
  const errors: string[] = []
  const lines: KanbunChar[][] = proposal.lines.map((l, i) => {
    const r = readLine(l, whites[i])
    if (!r.ok) {
      errors.push(...r.errors)
      return []
    }
    return r.chars
  })
  if (errors.length) return { ok: false, errors }
  const wrapped = wrapMarks(lines, proposal.marks, i => `${base.id}-m${i + 1}`)
  if (!wrapped.ok) return { ok: false, errors: wrapped.errors }

  const points = allocatePoints(proposal.questions.map(q => Math.min(5, Math.max(1, q.weight))), subtotal, pointStep)
  if (!points) errors.push(`小問が多すぎて、小計${subtotal}点を${pointStep}点刻みで配れない`)
  const questions = proposal.questions.map((p, i) => {
    const built = buildQuestion(p, `${base.id}-q${i + 1}`, `問${i + 1}`, wrapped.ids, whites.join(''), points?.[i] ?? pointStep)
    errors.push(...built.errors)
    return built.question
  })
  const parsed = Section.safeParse({ ...base, passage: { ...passage, lines: wrapped.lines }, questions })
  if (!parsed.success) for (const issue of parsed.error.issues) errors.push(issue.message)
  if (errors.length || !parsed.success) return { ok: false, errors }
  return {
    ok: true,
    section: parsed.data,
    rationales: proposal.questions.map((p, i) => ({ questionId: questions[i].id, rationale: p.rationale, standard: p.standard })),
    ...(proposal.suggestions?.length && { suggestions: proposal.suggestions }),
  }
}
