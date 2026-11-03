import { markNumbers, markRefsOf } from '../model/derive.js'
import { lineText } from '../model/kanbun.js'
import type { ProseSegment, Section } from '../model/schema.js'
import { circled } from '../paper/kansuji.js'

/*
 * 本文を直す。本文は「段落を改行でつないだ文字列」にして先生に直してもらい、
 * 直す前と後の文字の差分から、傍線部とルビを残った文字に付け直す（傍線は文字に付いて動く）。
 */

type Inline = Extract<ProseSegment, { kind: 'text' | 'ruby' }>

/** 本文を文字列にする。段落の区切りは改行、ルビは親字だけ */
export function passageToText(segments: ProseSegment[]): string {
  const inline = (s: Inline) => (s.kind === 'text' ? s.text : s.base)
  return segments.map(s => (s.kind === 'break' ? '\n' : s.kind === 'mark' ? s.children.map(inline).join('') : inline(s))).join('')
}

// 差分の手数の上限。これより大きく書き換えたところは、残った文字がないものとして扱う
const MAX_EDITS = 1000

/** 直す前の各文字が、直した後の何文字目に残ったか（残らなければ -1）。文字単位の差分（Myers）で求める */
export function charMap(a: string, b: string): number[] {
  const map = new Array<number>(a.length).fill(-1)
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) map[pre] = pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) {
    map[a.length - 1 - suf] = b.length - 1 - suf
    suf++
  }
  const A = a.slice(pre, a.length - suf)
  const B = b.slice(pre, b.length - suf)
  const n = A.length, m = B.length
  const limit = Math.min(n + m, MAX_EDITS)
  const off = limit + 1
  const v = new Int32Array(2 * limit + 3)
  const trace: Int32Array[] = []
  let found = n === 0 && m === 0
  for (let d = 0; d <= limit && !found; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
      let y = x - k
      while (x < n && y < m && A[x] === B[y]) { x++; y++ }
      v[off + k] = x
      if (x >= n && y >= m) { found = true; break }
    }
  }
  if (!found) return map
  // 終わりからたどり、斜めに進んだ（同じ文字の）ところを対応づける
  let x = n, y = m
  for (let d = trace.length - 1; d > 0; d--) {
    const t = trace[d]
    const k = x - y
    const prevK = k === -d || (k !== d && t[off + k - 1] < t[off + k + 1]) ? k + 1 : k - 1
    const prevX = t[off + prevK], prevY = prevX - prevK
    while (x > prevX && y > prevY) { x--; y--; map[pre + x] = pre + y }
    x = prevX
    y = prevY
  }
  while (x > 0 && y > 0) { x--; y--; map[pre + x] = pre + y }
  return map
}

/** 直す前と後で変わった箇所（直前の数文字を添えた、直す前と後の文の組）。AI に何を直したかを伝えるのに使う */
export function changedParts(a: string, b: string): Array<{ before: string; after: string }> {
  const map = charMap(a, b)
  const parts: Array<{ before: string; after: string }> = []
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && map[i] === j) { i++; j++; continue }
    const i0 = i, j0 = j
    while (i < a.length && map[i] < 0) i++
    j = i < a.length ? map[i] : b.length
    parts.push({ before: a.slice(Math.max(0, i0 - 8), i), after: b.slice(Math.max(0, j0 - 8), j) })
  }
  return parts
}

type OldChar = { mark?: string; ruby?: number }
type Ruby = { base: string; reading: string; start: number }

function flatten(segments: ProseSegment[]) {
  const chars: OldChar[] = []
  const rubies: Ruby[] = []
  const put = (s: Inline, mark?: string) => {
    if (s.kind === 'text') for (let i = 0; i < s.text.length; i++) chars.push({ mark })
    else {
      rubies.push({ base: s.base, reading: s.reading, start: chars.length })
      for (let i = 0; i < s.base.length; i++) chars.push({ mark, ruby: rubies.length - 1 })
    }
  }
  for (const s of segments) {
    if (s.kind === 'break') chars.push({})
    else if (s.kind === 'mark') s.children.forEach(c => put(c, s.id))
    else put(s)
  }
  return { chars, rubies }
}

/** 直した後の文字列の上での、傍線部の範囲（両端を含む）。改行の前までにする */
export function markRanges(segments: ProseSegment[], text: string): Map<string, [number, number]> {
  const old = passageToText(segments)
  const map = charMap(old, text)
  const { chars } = flatten(segments)
  const ranges = new Map<string, [number, number]>()
  chars.forEach((c, i) => {
    if (!c.mark || map[i] < 0) return
    const r = ranges.get(c.mark)
    ranges.set(c.mark, r ? [r[0], map[i]] : [map[i], map[i]])
  })
  for (const [id, [s, e]] of ranges) {
    const nl = text.indexOf('\n', s)
    ranges.set(id, [s, nl >= 0 && nl <= e ? nl - 1 : e])
  }
  for (const [id, [s, e]] of ranges) if (e < s) ranges.delete(id)
  return ranges
}

/** 文字を入れる位置（選んだ範囲）が傍線部の中にあれば、その傍線部の識別子 */
export function markAtCaret(segments: ProseSegment[], text: string, start: number, end: number): string | undefined {
  for (const [id, [s, e]] of markRanges(segments, text)) {
    if (start === end ? s < start && start <= e : start <= e && end > s) return id
  }
  return undefined
}

export type Rebuilt = { segments: ProseSegment[]; lostRuby: string[] }

