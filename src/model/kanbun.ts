import { kanbunLine } from './notation.js'
import type { KanbunChar, KanbunPassage, KanbunToken } from './schema.js'

/*
 * 漢文の句。返り点が決まった値で、対応がとれて読む順が決まるかを確かめる。
 * 句は「字(送り仮名)[返り点]」の記法で読み書きする（AI の返答と、先生が直す欄で同じ記法）。
 */

export const KAERITEN = ['レ', '一', '二', '三', '上', '中', '下', '一レ', '上レ'] as const

type Result<T> = ({ ok: true } & T) | { ok: false; errors: string[] }

/** 句の字（傍線部の中の字も含めて並べる） */
export function lineChars(line: KanbunToken[]): KanbunChar[] {
  return line.flatMap(t => (t.kind === 'char' ? [t] : t.children))
}

/** 句の白文 */
export const lineText = (line: KanbunToken[]) => lineChars(line).map(c => c.char).join('')

/** 句を記法にする（傍線部は書かない） */
export function lineNotation(line: KanbunToken[]): string {
  return lineChars(line).map(c => `${c.char}${c.okurigana ? `(${c.okurigana})` : ''}${c.kaeriten ? `[${c.kaeriten}]` : ''}`).join('')
}

/**
 * 返り点に従って読む順に字を並べる。レ点の字は次の字の後、二・三点の字は一点の字の後、中・下点の字は上点の字の後に読む。
 * 読まれないまま句が終わる字があれば、返り点の対応がとれていない。
 */
export function readingOrder(chars: KanbunChar[]): Result<{ order: string }> {
  const bad = chars.filter(c => c.kaeriten && !(KAERITEN as readonly string[]).includes(c.kaeriten))
  if (bad.length) return { ok: false, errors: bad.map(c => `返り点「${c.kaeriten}」は使えない（${KAERITEN.join('・')} のどれか）`) }
  const out: KanbunChar[] = []
  // レ点の字は、次の字を読んだ後に読む
  const after = new Map<KanbunChar, KanbunChar>()
  const waiting = new Map<string, KanbunChar>()
  const read = (c: KanbunChar) => {
    out.push(c)
    const k = c.kaeriten ?? ''
    const follow = k.startsWith('一') ? ['二', '三'] : k.startsWith('上') ? ['中', '下'] : []
    for (const f of follow) {
      const w = waiting.get(f)
      if (!w) continue
      waiting.delete(f)
      read(w)
    }
    const prev = after.get(c)
    if (prev) read(prev)
  }
  for (const [i, c] of chars.entries()) {
    const k = c.kaeriten
    if (k?.endsWith('レ')) {
      if (i + 1 >= chars.length) return { ok: false, errors: [`句の最後の字「${c.char}」にレ点がある`] }
      after.set(chars[i + 1], c)
    } else if (k === '二' || k === '三' || k === '中' || k === '下') {
      if (waiting.has(k)) return { ok: false, errors: [`「${k}」点が一つの句に二つある`] }
      waiting.set(k, c)
    } else read(c)
  }
  if (out.length !== chars.length) {
    const left = chars.filter(c => !out.includes(c)).map(c => `「${c.char}」`).join('')
    return { ok: false, errors: [`返り点の対応がとれず、${left}が読まれないまま句が終わる`] }
  }
  return { ok: true, order: out.map(c => c.char).join('') }
}

/** 記法の句を読み、字の並びが白文と同じで、返り点の対応がとれているかを確かめる */
export function readLine(notation: string, white: string): Result<{ chars: KanbunChar[] }> {
  const chars = lineChars(kanbunLine(notation.replace(/\s/g, '')))
  const text = chars.map(c => c.char).join('')
  if (text !== white) return { ok: false, errors: [`句「${white}」の字が「${text}」になっている（白文の字を一字も変えず、足さず、削らない）`] }
  const okuri = chars.filter(c => c.okurigana && !/^[ァ-ヶー]+$/.test(c.okurigana))
  if (okuri.length) return { ok: false, errors: okuri.map(c => `「${c.char}」の送り仮名「${c.okurigana}」をカタカナで書いていない`) }
  const order = readingOrder(chars)
  if (!order.ok) return { ok: false, errors: order.errors.map(e => `句「${white}」: ${e}`) }
  return { ok: true, chars }
}

/** 句の字を、元の句の傍線部と同じ位置で包み直す（字の並びは同じ） */
export function rewrap(old: KanbunToken[], chars: KanbunChar[]): KanbunToken[] {
  const out: KanbunToken[] = []
  let i = 0
  for (const t of old) {
    if (t.kind === 'char') out.push(chars[i++])
    else {
      out.push({ ...t, children: chars.slice(i, i + t.children.length) })
      i += t.children.length
    }
  }
  return out
}

/** 句ごとの記法で、返り点と送り仮名を直す。白文の字は変えられない。傍線部は同じ字に付けたまま残す */
export function editKanbun(passage: KanbunPassage, text: string): Result<{ passage: KanbunPassage }> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length !== passage.lines.length) return { ok: false, errors: [`句の数は${passage.lines.length}のままにしてください（一行に一句）`] }
  const errors: string[] = []
  const next = passage.lines.map((old, i) => {
    const r = readLine(lines[i], lineText(old))
    if (!r.ok) {
      errors.push(...r.errors)
      return old
    }
    return rewrap(old, r.chars)
  })
  return errors.length ? { ok: false, errors } : { ok: true, passage: { ...passage, lines: next } }
}

