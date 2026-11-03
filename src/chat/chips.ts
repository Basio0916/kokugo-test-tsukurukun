import { draftable } from '../ai/client'
import type { Test } from '../model/schema'
import { targetLabel, type Target } from './messages'

/* 選んだ大問・小問に合わせて出す、よくある頼み方のボタン */

export type Chip = { label: string; disabled?: boolean } & (
  | { kind: 'ask'; text: string }
  | { kind: 'addQuestion'; sectionId: string; at: number }
  | { kind: 'points'; sectionId: string; questionId: string; delta: number }
  | { kind: 'draft'; sectionId: string }
  | { kind: 'kanji'; sectionId: string }
  | { kind: 'openPassage'; sectionId: string }
)

type Context = {
  pointStep: number
  // 作っている大問
  drafting: Set<string>
  // AI が考えている間（頼みの文を送れない）
  busy: boolean
  // 作り方の教材がわかる文法の大問
  grammarKnown: (sectionId: string) => boolean
}

export function chipsFor(test: Test, target: Target, ctx: Context): Chip[] {
  const section = test.sections.find(s => s.id === target.sectionId)!
  const label = targetLabel(test, target)
  const step = ctx.pointStep === 1 ? '一点' : '〇・五点'
  const drafting = ctx.drafting.has(section.id)
  // 本文を貼る前の文章の大問と作文には、小問を足さない
  const addable = section.kind !== 'composition' && !(section.questions.length === 0 && !section.passage && section.kind !== 'kanji' && section.kind !== 'grammar')

  const qi = section.questions.findIndex(q => q.id === target.questionId)
  if (qi >= 0) {
    const q = section.questions[qi]
    const ask = (chip: string, text: string): Chip => ({ label: chip, kind: 'ask', text: `${label}${text}`, disabled: ctx.busy || drafting })
    const chips: Chip[] = []
    if (draftable(section) && !q.items) {
      chips.push(ask('もう少し易しく', 'をもう少し易しくしてください'))
      if (q.format === 'choice') chips.push(ask('選択肢を五つに', 'の選択肢を五つにしてください'), ask('記述問題にする', 'を記述問題にしてください'))
      chips.push(ask('AIに作り直してもらう', 'を別の問い方で作り直してください'))
    }
    if (addable) chips.push({ label: 'この後ろに小問を足す', kind: 'addQuestion', sectionId: section.id, at: qi + 1 })
    chips.push(
      { label: `配点を${step}上げる`, kind: 'points', sectionId: section.id, questionId: q.id, delta: ctx.pointStep },
      { label: `配点を${step}下げる`, kind: 'points', sectionId: section.id, questionId: q.id, delta: -ctx.pointStep },
    )
    return chips
  }

  const chips: Chip[] = []
  const prose = section.kind === 'literary' || section.kind === 'expository'
  if (prose && !section.passage) chips.push({ label: '本文欄を開く', kind: 'openPassage', sectionId: section.id })
  if (draftable(section)) chips.push({ label: section.questions.length ? 'AIに作り直してもらう' : 'AIに作ってもらう', kind: 'draft', sectionId: section.id, disabled: drafting })
  if (section.kind === 'grammar' && ctx.grammarKnown(section.id)) chips.push({ label: 'AIに作り直してもらう', kind: 'draft', sectionId: section.id, disabled: drafting })
  if (section.kind === 'kanji') chips.push({ label: '出題する漢字を選び直す', kind: 'kanji', sectionId: section.id, disabled: drafting })
  if (addable) chips.push({ label: '小問を足す', kind: 'addQuestion', sectionId: section.id, at: section.questions.length })
  return chips
}
