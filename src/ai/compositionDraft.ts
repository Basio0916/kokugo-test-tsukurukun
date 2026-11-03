import { z } from 'zod'
import { findGroup, splitStandard, standardText } from '../catalog/catalog.js'
import { Grade } from '../catalog/schema.js'
import { PointStep, Section } from '../model/schema.js'
import { draftWithRetry, jsonHandler } from './claude.js'
import { CompositionProposal, toCompositionSection } from './composition.js'
import type { DraftResponse } from './draft.js'
import { COMPOSITION_SYSTEM_PROMPT, compositionUserPrompt } from './prompt.js'

/* サーバー側で、作文の大問の題と条件を Claude に作ってもらう。テストの教材の単元の指導事項をまとめて渡す */

export const CompositionDraftRequest = z.object({
  grade: Grade,
  // テストの教材の大問の教材名
  materials: z.array(z.string().min(1)),
  pointStep: PointStep,
  subtotal: z.number().positive(),
  section: Section,
  wish: z.string().min(1).optional(),
})
export type CompositionDraftRequest = z.infer<typeof CompositionDraftRequest>

export async function draftComposition(request: CompositionDraftRequest): Promise<DraftResponse> {
  const { grade, materials, subtotal, section, wish } = request
  const codes = [...new Set(materials.flatMap(m => findGroup(grade, m)?.standards ?? []))]
  const result = await draftWithRetry({
    label: '作文',
    schema: CompositionProposal,
    system: COMPOSITION_SYSTEM_PROMPT,
    prompt: compositionUserPrompt({ grade, materials, standards: codes.map(code => ({ code, text: standardText(grade, code) ?? '' })), instruction: section.instruction, subtotal, wish }),
    convert: proposal => toCompositionSection(section, proposal, subtotal),
  })
  if (!result.ok) return result
  const unit = new Set(codes)
  return { ok: true, section: result.section, rationales: result.rationales.map(r => ({ ...r, inUnit: splitStandard(r.standard).every(c => unit.has(c)) })) }
}

export const handleCompositionDraftRequest = jsonHandler(CompositionDraftRequest, draftComposition)
