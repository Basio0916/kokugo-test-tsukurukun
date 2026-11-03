import { describe, expect, it } from 'vitest'
import { markNumbers, questionNumberOf, totalPoints } from '../model/derive'
import { sampleTest } from '../sample/sampleTest'
import { appendSection, moveQuestion, moveSection, newSectionId, removeQuestion, removeSection, reorderQuestions, reorderSections, replaceQuestion, replaceSection, setInstruction, sortQuestionsByPassage, stepPoints } from './operations'
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

  it('新しい並びで並べ替える。今の大問の並べ替えでなければ理由を返す', () => {
    const r = reorderSections(sampleTest, ['meros', 'kanji', 'grammar', 'ougi', 'kanshi', 'sakubun'])
    expect(r.ok && r.test.sections.map(s => s.id)).toEqual(['meros', 'kanji', 'grammar', 'ougi', 'kanshi', 'sakubun'])
    expect(reorderSections(sampleTest, ['meros', 'kanji']).ok).toBe(false)
    expect(reorderSections(sampleTest, ['meros', 'meros', 'grammar', 'ougi', 'kanshi', 'sakubun']).ok).toBe(false)
    expect(reorderSections(sampleTest, ['x', 'kanji', 'grammar', 'ougi', 'kanshi', 'sakubun']).ok).toBe(false)
  })

  it('大問の置き換えは、テストのデータとして正しくなければ理由を返す', () => {
    expect(replaceSection(sampleTest, { ...meros(), passage: undefined }).ok).toBe(false)
    const r = replaceSection(sampleTest, { ...meros(), instruction: '次の文章を読んで答えなさい。' })
    expect(r.ok && r.test.sections.find(s => s.id === 'meros')!.instruction).toBe('次の文章を読んで答えなさい。')
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

describe('配点の上げ下げ', () => {
  const points = (t: typeof sampleTest, sid: string, qid: string) => t.sections.find(s => s.id === sid)!.questions.find(q => q.id === qid)!
  it('刻みだけ上げ下げし、刻みより下げられない', () => {
    const up = stepPoints(sampleTest, 'meros', 'q1', 1)
    expect(up.ok && points(up.test, 'meros', 'q1').points).toBe(5)
    const one = { ...sampleTest, sections: sampleTest.sections.map(s => (s.id === 'kanshi' ? { ...s, questions: s.questions.map(q => (q.id === 'h1' ? { ...q, points: 1 } : q)) } : s)) }
    expect(stepPoints(one, 'kanshi', 'h1', -1).ok).toBe(false)
  })

  it('項目ごとの配点の小問は、項目ごとの配点を変える', () => {
    const r = stepPoints(sampleTest, 'kanji', 'k1', -1)
    expect(r.ok && points(r.test, 'kanji', 'k1').pointsEach).toBe(1)
    expect(r.ok && totalPoints(r.test)).toBe(totalPoints(sampleTest) - 5)
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

describe('決まった大問の配点を残してそろえる', () => {
  it('作文の配点は変えず、ほかを満点からその配点を引いた合計にそろえる', () => {
    const r = rescalePoints(sampleTest, ['sakubun'])
    expect(r.ok && totalPoints(r.test)).toBe(100)
    expect(r.ok && r.test.sections.find(s => s.id === 'sakubun')).toBe(sampleTest.sections.find(s => s.id === 'sakubun'))
    const bigger = { ...sampleTest, sections: sampleTest.sections.map(s => (s.id === 'sakubun' ? { ...s, questions: s.questions.map(q => ({ ...q, points: 30 })) } : s)) }
    const r2 = rescalePoints(bigger, ['sakubun'])
    expect(r2.ok && totalPoints(r2.test)).toBe(100)
    expect(r2.ok && r2.test.sections.find(s => s.id === 'sakubun')!.questions[0].points).toBe(30)
  })
})


describe('小問の並べ替えと本文の順', () => {
  const ids = (t: typeof sampleTest) => t.sections.find(s => s.id === 'meros')!.questions.map(q => q.id)
  it('新しい並びで並べ替える。その大問の小問の並べ替えでなければ理由を返す', () => {
    const r = reorderQuestions(sampleTest, 'meros', ['q1', 'q3', 'q2', 'q4'])
    expect(r.ok && ids(r.test)).toEqual(['q1', 'q3', 'q2', 'q4'])
    expect(reorderQuestions(sampleTest, 'meros', ['q1', 'q2']).ok).toBe(false)
    expect(reorderQuestions(sampleTest, 'meros', ['q1', 'q2', 'q3', 'k1']).ok).toBe(false)
  })

  it('傍線部の出てくる順に並べ、傍線部のない小問は後ろ', () => {
    const shuffled = reorderQuestions(sampleTest, 'meros', ['q4', 'q3', 'q1', 'q2'])
    expect(shuffled.ok && ids(sortQuestionsByPassage(shuffled.test, 'meros'))).toEqual(['q1', 'q2', 'q3', 'q4'])
  })
})
