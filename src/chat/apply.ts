import type { ChatChange } from '../ai/chat'
import { removeQuestion, removeSection, reorderQuestions, reorderSections, replaceSection, sortQuestionsByPassage } from '../edit/operations'
import type { Section, Test } from '../model/schema'
import type { Target } from './messages'

/*
 * 会話の返答の変更を、今のテストに当てはめる。AI に送ったとき（sent）から、変更が指す大問が紙面で変わっていたら入れない。
 * 大問の作り直しは AI にもう一度頼むので、ここではどの大問かを返すだけにする。
 */

export type Applied =
  | { kind: 'applied'; test: Test; changed: Target | null; unconfirm?: string }
  | { kind: 'redraft'; section: Section; wish: string }
  // 小問を足す: 画面が案を作って会話に並べる。at は差し込む位置
  | { kind: 'addQuestion'; section: Section; at: number }
  | { kind: 'stale' }
  | { kind: 'failed'; errors: string[] }

type Changing = Exclude<ChatChange, { kind: 'none' } | { kind: 'addSection' }>

export function applyChatChange(sent: Test, current: Test, change: Changing): Applied {
  const same = (sectionId: string) => {
    const before = sent.sections.find(s => s.id === sectionId)
    return before !== undefined && before === current.sections.find(s => s.id === sectionId)
  }
  switch (change.kind) {
    case 'reviseQuestion': {
      if (!same(change.sectionId)) return { kind: 'stale' }
      const r = replaceSection(current, change.section)
      if (!r.ok) return { kind: 'failed', errors: r.errors }
      return { kind: 'applied', test: r.test, changed: { sectionId: change.sectionId, questionId: change.questionId }, unconfirm: change.sectionId }
    }
    case 'redraftSection': {
      if (!same(change.sectionId)) return { kind: 'stale' }
      return { kind: 'redraft', section: current.sections.find(s => s.id === change.sectionId)!, wish: change.wish }
    }
    case 'reorderSections': {
      // 大問の顔ぶれが送ったときと同じなら、中身が変わっていても並べ替えられる
      const ids = (t: Test) => t.sections.map(s => s.id).sort().join()
      if (ids(sent) !== ids(current)) return { kind: 'stale' }
      const r = reorderSections(current, change.order)
      if (!r.ok) return { kind: 'failed', errors: r.errors }
      return { kind: 'applied', test: r.test, changed: null }
    }
    case 'reorderQuestions':
    case 'sortQuestions': {
      if (!same(change.sectionId)) return { kind: 'stale' }
      const r = change.kind === 'sortQuestions' ? { ok: true as const, test: sortQuestionsByPassage(current, change.sectionId) } : reorderQuestions(current, change.sectionId, change.order)
      if (!r.ok) return { kind: 'failed', errors: r.errors }
      return { kind: 'applied', test: r.test, changed: { sectionId: change.sectionId }, unconfirm: change.sectionId }
    }
    case 'addQuestion': {
      const section = current.sections.find(s => s.id === change.sectionId)
      if (!section) return { kind: 'stale' }
      const after = change.afterQuestionId ? section.questions.findIndex(q => q.id === change.afterQuestionId) : -1
      return { kind: 'addQuestion', section, at: after >= 0 ? after + 1 : section.questions.length }
    }
    case 'remove': {
      const section = current.sections.find(s => s.id === change.sectionId)
      if (!section || (change.questionId && !section.questions.some(q => q.id === change.questionId))) return { kind: 'stale' }
      if (!change.questionId) return { kind: 'applied', test: removeSection(current, change.sectionId), changed: null }
      return { kind: 'applied', test: removeQuestion(current, change.sectionId, change.questionId), changed: null, unconfirm: change.sectionId }
    }
  }
}
