import type { Grade } from '../catalog/schema'
import type { Section, Test } from '../model/schema'
import type { ChatRequest, ChatResponse, Selection } from './chat'
import type { DraftRequest, DraftResponse } from './draft'
import type { GrammarDraftRequest } from './grammarDraft'
import type { KanjiDraftRequest } from './kanjiDraft'
import type { QuestionDraftRequest, QuestionDraftResponse } from './questionDraft'

/* ブラウザから AI に頼む。サーバー側の関数（/api/draft-section など）を呼ぶ */

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

async function post<R = DraftResponse>(path: string, body: unknown): Promise<R> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json()) as R
  } catch {
    return { ok: false, errors: ['サーバーに接続できませんでした'] } as R
  }
}

/** subtotal は大問の配点の枠。wish は会話で作り直しを頼んだときの先生の希望 */
export function requestDraft(test: Test, section: Section, subtotal: number, wish?: string): Promise<DraftResponse> {
  const body: DraftRequest = { grade: gradeOf(test)!, material: materialOf(section)!, pointStep: test.info.pointStep, subtotal, section, ...(wish && { wish }) }
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

/** 小問を一つ足す案を頼む（おすすめ・形式を選ぶ・線を引く） */
export function requestIdeas(test: Test, section: Section, subtotal: number, how: QuestionDraftRequest['how']): Promise<QuestionDraftResponse> {
  const body: QuestionDraftRequest = { grade: gradeOf(test)!, material: materialOf(section)!, pointStep: test.info.pointStep, subtotal, section, how }
  return post<QuestionDraftResponse>('/api/draft-question', body)
}

/** 会話で頼む。history は直近の会話 */
export function requestChat(test: Test, selection: Selection | undefined, history: ChatRequest['history'], message: string): Promise<ChatResponse> {
  const body: ChatRequest = { test, ...(selection && { selection }), history, message }
  return post<ChatResponse>('/api/chat', body)
}
