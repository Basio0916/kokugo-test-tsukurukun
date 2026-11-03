import { describe, expect, it } from 'vitest'
import { kantenTotals, markNumbers, totalPoints } from '../model/derive'
import { sampleTest } from './sampleTest'

describe('サンプルのテスト', () => {
  it('合計が満点と一致する', () => {
    expect(totalPoints(sampleTest)).toBe(sampleTest.info.fullMarks)
  })

  it('観点別の合計', () => {
    expect(kantenTotals(sampleTest)).toEqual({ knowledge: 60, thinking: 40 })
  })

  it('扇の的の傍線部は本文の順に①〜④になる', () => {
    const ougi = sampleTest.sections.find(s => s.id === 'ougi')!
    expect([...markNumbers(ougi).entries()]).toEqual([['a', 1], ['b', 2], ['c', 3], ['d', 4]])
  })
})
