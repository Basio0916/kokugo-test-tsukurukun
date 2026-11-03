import { describe, expect, it } from 'vitest'
import { sampleTest } from '../sample/sampleTest'
import { editKanbun, lineChars, lineNotation, readingOrder, readLine, wrapMarks } from './kanbun'
import { kanbunLine } from './notation'
import { Section, type KanbunPassage } from './schema'

const order = (notation: string) => {
  const r = readingOrder(lineChars(kanbunLine(notation)))
  return r.ok ? r.order : r.errors[0]
}
const kanshi = () => sampleTest.sections.find(s => s.id === 'kanshi')!.passage as KanbunPassage

describe('返り点と読む順', () => {
  it('レ点・一二点・上下点', () => {
    expect(order('春眠不[レ]覚(エ)[レ]暁(ヲ)')).toBe('春眠暁覚不')
    expect(order('処処聞(ク)[二]啼鳥(ヲ)[一]')).toBe('処処啼鳥聞')
    expect(order('子曰(ハク)、学(ビテ)而時(ニ)習(フ)[レ]之(ヲ)、不[二]亦(タ)説(バシカラ)[一]乎。')).toBe('子曰、学而時之習、亦説不乎。')
    expect(order('有(リ)[レ]朋自(リ)[二]遠方[一]来(タル)')).toBe('朋有遠方自来')
    expect(order('A[下]B[二]C[一]D[上]E')).toBe('CBDAE')
  })

  it('一レ点は次の字の後に読み、続けて二点の字を読む', () => {
    expect(order('不[三]敢(ヘテ)為(サ)[二]天下[一レ]先(ト)')).toBe('敢天先下為不')
  })

  it('対応のない返り点、決まっていない返り点、最後の字のレ点は通さない', () => {
    expect(order('春眠不[二]覚暁')).toContain('読まれないまま')
    expect(order('春眠不[甲]覚暁')).toContain('使えない')
    expect(order('春眠不覚暁[レ]')).toContain('最後の字')
  })
})

describe('記法の句を読む', () => {
  it('字の並びが白文と同じで、送り仮名がカタカナ', () => {
    expect(readLine('春眠不[レ]覚(エ)[レ]暁(ヲ)', '春眠不覚暁').ok).toBe(true)
    expect(readLine('春眠不[レ]知(ル)[レ]暁(ヲ)', '春眠不覚暁')).toMatchObject({ ok: false, errors: [expect.stringContaining('白文の字を一字も変えず')] })
    expect(readLine('春眠不[レ]覚(え)[レ]暁(ヲ)', '春眠不覚暁')).toMatchObject({ ok: false, errors: [expect.stringContaining('カタカナ')] })
  })
})

describe('返り点と送り仮名を直す', () => {
  const text = () => kanshi().lines.map(lineNotation).join('\n')

  it('記法にして読み戻すと同じ。傍線部は同じ字に付いたまま', () => {
    const r = editKanbun(kanshi(), text())
    expect(r.ok && r.passage.lines).toEqual(kanshi().lines)
    const changed = editKanbun(kanshi(), text().replace('春眠不[レ]覚(エ)[レ]暁(ヲ)', '春眠不[レ]覚(ユ)[レ]暁(ヲ)'))
    expect(changed.ok && lineChars(changed.passage.lines[0])[3]).toEqual({ kind: 'char', char: '覚', okurigana: 'ユ', kaeriten: 'レ' })
    expect(changed.ok && changed.passage.lines[3]).toEqual(kanshi().lines[3])
  })

  it('字を変える・句の数を変えると直せない', () => {
    expect(editKanbun(kanshi(), text().replace('春眠', '夏眠')).ok).toBe(false)
    expect(editKanbun(kanshi(), text().split('\n').slice(0, 3).join('\n')).ok).toBe(false)
  })
})

describe('句の中の引用に傍線部を付ける', () => {
  const lines = () => kanshi().lines.map(lineChars)
  it('一つの句の中で見つかれば包む。句をまたぐ・ない引用は不正', () => {
    const r = wrapMarks(lines(), [{ key: 'A', quote: '花落知多少' }, { key: 'B', quote: '啼鳥' }], i => `n${i}`)
    expect(r.ok && r.lines[3][0]).toMatchObject({ kind: 'mark', id: 'n0' })
    expect(r.ok && r.ids.get('B')).toBe('n1')
    expect(wrapMarks(lines(), [{ key: 'A', quote: '暁処処' }], i => `n${i}`).ok).toBe(false)
    expect(wrapMarks(lines(), [{ key: 'A', quote: '秋風' }], i => `n${i}`).ok).toBe(false)
  })
})

describe('白文を貼る前の漢文の大問', () => {
  it('本文も小問も持たなければ正しい', () => {
    expect(Section.safeParse({ id: 's', kind: 'kanbun', material: '漢詩の風景', instruction: '次の漢文を読んで、あとの問いに答えなさい。', questions: [] }).success).toBe(true)
  })
})
