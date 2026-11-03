import { z } from 'zod'
import { choiceLabel } from '../model/derive.js'
import { itemSegments, stem } from '../model/notation.js'
import { Section, type Question } from '../model/schema.js'
import { WRITTEN_NUMBER, type Converted } from './toSection.js'

/*
 * 文法の大問。項目を持つ問い（記号選択・短答）を二〜四問。
 * 記号選択の正答は選択肢の文で受け取り、システムが記号（ア・イ…）に直す。
 */

const GrammarItem = z.object({
  sentence: z.string().min(1).describe('例文。答える箇所があれば [[ ]] で一か所だけ囲む。番号は付けない'),
  answer: z.string().optional().describe('短答の答え'),
  correctChoice: z.string().optional().describe('記号選択の正答。choices のうち正しいものを、一字も変えずにそのまま書く'),
})

const GrammarQuestion = z.object({
  format: z.enum(['choice', 'short']).describe('記号選択（choices から項目ごとに選ぶ）か短答'),
  stem: z.string().min(1).describe('問い文。選択肢の範囲は {範囲} と書き、項目の番号（①など）や記号（ア〜エ）は文字で書かない'),
  choices: z.array(z.string().min(1)).optional().describe('記号選択の選択肢。記号は付けない'),
  items: z.array(GrammarItem).min(1),
  rationale: z.string().min(1).describe('この問いを入れる理由。先生に向けて一〜二文で'),
})

export const GrammarProposal = z.object({ questions: z.array(GrammarQuestion) })
export type GrammarProposal = z.infer<typeof GrammarProposal>

export type GrammarPlan = { each: number; count: number; standard: string }

export function toGrammarSection(base: Section, proposal: GrammarProposal, plan: GrammarPlan): Converted {
  const errors: string[] = []
  const { questions: qs } = proposal
  const total = qs.reduce((a, q) => a + q.items.length, 0)
  if (qs.length < 2 || qs.length > 4) errors.push(`問いが ${qs.length} 問（二〜四問にする）`)
  if (total !== plan.count) errors.push(`項目が全部で ${total} 個（${plan.count} 個ちょうどにする）`)

  const questions = qs.map((q, i): Question => {
    const label = `問${i + 1}`
    if (WRITTEN_NUMBER.test(q.stem)) errors.push(`${label}: 問い文に番号や記号を文字で書いている（{範囲} の記法を使い、項目の番号は書かない）`)
    if (q.format === 'choice' && !(q.choices && q.choices.length >= 2)) errors.push(`${label}: 記号選択なのに選択肢がない`)
    const items = q.items.map((item, j) => {
      if ([...item.sentence.matchAll(/\[\[/g)].length > 1) errors.push(`${label}の項目${j + 1}: 傍線部（[[ ]]）が二か所以上ある`)
      let answer = item.answer ?? ''
      if (q.format === 'choice') {
        const index = item.correctChoice === undefined ? -1 : (q.choices ?? []).indexOf(item.correctChoice)
        if (index === -1) errors.push(`${label}の項目${j + 1}: 正答（correctChoice）が選択肢のどれとも一致しない（選択肢の文をそのまま書く）`)
        else answer = choiceLabel(index)
      } else if (!answer) errors.push(`${label}の項目${j + 1}: 答え（answer）がない`)
      return { segments: itemSegments(item.sentence), answer: answer || '？' }
    })
    return {
      id: `${base.id}-q${i + 1}`, format: q.format, stem: stem(q.stem), kanten: 'knowledge', standard: plan.standard,
      pointsEach: plan.each, items, ...(q.choices && { choices: q.choices }),
    }
  })

  const parsed = Section.safeParse({ ...base, questions })
  if (!parsed.success) errors.push(...parsed.error.issues.map(issue => issue.message))
  if (errors.length || !parsed.success) return { ok: false, errors }
  return {
    ok: true,
    section: parsed.data,
    rationales: qs.map((q, i) => ({ questionId: questions[i].id, rationale: q.rationale, standard: plan.standard })),
  }
}
