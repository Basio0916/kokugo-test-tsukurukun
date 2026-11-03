import { choiceLabel } from '../model/derive'
import type { StemSegment } from '../model/schema'
import { circled } from '../paper/kansuji'

/*
 * 問い文を、紙面と同じ番号の印の付いた文字列にして直せるようにする。
 *   {傍線部①} … 「傍線部①」の形の参照   {①} … 「①」だけの参照   {ア〜エ} … 選択肢の範囲
 */

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

export function stemToText(stem: StemSegment[], numbers: Map<string, number>, choiceCount: number): string {
  return stem.map(s => {
    if (s.kind === 'text') return s.text
    if (s.kind === 'choiceRange') return `{ア〜${choiceLabel(Math.max(choiceCount, 2) - 1)}}`
    const n = numbers.get(s.id)
    const mark = n ? circled(n) : '？'
    return s.form === 'label' ? `{傍線部${mark}}` : `{${mark}}`
  }).join('')
}

export type ParsedStem = { ok: true; stem: StemSegment[] } | { ok: false; errors: string[] }

export function textToStem(text: string, numbers: Map<string, number>): ParsedStem {
  const idOf = new Map([...numbers].map(([id, n]) => [n, id]))
  const stem: StemSegment[] = []
  const errors: string[] = []
  let last = 0
  for (const m of text.matchAll(/\{(傍線部)?([^{}]*)\}/g)) {
    if (m.index > last) stem.push({ kind: 'text', text: text.slice(last, m.index) })
    last = m.index + m[0].length
    const body = m[2]
    if (!m[1] && /^ア〜[イ-ン]$/.test(body)) {
      stem.push({ kind: 'choiceRange' })
      continue
    }
    const n = CIRCLED.indexOf(body) + 1
    const id = n > 0 ? idOf.get(n) : undefined
    if (!id) {
      errors.push(`「${m[0]}」の傍線部が本文にない（紙面にある番号を使う）`)
      continue
    }
    stem.push({ kind: 'markRef', id, form: m[1] ? 'label' : 'number' })
  }
  if (last < text.length) stem.push({ kind: 'text', text: text.slice(last) })
  if (/[{}]/.test(stem.flatMap(s => (s.kind === 'text' ? [s.text] : [])).join(''))) errors.push('「{」「}」の組がそろっていない')
  return errors.length ? { ok: false, errors } : { ok: true, stem }
}
