import { describe, expect, it } from 'vitest'
import { catalog } from '../catalog/catalog'
import { Test } from '../model/schema'
import { itemPlan } from '../ai/items'
import { CLASSIFIED_NAMES, grammarMaterialsOf, kanjiStandardOf, kantenOfStandard, materialsOf } from './kinds'
import { splitWords } from './splitWords'
import { pastedKanbun, pastedPassage, workOf } from './passage'
import { blankComposition, buildSkeleton } from './skeleton'

const info = { year: '令和八年度', name: '学年末テスト', grade: '二年', fullMarks: 100, minutes: 50, pointStep: 1 as const }

describe('教材の一覧', () => {
  it('分類の一覧の教材名は、どれも単元データにある', () => {
    const names = new Set(catalog.grades.flatMap(g => g.units.flatMap(u => u.groups.map(x => x.materials[0]))))
    expect(CLASSIFIED_NAMES.filter(n => !names.has(n))).toEqual([])
  })

  it('二年の一覧に走れメロスがあり、古文・漢文は選べない', () => {
    const list = materialsOf(2)
    expect(list.find(m => m.name === '走れメロス')).toMatchObject({ kind: 'literary', month: 1, unit: '８　表現を見つめる' })
    expect(list.find(m => m.name === 'モアイは語る――地球の未来')).toMatchObject({ kind: 'expository' })
    expect(list.find(m => m.name.startsWith('扇の的'))).toMatchObject({ kind: 'classical' })
    expect(list.find(m => m.name === '漢詩の風景')).toMatchObject({ kind: 'kanbun' })
    expect(list.some(m => m.name === '国語の力試し')).toBe(false)
  })
})

describe('骨組みと配点の枠', () => {
  const two = materialsOf(2).filter(m => m.name === 'アイスプラネット' || m.name === '走れメロス')

  it('教材ごとに本文も小問もない大問を並べ、満点を割り振る', () => {
    const r = buildSkeleton(info, two)!
    expect(r.test.sections.map(s => s.kind)).toEqual(['literary', 'literary'])
    expect(r.allotments).toEqual({ s1: 50, s2: 50 })
    expect(r.materialNames).toEqual({ s1: 'アイスプラネット', s2: '走れメロス' })
    expect(Test.safeParse(r.test).success).toBe(true)
  })

  it('〇・五点刻みでも合計は満点ちょうど', () => {
    const three = materialsOf(2).filter(m => m.kind === 'literary' || m.kind === 'expository').slice(0, 3)
    const r = buildSkeleton({ ...info, fullMarks: 50, pointStep: 0.5 }, three)!
    expect(Object.values(r.allotments).reduce((a, b) => a + b, 0)).toBe(50)
    expect(Object.values(r.allotments).every(p => Number.isInteger(p / 0.5))).toBe(true)
  })

  it('教材を選ばなければ作らない', () => {
    expect(buildSkeleton(info, [])).toBeNull()
  })
})

describe('本文の貼り付け', () => {
  it('改行で段落に分け、空の行と字下げの空白を取り除く', () => {
    const p = pastedPassage('　メロスは激怒した。\n\n  必ず、かの王を除かなければならぬと決意した。\r\n　メロスには政治がわからぬ。\n', '走れメロス', '太宰治')!
    expect(p.segments).toEqual([
      { kind: 'text', text: 'メロスは激怒した。' }, { kind: 'break' },
      { kind: 'text', text: '必ず、かの王を除かなければならぬと決意した。' }, { kind: 'break' },
      { kind: 'text', text: 'メロスには政治がわからぬ。' },
    ])
    expect(p.source).toBe('太宰治「走れメロス」より')
  })

  it('作者名がなければ「「教材名」より」、本文が空なら作らない', () => {
    expect(pastedPassage('本文', '走れメロス', '')!.source).toBe('「走れメロス」より')
    expect(pastedPassage(' \n　\n', '走れメロス', '太宰治')).toBeNull()
  })
})

describe('漢字・文法の教材と記号', () => {
  it('二年の文法の教材は三つ', () => {
    expect(grammarMaterialsOf(2).map(g => g.name)).toEqual(['文法１　自立語', '文法２　用言の活用', '文法３　付属語'])
    expect(grammarMaterialsOf(2)[1].standards).toEqual(['(1)オ'])
  })

  it('漢字の指導事項の記号は学年で違う', () => {
    expect([1, 2, 3].map(g => kanjiStandardOf(g as 1 | 2 | 3))).toEqual(['(1)イ', '(1)ウ', '(1)ア'])
  })
})

