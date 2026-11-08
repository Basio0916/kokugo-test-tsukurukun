import { useLayoutEffect, useRef, useState } from 'react'

/* B4 横（JIS）の紙を、置く場所の幅に合わせて縮めて描く */

export const MM = 96 / 25.4
const PAGE_W = 364 * MM

/** 紙を置く要素の ref と、縮める割合（1 以下） */
export function usePageScale() {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  // 最初に描く前に一度測る。ResizeObserver の知らせを待つと、一コマだけ縮める前の大きさで描いてしまう
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => setScale(Math.min(1, (el.clientWidth - 32) / PAGE_W))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, scale] as const
}
