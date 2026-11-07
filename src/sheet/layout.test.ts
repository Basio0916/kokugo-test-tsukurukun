import { describe, expect, it } from 'vitest'
import { removeQuestion } from '../edit/operations'
import { kantenTotals, sectionPoints } from '../model/derive'
import type { Question, Section, Test } from '../model/schema'
import { longTest } from '../sample/longTest'
import { sampleTest } from '../sample/sampleTest'
import { AREA, layoutAnswerSheet, piecesOf, type Unit } from './layout'

const section = (id: string) => sampleTest.sections.find(s => s.id === id)!
const q = (sid: string, qid: string) => section(sid).questions.find(x => x.id === qid)!

describe('解答欄の大きさ', () => {
  it('記号選択は二マス、項目があれば項目ごと', () => {
    expect(piecesOf(section('meros'), q('meros', 'q2'))).toEqual([{ rows: 2, cols: 1, grid: false }])
    expect(piecesOf(section('grammar'), q('grammar', 'g1')).map(p => [p.label, p.rows])).toEqual([['①', 2], ['②', 2], ['③', 2]])
  })

  it('漢字・仮名の項目は答えの字数に一マス足す。傍線部を指す項目は傍線部の番号', () => {
    expect(piecesOf(section('kanji'), q('kanji', 'k1')).map(p => [p.label, p.rows])).toEqual([['①', 4], ['②', 6], ['③', 4], ['④', 3], ['⑤', 3]])
    expect(piecesOf(section('ougi'), q('ougi', 'o2')).map(p => [p.label, p.rows])).toEqual([['②', 5], ['③', 5]])
  })

  it('抜き出し・記述は字数のマス目で、二十マスで折り返す', () => {
    expect(piecesOf(section('meros'), q('meros', 'q1'))).toEqual([{ rows: 11, cols: 1, grid: true, count: 11 }])
    expect(piecesOf(section('meros'), q('meros', 'q3'))).toEqual([{ rows: 20, cols: 2, grid: true, count: 40 }])
    expect(piecesOf(section('sakubun'), q('sakubun', 'c1'))).toEqual([{ rows: 20, cols: 10, grid: true, count: 200 }])
  })

  it('短答は字数の指定があればマス目、なければ答えの字数に二マス足す', () => {
    expect(piecesOf(section('ougi'), q('ougi', 'o4'))).toEqual([{ rows: 2, cols: 1, grid: true, count: 2 }])
    expect(piecesOf(section('kanshi'), q('kanshi', 'h2'))).toEqual([{ rows: Math.max(3, [...q('kanshi', 'h2').answer!].length + 2), cols: 1, grid: false }])
    expect(piecesOf(section('kanshi'), q('kanshi', 'h4')).map(p => [p.label, p.rows])).toEqual([['①', 4], ['②', 4]])
  })
})

const overlaps = (a: Unit, b: Unit) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function checkLayout(test: Test) {
  const layout = layoutAnswerSheet(test)
  expect(layout.fits).toBe(true)
  expect(layout.width).toBeLessThanOrEqual(AREA.width)
  const bodyBottom = (layout.rows) * layout.cell
  layout.sections.forEach((s, si) => {
    const sec = test.sections[si]
    // すべての小問の見出しが載る
    const named = new Set(s.units.filter(u => u.kind === 'question').map(u => u.label))
    expect(named.size).toBe(sec.questions.length)
    // 重ならず、大問の幅と一列のマスの数に収まる
    s.units.forEach((u, i) => {
      expect(u.x + u.w).toBeLessThanOrEqual(s.w + 1e-9)
      expect(u.y + u.h).toBeLessThanOrEqual(bodyBottom + 1e-9)
      s.units.slice(i + 1).forEach(v => expect(overlaps(u, v)).toBe(false))
    })
    expect(s.scores.reduce((a, x) => a + x.points, 0)).toBe(sectionPoints(sec))
    if (si > 0) expect(s.x).toBeGreaterThanOrEqual(layout.sections[si - 1].x + layout.sections[si - 1].w)
  })
  const totals = kantenTotals(test)
  for (const kanten of ['knowledge', 'thinking'] as const) {
    expect(layout.sections.flatMap(s => s.scores).filter(x => x.kanten === kanten).reduce((a, x) => a + x.points, 0)).toBe(totals[kanten])
  }
  return layout
}

