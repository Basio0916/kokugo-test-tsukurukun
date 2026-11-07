import { describe, expect, it } from 'vitest'
import { removeQuestion } from '../edit/operations'
import { choiceLabel, kantenTotals, sectionPoints } from '../model/derive'
import type { Question, Section, Test } from '../model/schema'
import { longTest } from '../sample/longTest'
import { sampleTest } from '../sample/sampleTest'
import { answerOverflows, AREA, layoutAnswerSheet, piecesOf, type Unit } from './layout'

const section = (id: string) => sampleTest.sections.find(s => s.id === id)!
const q = (sid: string, qid: string) => section(sid).questions.find(x => x.id === qid)!

describe('解答欄の大きさ', () => {
  it('記号選択は二マス、項目があれば項目ごと', () => {
    expect(piecesOf(section('meros'), q('meros', 'q2'))).toEqual([{ rows: 2, cols: 1, grid: false, answer: 'イ' }])
    expect(piecesOf(section('grammar'), q('grammar', 'g1')).map(p => [p.label, p.rows])).toEqual([['①', 2], ['②', 2], ['③', 2]])
  })

  it('漢字・仮名の項目は答えの字数に一マス足す。傍線部を指す項目は傍線部の番号', () => {
    expect(piecesOf(section('kanji'), q('kanji', 'k1')).map(p => [p.label, p.rows])).toEqual([['①', 4], ['②', 6], ['③', 4], ['④', 3], ['⑤', 3]])
    expect(piecesOf(section('ougi'), q('ougi', 'o2')).map(p => [p.label, p.rows])).toEqual([['②', 5], ['③', 5]])
  })

  it('抜き出し・記述は字数のマス目で、二十マスで折り返す', () => {
    expect(piecesOf(section('meros'), q('meros', 'q1'))).toEqual([{ rows: 11, cols: 1, grid: true, count: 11, answer: q('meros', 'q1').answer }])
    expect(piecesOf(section('meros'), q('meros', 'q3'))).toEqual([{ rows: 20, cols: 2, grid: true, count: 40, answer: q('meros', 'q3').answer }])
    expect(piecesOf(section('sakubun'), q('sakubun', 'c1'))).toEqual([{ rows: 20, cols: 10, grid: true, count: 200 }])
  })

  it('短答は字数の指定があればマス目、なければ答えの字数に二マス足す', () => {
    expect(piecesOf(section('ougi'), q('ougi', 'o4'))).toEqual([{ rows: 2, cols: 1, grid: true, count: 2, answer: '対句' }])
    expect(piecesOf(section('kanshi'), q('kanshi', 'h2'))).toEqual([{ rows: Math.max(3, [...q('kanshi', 'h2').answer!].length + 2), cols: 1, grid: false, answer: q('kanshi', 'h2').answer }])
    expect(piecesOf(section('kanshi'), q('kanshi', 'h4')).map(p => [p.label, p.rows])).toEqual([['①', 4], ['②', 4]])
  })
})

