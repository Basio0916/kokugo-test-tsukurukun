import { describe, expect, it } from 'vitest'
import { circled, kansuji } from './kansuji'

describe('漢数字', () => {
  it.each([
    [24, '二十四'],
    [100, '百'],
    [0.5, '〇・五'],
    [1.5, '一・五'],
    [10, '十'],
    [45, '四十五'],
    [200, '二百'],
    [111, '百十一'],
  ])('%s は %s', (n, s) => {
    expect(kansuji(n)).toBe(s)
  })

  it('〇・五刻みでない数は扱わない', () => {
    expect(() => kansuji(0.25)).toThrow()
  })

  it('丸数字', () => {
    expect([1, 2, 10].map(circled)).toEqual(['①', '②', '⑩'])
  })
})
