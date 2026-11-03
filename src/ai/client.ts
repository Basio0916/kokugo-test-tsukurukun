import type { Grade } from '../catalog/schema'
import type { Section, Test } from '../model/schema'
import type { DraftedRationale, DraftRequest, DraftResponse } from './draft'

/* ブラウザから大問の生成を頼む。サーバー側の関数（/api/draft-section）を呼ぶ */
export type DraftState =
  | { status: 'idle' }
  | { status: 'drafting'; sectionId: string }
  | { status: 'failed'; sectionId: string; errors: string[] }
  | { status: 'drafted'; sectionId: string; rationales: DraftedRationale[] }

// 出典の「」の中を教材名とする（例: 太宰治「走れメロス」より → 走れメロス）
export function materialOf(section: Section): string | undefined {
  return section.passage?.kind === 'prose' ? section.passage.source.match(/「(.+?)」/)?.[1] : undefined
}

export function gradeOf(test: Test): Grade | undefined {
  const g = '一二三'.indexOf(test.info.grade[0]) + 1
  return g === 1 || g === 2 || g === 3 ? g : undefined
}

/** この change で AI に作ってもらえる大問（文学的文章・説明的文章で、教材名がわかるもの） */
export function draftable(section: Section): boolean {
  return (section.kind === 'literary' || section.kind === 'expository') && materialOf(section) !== undefined
}

export async function requestDraft(test: Test, section: Section): Promise<DraftResponse> {
  const body: DraftRequest = { grade: gradeOf(test)!, material: materialOf(section)!, pointStep: test.info.pointStep, section }
  try {
    const res = await fetch('/api/draft-section', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json()) as DraftResponse
  } catch {
    return { ok: false, errors: ['サーバーに接続できませんでした'] }
  }
}

