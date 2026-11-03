import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { MM, usePageScale } from './scale'
import type { Test } from '../model/schema'
import { buildBlocks, type BlockTarget, type PaperActions } from './blocks'
import { pack } from './pack'
import './paper.css'

// B4 横（JIS）。紙面の内側の幅が、ページに詰められる量になる
const INNER_W = (364 - 30) * MM

type Props = PaperActions & {
  test: Test
  // 一枚の紙面に収まらない大問（見出しと本文のブロックが紙面の内側より広い）を知らせる
  onTooWide?: (sectionIds: string[]) => void
  // 会話で選ぶ。選んだもの・変わったものに印を付ける（大問だけを指すときは、その大問のブロックすべて）。割り付けには関わらない
  selected?: BlockTarget | null
  changed?: BlockTarget | null
  onSelect?: (target: BlockTarget) => void
  // 小問をダブルクリックしたとき（小問を直す）
  onOpenQuestion?: (target: BlockTarget) => void
  // 本文を直したあとの要確認の小問（「大問/小問」）
  flagged?: Set<string>
}

const covers = (t: BlockTarget | null | undefined, b: BlockTarget | undefined) =>
  !!t && !!b && t.sectionId === b.sectionId && (!t.questionId || t.questionId === b.questionId)

export function Paper({ test, allotments, onOpenPassage, onOpenKanji, editing, onTooWide, selected, changed, onSelect, onOpenQuestion, flagged }: Props) {
  const blocks = useMemo(() => buildBlocks(test, { allotments, onOpenPassage, onOpenKanji, editing }), [test, allotments, onOpenPassage, onOpenKanji, editing])
  const measureRef = useRef<HTMLDivElement>(null)
  // 割り付けは、測ったときのブロックの並びと組にして持つ（並びが変わったら、測り直すまで前の割り付けは使わない）
  const [layout, setLayout] = useState<{ blocks: typeof blocks; pages: number[][] } | null>(null)
  const pages = layout?.blocks === blocks ? layout.pages : null
  const [fontEpoch, setFontEpoch] = useState(0)
  const [frameRef, scale] = usePageScale()

  // 画面外で各ブロックを描いて幅を測り、前から詰める
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const widths = [...el.children].map(c => c.getBoundingClientRect().width)
    setLayout({ blocks, pages: pack(blocks.map((b, i) => ({ width: widths[i], newPage: b.newPage, keepWithNext: b.keepWithNext })), INNER_W) })
    onTooWide?.(blocks.flatMap((b, i) => (b.key.endsWith(':h') && widths[i] > INNER_W + 1 ? [b.key.slice(0, -2)] : [])))
  }, [blocks, fontEpoch, onTooWide])

  // 明朝体が読み込まれると文字の幅が変わるので、測り直す
  useEffect(() => {
    let alive = true
    document.fonts?.ready.then(() => { if (alive) setFontEpoch(e => e + 1) })
    return () => { alive = false }
  }, [])

  return (
    <div className="paper" ref={frameRef}>
      <div className="measure" ref={measureRef} aria-hidden="true">
        {blocks.map(b => <div className="blk" key={b.key}>{b.node}</div>)}
      </div>
      <div className="paper-pages" style={{ '--s': scale } as CSSProperties}>
        {pages?.map((page, pi) => (
          <div className="page-frame" key={pi}>
            <section className="page" aria-label={`${pi + 1}ページ`}>
              <div className="page-in">
                {page.map(i => {
                  const b = blocks[i]
                  const isFlagged = !!b.target?.questionId && !!flagged?.has(`${b.target.sectionId}/${b.target.questionId}`)
                  const cls = `blk${covers(selected, b.target) ? ' blk-selected' : ''}${covers(changed, b.target) ? ' blk-changed' : ''}${isFlagged ? ' blk-flagged' : ''}`
                  return (
                    <div
                      className={cls} key={b.key}
                      // 大問の一覧から移るときの目印
                      data-target={b.target && (b.target.questionId ? `${b.target.sectionId}/${b.target.questionId}` : b.target.sectionId)}
                      onDoubleClick={e => {
                        if (b.target?.questionId && onOpenQuestion && !(e.target as Element).closest('button')) onOpenQuestion(b.target)
                      }}
                      onClick={e => {
                        // 操作のボタンを押したときと、本文の文字を選んだとき（傍線を引く）は選ばない
                        if (!onSelect || !b.target || (e.target as Element).closest('button') || !getSelection()?.isCollapsed) return
                        onSelect(b.target)
                      }}
                    >{b.node}{isFlagged && <span className="blk-flag">要確認</span>}</div>
                  )
                })}
              </div>
              <div className="page-no">{pi + 1}</div>
            </section>
          </div>
        ))}
      </div>
    </div>
  )
}
