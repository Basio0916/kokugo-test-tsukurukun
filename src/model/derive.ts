import type { Passage, Question, Section, Test } from './schema'

/* 番号と配点の合計は保存せず、テストのデータから計算する */

const CHOICE_LABELS = 'アイウエオカキクケコ'

export function choiceLabel(index: number): string {
  return CHOICE_LABELS[index]
}

export function questionNumberOf(section: Section, questionId: string): number {
  return section.questions.findIndex(q => q.id === questionId) + 1
}

// 本文に出てくる順の傍線部の識別子
export function markIdsInPassage(passage: Passage): string[] {
  if (passage.kind === 'prose') return passage.segments.flatMap(s => (s.kind === 'mark' ? [s.id] : []))
  return passage.lines.flatMap(line => line.flatMap(t => (t.kind === 'mark' ? [t.id] : [])))
}

export function markRefsOf(question: Question): string[] {
  const ids = question.stem.flatMap(s => (s.kind === 'markRef' ? [s.id] : []))
  question.items?.forEach(it => { if (it.markId) ids.push(it.markId) })
  return [...new Set(ids)]
}

// 小問から参照されている傍線部だけを、本文の順に ①②③… と数える
export function markNumbers(section: Section): Map<string, number> {
  const numbers = new Map<string, number>()
  if (!section.passage) return numbers
  const referenced = new Set(section.questions.flatMap(markRefsOf))
  markIdsInPassage(section.passage).filter(id => referenced.has(id)).forEach((id, i) => numbers.set(id, i + 1))
  return numbers
}

// 問い文が参照しているのに本文にない傍線部
export function missingMarkRefs(section: Section, question: Question): string[] {
  const inPassage = new Set(section.passage ? markIdsInPassage(section.passage) : [])
  return markRefsOf(question).filter(id => !inPassage.has(id))
}

export function questionPoints(question: Question): number {
  if (question.pointsEach !== undefined) return question.pointsEach * (question.items?.length ?? 0)
  return question.points ?? 0
}

export function sectionPoints(section: Section): number {
  return section.questions.reduce((sum, q) => sum + questionPoints(q), 0)
}

export function kantenTotals(test: Test): { knowledge: number; thinking: number } {
  const totals = { knowledge: 0, thinking: 0 }
  test.sections.forEach(s => s.questions.forEach(q => { totals[q.kanten] += questionPoints(q) }))
  return totals
}

export function totalPoints(test: Test): number {
  return test.sections.reduce((sum, s) => sum + sectionPoints(s), 0)
}
