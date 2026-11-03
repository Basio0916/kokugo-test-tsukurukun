import { choiceLabel, markNumbers } from '../model/derive'
import type { Question, Section } from '../model/schema'
import { circled, kansuji } from '../paper/kansuji'

/* 模範解答・採点基準の表の行。正答の記号・項目の見出し・配点の書き方は、テストのデータから導く */

export type KeyRow = {
  // 問一
  label: string
  answer: string
  // 四点・各二点
  points: string
  kanten: string
  standard: string
  rubric: string[]
}

const KANTEN = { knowledge: '知識・技能', thinking: '思考・判断・表現' } as const

function answerOf(section: Section, q: Question): string {
  const numbers = markNumbers(section)
  if (q.items) return q.items.map((it, i) => `${it.markId ? circled(numbers.get(it.markId) ?? 0) : circled(i + 1)} ${it.answer}`).join('　')
  if (q.format === 'choice') return q.correct !== undefined ? choiceLabel(q.correct) : ''
  return q.answer ?? '—'
}

// 採点の観点がない小問の採点基準。作文は条件に沿って書けているかを見る
function defaultRubric(q: Question): string[] {
  if (q.format === 'composition') return ['条件に沿って書けている', ...(q.conditions ?? [])]
  return [q.format === 'choice' ? '記号が合っていれば正答' : '答えが合っていれば正答']
}

export function keyRows(section: Section): KeyRow[] {
  return section.questions.map((q, i) => ({
    label: q.format === 'composition' ? '作文' : `問${kansuji(i + 1)}`,
    answer: answerOf(section, q),
    points: q.pointsEach !== undefined ? `各${kansuji(q.pointsEach)}点` : `${kansuji(q.points ?? 0)}点`,
    kanten: KANTEN[q.kanten],
    standard: q.standard,
    rubric: q.rubric ?? defaultRubric(q),
  }))
}
