import { plainText } from './anchor.js'
import { ClassicalProposal, toClassicalSection } from './classical.js'
import { jsonHandler } from './claude.js'
import { DraftRequest, draftWithUnit, type DraftResponse } from './draft.js'
import { CLASSICAL_SYSTEM_PROMPT, userPrompt } from './prompt.js'

/* サーバー側で、古文の大問のルビと小問を Claude に作ってもらう */

export async function draftClassical(request: DraftRequest): Promise<DraftResponse> {
  const { grade, material, pointStep, subtotal, section, wish } = request
  const passage = section.passage
  if (passage?.kind !== 'prose') return { ok: false, errors: ['この大問は本文（古文）を持たない'] }
  return draftWithUnit(request, {
    schema: ClassicalProposal,
    system: CLASSICAL_SYSTEM_PROMPT,
    prompt: standards => userPrompt({ grade, material, pointStep, subtotal, standards, instruction: section.instruction, passage: plainText(passage.segments), source: passage.source, wish }),
    convert: proposal => toClassicalSection(section, proposal, pointStep, subtotal),
  })
}

export const handleClassicalDraftRequest = jsonHandler(DraftRequest, draftClassical)
