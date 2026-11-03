import { describe, expect, it } from 'vitest'
import { sampleTest } from '../sample/sampleTest'
import { keyRows } from './keyRows'

const rows = (id: string) => keyRows(sampleTest.sections.find(s => s.id === id)!)

describe('模範解答・採点基準の行', () => {
  it('記号選択は正答の記号、記述は模範解答と採点の観点', () => {
    const [, q2, q3] = rows('meros')
    expect(q2).toEqual({ label: '問二', answer: 'イ', points: '四点', kanten: '知識・技能', standard: '(1)エ', rubric: ['記号が合っていれば正答'] })
    expect(q3.answer).toBe('政治のことはわからない村の牧人だが、邪悪に対しては人一倍に敏感な人物。')
    expect(q3.points).toBe('十点')
    expect(q3.rubric).toHaveLength(3)
  })

  it('項目は見出しと答えを並べ、配点は各◯点。傍線部を指す項目は傍線部の番号', () => {
    expect(rows('kanji')[0]).toMatchObject({ answer: '① あざむ　② だくりゅう　③ けいり　④ いそ　⑤ い', points: '各二点', rubric: ['答えが合っていれば正答'] })
    expect(rows('ougi')[1]).toMatchObject({ answer: '② ゆりすえ　③ ただよえ', points: '各二点' })
    expect(rows('grammar')[0]).toMatchObject({ answer: '① ア　② イ　③ エ', rubric: ['記号が合っていれば正答'] })
  })

  it('作文は条件に沿って書けているかを採点基準にする', () => {
    expect(rows('sakubun')[0].label).toBe('作文')
    expect(rows('sakubun')[0].rubric).toEqual(['条件に沿って書けている', expect.stringContaining('二段落'), '百六十字以上、二百字以内で書くこと。'])
  })
})
