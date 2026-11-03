import { describe, expect, it } from 'vitest'
import { catalog } from '../catalog/catalog'
import { Test } from '../model/schema'
import { CLASSIFIED_NAMES, materialsOf } from './kinds'
import { pastedPassage } from './passage'
import { buildSkeleton } from './skeleton'

const info = { year: '令和八年度', name: '学年末テスト', grade: '二年', fullMarks: 100, minutes: 50, pointStep: 1 as const }

describe('教材の一覧', () => {
  it('分類の一覧の教材名は、どれも単元データにある', () => {
    const names = new Set(catalog.grades.flatMap(g => g.units.flatMap(u => u.groups.map(x => x.materials[0]))))
    expect(CLASSIFIED_NAMES.filter(n => !names.has(n))).toEqual([])
  })

  it('二年の一覧に走れメロスがあり、古文・漢文は選べない', () => {
    const list = materialsOf(2)
    expect(list.find(m => m.name === '走れメロス')).toMatchObject({ kind: 'literary', selectable: true, month: 1, unit: '８　表現を見つめる' })
    expect(list.find(m => m.name === 'モアイは語る――地球の未来')).toMatchObject({ kind: 'expository', selectable: true })
    expect(list.find(m => m.name.startsWith('扇の的'))).toMatchObject({ kind: 'classical', selectable: false })
    expect(list.find(m => m.name === '漢詩の風景')).toMatchObject({ kind: 'kanbun', selectable: false })
    expect(list.some(m => m.name === '国語の力試し')).toBe(false)
  })
})

describe('骨組みと配点の枠', () => {
  const two = materialsOf(2).filter(m => m.name === 'アイスプラネット' || m.name === '走れメロス')

  it('教材ごとに本文も小問もない大問を並べ、満点を割り振る', () => {
    const r = buildSkeleton(info, two)!
    expect(r.test.sections.map(s => s.kind)).toEqual(['literary', 'literary'])
    expect(r.allotments).toEqual({ s1: 50, s2: 50 })
    expect(r.materialNames).toEqual({ s1: 'アイスプラネット', s2: '走れメロス' })
    expect(Test.safeParse(r.test).success).toBe(true)
  })

  it('〇・五点刻みでも合計は満点ちょうど', () => {
    const three = materialsOf(2).filter(m => m.selectable).slice(0, 3)
    const r = buildSkeleton({ ...info, fullMarks: 50, pointStep: 0.5 }, three)!
    expect(Object.values(r.allotments).reduce((a, b) => a + b, 0)).toBe(50)
    expect(Object.values(r.allotments).every(p => Number.isInteger(p / 0.5))).toBe(true)
  })

  it('教材を選ばなければ作らない', () => {
    expect(buildSkeleton(info, [])).toBeNull()
  })
})

describe('本文の貼り付け', () => {
  it('改行で段落に分け、空の行と字下げの空白を取り除く', () => {
    const p = pastedPassage('　メロスは激怒した。\n\n  必ず、かの王を除かなければならぬと決意した。\r\n　メロスには政治がわからぬ。\n', '走れメロス', '太宰治')!
    expect(p.segments).toEqual([
      { kind: 'text', text: 'メロスは激怒した。' }, { kind: 'break' },
      { kind: 'text', text: '必ず、かの王を除かなければならぬと決意した。' }, { kind: 'break' },
      { kind: 'text', text: 'メロスには政治がわからぬ。' },
    ])
    expect(p.source).toBe('太宰治「走れメロス」より')
  })

  it('作者名がなければ「「教材名」より」、本文が空なら作らない', () => {
    expect(pastedPassage('本文', '走れメロス', '')!.source).toBe('「走れメロス」より')
    expect(pastedPassage(' \n　\n', '走れメロス', '太宰治')).toBeNull()
  })
})
