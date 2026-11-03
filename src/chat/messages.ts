import type { Selection } from '../ai/chat'
import type { DraftedRationale } from '../ai/draft'
import type { Section, Test } from '../model/schema'
import { kansuji } from '../paper/kansuji'

/* 会話のメッセージ。データだけを持ち、ボタンを押したときの処理は画面（App）が行う */

export type Target = Selection

// group が同じボタンは、一つ押すとまとめて押せなくなる（group のないボタンは、メッセージで一つのまとまり）
export type ChatButton = { label: string; group?: string } & (
  | { action: 'confirm'; sectionId: string }
  | { action: 'redraft'; sectionId: string }
  | { action: 'undo' }
  | { action: 'addSection' }
  // 本文を直したあとの要確認の小問への対応
  | { action: 'fixFlag' | 'keepFlag' | 'removeFlagged'; sectionId: string; questionId: string }
)

export type Note = { head?: string; text: string; outside?: boolean }

export type ChatMessage = {
  id: number
  who: 'me' | 'ai'
  text: string
  notes?: { title: string; label: string; items: Note[] }
  buttons?: ChatButton[]
  // 押したボタンのまとまり
  usedGroups?: string[]
  // 元に戻す: 今のテストが after と同じときだけ押せる。clearFlags の大問の要確認も外す
  undo?: { before: Test; after: Test; clearFlags?: string }
  error?: boolean
}

export type NewMessage = Omit<ChatMessage, 'id'>

export const WELCOME: NewMessage = {
  who: 'ai',
  text: '紙面の本文欄に教材の本文を貼ると、AI が小問を作ります。紙面の大問や小問をクリックして選ぶと、それについて下のボタンや言葉で頼めます。',
}

const NAMES: Partial<Record<Section['kind'], string>> = { kanji: '漢字', grammar: '文法', composition: '作文' }

/** 会話で大問を呼ぶ名前（【三】走れメロス） */
export function sectionLabel(test: Test, section: Section, materialNames: Record<string, string>, material?: string): string {
  return `【${kansuji(test.sections.findIndex(s => s.id === section.id) + 1)}】${material ?? materialNames[section.id] ?? NAMES[section.kind] ?? ''}`
}

/** 選んでいるものを紙面の番号で書く（【三】問二） */
export function targetLabel(test: Test, target: Target): string {
  const si = test.sections.findIndex(s => s.id === target.sectionId)
  const qi = target.questionId ? test.sections[si].questions.findIndex(q => q.id === target.questionId) : -1
  return `【${kansuji(si + 1)}】${qi >= 0 ? `問${kansuji(qi + 1)}` : ''}`
}

/** 選んでいるものが今のテストにあるときだけ返す（消えたら選択も外れる） */
export function liveTarget(test: Test, target: Target | null): Target | null {
  const section = target && test.sections.find(s => s.id === target.sectionId)
  if (!section) return null
  if (target.questionId && !section.questions.some(q => q.id === target.questionId)) return null
  return target
}

export function draftedMessage(label: string, sectionId: string, rationales: DraftedRationale[], undo: ChatMessage['undo']): NewMessage {
  return {
    who: 'ai',
    text: `${label}の大問を作りました。問いごとの理由を確かめて、よければ確定してください。`,
    notes: {
      title: '提案の理由',
      label: `${label} AI の提案の理由`,
      items: rationales.map((r, i) => ({ head: `問${kansuji(i + 1)}（${r.standard}）`, text: r.rationale, outside: !r.inUnit })),
    },
    buttons: [{ label: `${label.match(/^【.+?】/)?.[0] ?? label}を確定する`, action: 'confirm', sectionId }, { label: '元に戻す', action: 'undo' }],
    undo,
  }
}

export function failedMessage(label: string, sectionId: string, errors: string[]): NewMessage {
  return {
    who: 'ai',
    text: `${label}の大問を作れませんでした。紙面は元のままです。`,
    notes: { title: '理由', label: `${label} 作れなかった理由`, items: errors.map(text => ({ text })) },
    buttons: [{ label: 'もう一度作ってもらう', action: 'redraft', sectionId }],
    error: true,
  }
}

/** ボタンがもう押せないか（同じまとまりのボタンを押した） */
export const buttonUsed = (message: ChatMessage, button: ChatButton) => (message.usedGroups ?? []).includes(button.group ?? '')
