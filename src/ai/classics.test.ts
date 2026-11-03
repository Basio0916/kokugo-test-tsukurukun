import { describe, expect, it } from 'vitest'
import { sectionPoints } from '../model/derive'
import { lineText } from '../model/kanbun'
import { kanbunLine } from '../model/notation'
import type { KanbunPassage, Section } from '../model/schema'
import { sampleTest } from '../sample/sampleTest'
import { toClassicalSection, type ClassicalProposal } from './classical'
import { toKanbunSection, type KanbunProposal } from './kanbun'

const ougi = (): Section => ({ ...sampleTest.sections.find(s => s.id === 'ougi')!, questions: [] })
const q = { kanten: 'knowledge' as const, standard: '(3)ア', weight: 2, rationale: '理由' }

const classical = (over: Partial<ClassicalProposal> = {}): ClassicalProposal => ({
  ruby: [{ base: '陸', reading: 'くが' }, { base: '磯', reading: 'いそ' }],
  marks: [{ key: 'A', quote: '揺りすゑ' }, { key: 'B', quote: '漂へ' }, { key: 'C', quote: 'いづれもいづれも晴れならずといふことぞなき' }],
  questions: [
    { ...q, format: 'kana', stem: '{傍線部:A}「揺りすゑ」・{番号:B}「漂へ」を現代仮名遣いに直し、すべてひらがなで書きなさい。', items: [{ markKey: 'A', answer: 'ゆりすえ' }, { markKey: 'B', answer: 'ただよえ' }] },
    { ...q, format: 'choice', standard: 'C(1)イ', stem: '{傍線部:C}の意味として最も適切なものを、次の{範囲}から一つ選び、記号で答えなさい。', choices: ['あ', 'い', 'う', 'え'], correctChoice: 'あ' },
  ],
  ...over,
})

describe('古文の大問', () => {
  it('ルビを付けてから傍線部を付け、仮名遣いの問いは傍線部ごとの項目で、配点は枠の合計', () => {
    const r = toClassicalSection(ougi(), classical(), 1, 20)
    expect(r.ok).toBe(true)
    if (!r.ok || r.section.passage?.kind !== 'prose') return
    const rubies = r.section.passage.segments.filter(s => s.kind === 'ruby')
    expect(rubies).toEqual([{ kind: 'ruby', base: '磯', reading: 'いそ' }, { kind: 'ruby', base: '陸', reading: 'くが' }])
    expect(r.section.questions[0]).toMatchObject({ format: 'kana', items: [{ markId: 'ougi-m1', answer: 'ゆりすえ' }, { markId: 'ougi-m2', answer: 'ただよえ' }] })
    expect(sectionPoints(r.section)).toBe(20)
  })

  it('仮名遣いの答えに漢字、仮名遣いの傍線部の中のルビ、本文にない親字、ひらがなでない読みは通さない', () => {
    const kanji = classical()
    kanji.questions[0].items![0].answer = '揺りすえ'
    expect(toClassicalSection(ougi(), kanji, 1, 20)).toMatchObject({ ok: false, errors: [expect.stringContaining('ひらがなだけでない')] })
    expect(toClassicalSection(ougi(), classical({ ruby: [{ base: '漂', reading: 'ただよ' }] }), 1, 20)).toMatchObject({ ok: false, errors: [expect.stringContaining('ルビを付けている')] })
    expect(toClassicalSection(ougi(), classical({ ruby: [{ base: '城', reading: 'しろ' }] }), 1, 20).ok).toBe(false)
    expect(toClassicalSection(ougi(), classical({ ruby: [{ base: '陸', reading: 'クガ' }] }), 1, 20).ok).toBe(false)
  })
})

// 白文だけの漢文の大問（返り点と送り仮名を外したもの）
const kanshi = (): Section => {
  const s = sampleTest.sections.find(x => x.id === 'kanshi')!
  const p = s.passage as KanbunPassage
  return { ...s, questions: [], passage: { ...p, lines: p.lines.map(l => kanbunLine(lineText(l))) } }
}
const kanbun = (over: Partial<KanbunProposal> = {}): KanbunProposal => ({
  lines: ['春眠不[レ]覚(エ)[レ]暁(ヲ)', '処処聞(ク)[二]啼鳥(ヲ)[一]', '夜来風雨(ノ)声', '花落(ツルコト)知(ル)多少'],
  marks: [{ key: 'A', quote: '花落知多少' }],
  questions: [
    { ...q, format: 'short', charLimit: 4, stem: 'この漢詩の形式を何といいますか。漢字四字で書きなさい。', answer: '五言絶句' },
    { ...q, format: 'extract', stem: '{傍線部:A}から、作者が気にかけているものを漢字一字で抜き出しなさい。', answer: '花' },
  ],
  ...over,
})

describe('漢文の大問', () => {
  it('記法の訓読を読み、返り点と送り仮名を各字に付け、句の中の引用に傍線部を付ける', () => {
    const r = toKanbunSection(kanshi(), kanbun(), 1, 16)
    expect(r.ok).toBe(true)
    if (!r.ok || r.section.passage?.kind !== 'kanbun') return
    expect(r.section.passage.lines[0][3]).toEqual({ kind: 'char', char: '覚', okurigana: 'エ', kaeriten: 'レ' })
    expect(r.section.passage.lines[3][0]).toMatchObject({ kind: 'mark', id: 'kanshi-m1' })
    expect(sectionPoints(r.section)).toBe(16)
  })

  it('句の数、字の違い、返り点の対応、句にない引用、白文にない抜き出しは通さない', () => {
    expect(toKanbunSection(kanshi(), kanbun({ lines: ['春眠不[レ]覚(エ)[レ]暁(ヲ)'] }), 1, 16).ok).toBe(false)
    const wrong = kanbun()
    wrong.lines[0] = '春眠不[レ]知(ル)[レ]暁(ヲ)'
    expect(toKanbunSection(kanshi(), wrong, 1, 16)).toMatchObject({ ok: false, errors: [expect.stringContaining('白文の字を一字も変えず')] })
    const unpaired = kanbun()
    unpaired.lines[1] = '処処聞(ク)[二]啼鳥(ヲ)'
    expect(toKanbunSection(kanshi(), unpaired, 1, 16)).toMatchObject({ ok: false, errors: [expect.stringContaining('読まれないまま')] })
    expect(toKanbunSection(kanshi(), kanbun({ marks: [{ key: 'A', quote: '暁処処' }] }), 1, 16).ok).toBe(false)
    const extract = kanbun()
    extract.questions[1].answer = '月'
    expect(toKanbunSection(kanshi(), extract, 1, 16)).toMatchObject({ ok: false, errors: [expect.stringContaining('本文にない')] })
  })
})
