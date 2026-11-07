import { z } from 'zod'
import { questionPoints } from '../model/derive.js'
import { Section, type Question } from '../model/schema.js'
import { addKanbunMarks, lineText } from '../model/kanbun.js'
import { addMarks, plainText } from './anchor.js'
import type { Checked } from './claude.js'
import { ProposedMark, ProposedQuestion } from './proposal.js'
import { buildQuestion } from './toSection.js'

/*
 * 小問を一つ足すための AI の案。案ごとに、今の傍線部を残して引用を本文に付け、小問をテストのデータとして検証する。
 * 足し方（おすすめ・形式を選ぶ・線を引く）は違っても、返答の形と関門は同じ。
 */

export const QuestionIdea = z.object({
  marks: z.array(ProposedMark).describe('この小問で傍線を引く箇所。今ある傍線部を使うときも、その文字列をそのまま引用する'),
  question: ProposedQuestion,
  adjustments: z.string().optional().describe('先生の希望から整えたところ（解答形式、字数の指定など）。線を引いて作るときだけ書く'),
})
export const QuestionIdeas = z.object({ ideas: z.array(QuestionIdea).min(1) })
export type QuestionIdeas = z.infer<typeof QuestionIdeas>

export type Idea = { section: Section; question: Question; rationale: string; adjustments?: string }

/** 足した小問の配点: 大問の今の小問の配点の平均（小問がなければ配点の枠の五分の一）を刻みの倍数に丸めたもの。最低でも刻み */
export function defaultPoints(section: Section, subtotal: number, step: number): number {
  const qs = section.questions
  const average = qs.length ? qs.reduce((a, q) => a + questionPoints(q), 0) / qs.length : subtotal / 5
  return Math.max(step, Math.round(average / step) * step)
}

/** 今ある識別子と重ならない、新しい識別子を作る */
export function freshIds(used: Set<string>, prefix: string) {
  let n = 1
  return () => {
    while (used.has(`${prefix}${n}`)) n++
    const id = `${prefix}${n}`
    used.add(id)
    return id
  }
}

type Options = { pointStep: number; subtotal: number; quote?: string; needsFill?: boolean }

export function toIdeas(base: Section, proposal: QuestionIdeas, options: Options): Checked<{ ideas: Idea[] }> {
  const passage = base.passage
  if (!passage) return { ok: false, errors: ['この大問は本文を持たない'] }
  const usedMarkIds = passage.kind === 'prose' ? passage.segments.flatMap(s => (s.kind === 'mark' ? [s.id] : [])) : passage.lines.flat().flatMap(t => (t.kind === 'mark' ? [t.id] : []))
  const points = defaultPoints(base, options.subtotal, options.pointStep)
  const errors: string[] = []
  const ideas: Idea[] = []
  proposal.ideas.forEach((idea, i) => {
    const label = `案${i + 1}`
    if (options.quote && !idea.marks.some(m => m.quote === options.quote)) {
      errors.push(`${label}: 先生が線を引いた「${options.quote}」を marks にそのまま引用していない`)
      return
    }
    if (options.needsFill && !idea.question.fillText?.trim()) {
      errors.push(`${label}: 空欄補充を頼まれたのに穴埋め文（fillText）がない`)
      return
    }
    const markId = freshIds(new Set(usedMarkIds), `${base.id}-n`)
    // 文章・古文は本文の引用、漢文は句の中の字の引用に、今ある傍線部を残して付ける
    const anchored = passage.kind === 'prose'
      ? (() => { const r = addMarks(passage.segments, idea.marks, () => markId()); return r.ok ? { ok: true as const, passage: { ...passage, segments: r.segments }, ids: r.ids, text: plainText(r.segments) } : r })()
      : (() => { const r = addKanbunMarks(passage.lines, idea.marks, () => markId()); return r.ok ? { ok: true as const, passage: { ...passage, lines: r.lines }, ids: r.ids, text: r.lines.map(lineText).join('') } : r })()
    if (!anchored.ok) return errors.push(...anchored.errors.map(e => `${label}: ${e}`))
    const questionId = freshIds(new Set(base.questions.map(q => q.id)), `${base.id}-a`)()
    const built = buildQuestion(idea.question, questionId, label, anchored.ids, anchored.text, points)
    if (built.errors.length) return errors.push(...built.errors)
    const section: Section = { ...base, passage: anchored.passage }
    const parsed = Section.safeParse({ ...section, questions: [...section.questions, built.question] })
    if (!parsed.success) return errors.push(...parsed.error.issues.map(issue => `${label}: ${issue.message}`))
    ideas.push({ section, question: built.question, rationale: idea.question.rationale, ...(idea.adjustments && { adjustments: idea.adjustments }) })
  })
  // おすすめで一部の案だけ通らないときは、通った案だけを返す
  return ideas.length ? { ok: true, ideas } : { ok: false, errors }
}
