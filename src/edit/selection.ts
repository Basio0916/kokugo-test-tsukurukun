/*
 * 紙面の本文の選択から、線を引く箇所（引用）と、選択の直前の文字を取る。
 * 傍線部の番号（①など）・ルビの読み・出典は本文の文字ではないので除く。画面外の測るためのブロックは対象にしない。
 */

export type PassageSelection = { sectionId: string; quote: string; before?: string; x: number; y: number }

const elementOf = (n: Node) => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement)

function textOf(range: Range): string {
  const fragment = range.cloneContents()
  fragment.querySelectorAll('.mk, rt, .src').forEach(n => n.remove())
  return (fragment.textContent ?? '').replace(/\s/g, '')
}

export function readPassageSelection(): PassageSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const passage = elementOf(range.startContainer)?.closest('.page .passage[data-section]')
  if (!passage || passage !== elementOf(range.endContainer)?.closest('.page .passage[data-section]')) return null
  const quote = textOf(range)
  if (!quote) return null
  // 直前の文字は、同じ段落の中だけから取る（段落の区切りは本文の文字列では改行になる）
  const paragraph = elementOf(range.startContainer)?.closest('p')
  let before: string | undefined
  if (paragraph) {
    const head = document.createRange()
    head.setStart(paragraph, 0)
    head.setEnd(range.startContainer, range.startOffset)
    before = textOf(head).slice(-8) || undefined
  }
  const box = range.getBoundingClientRect()
  return { sectionId: passage.getAttribute('data-section')!, quote, before, x: box.left, y: box.bottom }
}
