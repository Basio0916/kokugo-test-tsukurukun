import { describe, expect, it } from 'vitest'
import { markNumbers } from '../model/derive'
import { sampleTest } from '../sample/sampleTest'
import { plainText } from './anchor'
import { describeSelection, describeTest, toChatResult, type ChatAnswer } from './chat'

const meros = () => sampleTest.sections.find(s => s.id === 'meros')!

const revised: Extract<ChatAnswer['change'], { kind: 'reviseQuestion' }> = {
  kind: 'reviseQuestion', sectionId: 'meros', questionId: 'q2',
  marks: [{ key: 'A', quote: '邪智暴虐' }],
  question: {
    format: 'choice', stem: '{傍線部:A}「邪智暴虐」の意味を、次の{範囲}から一つ選び、記号で答えなさい。',
    choices: ['悪知恵がはたらき、乱暴で残虐なこと。', '正直で心が優しいこと。', '体が強く、足が速いこと。', '物知りで、よく笑うこと。'],
    correctChoice: '悪知恵がはたらき、乱暴で残虐なこと。', kanten: 'knowledge', standard: '(1)エ', rationale: '選択肢の違いをはっきりさせた',
  },
}
const answer = (change: ChatAnswer['change']): ChatAnswer => ({ reply: '直しました。', change })

describe('AI に読ませるテストの文', () => {
  const text = describeTest(sampleTest)

  it('紙面と同じ番号に識別子を添える', () => {
    expect(text).toContain('## 【三】文学的文章「走れメロス」（識別子 meros、小計 24点）')
    expect(text).toContain('### 問二（識別子 q2、記号選択、4点、知識・技能、(1)エ）')
    expect(text).toContain('傍線部②「邪智暴虐」の意味として')
    expect(text).toContain('（正答 イ）')
    expect(text).toContain('- 傍線部③「メロスには政治がわからぬ」')
  })

  it('単元の指導事項と本文を付け、項目の小問は項目と答えを並べる', () => {
    expect(text).toContain('単元の指導事項:\n- (1)エ: 抽象的な概念を表す語句')
    const passage = meros().passage!
    expect(text).toContain(plainText(passage.kind === 'prose' ? passage.segments : []))
    expect(text).toContain('### 問一（識別子 k1、漢字、各2点×5項目、知識・技能、(1)ウ）')
    expect(text).toContain('① 人を[[欺]]くことはしない。 → あざむ')
  })

  it('本文を貼る前の文章の大問', () => {
    const empty = { ...sampleTest, sections: [{ id: 's', kind: 'literary' as const, instruction: '次の文章を読んで、あとの問いに答えなさい。', questions: [] }] }
    expect(describeTest(empty)).toContain('本文: （まだ貼られていない）')
  })

  it('選んでいるもの', () => {
    expect(describeSelection(sampleTest, { sectionId: 'meros', questionId: 'q2' })).toBe('【三】問二（大問の識別子 meros、小問の識別子 q2）')
    expect(describeSelection(sampleTest, { sectionId: 'meros' })).toBe('【三】の大問（識別子 meros）')
    expect(describeSelection(sampleTest)).toBe('（なし）')
  })
})

describe('会話の返答の関門', () => {
  it('小問を直すと、識別子と配点はそのままで、今の傍線部を使う', () => {
    const r = toChatResult(sampleTest, answer(revised))
    expect(r.ok).toBe(true)
    if (!r.ok || r.change.kind !== 'reviseQuestion') return
    const q = r.change.section.questions[1]
    expect(q.id).toBe('q2')
    expect(q.points).toBe(4)
    expect(q.correct).toBe(0)
    expect(q.stem[0]).toEqual({ kind: 'markRef', id: 'b', form: 'label' })
    expect([...markNumbers(r.change.section)]).toEqual([['a', 1], ['b', 2], ['c', 3]])
    expect(r.notes).toEqual([])
  })

  it('新しい箇所を引用すると、傍線部が増える', () => {
    const r = toChatResult(sampleTest, answer({ ...revised, marks: [{ key: 'A', quote: '人一倍に敏感であった' }] }))
    expect(r.ok && r.change.kind === 'reviseQuestion' && [...markNumbers(r.change.section).values()]).toEqual([1, 2, 3])
    expect(r.ok && r.change.kind === 'reviseQuestion' && r.change.section.passage?.kind === 'prose' && r.change.section.passage.segments.filter(s => s.kind === 'mark')).toHaveLength(4)
  })

  it('文章の大問以外の小問、ない小問、項目の小問、本文にない引用は通さない', () => {
    expect(toChatResult(sampleTest, answer({ ...revised, sectionId: 'kanji', questionId: 'k1' })).ok).toBe(false)
    expect(toChatResult(sampleTest, answer({ ...revised, questionId: 'q9' })).ok).toBe(false)
    expect(toChatResult(sampleTest, answer({ ...revised, sectionId: 'nope' })).ok).toBe(false)
    const r = toChatResult(sampleTest, answer({ ...revised, marks: [{ key: 'A', quote: '王は激怒した' }] }))
    expect(r.ok).toBe(false)
  })

  it('並べ替えはすべての大問の並びでなければ通さない', () => {
    expect(toChatResult(sampleTest, answer({ kind: 'reorderSections', order: ['meros', 'kanji'] })).ok).toBe(false)
    expect(toChatResult(sampleTest, answer({ kind: 'reorderSections', order: ['kanji', 'meros', 'grammar', 'ougi', 'kanshi', 'sakubun'] })).ok).toBe(true)
  })

  it('作り直せるのは本文を持つ文学的文章・説明的文章の大問だけ', () => {
    expect(toChatResult(sampleTest, answer({ kind: 'redraftSection', sectionId: 'meros', wish: '記述を中心に' })).ok).toBe(true)
    expect(toChatResult(sampleTest, answer({ kind: 'redraftSection', sectionId: 'ougi', wish: '易しく' })).ok).toBe(false)
  })

  it('消す大問・小問がテストにあるか', () => {
    expect(toChatResult(sampleTest, answer({ kind: 'remove', sectionId: 'meros', questionId: 'q3' })).ok).toBe(true)
    expect(toChatResult(sampleTest, answer({ kind: 'remove', sectionId: 'meros', questionId: 'q9' })).ok).toBe(false)
    expect(toChatResult(sampleTest, answer({ kind: 'remove', sectionId: 'grammar' })).ok).toBe(true)
  })

  it('相談だけなら変更なしで、気づいたことを添える', () => {
    const r = toChatResult(sampleTest, { reply: '問三がよいと思います。', notes: ['記述は一問だけです'], change: { kind: 'none' } })
    expect(r.ok && r.notes).toEqual(['記述は一問だけです'])
  })
})
