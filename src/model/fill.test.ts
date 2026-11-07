import { describe, expect, it } from 'vitest'
import { fillDisplay } from '../paper/fill'
import { blankLabel, blanksOf, questionPoints } from './derive'
import { fillToText, parseFill, stem } from './notation'
import { Question, type FillSegment } from './schema'

const parsed = (src: string): FillSegment[] => {
  const r = parseFill(src)
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.fill
}

const TWO = 'メロスは[[激怒]]し、[[邪智暴虐]]の王を除こうと決意した。'
const question = (over: Record<string, unknown> = {}) => ({
  id: 'q', format: 'extract', stem: stem('次の文の空欄に当てはまる言葉を、本文からそれぞれ抜き出しなさい。'), fill: parsed(TWO), points: 6, kanten: 'thinking', standard: 'C(1)イ', ...over,
})

describe('穴埋め文の記法', () => {
  it('空欄の答えを読み、字数の上限は「｜」で添える', () => {
    expect(parsed('王を[[除く｜10]]こと。')).toEqual([{ kind: 'text', text: '王を' }, { kind: 'blank', answer: '除く', charLimit: 10 }, { kind: 'text', text: 'こと。' }])
    expect(parsed(TWO).filter(s => s.kind === 'blank')).toEqual([{ kind: 'blank', answer: '激怒' }, { kind: 'blank', answer: '邪智暴虐' }])
  })

  it.each(['[[除く|10]]', '[[除く｜10]]', '[[除く|１０]]', '[[除く｜１０]]'])('%s は半角でも全角でも読める', src => {
    expect(parsed(src)).toEqual([{ kind: 'blank', answer: '除く', charLimit: 10 }])
  })

  it('書き出すと全角の区切りになり、読み直しても同じになる', () => {
    const fill = parsed('王を[[除く|１０]]こと、[[激怒]]。')
    expect(fillToText(fill)).toBe('王を[[除く｜10]]こと、[[激怒]]。')
    expect(parsed(fillToText(fill))).toEqual(fill)
  })

  it('字数が数字でない、括弧の組がそろっていない、答えが空のときは理由を返す', () => {
    expect(parseFill('王を[[除く｜十]]こと。')).toMatchObject({ ok: false, errors: [expect.stringContaining('字数は数字で書く')] })
    expect(parseFill('王を[[除くこと。')).toMatchObject({ ok: false, errors: [expect.stringContaining('組がそろっていない')] })
    expect(parseFill('王を[[｜10]]こと。')).toMatchObject({ ok: false, errors: [expect.stringContaining('答えがない')] })
  })
})

describe('小問の穴埋め文', () => {
  it('抜き出しと短答の小問が持てて、配点は小問全体の点数', () => {
    const q = Question.parse(question())
    expect(blanksOf(q).map(b => b.answer)).toEqual(['激怒', '邪智暴虐'])
    expect(questionPoints(q)).toBe(6)
    expect(Question.safeParse(question({ format: 'short' })).success).toBe(true)
  })

  it('空欄の番号は順に振り、空欄が一つなら付けない', () => {
    expect([blankLabel(0, 2), blankLabel(1, 2)]).toEqual(['Ⅰ', 'Ⅱ'])
    expect(blankLabel(0, 1)).toBeUndefined()
  })

  it.each([
    ['字数の上限を超える答え', { fill: parsed('[[除かなければ｜3]]') }],
    ['空欄がない', { fill: [{ kind: 'text', text: '文字だけ' }] }],
    ['記述の小問', { format: 'description' }],
    ['記号選択の小問', { format: 'choice', choices: ['あ', 'い'], correct: 0 }],
    ['小問全体の答え', { answer: '激怒' }],
    ['小問全体の字数', { charLimit: 6 }],
    ['項目', { items: [{ answer: 'あ' }], points: undefined, pointsEach: 2 }],
    ['空欄が十一個', { fill: parsed('[[あ]]'.repeat(11)) }],
  ])('%s は不正', (_, over) => {
    expect(Question.safeParse(question(over)).success).toBe(false)
  })
})

describe('穴埋め文の見え方', () => {
  it('答えを出さず、番号と字数を漢数字で括弧に入れる', () => {
    expect(fillDisplay(parsed(TWO))).toBe('メロスは（Ⅰ　二字）し、（Ⅱ　四字）の王を除こうと決意した。')
  })

  it('空欄が一つなら番号を付けず、上限があれば「以内」にする', () => {
    expect(fillDisplay(parsed('王を[[除く｜10]]こと。'))).toBe('王を（十字以内）こと。')
    expect(fillDisplay(parsed('王を[[除く]]こと。'))).toBe('王を（二字）こと。')
  })
})
