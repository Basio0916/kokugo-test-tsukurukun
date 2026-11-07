import { describe, expect, it } from 'vitest'
import { prose } from '../model/notation'
import type { ProseSegment, Section } from '../model/schema'
import { sampleTest } from '../sample/sampleTest'
import { changedParts, charMap, markAtCaret, passageIssues, passageToText, rebuildPassage } from './passageEdit'

const meros = () => sampleTest.sections.find(s => s.id === 'meros')!
const ougi = () => sampleTest.sections.find(s => s.id === 'ougi')!
const segs = (s: Section) => (s.passage?.kind === 'prose' ? s.passage.segments : [])
const withText = (s: Section, text: string): Section => ({ ...s, passage: { ...(s.passage as Extract<Section['passage'], { kind: 'prose' }>), segments: rebuildPassage(segs(s), text)!.segments } })
const marks = (segments: ProseSegment[]) => segments.flatMap(s => (s.kind === 'mark' ? [[s.id, passageToText(s.children)]] : []))

describe('穴埋め文の答えの確かめ', () => {
  const fillSection = (format: 'extract' | 'short'): Section => ({
    ...meros(),
    questions: [{
      id: 'f', format, stem: [{ kind: 'text', text: '次の文の空欄に当てはまる言葉を書きなさい。' }], points: 4, kanten: 'thinking', standard: 'C(1)イ',
      fill: [{ kind: 'blank', answer: '激怒' }, { kind: 'text', text: 'し、' }, { kind: 'blank', answer: '邪智暴虐' }, { kind: 'text', text: 'の王を除こうとした。' }],
    }],
  })
  const text = () => passageToText(segs(meros()))

  it('抜き出しの空欄の答えを本文から消すと、その小問が要確認になる', () => {
    const s = fillSection('extract')
    const issues = passageIssues(s, withText(s, text().replace('邪智暴虐', '邪悪')))
    expect(issues.f).toEqual([{ key: 'answer:邪智暴虐', text: '空欄の答え「邪智暴虐」が本文に見当たりません' }])
  })

  it('考えて答える短答の空欄は確かめない', () => {
    const s = fillSection('short')
    expect(passageIssues(s, withText(s, text().replace('邪智暴虐', '邪悪')))).toEqual({})
  })

  it('「このままにする」とした空欄の答えは、もう知らせない', () => {
    const s = fillSection('extract')
    expect(passageIssues(s, withText(s, text().replace('邪智暴虐', '邪悪')), { f: ['answer:邪智暴虐'] })).toEqual({})
  })
})

describe('文字の差分', () => {
  it('残った文字の位置を返す', () => {
    expect(charMap('あいうえお', 'あいXうえお')).toEqual([0, 1, 3, 4, 5])
    expect(charMap('あいうえお', 'あうお')).toEqual([0, -1, 1, -1, 2])
    expect(charMap('あいうえお', 'かきくけこ')).toEqual([-1, -1, -1, -1, -1])
    expect(charMap('ああああ', 'あああ').filter(i => i >= 0)).toEqual([0, 1, 2])
  })

  it('離れた二か所を直しても、間の文字は対応がつく', () => {
    const map = charMap('メロスは激怒した。王を除く。', 'メロスはひどく激怒した。暴君を除く。')
    expect(map[4]).toBe(7) // 激
    expect(map[9]).toBe(-1) // 王 は消える
    expect(map[10]).toBe(14) // を は残る
  })
})

describe('変わった箇所', () => {
  it('直前の数文字を添えて、直す前と後の組で返す', () => {
    expect(changedParts('メロスは激怒した。王を除く。', 'メロスはひどく激怒した。暴君を除く。')).toEqual([
      { before: 'メロスは', after: 'メロスはひどく' },
      { before: 'ロスは激怒した。王', after: 'ひどく激怒した。暴君' },
    ])
    expect(changedParts('あいう', 'あいう')).toEqual([])
  })
})

