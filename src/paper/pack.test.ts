import { describe, expect, it } from 'vitest'
import { pack, type PackItem } from './pack'

const item = (width: number, extra: Partial<PackItem> = {}): PackItem => ({ width, newPage: false, keepWithNext: false, ...extra })

describe('ページの割り付け', () => {
  it('収まる分は同じページに詰める', () => {
    expect(pack([item(30), item(30), item(30)], 100)).toEqual([[0, 1, 2]])
  })

  it('収まらないブロックは次のページへ送る', () => {
    expect(pack([item(40), item(40), item(40)], 100)).toEqual([[0, 1], [2]])
  })

  it('新しいページから始めるブロック', () => {
    expect(pack([item(10), item(10, { newPage: true }), item(10)], 100)).toEqual([[0], [1, 2]])
  })

  it('見出しは次のブロックと一緒に送る', () => {
    expect(pack([item(60), item(20, { keepWithNext: true }), item(30)], 100)).toEqual([[0], [1, 2]])
  })

  it('次のブロックが新しいページから始まるなら、その幅は見ずに見出しをこのページに置く', () => {
    // 表紙・小問のまだない漢字の見出し・本文を貼った文章の大問の見出し
    expect(pack([item(20), item(10, { keepWithNext: true }), item(80, { newPage: true })], 100)).toEqual([[0, 1], [2]])
  })

  it('一つで一ページを超えるブロックも、そのページに置く', () => {
    expect(pack([item(150), item(10)], 100)).toEqual([[0], [1]])
  })
})
