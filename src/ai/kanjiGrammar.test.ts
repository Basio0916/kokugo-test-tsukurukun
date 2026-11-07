import { describe, expect, it } from 'vitest'
import type { Section } from '../model/schema'
import { toGrammarSection, type GrammarProposal } from './grammar'
import { toKanjiSection, type KanjiProposal } from './kanji'

const base = (id: string, kind: 'kanji' | 'grammar'): Section => ({ id, kind, instruction: '次の問いに答えなさい。', questions: [] })

describe('漢字の大問', () => {
  const plan = { each: 2, reading: 2, writing: 2, standard: '(1)ウ' }
  const words = ['濁流', '欺く', '約束', '漂う', '邪智暴虐']
  const good: KanjiProposal = {
    reading: [{ sentence: '[[濁流]]を泳ぎ切る。', answer: 'だくりゅう' }, { sentence: '人を[[欺く]]ことはしない。', answer: 'あざむく' }],
    writing: [{ sentence: '友との[[ヤクソク]]を守る。', answer: '約束' }, { sentence: '小舟が波間に[[タダヨ]]う。', answer: '漂' }],
    readingRationale: '理由', writingRationale: '理由',
  }

  it('読み・書きの二問になり、各二点で八点', () => {
    const r = toKanjiSection(base('kanji', 'kanji'), good, plan, words)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.section.questions.map(q => [q.format, q.pointsEach, q.items?.length, q.standard])).toEqual([['kanji', 2, 2, '(1)ウ'], ['kanji', 2, 2, '(1)ウ']])
    expect(r.section.questions[0].items![0].segments).toEqual([{ kind: 'underline', text: '濁流' }, { kind: 'text', text: 'を泳ぎ切る。' }])
  })

  it('答えの形と項目の数がおかしければ、理由を返す', () => {
    const r = toKanjiSection(base('kanji', 'kanji'), {
      ...good,
      reading: [{ sentence: '人を[[欺く]]ことはしない。', answer: '欺く' }, { sentence: '[[濁流]]と[[邪智暴虐]]。', answer: 'だくりゅう' }, { sentence: '[[濁流]]を泳ぐ。', answer: 'だくりゅう' }],
      writing: [{ sentence: '友との[[やくそく]]を守る。', answer: '約束' }, { sentence: '[[ヤクジョウ]]を結ぶ。', answer: '約定' }],
    }, plan, words)
    expect(r.ok).toBe(false)
    if (r.ok) return
    const all = r.errors.join('\n')
    expect(all).toContain('読みの項目が 3 個（2 個ちょうどにする）')
    expect(all).toContain('読み1: 答え「欺く」はひらがなだけで書く')
    expect(all).toContain('読み2: 例文の傍線部（[[ ]]）が 2 か所')
    expect(all).toContain('書き1: 傍線部「やくそく」はかたかなだけで書く')
    // 「約束」を頼んで「約定」が返ると、語の単位で照らし合わせて見つかる
    expect(all).toContain('書き2: 「約定」は先生が決めた語になく、中学校で習う漢字を含まない')
  })

  it('先生の語で足りるのに、ほかの語を使うと不正', () => {
    const r = toKanjiSection(base('kanji', 'kanji'), {
      ...good,
      writing: [good.writing[0], { sentence: '[[アラシ]]が来る。', answer: '嵐' }],
    }, plan, ['濁流', '欺く', '約束', '漂う'])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toContain('先生が決めた語が 3 個しか使われていない（4 個使う）')
  })

  describe('先生の語が項目の数より少ないとき', () => {
    const short: KanjiProposal = {
      ...good,
      writing: [good.writing[0], { sentence: '[[アラシ]]が来る。', answer: '嵐' }],
    }

    it('先生の語をすべて使い、残りを中学校で習う漢字を含む語で補えば通り、補った語を理由に書き添える', () => {
      const r = toKanjiSection(base('kanji', 'kanji'), short, plan, ['濁流', '約束'])
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.rationales.map(x => x.rationale)).toEqual(['理由　AI が補った語: 欺く', '理由　AI が補った語: 嵐'])
    })

    it('補った語に中学校で習う漢字がなければ不正', () => {
      const r = toKanjiSection(base('kanji', 'kanji'), {
        ...short,
        writing: [good.writing[0], { sentence: '[[ヤクジョウ]]を結ぶ。', answer: '約定' }],
      }, plan, ['濁流', '約束'])
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.errors.join('\n')).toContain('書き2: 「約定」は先生が決めた語になく、中学校で習う漢字を含まない（補う語は中学校で習う漢字を含める）')
    })

    it('漢字を含まない語は数えない', () => {
      expect(toKanjiSection(base('kanji', 'kanji'), short, plan, ['濁流', '約束', 'ほほえむ']).ok).toBe(true)
    })
  })

  it('同じ語を二つの項目で出すと不正', () => {
    const r = toKanjiSection(base('kanji', 'kanji'), {
      ...good,
      reading: [good.reading[0], { sentence: '友との[[約束]]を守る。', answer: 'やくそく' }],
    }, plan, words)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.join('\n')).toContain('書き1: 「約束」をほかの項目でも出している（同じ語は一度だけ出す）')
  })

  it('送り仮名だけが違う語は同じ語として数える', () => {
    const r = toKanjiSection(base('kanji', 'kanji'), {
      ...good,
      reading: [{ sentence: '本を[[著す]]。', answer: 'あらわす' }, good.reading[0]],
      writing: [good.writing[0], { sentence: '[[アラシ]]が来る。', answer: '嵐' }],
    }, plan, ['著す', '著しい', '濁流', '約束'])
    expect(r.ok).toBe(true)
  })
})

