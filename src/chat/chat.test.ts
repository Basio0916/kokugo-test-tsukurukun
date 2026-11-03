import { describe, expect, it } from 'vitest'
import { removeQuestion, replaceQuestion } from '../edit/operations'
import { sampleTest } from '../sample/sampleTest'
import { applyChatChange } from './apply'
import { chipsFor } from './chips'
import { flagsMessage, liveFlags, mergeFlags } from './flags'
import { liveTarget, targetLabel } from './messages'

const ctx = { pointStep: 1, drafting: new Set<string>(), busy: false, grammarKnown: () => false }
const labels = (chips: ReturnType<typeof chipsFor>) => chips.map(c => c.label)
const meros = () => sampleTest.sections.find(s => s.id === 'meros')!

describe('頼み方のボタン', () => {
  it('文章の大問の記号選択の小問', () => {
    const chips = chipsFor(sampleTest, { sectionId: 'meros', questionId: 'q2' }, ctx)
    expect(labels(chips)).toEqual(['もう少し易しく', '選択肢を五つに', '記述問題にする', 'AIに作り直してもらう', 'この後ろに小問を足す', '配点を一点上げる', '配点を一点下げる'])
    expect(chips[0]).toMatchObject({ kind: 'ask', text: '【三】問二をもう少し易しくしてください' })
    expect(chips[4]).toMatchObject({ kind: 'addQuestion', at: 2 })
  })

  it('漢字の小問は配点と足すだけ。考えている間は頼みの文を送れない', () => {
    expect(labels(chipsFor(sampleTest, { sectionId: 'kanji', questionId: 'k1' }, ctx))).toEqual(['この後ろに小問を足す', '配点を一点上げる', '配点を一点下げる'])
    const busy = chipsFor(sampleTest, { sectionId: 'meros', questionId: 'q3' }, { ...ctx, busy: true, pointStep: 0.5 })
    expect(busy.filter(c => c.kind === 'ask').every(c => c.disabled)).toBe(true)
    expect(busy.at(-1)).toMatchObject({ label: '配点を〇・五点下げる', delta: -0.5 })
  })

  it('大問: 作り直す・漢字を選び直す・本文欄を開く。作っている間は押せない', () => {
    expect(labels(chipsFor(sampleTest, { sectionId: 'meros' }, ctx))).toEqual(['本文を直す', 'AIに作り直してもらう', '小問を足す'])
    expect(chipsFor(sampleTest, { sectionId: 'meros' }, { ...ctx, drafting: new Set(['meros']) })[1].disabled).toBe(true)
    expect(labels(chipsFor(sampleTest, { sectionId: 'ougi' }, ctx))).toEqual(['本文を直す', '小問を足す'])
    expect(labels(chipsFor(sampleTest, { sectionId: 'kanji' }, ctx))).toEqual(['出題する漢字を選び直す', '小問を足す'])
    expect(labels(chipsFor(sampleTest, { sectionId: 'grammar' }, { ...ctx, grammarKnown: () => true }))).toEqual(['AIに作り直してもらう', '小問を足す'])
    const empty = { ...sampleTest, sections: [{ id: 's', kind: 'literary' as const, instruction: '次の文章を読んで、あとの問いに答えなさい。', questions: [] }] }
    expect(labels(chipsFor(empty, { sectionId: 's' }, ctx))).toEqual(['本文欄を開く'])
  })
})

describe('選んでいるもの', () => {
  it('番号で書き、消えたら外れる', () => {
    expect(targetLabel(sampleTest, { sectionId: 'meros', questionId: 'q2' })).toBe('【三】問二')
    expect(targetLabel(sampleTest, { sectionId: 'meros' })).toBe('【三】')
    expect(liveTarget(removeQuestion(sampleTest, 'meros', 'q2'), { sectionId: 'meros', questionId: 'q2' })).toBeNull()
    expect(liveTarget(sampleTest, { sectionId: 'meros', questionId: 'q2' })).not.toBeNull()
  })
})

