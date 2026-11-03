import { z } from 'zod'
import { grammarMaterialsOf, standardText } from '../catalog/catalog.js'
import { Grade } from '../catalog/schema.js'
import { PointStep, Section } from '../model/schema.js'
import { draftWithRetry, jsonHandler } from './claude.js'
import type { DraftResponse } from './draft.js'
import { GrammarProposal, toGrammarSection } from './grammar.js'
import { itemPlan } from './items.js'
import { GRAMMAR_SYSTEM_PROMPT, grammarUserPrompt } from './prompt.js'

/* サーバー側で、文法の大問を Claude に作ってもらう */

export const GrammarDraftRequest = z.object({
  grade: Grade,
  materials: z.array(z.string().min(1)).min(1),
  pointStep: PointStep,
  subtotal: z.number().positive(),
  section: Section,
})
export type GrammarDraftRequest = z.infer<typeof GrammarDraftRequest>

export async function draftGrammar(request: GrammarDraftRequest): Promise<DraftResponse> {
  const { grade, materials, pointStep, subtotal, section } = request
  const chosen = grammarMaterialsOf(grade).filter(g => materials.includes(g.name))
  if (chosen.length === 0) return { ok: false, errors: [`単元データに文法の教材「${materials.join('」「')}」がありません`] }
  const plan = itemPlan(subtotal, pointStep)
  if (!plan) return { ok: false, errors: [`配点の枠 ${subtotal} 点を、${pointStep} 点刻みの項目に分けられない`] }

  // 指導事項は教材に付いている記号。前の学年の記号だけを持つ教材（三年の文法のまとめなど）は、それを使う
  const codes = [
    ...chosen.flatMap(g => g.standards.map(code => ({ grade, code }))),
    ...chosen.flatMap(g => g.earlierGradeCodes),
  ].filter((c, i, all) => all.findIndex(d => d.grade === c.grade && d.code === c.code) === i)
  const standard = codes.map(c => (c.grade === grade ? c.code : `${c.grade}年${c.code}`)).join('・')
  const result = await draftWithRetry({
    label: '文法',
    schema: GrammarProposal,
    system: GRAMMAR_SYSTEM_PROMPT,
    prompt: grammarUserPrompt({
      grade, materials: chosen.map(g => g.name), count: plan.count,
      standards: codes.map(c => ({ code: c.grade === grade ? c.code : `${c.grade}年${c.code}`, text: standardText(c.grade, c.code) ?? '' })),
    }),
    convert: proposal => toGrammarSection(section, proposal, { each: plan.each, count: plan.count, standard }),
  })
  return result.ok ? { ...result, rationales: result.rationales.map(r => ({ ...r, inUnit: true })) } : result
}

export const handleGrammarDraftRequest = jsonHandler(GrammarDraftRequest, draftGrammar)