describe('解答用紙の割り付け', () => {
  it('サンプルは一枚に収まり、すべての小問が重ならずに載る', () => {
    const layout = checkLayout(sampleTest)
    expect(layout.cell).toBe(9)
    expect(layout.sections.map(s => s.label)).toEqual(['一', '二', '三', '四', '五', '六'])
  })

  it('小問の多いサンプルも、すべての小問が重ならずに一枚に収まる', () => {
    checkLayout(longTest)
  })

  it.each([7, 8])('漢字と文法、各%i問（記述を含む）の文章の大問三つ、作文のテストも一枚に収まる', count => {
    const answer = (n: number) => 'あ'.repeat(n)
    const base = { kanten: 'thinking' as const, standard: 'C(1)イ', points: 4, stem: [] }
    const choice = { ...base, format: 'choice' as const, choices: ['あ', 'い', 'う', 'え'], correct: 0 }
    const written: Array<Omit<Question, 'id'>> = [
      { ...base, format: 'extract', charLimit: 13, answer: answer(13) },
      { ...base, format: 'extract', charLimit: 22, answer: answer(22) },
      { ...base, format: 'description', charLimit: 50, answer: answer(50) },
      { ...base, format: 'description', charLimit: 60, answer: answer(60) },
    ]
    const questions = [...written, ...Array<Omit<Question, 'id'>>(count - written.length).fill(choice)]
    const reading = (id: string): Section => ({ ...section('meros'), id, questions: questions.map((q, i) => ({ ...q, id: `${id}-q${i + 1}` })) })
    checkLayout({ ...sampleTest, sections: [section('kanji'), section('grammar'), reading('a'), reading('b'), reading('c'), section('sakubun')] })
  })

  it('入らなければマスを小さくして収まる大きさを選ぶ', () => {
    const wide = { ...sampleTest, sections: sampleTest.sections.map(s => (s.id === 'sakubun' ? { ...s, questions: s.questions.map(x => ({ ...x, charLimit: 400 })) } : s)) }
    const layout = checkLayout(wide)
    expect(layout.cell).toBeLessThan(9)
  })

  it('漢字の項目が列をまたぐと、次の列にも小問の見出しが付く', () => {
    const kanji = layoutAnswerSheet(sampleTest).sections[0]
    const heads = kanji.units.filter(u => u.kind === 'question')
    expect(heads.map(h => h.label).filter(l => l === '問一').length).toBeGreaterThan(1)
    expect(new Set(heads.filter(h => h.label === '問一').map(h => h.x)).size).toBeGreaterThan(1)
  })

  it('小問を消すと番号と小計が変わる', () => {
    const meros = layoutAnswerSheet(removeQuestion(sampleTest, 'meros', 'q2')).sections[2]
    expect([...new Set(meros.units.filter(u => u.kind === 'question').map(u => u.label))]).toEqual(['問一', '問二', '問三'])
    expect(meros.scores).toEqual([{ kanten: 'thinking', points: 20 }])
  })

  it('作文の問の見出しは「作文」', () => {
    const sakubun = layoutAnswerSheet(sampleTest).sections.at(-1)!
    expect(sakubun.units.filter(u => u.kind === 'question').map(u => u.label)).toEqual(['作文'])
  })

  it('本文を貼る前の大問は本文待ち', () => {
    const t = { ...sampleTest, sections: [...sampleTest.sections, { id: 's', kind: 'literary' as const, instruction: '次の文章を読んで、あとの問いに答えなさい。', questions: [] }] }
    expect(layoutAnswerSheet(t).sections.at(-1)!.waiting).toBe('本文待ち')
  })

  it('いちばん小さいマスでも入らなければ fits が false', () => {
    const huge = { ...sampleTest, sections: sampleTest.sections.map(s => (s.id === 'sakubun' ? { ...s, questions: s.questions.map(x => ({ ...x, charLimit: 1200 })) } : s)) }
    const layout = layoutAnswerSheet(huge)
    expect(layout.fits).toBe(false)
    expect(layout.cell).toBe(6)
  })
})