describe('傍線とルビを付け直す', () => {
  const text = () => passageToText(segs(meros()))

  it('本文を改行でつないだ文字列にする', () => {
    expect(passageToText(prose('あ<m:a>い</m>う'))).toBe('あいう')
    expect(passageToText([{ kind: 'text', text: 'あ' }, { kind: 'break' }, { kind: 'ruby', base: '磯', reading: 'いそ' }])).toBe('あ\n磯')
  })

  it('傍線部の前を直すと、傍線部は同じ文字に付いて動く', () => {
    const r = rebuildPassage(segs(meros()), text().replace('メロスは激怒した。', 'メロスはひどく激怒した。'))!
    expect(marks(r.segments)).toEqual([['a', '激怒した'], ['b', '邪智暴虐'], ['c', 'メロスには政治がわからぬ']])
  })

  it('傍線部の中を書き換えると、残った文字と書き足した文字を包む。丸ごと消すとなくなる', () => {
    const r = rebuildPassage(segs(meros()), text().replace('邪智暴虐', '邪知暴虐').replace('メロスには政治がわからぬ。', ''))!
    expect(marks(r.segments)).toEqual([['a', '激怒した'], ['b', '邪知暴虐']])
  })

  it('傍線部の中で改行すると、改行の前までを傍線部にし、段落を分ける', () => {
    const r = rebuildPassage(segs(meros()), text().replace('邪智暴虐', '邪智\n暴虐'))!
    expect(marks(r.segments)).toContainEqual(['b', '邪智'])
    expect(r.segments.filter(s => s.kind === 'break')).toHaveLength(1)
  })

  it('空の行は捨て、行の頭の空白は除く。空なら null', () => {
    const r = rebuildPassage(prose('あいう'), '　あい\n\n  \nう')!
    expect(r.segments).toEqual([{ kind: 'text', text: 'あい' }, { kind: 'break' }, { kind: 'text', text: 'う' }])
    expect(rebuildPassage(prose('あいう'), ' \n ')).toBeNull()
  })

  it('ルビは親字が残れば付け、親字を消したものは外れたと返す', () => {
    const t = passageToText(segs(ougi()))
    const r = rebuildPassage(segs(ougi()), t.replace('磯打つ波も', '浜打つ波も'))!
    expect(r.lostRuby).toEqual(['磯'])
    expect(r.segments).toContainEqual({ kind: 'ruby', base: '陸', reading: 'くが' })
    // 傍線部の中のルビ（酉・刻）は傍線部の中に残る
    const a = r.segments.find(s => s.kind === 'mark' && s.id === 'a')
    expect(a?.kind === 'mark' && a.children).toContainEqual({ kind: 'ruby', base: '酉', reading: 'とり' })
  })

  it('文字を入れる位置が傍線部の中にあるか', () => {
    const t = text()
    const i = t.indexOf('邪智暴虐')
    expect(markAtCaret(segs(meros()), t, i + 2, i + 2)).toBe('b')
    expect(markAtCaret(segs(meros()), t, i, i)).toBeUndefined()
    // 傍線部の直後に書き足した字は傍線部に入らないので、注意も出さない
    expect(markAtCaret(segs(meros()), t, i + 4, i + 4)).toBeUndefined()
    expect(markAtCaret(segs(meros()), t, i - 2, i + 1)).toBe('b')
    expect(markAtCaret(segs(meros()), t, 0, 0)).toBeUndefined()
  })
})

describe('本文を直したあとの食い違い', () => {
  const text = () => passageToText(segs(meros()))

  it('傍線部の前を直しただけなら、食い違いはない', () => {
    expect(passageIssues(meros(), withText(meros(), text().replace('必ず、かの', '必ず、あの')))).toEqual({})
  })

  it('傍線部の文字が変わった・消えた', () => {
    const issues = passageIssues(meros(), withText(meros(), text().replace('邪智暴虐', '邪知暴虐').replace('メロスには政治がわからぬ。', '')))
    expect(issues.q2).toEqual([{ key: 'changed:b:邪知暴虐', text: '傍線部②の文字が「邪智暴虐」から「邪知暴虐」に変わりました' }])
    expect(issues.q3).toEqual([{ key: 'gone:c', text: '傍線部③「メロスには政治がわからぬ」が本文から消えました' }])
  })

  it('抜き出しの答えと、問い文の引用が本文から消えた', () => {
    const issues = passageIssues(meros(), withText(meros(), text().replace('王を除かなければならぬ', '王をこらしめねばならぬ').replace('メロスは激怒した。', '')))
    expect(issues.q1.map(i => i.key)).toEqual(['gone:a', 'answer:王を除かなければならぬ'])
    expect(issues.q4).toEqual([{ key: 'quote:メロスは激怒した。', text: '問い文が引用している「メロスは激怒した。」が本文に見当たりません' }])
  })

  it('このままにした点は知らせない。番号が振り直っても key は同じ', () => {
    const edited = withText(meros(), text().replace('邪智暴虐', '邪知暴虐'))
    expect(passageIssues(meros(), edited, { q2: ['changed:b:邪知暴虐'] })).toEqual({})
    const removedFirst = { ...meros(), questions: meros().questions.filter(q => q.id !== 'q1') }
    expect(passageIssues(removedFirst, { ...edited, questions: removedFirst.questions }).q2[0].key).toBe('changed:b:邪知暴虐')
  })
})