/**
 * 句の字の並びに、引用で傍線部を付ける。引用は一つの句の中で探し、二か所以上にあれば before（直前の字）で決める。
 * ids は引用のキー → 傍線部の識別子
 */
export function wrapMarks(lines: KanbunChar[][], marks: Array<{ key: string; quote: string; before?: string }>, idOf: (i: number) => string): Result<{ lines: KanbunToken[][]; ids: Map<string, string> }> {
  const errors: string[] = []
  const spans: Array<{ line: number; start: number; end: number; id: string }> = []
  const ids = new Map<string, string>()
  marks.forEach((m, mi) => {
    const hits: Array<{ line: number; start: number }> = []
    lines.forEach((l, li) => {
      const text = l.map(c => c.char).join('')
      for (let at = text.indexOf(m.quote); at >= 0; at = text.indexOf(m.quote, at + 1)) {
        if (!m.before || text.slice(0, at).endsWith(m.before)) hits.push({ line: li, start: at })
      }
    })
    if (hits.length === 0) return errors.push(`傍線部${m.key}「${m.quote}」が、一つの句の中に見つからない（句をまたがず、白文の字のとおりに引用する）`)
    if (hits.length > 1) return errors.push(`傍線部${m.key}「${m.quote}」が二か所以上にあり、決まらない（before に直前の字を書く）`)
    const { line, start } = hits[0]
    const end = start + m.quote.length
    if (spans.some(s => s.line === line && start < s.end && s.start < end)) return errors.push(`傍線部${m.key}「${m.quote}」がほかの傍線部と重なる`)
    const id = idOf(mi)
    spans.push({ line, start, end, id })
    ids.set(m.key, id)
  })
  if (errors.length) return { ok: false, errors }
  const out = lines.map((l, li) => {
    const tokens: KanbunToken[] = []
    let i = 0
    for (const s of spans.filter(s => s.line === li).sort((a, b) => a.start - b.start)) {
      tokens.push(...l.slice(i, s.start))
      tokens.push({ kind: 'mark', id: s.id, children: l.slice(s.start, s.end) })
      i = s.end
    }
    tokens.push(...l.slice(i))
    return tokens
  })
  return { ok: true, lines: out, ids }
}

/**
 * 今ある傍線部を残して、句の中の引用に傍線部を付ける。引用が今ある傍線部と同じ範囲ならその識別子を使い、
 * 一部だけ重なる引用は不正。ids は引用のキー → 傍線部の識別子
 */
export function addKanbunMarks(lines: KanbunToken[][], marks: Array<{ key: string; quote: string; before?: string }>, idOf: () => string): Result<{ lines: KanbunToken[][]; ids: Map<string, string> }> {
  const errors: string[] = []
  const ids = new Map<string, string>()
  // 句ごとの傍線部の範囲（字の位置）
  const spans = lines.map(line => {
    const out: Array<{ start: number; end: number; id: string }> = []
    let i = 0
    for (const t of line) {
      if (t.kind === 'mark') out.push({ start: i, end: i + t.children.length, id: t.id })
      i += t.kind === 'mark' ? t.children.length : 1
    }
    return out
  })
  for (const m of marks) {
    const hits: Array<{ line: number; start: number }> = []
    lines.forEach((l, li) => {
      const text = lineText(l)
      for (let at = text.indexOf(m.quote); at >= 0; at = text.indexOf(m.quote, at + 1)) {
        if (!m.before || text.slice(0, at).endsWith(m.before)) hits.push({ line: li, start: at })
      }
    })
    if (hits.length === 0) { errors.push(`傍線部${m.key}「${m.quote}」が、一つの句の中に見つからない（句をまたがず、送り仮名と返り点を除いた字で引用する）`); continue }
    if (hits.length > 1) { errors.push(`傍線部${m.key}「${m.quote}」が二か所以上にあり、決まらない（before に直前の字を書く）`); continue }
    const { line, start } = hits[0]
    const end = start + m.quote.length
    const same = spans[line].find(s => s.start === start && s.end === end)
    if (same) { ids.set(m.key, same.id); continue }
    if (spans[line].some(s => start < s.end && s.start < end)) { errors.push(`傍線部${m.key}「${m.quote}」が今ある傍線部と一部だけ重なっている`); continue }
    const id = idOf()
    spans[line].push({ start, end, id })
    ids.set(m.key, id)
  }
  if (errors.length) return { ok: false, errors }
  const out = lines.map((line, li) => {
    const chars = lineChars(line)
    const tokens: KanbunToken[] = []
    let i = 0
    for (const s of [...spans[li]].sort((a, b) => a.start - b.start)) {
      tokens.push(...chars.slice(i, s.start))
      tokens.push({ kind: 'mark', id: s.id, children: chars.slice(s.start, s.end) })
      i = s.end
    }
    tokens.push(...chars.slice(i))
    return tokens
  })
  return { ok: true, lines: out, ids }
}
