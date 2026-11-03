import { describe, expect, it } from 'vitest'
import { insertQuestion } from '../edit/operations'
import { markNumbers, questionNumberOf } from '../model/derive'
import { sampleTest } from '../sample/sampleTest'
import { toIdeas, type QuestionIdeas } from './addQuestion'
import { addMarks, plainText } from './anchor'

const meros = () => sampleTest.sections.find(s => s.id === 'meros')!
const segments = () => {
  const p = meros().passage!
  return p.kind === 'prose' ? p.segments : []
}

describe('今の傍線部を残して引用を付ける', () => {
  it('同じ範囲は今の傍線部を使い、新しい箇所には新しい傍線部を付ける', () => {
    const r = addMarks(segments(), [{ key: 'A', quote: '邪智暴虐' }, { key: 'B', quote: '人一倍に敏感であった' }], () => 'new1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.ids.get('A')).toBe('b')
    expect(r.ids.get('B')).toBe('new1')
    expect(plainText(r.segments)).toBe(plainText(segments()))
    expect(r.segments.filter(s => s.kind === 'mark').map(s => s.kind === 'mark' && s.id)).toEqual(['a', 'b', 'c', 'new1'])
  })

  it('今の傍線部と一部だけ重なる引用は不正', () => {
    const r = addMarks(segments(), [{ key: 'A', quote: '激怒した。必ず' }], () => 'new1')
    expect(r.ok === false && r.errors[0]).toContain('一部だけ重なっている')
  })
})

describe('小問を差し込む', () => {
  it('問一の後に差し込むと問二になる', () => {
    const q = { ...meros().questions[0], id: 'added' }
    const r = insertQuestion(sampleTest, 'meros', 1, q)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const section = r.test.sections.find(s => s.id === 'meros')!
    expect(questionNumberOf(section, 'added')).toBe(2)
    expect(questionNumberOf(section, 'q2')).toBe(3)
  })
})

describe('小問を足す AI の案', () => {
  const idea = (quote: string, stem: string) => ({
    marks: [{ key: 'A', quote }],
    question: {
      format: 'short' as const, stem, answer: '答え', kanten: 'thinking' as const, standard: 'C(1)イ', weight: 1, rationale: '理由',
    },
  })

  it('案ごとに傍線部を付けて小問を組み立て、配点は今の小問の平均', () => {
    const proposal: QuestionIdeas = { ideas: [idea('人一倍に敏感であった', '{傍線部:A}とありますが、どういうことですか。')] }
    const r = toIdeas(meros(), proposal, { pointStep: 1, subtotal: 24 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [first] = r.ideas
    expect(first.question.points).toBe(6)
    const section = { ...first.section, questions: [...first.section.questions, first.question] }
    expect([...markNumbers(section).values()]).toEqual([1, 2, 3, 4])
  })

  it('通らない案は理由を返す。線を引いた箇所を引用していない案も不正', () => {
    const bad = toIdeas(meros(), { ideas: [idea('メロスは怒った', '{傍線部:A}について。')] }, { pointStep: 1, subtotal: 24 })
    expect(bad.ok === false && bad.errors[0]).toContain('本文にない')
    const notQuoted = toIdeas(meros(), { ideas: [idea('邪智暴虐', '{傍線部:A}の意味は。')] }, { pointStep: 1, subtotal: 24, quote: '人一倍に敏感であった' })
    expect(notQuoted.ok === false && notQuoted.errors[0]).toContain('線を引いた')
  })

  it('おすすめの一部が通らなければ、通った案だけを返す', () => {
    const r = toIdeas(meros(), { ideas: [idea('メロスは怒った', '{傍線部:A}について。'), idea('村の牧人', '{傍線部:A}とは何ですか。')] }, { pointStep: 1, subtotal: 24 })
    expect(r.ok && r.ideas.length).toBe(1)
  })
})
