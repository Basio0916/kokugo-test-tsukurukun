import { useRef, type MouseEvent, type RefObject } from 'react'

/** 背景（ポップアップの外）を押して閉じる。押し始めと離したところが両方とも外のときだけ閉じる（欄の文字を選びながら外へ出て離しても閉じない） */
export function useBackdropClose(ref: RefObject<HTMLDialogElement | null>) {
  const downOutside = useRef(false)
  const outside = (e: MouseEvent) => {
    const dialog = ref.current
    if (!dialog || e.target !== dialog) return false
    const r = dialog.getBoundingClientRect()
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  }
  return {
    onMouseDown: (e: MouseEvent) => { downOutside.current = outside(e) },
    onClick: (e: MouseEvent) => {
      if (downOutside.current && outside(e)) ref.current?.close()
      downOutside.current = false
    },
  }
}
