import { describe, expect, it } from 'vitest'
import { kantenTotals, markNumbers, missingMarkRefs, questionNumberOf, questionPoints, sectionPoints, totalPoints } from './derive'
import { itemSegments, prose, stem } from './notation'
import { Test, type Question, type Section } from './schema'

const info = { year: '令和八年度', name: '前期中間テスト', grade: '二年', fullMarks: 50, minutes: 45, pointStep: 0.5 as const }

const choiceQ = (id: string, src: string, extra: Partial<Question> = {}): Question => ({
  id, format: 'choice', stem: stem(src), choices: ['あ', 'い', 'う', 'え'], correct: 0, points: 4, kanten: 'thinking', standard: 'C(1)イ', ...extra,
})

const literary = (questions: Question[]): Section => ({
  id: 's1', kind: 'literary', instruction: '次の文章を読んで、あとの問いに答えなさい。',
  passage: { kind: 'prose', segments: prose('<m:a>メロスは</m>激怒した。<m:b>必ず</m>、かの<m:c>王</m>を除く。'), source: '太宰治「走れメロス」より' },
  questions,
})

const kanjiQ = (pointsEach: number): Question => ({
  id: 'k', format: 'kanji', stem: stem('次の傍線部の読みを書きなさい。'), kanten: 'knowledge', standard: '(1)ウ', pointsEach,
  items: ['[[欺]]く', '[[濁流]]', '[[刑吏]]', '[[磯]]', '[[射]]る'].map(t => ({ segments: itemSegments(t), answer: 'あ' })),
})

describe('テスト情報', () => {
  it('学校ごとのテストの名前や満点をそのまま持つ', () => {
    const t = Test.parse({ info, sections: [] })
    expect(t.info).toEqual(info)
  })

  it('刻みが一点・〇・五点以外なら不正', () => {
    expect(Test.safeParse({ info: { ...info, pointStep: 0.25 }, sections: [] }).success).toBe(false)
  })
})

describe('大問と小問の形', () => {
  it('文章を扱う大問は本文を持てる', () => {
    expect(Test.safeParse({ info, sections: [literary([choiceQ('q1', '{傍線部:a}とは')])] }).success).toBe(true)
  })

  it('漢字の大問は本文を持たない', () => {
    const s: Section = { id: 'k', kind: 'kanji', instruction: '次の問いに答えなさい。', questions: [kanjiQ(2)] }
    expect(Test.safeParse({ info, sections: [s] }).success).toBe(true)
    expect(Test.safeParse({ info, sections: [{ ...s, passage: literary([]).passage }] }).success).toBe(false)
  })

  it('観点が二つ以外なら不正', () => {
    const bad = { ...choiceQ('q1', 'あ'), kanten: 'attitude' }
    expect(Test.safeParse({ info, sections: [literary([bad as unknown as Question])] }).success).toBe(false)
  })

  it('配点が刻みの倍数でなければ不正', () => {
    const half = choiceQ('q1', 'あ', { points: 2.5 })
    expect(Test.safeParse({ info, sections: [literary([half])] }).success).toBe(true)
    expect(Test.safeParse({ info: { ...info, pointStep: 1 }, sections: [literary([half])] }).success).toBe(false)
  })
})

describe('番号', () => {
  it('傍線部は本文の順に数える（問の並びとは関係ない）', () => {
    const s = literary([choiceQ('q1', '{傍線部:c}とは'), choiceQ('q2', '{傍線部:a}とは')])
    expect(markNumbers(s)).toEqual(new Map([['a', 1], ['c', 2]]))
  })

  it('参照されていない傍線部は数えない', () => {
    const s = literary([choiceQ('q1', '{傍線部:a}とは'), choiceQ('q2', '{番号:c}とは')])
    const n = markNumbers(s)
    expect(n.get('a')).toBe(1)
    expect(n.get('c')).toBe(2)
    expect(n.has('b')).toBe(false)
  })

  it('小問を並べ替えると問の番号が変わる', () => {
    const s = literary([choiceQ('q1', 'あ'), choiceQ('q2', 'い')])
    const moved = { ...s, questions: [s.questions[1], s.questions[0]] }
    expect(questionNumberOf(moved, 'q2')).toBe(1)
    expect(questionNumberOf(moved, 'q1')).toBe(2)
  })

  it('参照先の傍線部が本文にない小問を見分ける', () => {
    const s = literary([choiceQ('q1', '{傍線部:z}とは')])
    expect(missingMarkRefs(s, s.questions[0])).toEqual(['z'])
  })
})

describe('配点の集計', () => {
  it('大問の小計・観点別・全体の合計', () => {
    const kanji: Section = { id: 'k', kind: 'kanji', instruction: '次の問いに答えなさい。', questions: [kanjiQ(2), { ...kanjiQ(2), id: 'k2' }] }
    const lit = literary([choiceQ('q1', 'あ', { points: 6 })])
    const t = Test.parse({ info: { ...info, pointStep: 1 }, sections: [kanji, lit] })
    expect(questionPoints(t.sections[0].questions[0])).toBe(10)
    expect(sectionPoints(t.sections[0])).toBe(20)
    expect(sectionPoints(t.sections[1])).toBe(6)
    expect(kantenTotals(t)).toEqual({ knowledge: 20, thinking: 6 })
    expect(totalPoints(t)).toBe(26)
  })

  it('〇・五点も誤差なく集計する', () => {
    const three = { ...kanjiQ(0.5), items: kanjiQ(0.5).items!.slice(0, 3) }
    const t = Test.parse({ info, sections: [
      { id: 'k', kind: 'kanji', instruction: '次の問いに答えなさい。', questions: [three] },
      literary([choiceQ('q1', 'あ', { points: 1.5 })]),
    ] })
    expect(totalPoints(t)).toBe(3)
  })
})
