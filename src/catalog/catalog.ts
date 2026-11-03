// サーバー側の関数（Node の ESM）からも読み込むので、拡張子と JSON の import 属性を付ける
import mitsumura from './mitsumura-r7.json' with { type: 'json' }
import standards from './standards.json' with { type: 'json' }
import { Catalog, StandardTexts, type Grade, type Group, type Unit } from './schema.js'

/* 教科書の単元データと、学習指導要領の指導事項の文言。読み込み時に形を検証する */

export const catalog: Catalog = Catalog.parse(mitsumura)
const standardTexts: StandardTexts = StandardTexts.parse(standards)

export function unitsOf(grade: Grade): Unit[] {
  return catalog.grades.find(g => g.grade === grade)!.units
}

/** 教材名（副題を除いた先頭の部分でもよい）から、その教材を含むまとまりを探す */
export function findGroup(grade: Grade, material: string): Group | undefined {
  return unitsOf(grade)
    .flatMap(u => u.groups)
    .find(g => g.materials.some(m => m === material || m.startsWith(material)))
}

/** 学習指導要領のその学年の指導事項・言語活動例の文言。記号は学年によって意味が違う */
export function standardText(grade: Grade, code: string): string | undefined {
  return standardTexts.items.find(i => i.grade === grade && i.code === code)?.text
}

/** 小問の指導事項（「C(1)オ・B(1)ウ」のように複数を「・」でつないだもの）を記号ごとに分ける */
export function splitStandard(standard: string): string[] {
  return standard.split('・').filter(Boolean)
}

export type GrammarMaterial = {
  name: string
  standards: string[]
  earlierGradeCodes: Array<{ grade: Grade; code: string }>
}

const GRAMMAR_NAME = /^文法[0-9０-９]/

/** その学年の文法の教材（「文法」と数字で始まる教材名（例: 文法２の用言の活用）を持つまとまり） */
export function grammarMaterialsOf(grade: Grade): GrammarMaterial[] {
  return unitsOf(grade).flatMap(unit =>
    unit.groups.flatMap(g => {
      const name = g.materials.find(m => GRAMMAR_NAME.test(m))
      return name ? [{ name, standards: g.standards, earlierGradeCodes: g.earlierGradeCodes ?? [] }] : []
    }),
  )
}

/** その学年の漢字の指導事項の記号。漢字の教材に付いている知識及び技能 (1) の記号のうち、最も多いもの */
export function kanjiStandardOf(grade: Grade): string {
  const counts = new Map<string, number>()
  for (const g of unitsOf(grade).flatMap(u => u.groups)) {
    if (!g.materials.some(m => m.includes('漢字'))) continue
    for (const code of g.standards.filter(c => c.startsWith('(1)'))) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}
