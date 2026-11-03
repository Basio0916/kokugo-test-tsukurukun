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

type Span = { start: number; end: number; id: string }

// 引用の本文の中の位置。見つからない・一つに決まらないときは理由
function locate(plain: string, a: Anchor): { start: number; end: number } | string {
  if (a.quote.includes('\n')) return `傍線部${a.key}「${a.quote}」が段落をまたいでいる（一つの段落の中から引用する）`
  let found = indexesOf(plain, a.quote)
  if (found.length > 1 && a.before) found = found.filter(at => plain.slice(0, at).endsWith(a.before!))
  if (found.length === 0) return `傍線部${a.key}「${a.quote}」が本文にない（本文から一字も変えずに引用する）`
  if (found.length > 1) return `傍線部${a.key}「${a.quote}」が本文に${found.length}回出てくる（before に直前の数文字を書く）`
  return { start: found[0], end: found[0] + a.quote.length }
}

/** 本文に今付いている傍線部の、本文の文字列の上での範囲 */
export function existingSpans(segments: ProseSegment[]): Span[] {
  const spans: Span[] = []
  let at = 0
  for (const s of segments) {
    const length = s.kind === 'mark' ? s.children.map(charsOf).join('').length : charsOf(s).length
    if (s.kind === 'mark') spans.push({ start: at, end: at + length, id: s.id })
    at += length
  }
  return spans
}

/** 引用ごとに傍線部を付けた本文と、AI のキーからシステムの識別子への対応を返す（今の傍線部は外して付け直す） */
export function anchorMarks(segments: ProseSegment[], anchors: Anchor[], idOf: (index: number) => string): Anchored {
  const inline = unmark(segments)
  const plain = inline.map(charsOf).join('')
  const errors: string[] = []
  const spans: Span[] = []
  const ids = new Map<string, string>()

  anchors.forEach((a, i) => {
    const found = locate(plain, a)
    if (typeof found === 'string') return errors.push(found)
    if (ids.has(a.key)) errors.push(`傍線部のキー${a.key}が重複している`)
    ids.set(a.key, idOf(i))
    spans.push({ ...found, id: idOf(i) })
  })
  if (overlaps(spans)) errors.push('傍線部どうしが重なっている')
  if (errors.length) return { ok: false, errors }
  return withSpans(inline, spans, ids)
}

/**
 * 今の傍線部を残したまま、引用ごとに傍線部を付ける。引用が今の傍線部と同じ範囲ならその傍線部を使い、
 * 一部だけ重なるなら不正。新しい傍線部の識別子は idOf で作る（呼ぶ側が重ならないものを渡す）。
 */
export function addMarks(segments: ProseSegment[], anchors: Anchor[], idOf: (index: number) => string): Anchored {
  const inline = unmark(segments)
  const plain = inline.map(charsOf).join('')
  const current = existingSpans(segments)
  const errors: string[] = []
  const added: Span[] = []
  const ids = new Map<string, string>()

  anchors.forEach((a, i) => {
    const found = locate(plain, a)
    if (typeof found === 'string') return errors.push(found)
    const same = current.find(s => s.start === found.start && s.end === found.end)
    if (same) return ids.set(a.key, same.id)
    if (current.some(s => s.start < found.end && found.start < s.end)) {
      return errors.push(`傍線部${a.key}「${a.quote}」が、今ある傍線部と一部だけ重なっている（重ならない箇所か、今の傍線部と同じ範囲を引用する）`)
    }
    const id = idOf(i)
    ids.set(a.key, id)
    added.push({ ...found, id })
  })
  if (overlaps(added)) errors.push('傍線部どうしが重なっている')
  if (errors.length) return { ok: false, errors }
  return withSpans(inline, [...current, ...added], ids)
}

function overlaps(spans: Span[]): boolean {
  const sorted = [...spans].sort((x, y) => x.start - y.start)
  return sorted.some((s, i) => i > 0 && s.start < sorted[i - 1].end)
}

// 地の文・ルビ・段落の区切りの並びを、傍線部の範囲で包み直す
function withSpans(inline: Inline[], spans: Span[], ids: Map<string, string>): Anchored {
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
