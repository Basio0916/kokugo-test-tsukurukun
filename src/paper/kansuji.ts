const DIGITS = '〇一二三四五六七八九'

function integer(n: number): string {
  if (n === 0) return '〇'
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10
  return (h ? (h > 1 ? DIGITS[h] : '') + '百' : '') + (t ? (t > 1 ? DIGITS[t] : '') + '十' : '') + (o ? DIGITS[o] : '')
}

// 紙面の数は漢数字で書く。配点の〇・五点刻みは「一・五」のように書く
export function kansuji(n: number): string {
  if (!Number.isInteger(n * 2) || n < 0 || n >= 1000) throw new RangeError(`漢数字にできない数: ${n}`)
  return Number.isInteger(n) ? integer(n) : `${integer(Math.floor(n))}・五`
}

export function circled(n: number): string {
  return String.fromCharCode(0x245f + n)
}
