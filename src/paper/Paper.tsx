import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Test } from '../model/schema'
import { buildBlocks, type PaperActions } from './blocks'
import { pack } from './pack'
import './paper.css'

// B4 横（JIS）。紙面の内側の幅が、ページに詰められる量になる
const MM = 96 / 25.4
const PAGE_W = 364 * MM
const INNER_W = (364 - 30) * MM

type Props = PaperActions & {
  test: Test
  // 一枚の紙面に収まらない大問（見出しと本文のブロックが紙面の内側より広い）を知らせる
  onTooWide?: (sectionIds: string[]) => void
}

export function Paper({ test, allotments, onOpenPassage, onOpenKanji, onTooWide }: Props) {
  const blocks = useMemo(() => buildBlocks(test, { allotments, onOpenPassage, onOpenKanji }), [test, allotments, onOpenPassage, onOpenKanji])
  const measureRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<number[][] | null>(null)
  const [fontEpoch, setFontEpoch] = useState(0)
  const [scale, setScale] = useState(1)

  // 画面外で各ブロックを描いて幅を測り、前から詰める
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const widths = [...el.children].map(c => c.getBoundingClientRect().width)
    setPages(pack(blocks.map((b, i) => ({ width: widths[i], newPage: b.newPage, keepWithNext: b.keepWithNext })), INNER_W))
    onTooWide?.(blocks.flatMap((b, i) => (b.key.endsWith(':h') && widths[i] > INNER_W + 1 ? [b.key.slice(0, -2)] : [])))
  }, [blocks, fontEpoch, onTooWide])

  // 明朝体が読み込まれると文字の幅が変わるので、測り直す
  useEffect(() => {
    let alive = true
    document.fonts?.ready.then(() => { if (alive) setFontEpoch(e => e + 1) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 32) / PAGE_W)))
    ro.observe(el)
    return () => ro.disconnect()
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
                {page.map(i => <div className="blk" key={blocks[i].key}>{blocks[i].node}</div>)}
              </div>
              <div className="page-no">{pi + 1}</div>
            </section>
          </div>
        ))}
      </div>
    </div>
  )
}
