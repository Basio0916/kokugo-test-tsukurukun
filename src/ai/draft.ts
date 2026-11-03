import { z } from 'zod'
import { findGroup, splitStandard, standardText } from '../catalog/catalog.js'
import { Grade } from '../catalog/schema.js'
import { PointStep, Section } from '../model/schema.js'
import { plainText } from './anchor.js'
import { draftWithRetry, jsonHandler } from './claude.js'
import { SYSTEM_PROMPT, userPrompt } from './prompt.js'
import { SectionProposal } from './proposal.js'
import { toSection, type Rationale } from './toSection.js'

/* サーバー側で、文章の大問の小問を Claude に作ってもらう */

export const DraftRequest = z.object({
  grade: Grade,
  material: z.string().min(1),
  pointStep: PointStep,
  // 大問の配点の枠。小問の配点はこの合計になるように割り振る
  subtotal: z.number().positive(),
  section: Section,
})
export type DraftRequest = z.infer<typeof DraftRequest>

export type DraftedRationale = Rationale & { inUnit: boolean }
export type DraftResponse =
  | { ok: true; section: Section; rationales: DraftedRationale[] }
  | { ok: false; errors: string[] }

export async function draftSection(request: DraftRequest): Promise<DraftResponse> {
  const { grade, material, pointStep, subtotal, section } = request
  const group = findGroup(grade, material)
  if (!group) return { ok: false, errors: [`単元データに「${material}」がありません`] }
  if (section.passage?.kind !== 'prose') return { ok: false, errors: ['この大問は本文（文章）を持たない'] }

  const result = await draftWithRetry({
    label: material,
    schema: SectionProposal,
    system: SYSTEM_PROMPT,
    prompt: userPrompt({
      grade, material, pointStep, subtotal,
      standards: group.standards.map(code => ({ code, text: standardText(grade, code) ?? '' })),
      instruction: section.instruction,
      passage: plainText(section.passage.segments),
      source: section.passage.source,
    }),
    convert: proposal => toSection(section, proposal, pointStep, subtotal),
  })
  if (!result.ok) return result
  const unit = new Set(group.standards)
  return {
    ok: true,
    section: result.section,
    rationales: result.rationales.map(r => ({ ...r, inUnit: splitStandard(r.standard).every(c => unit.has(c)) })),
  }
}

export const handleDraftRequest = jsonHandler(DraftRequest, draftSection)
