import type { Idea } from '../ai/addQuestion'
import { choiceLabel, markNumbers } from '../model/derive'
import type { Question } from '../model/schema'
import { fillDisplay } from '../paper/fill'
import { stemToText } from './stemText'

/* 小問を足す画面で使う形式の一覧・案の問い文の整形・空の小問のひな形 */

export type Format = 'choice' | 'extract' | 'description' | 'short'
export const FORMATS: Array<{ value: Format; label: string }> = [
  { value: 'choice', label: '記号選択' },
  { value: 'extract', label: '本文からの抜き出し' },
  { value: 'description', label: '記述' },
  { value: 'short', label: '短答' },
]
// AI に形式を選んで作ってもらうときは、空欄補充も選べる
export type AiFormat = Format | 'fill'
export const AI_FORMATS: Array<{ value: AiFormat; label: string }> = [...FORMATS, { value: 'fill', label: '空欄補充' }]
// 自分で書くときの形式。空欄補充は抜き出しか考えて答える形かを選ぶ。漢字・文法の大問は項目のある問い
export type OwnFormat = Format | 'fill-extract' | 'fill-short' | 'kanji-items' | 'short-items' | 'choice-items'
export const OWN_FORMATS: Array<{ value: OwnFormat; label: string }> = [
  ...FORMATS,
  { value: 'fill-extract', label: '空欄補充（本文から抜き出す）' },
  { value: 'fill-short', label: '空欄補充（考えて答える）' },
]

/** 案の問い文を、紙面と同じ番号で読める文字列にする */
export function ideaStem(idea: Idea): string {
  const numbers = markNumbers({ ...idea.section, questions: [...idea.section.questions, idea.question] })
  return stemToText(idea.question.stem, numbers, idea.question.choices?.length ?? 4).replace(/[{}]/g, '')
}

/** 案の選択肢を、記号を付けた一行にする */
export function ideaChoices(idea: Idea): string {
  return (idea.question.choices ?? []).map((c, i) => `${choiceLabel(i)} ${c}`).join('　')
}

/** 案の穴埋め文を、紙面と同じ見え方（答えを出さない形）にする */
export function ideaFill(idea: Idea): string | undefined {
  return idea.question.fill && `◎${fillDisplay(idea.question.fill)}`
}

/** 自分で書くときの空の小問のひな形 */
export function blankQuestion(format: OwnFormat, id: string, points: number, standard: string, kanten: Question['kanten']): Question {
  const base = { id, stem: [], kanten, standard }
  switch (format) {
    case 'choice': return { ...base, format: 'choice', choices: ['', '', '', ''], correct: 0, points }
    case 'extract': return { ...base, format: 'extract', answer: '', points }
    case 'description': return { ...base, format: 'description', answer: '', rubric: [], points }
    case 'short': return { ...base, format: 'short', answer: '', points }
    case 'fill-extract': return { ...base, format: 'extract', fill: [], points }
    case 'fill-short': return { ...base, format: 'short', fill: [], points }
    case 'kanji-items': return { ...base, format: 'kanji', items: [], pointsEach: points }
    case 'short-items': return { ...base, format: 'short', items: [], pointsEach: points }
    case 'choice-items': return { ...base, format: 'choice', choices: ['', '', '', ''], items: [], pointsEach: points }
  }
}
