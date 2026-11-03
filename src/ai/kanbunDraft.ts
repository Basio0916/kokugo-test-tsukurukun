import { lineText } from '../model/kanbun.js'
import { jsonHandler } from './claude.js'
import { DraftRequest, draftWithUnit, type DraftResponse } from './draft.js'
import { KanbunProposal, toKanbunSection } from './kanbun.js'
import { KANBUN_SYSTEM_PROMPT, kanbunUserPrompt } from './prompt.js'

/* サーバー側で、漢文の大問の訓読（返り点・送り仮名）と小問を Claude に作ってもらう */

export async function draftKanbun(request: DraftRequest): Promise<DraftResponse> {
  const { grade, material, pointStep, subtotal, section, wish } = request
  const passage = section.passage
  if (passage?.kind !== 'kanbun') return { ok: false, errors: ['この大問は漢文の本文を持たない'] }
  return draftWithUnit(request, {
    schema: KanbunProposal,
    system: KANBUN_SYSTEM_PROMPT,
    prompt: standards => kanbunUserPrompt({
      grade, material, pointStep, subtotal, standards, wish,
      instruction: section.instruction, title: passage.title, author: passage.author, lines: passage.lines.map(lineText), notes: passage.notes,
    }),
    convert: proposal => toKanbunSection(section, proposal, pointStep, subtotal),
  })
}

export const handleKanbunDraftRequest = jsonHandler(DraftRequest, draftKanbun)
