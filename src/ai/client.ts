import type { Grade } from '../catalog/schema'
import type { Section, Test } from '../model/schema'
import type { DraftedRationale, DraftRequest, DraftResponse } from './draft'
import type { GrammarDraftRequest } from './grammarDraft'
import type { KanjiDraftRequest } from './kanjiDraft'

/* ブラウザから大問の生成を頼む。サーバー側の関数（/api/draft-section）を呼ぶ */

// 大問ごとの、AI に作ってもらう状態
export type SectionDraft =
  | { status: 'drafting' }
  | { status: 'failed'; errors: string[] }
  | { status: 'drafted'; rationales: DraftedRationale[] }
export type DraftStates = Record<string, SectionDraft>

// 出典の「」の中を教材名とする（例: 太宰治「走れメロス」より → 走れメロス）
export function materialOf(section: Section): string | undefined {
  return section.passage?.kind === 'prose' ? section.passage.source.match(/「(.+?)」/)?.[1] : undefined
}

export function gradeOf(test: Test): Grade | undefined {
  const g = '一二三'.indexOf(test.info.grade[0]) + 1
  return g === 1 || g === 2 || g === 3 ? g : undefined
}

/** AI に作ってもらえる大問（本文を持つ文学的文章・説明的文章で、教材名がわかるもの） */
export function draftable(section: Section): boolean {
  return (section.kind === 'literary' || section.kind === 'expository') && materialOf(section) !== undefined
}

async function post(path: string, body: unknown): Promise<DraftResponse> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json()) as DraftResponse
  } catch {
    return { ok: false, errors: ['サーバーに接続できませんでした'] }
  }
}

/** subtotal は大問の配点の枠 */
export function requestDraft(test: Test, section: Section, subtotal: number): Promise<DraftResponse> {
  const body: DraftRequest = { grade: gradeOf(test)!, material: materialOf(section)!, pointStep: test.info.pointStep, subtotal, section }
  return post('/api/draft-section', body)
}

/** words は先生が決めた語、candidates は本文から拾った候補 */
export function requestKanji(test: Test, section: Section, subtotal: number, words: string[], candidates: string[]): Promise<DraftResponse> {
  const body: KanjiDraftRequest = { grade: gradeOf(test)!, words, candidates, pointStep: test.info.pointStep, subtotal, section }
  return post('/api/draft-kanji', body)
}

export function requestGrammar(test: Test, section: Section, subtotal: number, materials: string[]): Promise<DraftResponse> {
  const body: GrammarDraftRequest = { grade: gradeOf(test)!, materials, pointStep: test.info.pointStep, subtotal, section }
  return post('/api/draft-grammar', body)
}
