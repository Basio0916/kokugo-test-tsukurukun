import { describe, expect, it } from 'vitest'
import { Group } from './schema'

const group = { month: 1, materials: ['走れメロス'], hours: 8, standards: ['(1)エ', 'C(1)イ'], activities: ['C(2)イ'] }

describe('単元データの検証', () => {
  it('正しい形のまとまりは通る', () => {
    expect(Group.safeParse(group).success).toBe(true)
  })

  it('記号の形が不正なものははじく', () => {
    expect(Group.safeParse({ ...group, standards: ['C1イ'] }).success).toBe(false)
    expect(Group.safeParse({ ...group, standards: ['C(2)イ'] }).success).toBe(false)
    expect(Group.safeParse({ ...group, activities: ['C(1)イ'] }).success).toBe(false)
  })

  it('月が範囲外のものははじく', () => {
    expect(Group.safeParse({ ...group, month: 13 }).success).toBe(false)
  })
})
