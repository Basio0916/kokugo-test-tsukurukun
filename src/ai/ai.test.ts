import { describe, expect, it } from 'vitest'
import { markNumbers } from '../model/derive'
import { prose } from '../model/notation'
import type { ProseSegment } from '../model/schema'
import { sampleTest } from '../sample/sampleTest'
import { anchorMarks, plainText } from './anchor'
import { allocatePoints } from './points'
import type { ProposedQuestion, SectionProposal } from './proposal'
import { toSection } from './toSection'

const ids = (i: number) => `m${i + 1}`

describe('引用から傍線部を付ける', () => {
  const passage = prose('ころは二月の酉{とり}の刻{こく}ばかり。陸{くが}には源氏。陸{くが}には平家。')

  it('一つだけある引用に傍線部を付け、本文の文字は変えない', () => {
    const r = anchorMarks(passage, [{ key: 'A', quote: '二月の酉の刻' }], ids)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(plainText(r.segments)).toBe(plainText(passage))
    expect(r.segments[1]).toEqual({
      kind: 'mark', id: 'm1',
      children: [{ kind: 'text', text: '二月の' }, { kind: 'ruby', base: '酉', reading: 'とり' }, { kind: 'text', text: 'の' }, { kind: 'ruby', base: '刻', reading: 'こく' }],
    })
    expect(r.ids.get('A')).toBe('m1')
  })

  it('もとの傍線部は外す', () => {
    const r = anchorMarks(prose('メロスは<m:a>激怒した</m>。'), [], ids)
    expect(r.ok && r.segments).toEqual([{ kind: 'text', text: 'メロスは激怒した。' }])
  })

  it('本文にない引用は不正', () => {
    const r = anchorMarks(passage, [{ key: 'A', quote: '二月の酉の時' }], ids)
    expect(r.ok).toBe(false)
  })

  it('二回ある引用は、直前の文字で決まれば付け、決まらなければ不正', () => {
    expect(anchorMarks(passage, [{ key: 'A', quote: '陸には' }], ids).ok).toBe(false)
    const r = anchorMarks(passage, [{ key: 'A', quote: '陸には', before: '源氏。' }], ids)
    expect(r.ok && r.segments.find(s => s.kind === 'mark')).toEqual({
      kind: 'mark', id: 'm1', children: [{ kind: 'ruby', base: '陸', reading: 'くが' }, { kind: 'text', text: 'には' }],
    })
  })

  it('段落の区切りは保ち、段落をまたぐ引用は不正', () => {
    const paragraphs: ProseSegment[] = [{ kind: 'text', text: '一つ目の段落。' }, { kind: 'break' }, { kind: 'text', text: '二つ目の段落。' }]
    expect(plainText(paragraphs)).toBe('一つ目の段落。\n二つ目の段落。')
    const r = anchorMarks(paragraphs, [{ key: 'A', quote: '二つ目' }], ids)
    expect(r.ok && r.segments).toEqual([
      { kind: 'text', text: '一つ目の段落。' }, { kind: 'break' },
      { kind: 'mark', id: 'm1', children: [{ kind: 'text', text: '二つ目' }] }, { kind: 'text', text: 'の段落。' },
    ])
    expect(anchorMarks(paragraphs, [{ key: 'A', quote: '段落。\n二つ目' }], ids).ok).toBe(false)
  })

  it('ルビの親文字の途中で切れる引用と、重なる引用は不正', () => {
    const rubied: ProseSegment[] = [
      { kind: 'text', text: 'かの' },
      { kind: 'ruby', base: '邪智暴虐', reading: 'じゃちぼうぎゃく' },
      { kind: 'text', text: 'の王' },
    ]
    expect(anchorMarks(rubied, [{ key: 'A', quote: '邪智' }], ids).ok).toBe(false)
    expect(anchorMarks(passage, [{ key: 'A', quote: '二月の' }, { key: 'B', quote: '月の酉' }], ids).ok).toBe(false)
  })
})

