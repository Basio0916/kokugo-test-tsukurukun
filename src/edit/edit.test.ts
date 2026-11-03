import { describe, expect, it } from 'vitest'
import { markNumbers, questionNumberOf, totalPoints } from '../model/derive'
import { sampleTest } from '../sample/sampleTest'
import { appendSection, moveQuestion, moveSection, newSectionId, removeQuestion, removeSection, replaceQuestion, setInstruction } from './operations'
import { rescalePoints } from './rescale'
import { stemToText, textToStem } from './stemText'

const meros = () => sampleTest.sections.find(s => s.id === 'meros')!

describe('大問の操作', () => {
  it('上へ動かすと並びが入れ替わる。端ではそのまま', () => {
    const ids = (t: typeof sampleTest) => t.sections.map(s => s.id)
    expect(ids(moveSection(sampleTest, 'meros', -1))).toEqual(['kanji', 'meros', 'grammar', 'ougi', 'kanshi', 'sakubun'])
    expect(ids(moveSection(sampleTest, 'kanji', -1))).toEqual(ids(sampleTest))
  })

  it('削除と追加、識別子は重ならない', () => {
    const removed = removeSection(sampleTest, 'grammar')
    expect(removed.sections.some(s => s.id === 'grammar')).toBe(false)
    expect(newSectionId(sampleTest, 'kanji')).toBe('kanji2')
    const added = appendSection(sampleTest, { id: newSectionId(sampleTest, 's'), kind: 'literary', instruction: '次の文章を読んで、あとの問いに答えなさい。', questions: [] })
    expect(added.sections.at(-1)!.id).toBe('s')
  })

  it('指示文は空にできない', () => {
    expect(setInstruction(sampleTest, 'meros', '  ').ok).toBe(false)
    const r = setInstruction(sampleTest, 'meros', '次の文章を読んで、後の問いに答えなさい。')
    expect(r.ok && r.test.sections.find(s => s.id === 'meros')!.instruction).toBe('次の文章を読んで、後の問いに答えなさい。')
  })
})

describe('小問の操作', () => {
  it('並べ替えると問の番号が振り直る', () => {
    const moved = moveQuestion(sampleTest, 'meros', 'q2', -1).sections.find(s => s.id === 'meros')!
    expect(questionNumberOf(moved, 'q2')).toBe(1)
    expect(questionNumberOf(moved, 'q1')).toBe(2)
  })

  it('削除すると、参照されている傍線部だけが本文の順に振り直る', () => {
    expect([...markNumbers(meros())]).toEqual([['a', 1], ['b', 2], ['c', 3]])
    const removed = removeQuestion(sampleTest, 'meros', 'q2').sections.find(s => s.id === 'meros')!
    expect([...markNumbers(removed)]).toEqual([['a', 1], ['c', 2]])
  })

  it('置き換えは、テストのデータとして正しくなければ理由を返す', () => {
    const q = meros().questions[1]
    expect(replaceQuestion(sampleTest, 'meros', { ...q, choices: undefined }).ok).toBe(false)
    expect(replaceQuestion(sampleTest, 'meros', { ...q, points: 4.5 }).ok).toBe(false)
    const r = replaceQuestion(sampleTest, 'meros', { ...q, choices: ['あ', 'い', 'う', 'え'] })
    expect(r.ok && r.test.sections.find(s => s.id === 'meros')!.questions[1].choices).toEqual(['あ', 'い', 'う', 'え'])
  })
})

describe('問い文と番号の印', () => {
  const numbers = markNumbers(meros())

  it('番号の印の文字列にして、元に戻せる', () => {
    const q = meros().questions[1]
    const text = stemToText(q.stem, numbers, q.choices!.length)
    expect(text).toBe('{傍線部②}「邪智暴虐」の意味として最も適切なものを、次の{ア〜エ}から一つ選び、記号で答えなさい。')
    expect(textToStem(text, numbers)).toEqual({ ok: true, stem: q.stem })
  })

  it('本文にない番号や、閉じていない括弧は不正', () => {
    const r = textToStem('{傍線部⑨}とありますが', numbers)
    expect(r.ok === false && r.errors[0]).toContain('{傍線部⑨}')
    expect(textToStem('{傍線部①とありますが', numbers).ok).toBe(false)
  })
})

describe('配点を満点にそろえる', () => {
  it('百点のテストを五十点にそろえる', () => {
    const r = rescalePoints({ ...sampleTest, info: { ...sampleTest.info, fullMarks: 50 } })
    expect(r.ok && totalPoints(r.test)).toBe(50)
  })

  it('〇・五点刻みでも、どれも刻みの倍数', () => {
    const r = rescalePoints({ ...sampleTest, info: { ...sampleTest.info, fullMarks: 75, pointStep: 0.5 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(totalPoints(r.test)).toBe(75)
    const values = r.test.sections.flatMap(s => s.questions.map(q => q.points ?? q.pointsEach!))
    expect(values.every(v => Number.isInteger(v / 0.5) && v > 0)).toBe(true)
  })

  it('小問がなければそろえられない', () => {
    expect(rescalePoints({ ...sampleTest, sections: [] }).ok).toBe(false)
  })
})
