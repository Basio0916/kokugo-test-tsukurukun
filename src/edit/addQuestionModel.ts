import type { Idea } from '../ai/addQuestion'
import { markNumbers } from '../model/derive'
import type { Question } from '../model/schema'
import { stemToText } from './stemText'

/* 小問を足す画面で使う形式の一覧・案の問い文の整形・空の小問のひな形 */

export type Format = 'choice' | 'extract' | 'description' | 'short'
export const FORMATS: Array<{ value: Format; label: string }> = [
  { value: 'choice', label: '記号選択' },
  { value: 'extract', label: '本文からの抜き出し' },
  { value: 'description', label: '記述' },
  { value: 'short', label: '短答' },
]
// 漢字・文法の大問で「自分で書く」ときの形式（項目のある問い）
export type OwnFormat = Format | 'kanji-items' | 'short-items' | 'choice-items'

/** 案の問い文を、紙面と同じ番号で読める文字列にする */
export function ideaStem(idea: Idea): string {
  const numbers = markNumbers({ ...idea.section, questions: [...idea.section.questions, idea.question] })
  return stemToText(idea.question.stem, numbers, idea.question.choices?.length ?? 4).replace(/[{}]/g, '')
}

/** 自分で書くときの空の小問のひな形 */
export function blankQuestion(format: OwnFormat, id: string, points: number, standard: string, kanten: Question['kanten']): Question {
  const base = { id, stem: [], kanten, standard }
  switch (format) {
    case 'choice': return { ...base, format: 'choice', choices: ['', '', '', ''], correct: 0, points }
    case 'extract': return { ...base, format: 'extract', answer: '', points }
    case 'description': return { ...base, format: 'description', answer: '', rubric: [], points }
    case 'short': return { ...base, format: 'short', answer: '', points }
    case 'kanji-items': return { ...base, format: 'kanji', items: [], pointsEach: points }
    case 'short-items': return { ...base, format: 'short', items: [], pointsEach: points }
    case 'choice-items': return { ...base, format: 'choice', choices: ['', '', '', ''], items: [], pointsEach: points }
  }
}
