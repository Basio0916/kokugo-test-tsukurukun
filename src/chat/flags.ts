import type { Issue } from '../edit/passageEdit'
import type { Test } from '../model/schema'
import { kansuji } from '../paper/kansuji'
import type { NewMessage } from './messages'

/* 本文を直したあとの「要確認」。小問ごとの食い違いを、テストのデータの外で持つ */

// 「大問/小問」→ 食い違い
export type Flags = Record<string, Issue[]>

export const flagKey = (sectionId: string, questionId: string) => `${sectionId}/${questionId}`

/** 大問の小問ごとの食い違いを、今の要確認に足す（同じ key は一つにする） */
export function mergeFlags(flags: Flags, sectionId: string, found: Record<string, Issue[]>): Flags {
  const next = { ...flags }
  for (const [questionId, issues] of Object.entries(found)) {
    const key = flagKey(sectionId, questionId)
    const have = next[key] ?? []
    next[key] = [...have, ...issues.filter(i => !have.some(h => h.key === i.key))]
  }
  return next
}

/** 今のテストにある小問の要確認だけを残す */
export function liveFlags(test: Test, flags: Flags): Flags {
  const keys = new Set(test.sections.flatMap(s => s.questions.map(q => flagKey(s.id, q.id))))
  return Object.fromEntries(Object.entries(flags).filter(([k, v]) => keys.has(k) && v.length))
}

/** 大問の要確認の小問を並べ、小問ごとに「AIに直してもらう／このままにする／消す」を付けたメッセージ。なければ null */
export function flagsMessage(test: Test, sectionId: string, flags: Flags, note = ''): NewMessage | null {
  const si = test.sections.findIndex(s => s.id === sectionId)
  const flagged = (test.sections[si]?.questions ?? []).flatMap((q, i) => {
    const issues = flags[flagKey(sectionId, q.id)]
    return issues?.length ? [{ id: q.id, label: `問${kansuji(i + 1)}`, issues }] : []
  })
  if (!flagged.length) return null
  return {
    who: 'ai',
    text: `次の小問は、直した本文と食い違っているかもしれません。紙面に「要確認」の印を付けました。それぞれ、どうするか選んでください。${note}`,
    notes: { title: '要確認', label: `【${kansuji(si + 1)}】要確認の小問`, items: flagged.flatMap(f => f.issues.map(i => ({ head: f.label, text: i.text }))) },
    buttons: flagged.flatMap(f => [
      { label: `${f.label}をAIに直してもらう`, action: 'fixFlag' as const, sectionId, questionId: f.id, group: f.id },
      { label: `${f.label}はこのままにする`, action: 'keepFlag' as const, sectionId, questionId: f.id, group: f.id },
      { label: `${f.label}を消す`, action: 'removeFlagged' as const, sectionId, questionId: f.id, group: f.id },
    ]),
  }
}
