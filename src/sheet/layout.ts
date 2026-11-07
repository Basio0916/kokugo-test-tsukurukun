import { blankLabel, blanksOf, markNumbers, questionPoints } from '../model/derive'
import { needsPassage, type Kanten, type Question, type Section, type Test } from '../model/schema'
import { circled, kansuji } from '../paper/kansuji'

/*
 * 解答用紙の割り付け。解答欄の大きさはデータだけで決まるので、描いて測らずにマス目の単位で計算する。
 * 大問ごとに新しい列から、欄を列に上から積み、入らなければ次の列（左）へ送る。位置と大きさは mm で、
 * 解答欄を並べる場所の右上からの距離で表す。
 */

// B4 横の紙の内側の余白と、右端の題・名前の欄の幅（mm）
export const SHEET = { width: 364, height: 257, top: 14, right: 15, bottom: 17, left: 15, side: 36 }
export const AREA = {
  width: SHEET.width - SHEET.left - SHEET.right - SHEET.side,
  height: SHEET.height - SHEET.top - SHEET.bottom,
}

// マスの大きさ（mm）。収まるまで刻んで小さくする
const CELL_MAX = 9
const CELL_MIN = 6
const CELL_STEP = 0.5
// マス目の一列のマスの数と、大問の間のすき間（mm）
const COLUMN = 20
const GAP = 3

/** 小問の欄の一つ。label は項目の見出し（①・傍線部の番号）。grid はマス目（字数ぶんのマス） */
export type Piece = { label?: string; rows: number; cols: number; grid: boolean; count?: number }

const chars = (s: string | undefined) => [...(s ?? '')].length

/** 小問の欄を、解答形式からマスの数で決める。column はマス目の一列のマスの数 */
export function piecesOf(section: Section, q: Question, column = COLUMN): Piece[] {
  const numbers = markNumbers(section)
  const box = (rows: number, label?: string): Piece => ({ label, rows, cols: 1, grid: false })
  const grid = (n: number, height = column): Piece => ({ rows: Math.min(n, height), cols: Math.ceil(n / height), grid: true, count: n })
  if (q.fill) {
    const blanks = blanksOf(q)
    return blanks.map((b, i) => {
      const label = blankLabel(i, blanks.length)
      // 番号の見出しが一段使うので、そのぶん短く折り返す
      return { ...grid(b.charLimit ?? chars(b.answer), label ? column - 1 : column), label }
    })
  }
  const items = q.items?.map((it, i) => ({ it, label: it.markId ? circled(numbers.get(it.markId) ?? 0) : circled(i + 1) }))
  switch (q.format) {
    case 'choice':
      return items ? items.map(({ label }) => box(2, label)) : [box(2)]
    case 'kanji':
    case 'kana':
      return (items ?? []).map(({ it, label }) => box(Math.max(3, chars(it.answer) + 1), label))
    case 'short':
      if (items) return items.map(({ it, label }) => box(Math.max(3, q.charLimit ?? chars(it.answer) + 2), label))
      return q.charLimit ? [grid(q.charLimit)] : [box(Math.max(3, chars(q.answer) + 2))]
    case 'extract':
    case 'description':
    case 'composition':
      return [grid(q.charLimit ?? Math.max(10, chars(q.answer)))]
  }
}

export type Unit = {
  // 解答欄の場所の右上からの距離と大きさ（mm）
  x: number
  y: number
  w: number
  h: number
  // 小問の見出し（問一）・項目の見出し（①）・欄・マス目
  kind: 'question' | 'item' | 'box' | 'grid'
  label?: string
  rows?: number
  cols?: number
  // マス目のマスの数
  count?: number
}

export type SheetSection = {
  id: string
  // 大問の番号（一、二…）
  label: string
  x: number
  w: number
  units: Unit[]
  // 観点ごとの小計（その大問にある観点だけ）
  scores: Array<{ kanten: Kanten; points: number }>
  // 小問のない大問の知らせ
  waiting?: string
}

export type SheetLayout = { cell: number; rows: number; sections: SheetSection[]; width: number; fits: boolean }

/** 一つの大問を、マスの大きさ cell、一列 rows マスで列に積む */
function layoutSection(section: Section, index: number, cell: number, rows: number): Omit<SheetSection, 'x'> {
  const label = kansuji(index + 1)
  const scores = (['knowledge', 'thinking'] as const)
    .map(kanten => ({ kanten, points: section.questions.filter(q => q.kanten === kanten).reduce((a, q) => a + questionPoints(q), 0) }))
    .filter(s => section.questions.some(q => q.kanten === s.kanten))
  if (section.questions.length === 0) {
    return { id: section.id, label, w: cell, units: [], scores, waiting: needsPassage(section.kind) && !section.passage ? '本文待ち' : '小問なし' }
  }
  const units: Unit[] = []
  let col = 0
  let y = 0
  const newColumn = (width = 1) => {
    col += width
    y = 0
  }
  const column = Math.min(COLUMN, rows - 1)
  section.questions.forEach((q, qi) => {
    // 作文の問は「作文」と書く
    const name = q.format === 'composition' ? '作文' : `問${kansuji(qi + 1)}`
    let headed = false
    for (const piece of piecesOf(section, q, column)) {
      const need = (headed ? 0 : 1) + (piece.label ? 1 : 0) + piece.rows
      // 入らない、または二列以上のマス目は、次の列から置く（いまの列が空なら、そのまま置く）
      if (y > 0 && (y + need > rows || piece.cols > 1)) {
        newColumn()
        headed = false
      }
      const w = piece.cols * cell
      if (!headed) {
        units.push({ x: col * cell, y: y * cell, w, h: cell, kind: 'question', label: name })
        y += 1
        headed = true
      }
      if (piece.label) {
        units.push({ x: col * cell, y: y * cell, w, h: cell, kind: 'item', label: piece.label })
        y += 1
      }
      units.push(piece.grid
        ? { x: col * cell, y: y * cell, w, h: piece.rows * cell, kind: 'grid', rows: piece.rows, cols: piece.cols, count: piece.count }
        : { x: col * cell, y: y * cell, w, h: piece.rows * cell, kind: 'box' })
      y += piece.rows
      if (piece.cols > 1) {
        newColumn(piece.cols)
        headed = false
      }
    }
  })
  const used = y === 0 ? col : col + 1
  return { id: section.id, label, w: used * cell, units, scores }
}

/** 解答用紙を割り付ける。収まる最大のマスの大きさを選び、6mm でも入らなければ fits を false にする */
export function layoutAnswerSheet(test: Test): SheetLayout {
  let last: SheetLayout | undefined
  for (let cell = CELL_MAX; cell >= CELL_MIN; cell -= CELL_STEP) {
    // 大問の見出しの段と、小計の二段とそのすき間を除いたマスの数
    const rows = Math.floor((AREA.height - cell * 3 - 2) / cell)
    let x = 0
    const sections = test.sections.map((s, i) => {
      const laid = layoutSection(s, i, cell, rows)
      const placed = { ...laid, x }
      x += laid.w + GAP
      return placed
    })
    const width = Math.max(0, x - GAP)
    last = { cell, rows, sections, width, fits: width <= AREA.width }
    if (last.fits) return last
  }
  return last!
}
