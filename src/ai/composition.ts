import { z } from 'zod'
import { Section } from '../model/schema.js'
import { WRITTEN_NUMBER, type Converted } from './toSection.js'

/* 作文の大問。AI は題を含む指示文・条件・字数・採点の観点を返し、システムが作文の問一つの大問に組み立てる */

export const CompositionProposal = z.object({
  instruction: z.string().min(1).describe('大問の指示文。題（何について書くか）を含め、「次の条件にしたがって書きなさい。」で終える'),
  conditions: z.array(z.string().min(1)).describe('条件。二〜三つ（段落の構成、字数など）。番号は付けない'),
  charLimit: z.number().int().describe('字数の上限（六十〜四百）'),
  rubric: z.array(z.string().min(1)).min(1).describe('採点の観点'),
  standard: z.string().min(1).describe('指導事項の記号。B(1)ウ、C(1)オ のように書く（二つなら「・」でつなぐ）'),
  rationale: z.string().min(1).describe('この題と条件にした理由。テストの教材や指導事項とのつながりを、先生に向けて一〜二文で'),
})
export type CompositionProposal = z.infer<typeof CompositionProposal>

// 作文の字数の範囲（解答用紙の一枚に収めるため）
const MIN_CHARS = 60
const MAX_CHARS = 400

/** 作文の AI の返答を、作文の問一つの大問に組み立てて検証する。points は大問の配点の枠 */
export function toCompositionSection(base: Section, proposal: CompositionProposal, points: number): Converted {
  const errors: string[] = []
  if (proposal.conditions.length === 0) errors.push('条件（conditions）が一つもない')
  if (proposal.charLimit < MIN_CHARS || proposal.charLimit > MAX_CHARS) errors.push(`字数 ${proposal.charLimit} が ${MIN_CHARS}〜${MAX_CHARS} の範囲にない`)
  for (const text of [proposal.instruction, ...proposal.conditions]) {
    if (WRITTEN_NUMBER.test(text)) errors.push(`「${text}」に番号や記号を文字で書いている`)
  }
  const id = `${base.id}-c1`
  const parsed = Section.safeParse({
    ...base,
    instruction: proposal.instruction.trim(),
    questions: [{
      id, format: 'composition', stem: [], conditions: proposal.conditions, charLimit: proposal.charLimit,
      points, kanten: 'thinking', standard: proposal.standard, rubric: proposal.rubric,
    }],
  })
  if (!parsed.success) errors.push(...parsed.error.issues.map(i => i.message))
  if (errors.length || !parsed.success) return { ok: false, errors }
  return { ok: true, section: parsed.data, rationales: [{ questionId: id, rationale: proposal.rationale, standard: proposal.standard }] }
}