describe('会話の変更を当てはめる', () => {
  const revised = { ...meros(), questions: meros().questions.map(q => (q.id === 'q2' ? { ...q, choices: ['あ', 'い', 'う', 'え'] } : q)) }
  const change = { kind: 'reviseQuestion' as const, sectionId: 'meros', questionId: 'q2', section: revised }

  it('小問を直すと、変わった小問と確定を外す大問を返す', () => {
    const r = applyChatChange(sampleTest, sampleTest, change)
    expect(r).toMatchObject({ kind: 'applied', changed: { sectionId: 'meros', questionId: 'q2' }, unconfirm: 'meros' })
  })

  it('考えている間に同じ大問が紙面で変わっていたら入れない。他の大問なら入れる', () => {
    const edited = replaceQuestion(sampleTest, 'meros', { ...meros().questions[0], answer: '王を除く' })
    expect(edited.ok && applyChatChange(sampleTest, edited.test, change).kind).toBe('stale')
    const other = removeQuestion(sampleTest, 'kanji', 'k2')
    expect(applyChatChange(sampleTest, other, change).kind).toBe('applied')
  })

  it('並べ替えは確定を外さず、大問の顔ぶれが変わっていたら入れない', () => {
    const order = ['meros', 'kanji', 'grammar', 'ougi', 'kanshi', 'sakubun']
    const r = applyChatChange(sampleTest, sampleTest, { kind: 'reorderSections', order })
    expect(r.kind === 'applied' && r.test.sections.map(s => s.id)).toEqual(order)
    expect(r.kind === 'applied' && r.unconfirm).toBeUndefined()
    const removed = { ...sampleTest, sections: sampleTest.sections.filter(s => s.id !== 'sakubun') }
    expect(applyChatChange(sampleTest, removed, { kind: 'reorderSections', order }).kind).toBe('stale')
  })

  it('作り直しは今の大問を返し、消す小問がもうなければ入れない', () => {
    expect(applyChatChange(sampleTest, sampleTest, { kind: 'redraftSection', sectionId: 'meros', wish: '記述を中心に' })).toMatchObject({ kind: 'redraft', wish: '記述を中心に' })
    expect(applyChatChange(sampleTest, removeQuestion(sampleTest, 'meros', 'q3'), { kind: 'remove', sectionId: 'meros', questionId: 'q3' }).kind).toBe('stale')
    const r = applyChatChange(sampleTest, sampleTest, { kind: 'remove', sectionId: 'meros', questionId: 'q3' })
    expect(r.kind === 'applied' && r.test.sections.find(s => s.id === 'meros')!.questions).toHaveLength(3)
  })
})

describe('要確認', () => {
  const issue = (key: string) => ({ key, text: `文${key}` })

  it('同じ key は一つにまとめて足す', () => {
    const flags = mergeFlags({ 'meros/q2': [issue('a')] }, 'meros', { q2: [issue('a'), issue('b')], q3: [issue('c')] })
    expect(flags).toEqual({ 'meros/q2': [issue('a'), issue('b')], 'meros/q3': [issue('c')] })
  })

  it('消えた小問の要確認は残さない', () => {
    expect(liveFlags(removeQuestion(sampleTest, 'meros', 'q2'), { 'meros/q2': [issue('a')], 'meros/q3': [issue('b')] })).toEqual({ 'meros/q3': [issue('b')] })
  })

  it('小問ごとに三つのボタンを、小問ごとのまとまりで付ける', () => {
    const m = flagsMessage(sampleTest, 'meros', { 'meros/q2': [issue('a')], 'meros/q4': [issue('b')] })!
    expect(m.notes!.items).toEqual([{ head: '問二', text: '文a' }, { head: '問四', text: '文b' }])
    expect(m.buttons!.map(b => [b.label, b.group])).toEqual([
      ['問二をAIに直してもらう', 'q2'], ['問二はこのままにする', 'q2'], ['問二を消す', 'q2'],
      ['問四をAIに直してもらう', 'q4'], ['問四はこのままにする', 'q4'], ['問四を消す', 'q4'],
    ])
    expect(flagsMessage(sampleTest, 'meros', {})).toBeNull()
  })
})
