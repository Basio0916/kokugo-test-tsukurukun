import type { Grade } from '../catalog/schema'
import type { Section, Test } from '../model/schema'
import type { AnnotateRequest, AnnotateResponse } from './annotate'
import type { ChatRequest, ChatResponse, Selection } from './chat'
import type { CompositionDraftRequest } from './compositionDraft'
import type { DraftRequest, DraftResponse } from './draft'
import type { GrammarDraftRequest } from './grammarDraft'
import type { KanjiDraftRequest } from './kanjiDraft'
import type { PassageCheckRequest, PassageCheckResponse } from './passageCheck'
import type { QuestionDraftRequest, QuestionDraftResponse } from './questionDraft'

/* ブラウザから AI に頼む。サーバー側の関数（/api/draft-section など）を呼ぶ */

// 大問の教材名。持っていなければ出典の「」の中を教材名とする（例: 太宰治「走れメロス」より → 走れメロス）
export function materialOf(section: Section): string | undefined {
  return section.material ?? (section.passage?.kind === 'prose' ? section.passage.source.match(/「(.+?)」/)?.[1] : undefined)
}

export function gradeOf(test: Test): Grade | undefined {
  const g = '一二三'.indexOf(test.info.grade[0]) + 1
  return g === 1 || g === 2 || g === 3 ? g : undefined
}

/** AI に作ってもらえる大問（本文を持つ文学的文章・説明的文章で、教材名がわかるもの）。小問の案や会話での小問の直しもこの大問だけ */
export function draftable(section: Section): boolean {
  return (section.kind === 'literary' || section.kind === 'expository') && materialOf(section) !== undefined
}

/** 会話で小問を直せる大問（本文を持つ文章・古文・漢文） */
export function revisable(section: Section): boolean {
  if (section.kind === 'kanbun') return section.passage?.kind === 'kanbun'
  return (section.kind === 'literary' || section.kind === 'expository' || section.kind === 'classical') && section.passage?.kind === 'prose'
}

/** AI に小問の案を作ってもらえる大問（会話で直せる大問のうち、指導事項を引くための教材名がわかるもの） */
export function ideasAvailable(section: Section): boolean {
  return revisable(section) && materialOf(section) !== undefined
}

/** AI に大問を作り直してもらえる大問（本文を持つ文章・古文・漢文で教材名がわかるもの、作文） */
export function redraftable(section: Section): boolean {
  if (section.kind === 'composition') return true
  if (materialOf(section) === undefined) return false
  if (section.kind === 'kanbun') return section.passage?.kind === 'kanbun'
  return (section.kind === 'literary' || section.kind === 'expository' || section.kind === 'classical') && section.passage?.kind === 'prose'
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

/** 古文・漢文の大問を作ってもらう（要求の形は文章の大問と同じ） */
export function requestClassical(test: Test, section: Section, subtotal: number, wish?: string): Promise<DraftResponse> {
  const body: DraftRequest = { grade: gradeOf(test)!, material: materialOf(section)!, pointStep: test.info.pointStep, subtotal, section, ...(wish && { wish }) }
  return post(section.kind === 'kanbun' ? '/api/draft-kanbun' : '/api/draft-classical', body)
}

/** 作文の大問の題と条件を作ってもらう。テストの教材の大問の教材名を渡す */
export function requestComposition(test: Test, section: Section, subtotal: number, wish?: string): Promise<DraftResponse> {
  const materials = [...new Set(test.sections.flatMap(s => (s.kind !== 'composition' && materialOf(s) ? [materialOf(s)!] : [])))]
  const body: CompositionDraftRequest = { grade: gradeOf(test)!, materials, pointStep: test.info.pointStep, subtotal, section, ...(wish && { wish }) }
  return post('/api/draft-composition', body)
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

/** 本文を直したあと、選択肢・模範解答と本文の食い違いを AI に確かめてもらう */
export function requestPassageCheck(body: PassageCheckRequest): Promise<PassageCheckResponse> {
  return post<PassageCheckResponse>('/api/check-passage', body)
}

/** 本文を直して外れた漢文の訓読・古文のルビを付け直してもらう */
export function requestAnnotate(body: AnnotateRequest): Promise<AnnotateResponse> {
  return post<AnnotateResponse>('/api/annotate', body)
}
