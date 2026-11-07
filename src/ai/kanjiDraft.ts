import { z } from 'zod'
import { kanjiStandardOf, standardText } from '../catalog/catalog.js'
import { Grade } from '../catalog/schema.js'
import { PointStep, Section } from '../model/schema.js'
import { draftWithRetry, jsonHandler } from './claude.js'
import type { DraftResponse } from './draft.js'
import { itemPlan, kanjiSplit } from './items.js'
import { KanjiProposal, toKanjiSection } from './kanji.js'
import { KANJI_SYSTEM_PROMPT, kanjiUserPrompt } from './prompt.js'

/* サーバー側で、漢字の大問を Claude に作ってもらう。出題する語は先生が決めた語（足りなければ AI が補う） */

export const KanjiDraftRequest = z.object({
  grade: Grade,
  words: z.array(z.string().min(1)).min(1),
  pointStep: PointStep,
  subtotal: z.number().positive(),
  section: Section,
})
export type KanjiDraftRequest = z.infer<typeof KanjiDraftRequest>

export async function draftKanji(request: KanjiDraftRequest): Promise<DraftResponse> {
  const { grade, words, pointStep, subtotal, section } = request
  const plan = itemPlan(subtotal, pointStep)
  if (!plan) return { ok: false, errors: [`配点の枠 ${subtotal} 点を、${pointStep} 点刻みの項目に分けられない`] }
  const { reading, writing } = kanjiSplit(plan.count)
  const code = kanjiStandardOf(grade)
  const result = await draftWithRetry({
    label: '漢字',
    schema: KanjiProposal,
    system: KANJI_SYSTEM_PROMPT,
    prompt: kanjiUserPrompt({ grade, standard: { code, text: standardText(grade, code) ?? '' }, words, reading, writing }),
    convert: proposal => toKanjiSection(section, proposal, { each: plan.each, reading, writing, standard: code }, words),
  })
  return result.ok ? { ...result, rationales: result.rationales.map(r => ({ ...r, inUnit: true })) } : result
}

export const handleKanjiDraftRequest = jsonHandler(KanjiDraftRequest, draftKanji)
