import type { FillSegment, KanbunChar, KanbunToken, ProseSegment, StemSegment } from './schema.js'

/*
 * サンプルや試験データを短く書くための記法。保存形式ではない。
 *   本文の傍線部 <m:識別子>…</m>  ルビ 親字{よみ}
 *   漢文 字(送り仮名)[返り点]
 *   問い文 {傍線部:識別子} {番号:識別子} {範囲}
 *   項目の傍線 [[…]]
 *   穴埋め文の空欄 [[答え]] [[答え｜字数の上限]]（AI の返答と、小問を直す欄でも使う）
 */

type Inline = Extract<ProseSegment, { kind: 'text' | 'ruby' }>

function inline(src: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of src.matchAll(/(.)\{([^}]+)\}/g)) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) })
    out.push({ kind: 'ruby', base: m[1], reading: m[2] })
    last = m.index + m[0].length
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) })
  return out
}

// <m:識別子>…</m> で区切り、地の文と傍線部の中身をそれぞれ読む
function splitMarks<T>(src: string, read: (s: string) => T[]): Array<T | { kind: 'mark'; id: string; children: T[] }> {
  const out: Array<T | { kind: 'mark'; id: string; children: T[] }> = []
  let last = 0
  for (const m of src.matchAll(/<m:([^>]+)>(.*?)<\/m>/g)) {
    if (m.index > last) out.push(...read(src.slice(last, m.index)))
    out.push({ kind: 'mark', id: m[1], children: read(m[2]) })
    last = m.index + m[0].length
  }
  if (last < src.length) out.push(...read(src.slice(last)))
  return out
}

export function prose(src: string): ProseSegment[] {
  return splitMarks(src, inline)
}

function kanbunChars(src: string): KanbunChar[] {
  const out: KanbunChar[] = []
  for (const m of src.matchAll(/(.)(?:\(([^)]+)\))?(?:\[([^\]]+)\])?/gu)) {
    const c: KanbunChar = { kind: 'char', char: m[1] }
    if (m[2]) c.okurigana = m[2]
    if (m[3]) c.kaeriten = m[3]
    out.push(c)
  }
  return out
}

export function kanbunLine(src: string): KanbunToken[] {
  return splitMarks(src, kanbunChars)
}

export function stem(src: string): StemSegment[] {
  const out: StemSegment[] = []
  let last = 0
  for (const m of src.matchAll(/\{傍線部:([^}]+)\}|\{番号:([^}]+)\}|\{範囲\}/g)) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) })
    if (m[1]) out.push({ kind: 'markRef', id: m[1], form: 'label' })
    else if (m[2]) out.push({ kind: 'markRef', id: m[2], form: 'number' })
    else out.push({ kind: 'choiceRange' })
    last = m.index + m[0].length
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) })
  return out
}

export type ParsedFill = { ok: true; fill: FillSegment[] } | { ok: false; errors: string[] }

const halfDigits = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

/** 穴埋め文の記法を読む。先生が IME で打つので、区切りと数字は全角でも半角でもよい */
export function parseFill(src: string): ParsedFill {
  const fill: FillSegment[] = []
  const errors: string[] = []
  const text = (s: string) => {
    if (!s) return
    if (/\[\[|\]\]/.test(s)) errors.push('「[[」「]]」の組がそろっていない')
    fill.push({ kind: 'text', text: s })
  }
  let last = 0
  for (const m of src.matchAll(/\[\[(.*?)\]\]/g)) {
    text(src.slice(last, m.index))
    last = m.index + m[0].length
    const [answer, limit, ...rest] = m[1].split(/[｜|]/).map(s => s.trim())
    if (!answer) errors.push(`「${m[0]}」に答えがない`)
    const digits = limit === undefined ? undefined : halfDigits(limit)
    if (digits !== undefined && (!/^[0-9]+$/.test(digits) || rest.length)) errors.push(`「${m[0]}」の字数は数字で書く`)
    fill.push({ kind: 'blank', answer, ...(digits !== undefined && { charLimit: Number(digits) }) })
  }
  text(src.slice(last))
  return errors.length ? { ok: false, errors } : { ok: true, fill }
}

export function fillToText(fill: FillSegment[]): string {
  return fill.map(s => (s.kind === 'text' ? s.text : `[[${s.answer}${s.charLimit === undefined ? '' : `｜${s.charLimit}`}]]`)).join('')
}

export function itemSegments(src: string): Array<{ kind: 'text'; text: string } | { kind: 'underline'; text: string }> {
  const out: Array<{ kind: 'text'; text: string } | { kind: 'underline'; text: string }> = []
  let last = 0
  for (const m of src.matchAll(/\[\[(.+?)\]\]/g)) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) })
    out.push({ kind: 'underline', text: m[1] })
    last = m.index + m[0].length
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) })
  return out
}
