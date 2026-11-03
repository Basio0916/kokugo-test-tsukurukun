import { describe, expect, it } from 'vitest'
import { catalog, findGroup, splitStandard, standardText, unitsOf } from './catalog'

/* 資料から取り出したデータを、資料を読んで確かめた答えと突き合わせる */

describe('単元と教材のまとまり', () => {
  it('走れメロスは一月の、三つの教材をまとめたまとまり', () => {
    expect(findGroup(2, '走れメロス')).toEqual({
      month: 1,
      materials: ['走れメロス', '［書く］作品の魅力をまとめ、語り合おう', '漢字に親しもう５'],
      hours: 8,
      breakdown: '読⑥書②',
      standards: ['(1)エ', 'C(1)イ', 'C(1)オ', 'B(1)ウ', '(1)ウ'],
      activities: ['C(2)イ', 'B(2)ア'],
    })
  })

  it('古典の教材の指導事項', () => {
    expect(findGroup(2, '扇の的')?.standards).toEqual(['(3)ア', '(3)イ', 'C(1)イ'])
    expect(findGroup(2, '漢詩の風景')?.standards).toEqual(['(3)ア', '(3)イ', 'C(1)エ'])
    expect(findGroup(2, '文法２　用言の活用')?.standards).toEqual(['(1)オ'])
  })

  it('単元より前の教材と、番号のない単元を資料の位置に持つ', () => {
    const titles = unitsOf(2).map(u => u.title)
    expect(titles[0]).toBeNull()
    expect(unitsOf(2)[0].groups[0].materials).toEqual(['見えないだけ'])
    expect(titles.indexOf('情報×SDGs')).toBe(titles.indexOf('３　言葉と向き合う') + 1)
    expect(titles.filter(t => t === 'いつも本はそばに')).toHaveLength(2)
  })

  it('一つの欄に時数ごとに並んだ教材は、別のまとまりにする', () => {
    expect(findGroup(3, '温かいスープ')).toMatchObject({ hours: 2, materials: ['温かいスープ'], activities: ['C(2)イ'] })
    expect(findGroup(3, 'アラスカとの出会い')).toMatchObject({ hours: 2, activities: ['C(2)ア'] })
  })

  it('前の学年の指導事項は、学年と一緒に持つ', () => {
    expect(findGroup(3, '漢字に親しもう３')?.earlierGradeCodes).toEqual([
      { grade: 1, code: '(1)エ' },
      { grade: 2, code: '(1)オ' },
    ])
    // 資料では「（2年思・判・表B(2)ウ）」と学年を先に書いている
    expect(findGroup(3, '俳句の可能性')?.earlierGradeCodes).toEqual([{ grade: 2, code: 'B(2)ウ' }])
  })
})

describe('指導事項の文言', () => {
  it('同じ記号でも学年によって文言が違う', () => {
    expect(standardText(1, 'C(1)イ')).toBe('場面の展開や登場人物の相互関係，心情の変化などについて，描写を基に捉えること。')
    expect(standardText(2, 'C(1)イ')).toBe(
      '目的に応じて複数の情報を整理しながら適切な情報を得たり，登場人物の言動の意味などについて考えたりして，内容を解釈すること。',
    )
  })

  it('単元データのすべての記号が、その学年の文言の表で引ける', () => {
    const missing = catalog.grades.flatMap(({ grade, units }) =>
      units.flatMap(u => u.groups).flatMap(g => [
        ...[...g.standards, ...g.activities].filter(c => !standardText(grade, c)).map(c => `${grade}年 ${c}`),
        ...(g.earlierGradeCodes ?? []).filter(e => !standardText(e.grade, e.code)).map(e => `${e.grade}年 ${e.code}`),
      ]),
    )
    expect(missing).toEqual([])
  })

  it('小問の複合の記号を分けて引ける', () => {
    expect(splitStandard('C(1)オ・B(1)ウ')).toEqual(['C(1)オ', 'B(1)ウ'])
    expect(splitStandard('C(1)オ・B(1)ウ').every(c => standardText(2, c))).toBe(true)
  })
})
