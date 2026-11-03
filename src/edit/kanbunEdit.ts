import { lineText } from '../model/kanbun.js'
import type { KanbunChar, KanbunPassage, KanbunToken } from '../model/schema.js'
import { charMap } from './passageEdit.js'

/*
 * 漢文の白文を直す。句ごとに、同じ位置の句の白文が同じなら返り点・送り仮名・傍線部をそのまま残し、
 * 変わった句は字の差分で傍線部を残った字に付け直して、返り点と送り仮名を外す（AI が付け直す）。
 */

/** 白文を一行に一句でつないだ文字列 */
export const kanbunToText = (passage: KanbunPassage) => passage.lines.map(lineText).join('\n')

// 変わった句: 傍線部を残った字に付け直し、返り点と送り仮名のない字にする
function relineMarks(old: KanbunToken[], white: string): KanbunToken[] {
  const map = charMap(lineText(old), white)
  const spans: Array<{ id: string; start: number; end: number }> = []
  let pos = 0
  for (const t of old) {
    const len = t.kind === 'mark' ? t.children.length : 1
    if (t.kind === 'mark') {
      const kept = Array.from({ length: len }, (_, k) => map[pos + k]).filter(k => k >= 0)
      if (kept.length) spans.push({ id: t.id, start: Math.min(...kept), end: Math.max(...kept) + 1 })
    }
    pos += len
  }
  const chars: KanbunChar[] = [...white].map(char => ({ kind: 'char', char }))
  const out: KanbunToken[] = []
  let i = 0
  for (const s of spans) {
    out.push(...chars.slice(i, s.start))
    out.push({ kind: 'mark', id: s.id, children: chars.slice(s.start, s.end) })
    i = s.end
  }
  out.push(...chars.slice(i))
  return out
}

/** 白文（一行に一句）で直す。空白は除き、空の行は捨てる。changed は訓読を付け直す句の番号。白文が空なら null */
export function rebuildKanbun(passage: KanbunPassage, text: string): { passage: KanbunPassage; changed: number[] } | null {
  const whites = text.split(/\r?\n/).map(l => l.replace(/\s/g, '')).filter(Boolean)
  if (whites.length === 0) return null
  const changed: number[] = []
  const lines = whites.map((white, i) => {
    const old = passage.lines[i]
    if (old && lineText(old) === white) return old
    changed.push(i)
    return old ? relineMarks(old, white) : [...white].map((char): KanbunToken => ({ kind: 'char', char }))
  })
  return { passage: { ...passage, lines }, changed }
}
