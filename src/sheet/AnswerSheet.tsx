import type { CSSProperties } from 'react'
import { kantenTotals, totalPoints } from '../model/derive'
import type { Test } from '../model/schema'
import { usePageScale } from '../paper/scale'
import { AREA, SHEET, type SheetLayout, type Unit } from './layout'
import './sheet.css'

/* 解答用紙。割り付け（layoutAnswerSheet）の結果を、B4 横の一枚に mm で置いて描く */

const mm = (n: number) => `${n}mm`
// 枠の線の太さ（1px）だけ広げた長さ。隣り合う欄の枠の線を同じ場所に重ねて、二本並んで太く見えないようにする
const edge = (n: number) => `calc(${n}mm + 1px)`
const KANTEN = { knowledge: '知・技', thinking: '思・判・表' } as const

function UnitView({ unit, top, answered }: { unit: Unit; top: number; answered: boolean }) {
  const style: CSSProperties = { right: mm(unit.x), top: mm(top + unit.y), width: edge(unit.w), height: edge(unit.h) }
  // 模範解答つき解答用紙だけで答えを書く。字は一字ずつ数える（サロゲートペアの漢字も一字）
  const letters = answered && unit.answer ? [...unit.answer] : []
  // 三字の見出し（問十二）は、一マスに入るよう字を小さくする
  if (unit.kind === 'question' || unit.kind === 'item') return <div className={`sheet-head sheet-${unit.kind}${(unit.label?.length ?? 0) >= 3 ? ' sheet-small' : ''}${unit.shaded ? ' sheet-shaded' : ''}`} style={style}>{unit.label}</div>
  if (unit.kind === 'box') {
    // マス目でない欄は縦書きの一行で書く。字の大きさはマスの六割までにし、長い答えは欄の高さに収まるまで小さくする
    const size = Math.min(unit.w * 0.6, (unit.h - unit.w * 0.3) / Math.max(1, letters.length))
    return <div className="sheet-box" style={style}>{letters.length > 0 && <span className="sheet-answer" style={{ fontSize: mm(size) }}>{unit.answer}</span>}</div>
  }
  return (
    <div className="sheet-box sheet-grid" style={{ ...style, gridTemplateRows: `repeat(${unit.rows}, 1fr)`, gridTemplateColumns: `repeat(${unit.cols}, 1fr)` }}>
      {/* 外枠に接するマスの区切りは描かない（外枠と二本並ばないように）。答えは一マスに一字ずつ、マスの数まで書く */}
      {Array.from({ length: unit.count ?? 0 }, (_, i) => {
        const rows = unit.rows ?? 1
        const end = `${i % rows === rows - 1 ? ' sheet-cell-bottom' : ''}${Math.floor(i / rows) === (unit.cols ?? 1) - 1 ? ' sheet-cell-left' : ''}`
        return <span key={i} className={end.trim() || undefined}>{letters[i] && <span className="sheet-answer">{letters[i]}</span>}</span>
      })}
    </div>
  )
}

/** 解答用紙。answered のときは、模範解答を書き込んだ模範解答つき解答用紙にする */
export function AnswerSheet({ test, layout, answered = false }: { test: Test; layout: SheetLayout; answered?: boolean }) {
  const [ref, scale] = usePageScale()
  const { info } = test
  const totals = kantenTotals(test)
  const { cell } = layout
  return (
    <div className="paper" ref={ref}>
      <div className="paper-pages" style={{ '--s': scale } as CSSProperties}>
        <div className="page-frame">
          <section className="page sheet" aria-label={answered ? '模範解答つき解答用紙' : '解答用紙'} style={{ '--cell': mm(cell) } as CSSProperties}>
            {/* 右端。上に題と名前の欄を並べ、その二つの下に合計の欄を置く */}
            <div className="sheet-side" style={{ top: mm(SHEET.top), right: mm(SHEET.right), height: mm(AREA.height) }}>
              <div className="sheet-heading">
                <p className="sheet-title">{info.year}　{info.name}　国語{answered && '　模範解答'}</p>
                <p className="sheet-name">
                  <span>{info.grade}</span><span className="sheet-name-gap">組</span><span className="sheet-name-gap">番</span><span className="sheet-name-label">氏名</span>
                </p>
              </div>
              <dl className="sheet-totals" aria-label="観点別の合計">
                <div className="sheet-shaded"><dt>{KANTEN.knowledge}</dt><dd>／{totals.knowledge}</dd></div>
                <div><dt>{KANTEN.thinking}</dt><dd>／{totals.thinking}</dd></div>
                <div><dt>計</dt><dd>／{totalPoints(test)}</dd></div>
              </dl>
            </div>
            <div className="sheet-area" style={{ top: mm(SHEET.top), right: mm(SHEET.right + SHEET.side), width: mm(AREA.width), height: mm(AREA.height) }}>
              {layout.sections.map(s => (
                <div key={s.id} className="sheet-sec" style={{ right: mm(s.x), width: mm(s.w) }} aria-label={`解答用紙の${s.label}`}>
                  <div className="sheet-sec-h" style={{ height: edge(cell) }}>{s.label}</div>
                  {s.waiting
                    ? <p className="sheet-waiting" style={{ top: mm(cell) }}>{s.waiting}</p>
                    : s.units.map((u, i) => <UnitView key={i} unit={u} top={cell} answered={answered} />)}
                  {/* 小計は知・技を上、思・判・表を下の決まった段に置き、知・技を網掛けにする */}
                  <div className="sheet-scores">
                    {s.scores.map(sc => (
                      <p key={sc.kanten} className={`sheet-score-${sc.kanten}${sc.kanten === 'knowledge' ? ' sheet-shaded' : ''}`}><span>{KANTEN[sc.kanten]}</span>／{sc.points}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
