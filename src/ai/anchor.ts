import type { ProseSegment } from '../model/schema.js'

/*
 * AI が本文から引用した文字列を、本文の中で探して傍線部を付ける。
 * 本文の文字は変えない。ルビは割らない。
 */

type Inline = Extract<ProseSegment, { kind: 'text' | 'ruby' | 'break' }>

export type Anchor = { key: string; quote: string; before?: string }

/** 傍線部を外して、地の文・ルビ・段落の区切りだけの並びに戻す（隣り合う地の文はつなぐ） */
export function unmark(segments: ProseSegment[]): Inline[] {
  const out: Inline[] = []
  for (const s of segments.flatMap(s => (s.kind === 'mark' ? s.children : [s]))) {
    const last = out.at(-1)
    if (s.kind === 'text' && last?.kind === 'text') out[out.length - 1] = { kind: 'text', text: last.text + s.text }
    else out.push(s)
  }
  return out
}

// 本文の文字列の上での字。段落の区切りは改行一字として数える
const charsOf = (s: Inline) => (s.kind === 'text' ? s.text : s.kind === 'ruby' ? s.base : '\n')

/** ルビの親文字と地の文をつないだ、本文の文字列（段落の間は改行） */
export function plainText(segments: ProseSegment[]): string {
  return unmark(segments).map(charsOf).join('')
}

function indexesOf(text: string, quote: string): number[] {
  const out: number[] = []
  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) out.push(i)
  return out
}

export type Anchored =
  | { ok: true; segments: ProseSegment[]; ids: Map<string, string> }
  | { ok: false; errors: string[] }

/** 引用ごとに傍線部を付けた本文と、AI のキーからシステムの識別子への対応を返す */
export function anchorMarks(segments: ProseSegment[], anchors: Anchor[], idOf: (index: number) => string): Anchored {
  const inline = unmark(segments)
  const plain = inline.map(charsOf).join('')
  const errors: string[] = []
  const spans: Array<{ start: number; end: number; id: string }> = []
  const ids = new Map<string, string>()

  anchors.forEach((a, i) => {
    if (a.quote.includes('\n')) {
      errors.push(`傍線部${a.key}「${a.quote}」が段落をまたいでいる（一つの段落の中から引用する）`)
      return
    }
    let found = indexesOf(plain, a.quote)
    if (found.length > 1 && a.before) found = found.filter(at => plain.slice(0, at).endsWith(a.before!))
    if (found.length === 0) errors.push(`傍線部${a.key}「${a.quote}」が本文にない（本文から一字も変えずに引用する）`)
    else if (found.length > 1) errors.push(`傍線部${a.key}「${a.quote}」が本文に${found.length}回出てくる（before に直前の数文字を書く）`)
    else {
      if (ids.has(a.key)) errors.push(`傍線部のキー${a.key}が重複している`)
      ids.set(a.key, idOf(i))
      spans.push({ start: found[0], end: found[0] + a.quote.length, id: idOf(i) })
    }
  })
  spans.sort((x, y) => x.start - y.start)
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].start < spans[i - 1].end) errors.push('傍線部どうしが重なっている')
  }
  if (errors.length) return { ok: false, errors }

  // 本文の区切りを、傍線部の端で切り分ける
  const cuts = new Set(spans.flatMap(s => [s.start, s.end]))
  const pieces: Array<{ start: number; seg: Inline }> = []
  let at = 0
  for (const seg of inline) {
    if (seg.kind === 'break') {
      pieces.push({ start: at, seg })
      at += 1
      continue
    }
    if (seg.kind === 'ruby') {
      for (let c = at + 1; c < at + seg.base.length; c++) {
        if (cuts.has(c)) return { ok: false, errors: [`傍線部の端がルビの付いた「${seg.base}」の途中にかかっている`] }
      }
      pieces.push({ start: at, seg })
      at += seg.base.length
      continue
    }
    let from = 0
    for (let c = 1; c < seg.text.length; c++) {
      if (cuts.has(at + c)) {
        pieces.push({ start: at + from, seg: { kind: 'text', text: seg.text.slice(from, c) } })
        from = c
      }
    }
    pieces.push({ start: at + from, seg: { kind: 'text', text: seg.text.slice(from) } })
    at += seg.text.length
  }

  const out: ProseSegment[] = []
  for (const p of pieces) {
    const span = spans.find(s => s.start <= p.start && p.start < s.end)
    if (!span) {
      out.push(p.seg)
      continue
    }
    if (p.seg.kind === 'break') continue // 引用は改行を含まないので、傍線部の中に段落の区切りは来ない
    const last = out.at(-1)
    if (last?.kind === 'mark' && last.id === span.id) last.children.push(p.seg)
    else out.push({ kind: 'mark', id: span.id, children: [p.seg] })
  }
  return { ok: true, segments: out, ids }
}