describe('配点の割り振り', () => {
  it('小計を保ち、重みに比例して刻みの倍数にする', () => {
    expect(allocatePoints([1, 1, 2, 1], 24, 1)).toEqual([5, 5, 9, 5])
  })

  it('〇・五点刻みでも合計がちょうどになる', () => {
    const p = allocatePoints([3, 1, 1], 10, 0.5)!
    expect(p.reduce((a, b) => a + b, 0)).toBe(10)
    expect(p.every(x => Number.isInteger(x / 0.5))).toBe(true)
  })

  it('一刻みずつも配れないほど小問が多ければ null', () => {
    expect(allocatePoints([1, 1, 1], 2, 1)).toBeNull()
  })
})

describe('返答から大問を組み立てる', () => {
  const meros = sampleTest.sections.find(s => s.id === 'meros')!
  const q = (over: Partial<ProposedQuestion>): ProposedQuestion => ({
    format: 'choice', stem: '{傍線部:A}の意味を、次の{範囲}から一つ選びなさい。', choices: ['あ', 'い', 'う', 'え'], correctChoice: 'い',
    kanten: 'thinking', standard: 'C(1)イ', weight: 1, rationale: '理由', ...over,
  })
  const proposal: SectionProposal = {
    marks: [{ key: 'A', quote: '邪智暴虐' }, { key: 'B', quote: '激怒した' }],
    questions: [
      q({}),
      q({ format: 'extract', stem: '{傍線部:B}とありますが、本文から十一字で抜き出しなさい。', choices: undefined, correctChoice: undefined, charLimit: 11, answer: '王を除かなければならぬ', weight: 2 }),
    ],
  }

  it('正しい返答は大問になり、傍線部の番号は本文の順になる', () => {
    const r = toSection(meros, proposal, 1, 24)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.section.questions.map(x => x.points)).toEqual([8, 16])
    // 小計は配点の枠（24 点）。正答の文から、選択肢の番号（0 から）を決める
    expect(r.section.questions[0].correct).toBe(1)
    const before = meros.passage?.kind === 'prose' ? meros.passage.segments : []
    expect(r.section.passage?.kind === 'prose' && plainText(r.section.passage.segments)).toBe(plainText(before))
    // 「激怒した」が本文で先に出てくるので①
    expect([...markNumbers(r.section)]).toEqual([['meros-m2', 1], ['meros-m1', 2]])
    expect(r.rationales).toHaveLength(2)
  })

  it('不正な返答は、作り直しに使える理由を返す', () => {
    const r = toSection(meros, {
      marks: [{ key: 'A', quote: '邪智暴虐' }],
      questions: [
        q({ stem: '傍線部①の意味を、次のア〜エから選びなさい。' }),
        q({ correctChoice: 'お' }),
        q({ stem: '{傍線部:Z}について答えなさい。' }),
        q({ format: 'extract', choices: undefined, correctChoice: undefined, answer: '王を倒す' }),
      ],
    }, 1, 24)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.join('\n')).toContain('問1: 問い文に番号や記号を文字で書いている')
    expect(r.errors.join('\n')).toContain('問2: 正答（correctChoice）が選択肢のどれとも一致しない')
    expect(r.errors.join('\n')).toContain('問3: 問い文が参照する傍線部Zが marks にない')
    expect(r.errors.join('\n')).toContain('問4: 抜き出しの答え「王を倒す」が本文にない')
  })
})

describe('頼み方の例', () => {
  it('大問を作る返答の頼み方の例は、変換の結果に通る（なくてもよい）', () => {
    const meros = sampleTest.sections.find(s => s.id === 'meros')!
    const proposal = { marks: [{ key: 'A', quote: '激怒した' }], questions: [{ format: 'short' as const, stem: '{傍線部:A}とありますが、なぜですか。', answer: '王が人を殺すから', kanten: 'thinking' as const, standard: 'C(1)イ', weight: 1, rationale: '理由' }] }
    const withSuggestions = toSection(meros, { ...proposal, suggestions: ['人物像は記述で聞きたいです。'] }, 1, 10)
    expect(withSuggestions.ok && withSuggestions.suggestions).toEqual(['人物像は記述で聞きたいです。'])
    const without = toSection(meros, proposal, 1, 10)
    expect(without.ok && without.suggestions).toBeUndefined()
  })
})
