import type { KanbunChar, KanbunToken, ProseSegment, StemSegment } from './schema.js'

/*
 * サンプルや試験データを短く書くための記法。保存形式ではない。
 *   本文の傍線部 <m:識別子>…</m>  ルビ 親字{よみ}
 *   漢文 字(送り仮名)[返り点]
 *   問い文 {傍線部:識別子} {番号:識別子} {範囲}
 *   項目の傍線 [[…]]
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