/** 直した文字列から本文を組み立て直す。空の行は捨て、行の頭と終わりの空白は除く。本文が空なら null */
export function rebuildPassage(segments: ProseSegment[], text: string): Rebuilt | null {
  const old = passageToText(segments)
  const map = charMap(old, text)
  const { rubies } = flatten(segments)
  const ranges = markRanges(segments, text)
  const markOf = new Array<string | undefined>(text.length)
  for (const [id, [s, e]] of ranges) for (let i = s; i <= e; i++) markOf[i] = id

  // ルビは、親字がすべて同じ並びで残り、傍線部の境目にかからないときだけ付け直す
  const rubyAt = new Map<number, Ruby>()
  const lostRuby: string[] = []
  rubies.forEach(r => {
    const at = [...r.base].map((_, j) => map[r.start + j])
    const kept = at.every((p, j) => p >= 0 && (j === 0 || p === at[j - 1] + 1)) && text.slice(at[0], at[0] + r.base.length) === r.base
      && at.every(p => markOf[p] === markOf[at[0]])
    if (kept) rubyAt.set(at[0], r)
    else lostRuby.push(r.base)
  })
  const out: ProseSegment[] = []
  let pos = 0
  for (const line of text.split('\n')) {
    const lineStart = pos
    pos += line.length + 1
    const trimmed = line.trim()
    if (!trimmed) continue
    const s = lineStart + line.indexOf(trimmed)
    const e = s + trimmed.length
    if (out.length) out.push({ kind: 'break' })
    let i = s
    while (i < e) {
      const mark = markOf[i]
      let j = i
      while (j < e && markOf[j] === mark) j++
      const inline: Inline[] = []
      let k = i
      while (k < j) {
        const r = rubyAt.get(k)
        if (r && k + r.base.length <= j) {
          inline.push({ kind: 'ruby', base: r.base, reading: r.reading })
          k += r.base.length
          continue
        }
        let t = k
        while (t < j && !(rubyAt.has(t) && t + rubyAt.get(t)!.base.length <= j)) t++
        inline.push({ kind: 'text', text: text.slice(k, t) })
        k = t
      }
      if (mark) out.push({ kind: 'mark', id: mark, children: inline })
      else out.push(...inline)
      i = j
    }
  }
  return out.length ? { segments: out, lostRuby } : null
}

export type Issue = { key: string; text: string }

// 傍線部の文字（文章はルビの親字、漢文は送り仮名と返り点を除いた字）
const markTexts = (section: Section): Map<string, string> => {
  const p = section.passage
  if (p?.kind === 'prose') return new Map(p.segments.flatMap(s => (s.kind === 'mark' ? [[s.id, passageToText(s.children)] as const] : [])))
  if (p?.kind === 'kanbun') return new Map(p.lines.flat().flatMap(t => (t.kind === 'mark' ? [[t.id, lineText(t.children)] as const] : [])))
  return new Map()
}

// 本文の文字（段落・句の区切りは除く）
const plainOf = (section: Section) => {
  const p = section.passage
  if (p?.kind === 'prose') return passageToText(p.segments).replace(/\n/g, '')
  return p?.kind === 'kanbun' ? p.lines.map(lineText).join('') : ''
}

/**
 * 本文を直す前と後の大問を比べ、小問ごとの食い違いを返す。key は番号が振り直っても変わらない。
 * acked は小問ごとの、先生が「このままにする」とした key。
 */
export function passageIssues(before: Section, after: Section, acked: Record<string, string[]> = {}): Record<string, Issue[]> {
  if (!before.passage || before.passage.kind !== after.passage?.kind) return {}
  const oldText = plainOf(before)
  const newText = plainOf(after)
  const oldNumbers = markNumbers(before), newNumbers = markNumbers(after)
  const oldMarkTexts = markTexts(before), newMarkTexts = markTexts(after)
  const oldMarks = new Set(oldMarkTexts.values())
  const result: Record<string, Issue[]> = {}
  for (const q of after.questions) {
    const issues: Issue[] = []
    for (const id of markRefsOf(q)) {
      const was = oldMarkTexts.get(id)
      if (was === undefined) continue
      const now = newMarkTexts.get(id)
      if (now === undefined) issues.push({ key: `gone:${id}`, text: `傍線部${circled(oldNumbers.get(id) ?? 0)}「${was}」が本文から消えました` })
      else if (now !== was) issues.push({ key: `changed:${id}:${now}`, text: `傍線部${circled(newNumbers.get(id) ?? 0)}の文字が「${was}」から「${now}」に変わりました` })
    }
    if (q.format === 'extract' && q.answer && oldText.includes(q.answer) && !newText.includes(q.answer)) {
      issues.push({ key: `answer:${q.answer}`, text: `抜き出しの答え「${q.answer}」が本文に見当たりません` })
    }
    const stemText = q.stem.map(s => (s.kind === 'text' ? s.text : '')).join('')
    for (const [, quote] of stemText.matchAll(/「([^」]{2,})」/g)) {
      if (/[〜…]/.test(quote) || oldMarks.has(quote)) continue
      if (oldText.includes(quote) && !newText.includes(quote)) issues.push({ key: `quote:${quote}`, text: `問い文が引用している「${quote}」が本文に見当たりません` })
    }
    const open = issues.filter(i => !(acked[q.id] ?? []).includes(i.key))
    if (open.length) result[q.id] = open
  }
  return result
}