describe('文法の大問', () => {
  const plan = { each: 2, count: 5, standard: '(1)オ' }
  const good: GrammarProposal = {
    questions: [
      {
        format: 'choice', stem: '次の各文の傍線部の動詞の活用の種類を、あとの{範囲}からそれぞれ選び、記号で答えなさい。',
        choices: ['五段活用', '上一段活用', '下一段活用', 'カ行変格活用'],
        items: [{ sentence: '毎日[[走る]]。', correctChoice: '五段活用' }, { sentence: '朝早く[[起きる]]。', correctChoice: '上一段活用' }, { sentence: '友が[[来る]]。', correctChoice: 'カ行変格活用' }],
        rationale: '理由',
      },
      {
        format: 'short', stem: '次の各文の傍線部の動詞の活用形を書きなさい。',
        items: [{ sentence: '友を[[信じれ]]ば、道は開ける。', answer: '仮定形' }, { sentence: '野を[[越え]]て走った。', answer: '連用形' }],
        rationale: '理由',
      },
    ],
  }

  it('記号選択の正答を記号に直し、配点は各二点', () => {
    const r = toGrammarSection(base('grammar', 'grammar'), good, plan)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.section.questions[0].items!.map(it => it.answer)).toEqual(['ア', 'イ', 'エ'])
    expect(r.section.questions.map(q => q.pointsEach)).toEqual([2, 2])
  })

  it('正答が選択肢にない・項目の合計が違う・問い文に番号・問いが一つ、を理由にする', () => {
    const [choice] = good.questions
    const r = toGrammarSection(base('grammar', 'grammar'), {
      questions: [{ ...choice, stem: '次の①〜③の動詞の活用の種類を、ア〜エから選びなさい。', items: [{ sentence: '[[走る]]。', correctChoice: 'ラ行変格活用' }] }],
    }, plan)
    expect(r.ok).toBe(false)
    if (r.ok) return
    const all = r.errors.join('\n')
    expect(all).toContain('問いが 1 問（二〜四問にする）')
    expect(all).toContain('項目が全部で 1 個（5 個ちょうどにする）')
    expect(all).toContain('問1: 問い文に番号や記号を文字で書いている')
    expect(all).toContain('問1の項目1: 正答（correctChoice）が選択肢のどれとも一致しない')
  })
})
