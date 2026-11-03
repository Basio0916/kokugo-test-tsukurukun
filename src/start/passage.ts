import type { KanbunPassage, ProsePassage, ProseSegment } from '../model/schema'

/** 古文の出典に書く作品名: 教材名の中のかぎかっこの作品名、なければ「――」の前（扇の的 ――「平家物語」から → 平家物語） */
export function workOf(material: string): string {
  return material.match(/「(.+?)」/)?.[1] ?? material.split('――')[0].trim()
}

/**
 * 貼り付けた本文から本文のデータを作る。改行で段落に分け、空の行は捨て、段落の頭の字下げの空白は取り除く
 * （字下げは紙面が付ける）。出典は「作者「教材名」より」。本文が空なら null。
 */
export function pastedPassage(text: string, material: string, author: string): ProsePassage | null {
  const paragraphs = text
    .split(/\r?\n/)
    .map(line => line.trim()) // trim は全角の空白も取り除く
    .filter(line => line.length > 0)
  if (paragraphs.length === 0) return null
  const segments: ProseSegment[] = paragraphs.flatMap((p, i) =>
    i === 0 ? [{ kind: 'text' as const, text: p }] : [{ kind: 'break' as const }, { kind: 'text' as const, text: p }],
  )
  return { kind: 'prose', segments, source: `${author.trim()}「${material}」より` }
}

/** 白文（一行に一句）から、返り点と送り仮名のない漢文の本文を作る。空白は除き、空の行は捨てる。白文が空なら null */
export function pastedKanbun(title: string, author: string, white: string, notes: string): KanbunPassage | null {
  const lines = white.split(/\r?\n/).map(l => l.replace(/\s/g, '')).filter(Boolean)
  if (lines.length === 0) return null
  return {
    kind: 'kanbun',
    title: title.trim(),
    author: author.trim(),
    lines: lines.map(l => [...l].map(char => ({ kind: 'char' as const, char }))),
    notes: notes.split(/\r?\n/).map(n => n.trim()).filter(Boolean),
  }
}
