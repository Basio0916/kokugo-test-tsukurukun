/**
 * 小問の重みから配点を割り振る。合計は total ちょうどで、どれも step の倍数、最低でも step。
 * 一刻みずつ配ったあと、残りを重みに比例して配り、端数は大きい順（同じなら前の小問）に一刻みずつ足す。
 * 小問が多すぎて一刻みずつも配れないときは null。
 */
export function allocatePoints(weights: number[], total: number, step: number): number[] | null {
  const units = Math.round(total / step)
  const n = weights.length
  if (n === 0 || n > units) return null
  const rest = units - n
  const sum = weights.reduce((a, w) => a + w, 0)
  const exact = weights.map(w => (rest * w) / sum)
  const given = exact.map(Math.floor)
  let left = rest - given.reduce((a, g) => a + g, 0)
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left === 0) break
    given[i] += 1
    left -= 1
  }
  return given.map(g => (g + 1) * step)
}
