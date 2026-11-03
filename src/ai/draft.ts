import { z } from 'zod'
import { findGroup, splitStandard, standardText } from '../catalog/catalog.js'
import { Grade } from '../catalog/schema.js'
import { PointStep, Section } from '../model/schema.js'
import { plainText } from './anchor.js'
import { draftWithRetry, jsonHandler } from './claude.js'
import { SYSTEM_PROMPT, userPrompt } from './prompt.js'
import { SectionProposal } from './proposal.js'
import { toSection, type Converted, type Rationale } from './toSection.js'

/* サーバー側で、文章の大問の小問を Claude に作ってもらう */

export const DraftRequest = z.object({
  grade: Grade,
  material: z.string().min(1),
  pointStep: PointStep,
  // 大問の配点の枠。小問の配点はこの合計になるように割り振る
  subtotal: z.number().positive(),
  section: Section,
  // 会話で作り直しを頼んだときの先生の希望
  wish: z.string().min(1).optional(),
})
export type DraftRequest = z.infer<typeof DraftRequest>

export type DraftedRationale = Rationale & { inUnit: boolean }
export type DraftResponse =
  | { ok: true; section: Section; rationales: DraftedRationale[] }
  | { ok: false; errors: string[] }

type UnitJob<T> = {
  schema: z.ZodType<T>
  system: string
  // 単元の指導事項（記号と文言）から、AI への頼みの文を作る
  prompt: (standards: Array<{ code: string; text: string }>) => string
  convert: (proposal: T) => Converted
}

/** 単元データから指導事項を引いて AI に大問を作ってもらい、小問の指導事項が単元にあるかを添える（文章・古文・漢文で共通） */
export async function draftWithUnit<T>(request: DraftRequest, job: UnitJob<T>): Promise<DraftResponse> {
  const { grade, material } = request
  const group = findGroup(grade, material)
  if (!group) return { ok: false, errors: [`単元データに「${material}」がありません`] }
  const standards = group.standards.map(code => ({ code, text: standardText(grade, code) ?? '' }))
  const result = await draftWithRetry({ label: material, schema: job.schema, system: job.system, prompt: job.prompt(standards), convert: job.convert })
  if (!result.ok) return result
  const unit = new Set(group.standards)
  return {
    ok: true,
    section: result.section,
    rationales: result.rationales.map(r => ({ ...r, inUnit: splitStandard(r.standard).every(c => unit.has(c)) })),
  }
}

export async function draftSection(request: DraftRequest): Promise<DraftResponse> {
  const { grade, material, pointStep, subtotal, section, wish } = request
  const passage = section.passage
  if (passage?.kind !== 'prose') return { ok: false, errors: ['この大問は本文（文章）を持たない'] }
  return draftWithUnit(request, {
    schema: SectionProposal,
    system: SYSTEM_PROMPT,
    prompt: standards => userPrompt({ grade, material, pointStep, subtotal, standards, instruction: section.instruction, passage: plainText(passage.segments), source: passage.source, wish }),
    convert: proposal => toSection(section, proposal, pointStep, subtotal),
  })
}

export const handleDraftRequest = jsonHandler(DraftRequest, draftSection)
