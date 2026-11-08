export type PackItem = {
  width: number
  // 新しいページから始めるブロック（文章を扱う大問の見出しなど）
  newPage: boolean
  // 次のブロックと同じページに置きたいブロック（大問の見出しだけがページの端に残らないように）
  keepWithNext: boolean
}

// 測った幅をもとに、前から詰めてページに割り付ける。返すのはページごとのブロックの番号
export function pack(items: PackItem[], capacity: number): number[][] {
  const pages: number[][] = [[]]
  let used = 0
  items.forEach((item, i) => {
    // 次のブロックが新しいページから始まるなら、同じページには来ないので幅を見ない
    const next = item.keepWithNext && !items[i + 1]?.newPage ? items[i + 1] : undefined
    const need = item.width + (next ? next.width : 0)
    if (pages[pages.length - 1].length > 0 && (item.newPage || used + need > capacity)) {
      pages.push([])
      used = 0
    }
    pages[pages.length - 1].push(i)
    used += item.width
  })
  return pages
}