describe('漢字・文法を入れた骨組み', () => {
  const two = materialsOf(2).filter(m => m.name === 'アイスプラネット' || m.name === '走れメロス')
  const katsuyo = grammarMaterialsOf(2).filter(g => g.name === '文法２　用言の活用')

  it('漢字 → 文法 → 文章の順に並び、百点を 16・16・34・34 に割り振る', () => {
    const r = buildSkeleton(info, two, { kanji: true, grammar: katsuyo })!
    expect(r.test.sections.map(s => s.kind)).toEqual(['kanji', 'grammar', 'literary', 'literary'])
    expect(r.test.sections.map(s => r.allotments[s.id])).toEqual([16, 16, 34, 34])
    expect(r.grammarMaterials).toEqual(['文法２　用言の活用'])
    expect(Test.safeParse(r.test).success).toBe(true)
  })

  it('五十点・〇・五点刻みでも合計は満点ちょうどで、漢字・文法は一点の倍数', () => {
    const r = buildSkeleton({ ...info, fullMarks: 50, pointStep: 0.5 }, two.slice(0, 1), { kanji: true, grammar: katsuyo })!
    const points = r.test.sections.map(s => r.allotments[s.id])
    expect(points.reduce((a, b) => a + b, 0)).toBe(50)
    expect(points.slice(0, 2).every(p => Number.isInteger(p))).toBe(true)
  })

  it('漢字・文法だけで満点を超えるなら作らない', () => {
    expect(buildSkeleton({ ...info, fullMarks: 4 }, two, { kanji: true, grammar: katsuyo })).toBeNull()
  })
})

describe('項目ごとの配点と項目の数', () => {
  it('十六点・一点刻みは二点×八項目', () => {
    expect(itemPlan(16, 1)).toEqual({ each: 2, count: 8 })
  })

  it('〇・五点刻みでも二点に寄せる', () => {
    expect(itemPlan(12, 0.5)).toEqual({ each: 2, count: 6 })
  })

  it('二点で六〜十二項目にならない枠は、ほかの配点で六〜十二項目にする', () => {
    expect(itemPlan(30, 1)).toEqual({ each: 3, count: 10 })
    expect(itemPlan(10, 1)).toEqual({ each: 1, count: 10 })
  })
})

describe('先生が貼った語', () => {
  it('改行・読点・空白で区切り、同じ語はまとめる', () => {
    expect(splitWords('約束、信頼　名誉\n疲労,漂う 約束')).toEqual(['約束', '信頼', '名誉', '疲労', '漂う'])
  })
})

describe('古文の出典と教材名', () => {
  it('作品名は教材名のかぎかっこの中、なければ「――」の前', () => {
    expect(workOf('扇の的　――「平家物語」から')).toBe('平家物語')
    expect(workOf('枕草子')).toBe('枕草子')
    expect(workOf('君待つと――万葉・古今・新古今')).toBe('君待つと')
  })

  it('骨組みの大問は教材名を持ち、古文・漢文は種類に合った指示文になる', () => {
    const materials = materialsOf(2).filter(m => ['走れメロス', '扇の的　――「平家物語」から', '漢詩の風景'].includes(m.name))
    const skeleton = buildSkeleton({ year: '令和八年度', name: '期末', grade: '二年', fullMarks: 100, minutes: 50, pointStep: 1 }, materials)!
    // 教材は年間指導計画の順（扇の的・漢詩の風景が十一月、走れメロスが一月）
    expect(skeleton.test.sections.map(s => [s.kind, s.material, s.instruction])).toEqual([
      ['classical', '扇の的　――「平家物語」から', '次の古文を読んで、あとの問いに答えなさい。'],
      ['kanbun', '漢詩の風景', '次の漢文を読んで、あとの問いに答えなさい。'],
      ['literary', '走れメロス', '次の文章を読んで、あとの問いに答えなさい。'],
    ])
    expect(Test.safeParse(skeleton.test).success).toBe(true)
  })
})

describe('漢文の白文を貼る', () => {
  it('一行に一句。空白は除き、空の行は捨てる。語注は一行に一つ', () => {
    const p = pastedKanbun('春暁', '孟浩然', '春眠不覚暁\n 処処 聞啼鳥\n\n夜来風雨声\n花落知多少', '＊啼鳥……鳴いている鳥。\n\n＊夜来……昨夜から。')!
    expect(p.lines.map(l => l.map(t => (t.kind === 'char' ? t.char : '')).join(''))).toEqual(['春眠不覚暁', '処処聞啼鳥', '夜来風雨声', '花落知多少'])
    expect(p.notes).toEqual(['＊啼鳥……鳴いている鳥。', '＊夜来……昨夜から。'])
    expect(pastedKanbun('春暁', '', ' \n ', '')).toBeNull()
  })
})

describe('加えた直後の作文の大問', () => {
  it('決まった条件の作文の問を一つ持ち、テストのデータとして正しい', () => {
    const s = blankComposition('sakubun2', 10)
    expect(s.questions[0]).toMatchObject({ format: 'composition', charLimit: 200, points: 10, conditions: ['二段落で書くこと。', '百六十字以上、二百字以内で書くこと。'] })
    expect(Test.safeParse({ info, sections: [s] }).success).toBe(true)
  })
})

describe('教材の時数と指導事項', () => {
  it('教材に時数と指導事項の記号を持たせ、記号の頭で観点を分ける', () => {
    expect(materialsOf(2).find(m => m.name === '走れメロス')).toMatchObject({ hours: 8, standards: ['(1)エ', 'C(1)イ', 'C(1)オ', 'B(1)ウ', '(1)ウ'] })
    expect(kantenOfStandard('(1)エ')).toBe('knowledge')
    expect(kantenOfStandard('(3)ア')).toBe('knowledge')
    expect(kantenOfStandard('C(1)イ')).toBe('thinking')
    expect(kantenOfStandard('B(1)ウ')).toBe('thinking')
  })
})
