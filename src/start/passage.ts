import type { ProsePassage, ProseSegment } from '../model/schema'

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
