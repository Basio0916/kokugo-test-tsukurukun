/**
 * 漢字・文法の大問の、項目ごとの配点と項目の数を決める。
 * 配点の候補は 刻み × 1〜4。項目の数が整数で 6〜12 になるものから、配点が二点に近いもの（同じなら項目の多いほう）を選ぶ。
 * なければ、項目の数が整数になるもののうち 12 に最も近いもの。どれも整数にならなければ null。
 */
export function itemPlan(subtotal: number, step: number): { each: number; count: number } | null {
  const options = [1, 2, 3, 4]
    .map(k => ({ each: step * k, count: subtotal / (step * k) }))
    .filter(o => Number.isInteger(o.count) && o.count > 0)
  const fits = options.filter(o => o.count >= 6 && o.count <= 12)
  if (fits.length) return fits.sort((a, b) => Math.abs(a.each - 2) - Math.abs(b.each - 2) || b.count - a.count)[0]
  return options.sort((a, b) => Math.abs(a.count - 12) - Math.abs(b.count - 12))[0] ?? null
}

/** 漢字の大問の項目を読みと書きに、ほぼ半分ずつ分ける（奇数なら読みを一つ多くする） */
export function kanjiSplit(count: number): { reading: number; writing: number } {
  const reading = Math.ceil(count / 2)
  return { reading, writing: count - reading }
}
