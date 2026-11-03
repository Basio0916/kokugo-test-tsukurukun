import { useEffect, useRef, useState } from 'react'

/* B4 横（JIS）の紙を、置く場所の幅に合わせて縮めて描く */

export const MM = 96 / 25.4
const PAGE_W = 364 * MM

/** 紙を置く要素の ref と、縮める割合（1 以下） */
export function usePageScale() {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 32) / PAGE_W)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, scale] as const
}