describe('穴埋め文の解答欄', () => {
  const filled = (...blanks: Array<{ answer: string; charLimit?: number }>): Question => ({
    id: 'q-fill', format: 'extract', stem: [], points: 6, kanten: 'thinking', standard: 'C(1)イ',
    fill: blanks.flatMap(b => [{ kind: 'text' as const, text: 'あ' }, { kind: 'blank' as const, ...b }]),
  })

  it('空欄ごとのマス目に、番号の見出しを付ける', () => {
    expect(piecesOf(section('meros'), filled({ answer: '激怒' }, { answer: '邪智暴虐' }))).toEqual([
      { label: 'Ⅰ', rows: 2, cols: 1, grid: true, count: 2, answer: '激怒' },
      { label: 'Ⅱ', rows: 4, cols: 1, grid: true, count: 4, answer: '邪智暴虐' },
    ])
  })

  it('空欄が一つなら見出しなしで、字数の上限のマス目にする', () => {
    expect(piecesOf(section('meros'), filled({ answer: '王を除く', charLimit: 10 }))).toEqual([{ rows: 10, cols: 1, grid: true, count: 10, answer: '王を除く' }])
  })

  it('二十字を超える空欄は列を増やす', () => {
    expect(piecesOf(section('meros'), filled({ answer: 'あ', charLimit: 25 }))).toEqual([{ rows: 20, cols: 2, grid: true, count: 25, answer: 'あ' }])
  })

  it('番号の見出しが付く空欄は、見出しのぶん一マス短く折り返す', () => {
    expect(piecesOf(section('meros'), filled({ answer: '激怒' }, { answer: 'あ', charLimit: 20 }))[1]).toEqual({ label: 'Ⅱ', rows: 19, cols: 2, grid: true, count: 20, answer: 'あ' })
  })

  it('穴埋め文の小問を含むテストも、重ならずに一枚に収まる', () => {
    const meros = { ...section('meros'), questions: [...section('meros').questions, filled({ answer: '激怒' }, { answer: 'あ', charLimit: 25 })] }
    const layout = checkLayout({ ...sampleTest, sections: sampleTest.sections.map(s => (s.id === 'meros' ? meros : s)) })
    expect(layout.sections[2].units.filter(u => u.kind === 'item').map(u => u.label)).toEqual(['Ⅰ', 'Ⅱ'])
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

describe('観点の網掛け', () => {
  const sheet = layoutAnswerSheet(sampleTest)
  const heads = (index: number, kind: Unit['kind']) => sheet.sections[index].units.filter(u => u.kind === kind)

  it('項目のない小問は、知識・技能なら問の見出しを網掛けにする', () => {
    // 三（走れメロス）の問二だけが知識・技能
    const meros = heads(2, 'question')
    expect(new Set(meros.map(u => u.label))).toEqual(new Set(['問一', '問二', '問三', '問四']))
    meros.forEach(u => expect(u.shaded).toBe(u.label === '問二'))
  })

  it('項目のある小問は、項目の見出しを網掛けにし、問の見出しは列をまたいでも白', () => {
    const questions = heads(0, 'question')
    expect(questions.length).toBeGreaterThan(2)
    questions.forEach(u => expect(u.shaded).toBe(false))
    expect(heads(0, 'item').length).toBeGreaterThan(0)
    heads(0, 'item').forEach(u => expect(u.shaded).toBe(true))
  })

  it('思考・判断・表現の小問は、項目の見出しも白', () => {
    // 五（漢詩）の問四は、二つの項目を持つ思考・判断・表現の小問
    expect(heads(4, 'item').map(u => [u.label, u.shaded])).toEqual([['①', false], ['②', false]])
  })

  it('作文の見出しは白', () => {
    expect(heads(5, 'question').map(u => [u.label, u.shaded])).toEqual([['作文', false]])
  })
})

describe('欄に書き込む模範解答', () => {
  const sheet = layoutAnswerSheet(sampleTest)
  // 答えを書く欄（見出しを除く）の答えを、割り付けた順に並べる
  const answers = (index: number) => sheet.sections[index].units.filter(u => u.kind === 'box' || u.kind === 'grid').map(u => u.answer)

  it('記号選択は正答の記号、マス目の欄は模範解答', () => {
    expect(answers(2)).toEqual([q('meros', 'q1').answer, 'イ', q('meros', 'q3').answer, choiceLabel(q('meros', 'q4').correct!)])
  })

  it('項目のある小問は、項目ごとの答え', () => {
    expect(answers(0).slice(0, 5)).toEqual(['あざむ', 'だくりゅう', 'けいり', 'いそ', 'い'])
    expect(answers(1).slice(0, 3)).toEqual(['ア', 'イ', 'エ'])
    expect(answers(3).slice(1, 3)).toEqual(['ゆりすえ', 'ただよえ'])
  })

  it('作文の欄には答えを持たせない', () => {
    expect(answers(5)).toEqual([undefined])
  })

  it('穴埋め文の空欄は、空欄ごとの答え', () => {
    const fill: Question = {
      id: 'q-fill', format: 'extract', stem: [], points: 6, kanten: 'thinking', standard: 'C(1)イ',
      fill: [{ kind: 'text', text: 'メロスは' }, { kind: 'blank', answer: '激怒' }, { kind: 'text', text: 'し、' }, { kind: 'blank', answer: '邪智暴虐' }, { kind: 'text', text: 'の王を除こうと決意した。' }],
    }
    const meros = { ...section('meros'), questions: [fill] }
    const units = layoutAnswerSheet({ ...sampleTest, sections: [meros] }).sections[0].units
    expect(units.filter(u => u.kind === 'grid').map(u => [u.count, u.answer])).toEqual([[2, '激怒'], [4, '邪智暴虐']])
  })
})

describe('マス目に入りきらない模範解答', () => {
  const withAnswer = (answer: string) => ({
    ...sampleTest,
    sections: sampleTest.sections.map(s => (s.id === 'meros' ? { ...s, questions: s.questions.map(x => (x.id === 'q3' ? { ...x, answer } : x)) } : s)),
  })

  it('答えの字数がマスの数より多いと、どの小問か・字数・マスの数を知らせる', () => {
    expect(answerOverflows(withAnswer('あ'.repeat(45)))).toEqual([{ label: '【三】問三', chars: 45, cells: 40 }])
  })

  it('マスの数以内なら知らせない', () => {
    expect(answerOverflows(withAnswer('あ'.repeat(40)))).toEqual([])
    expect(answerOverflows(sampleTest)).toEqual([])
  })
})
