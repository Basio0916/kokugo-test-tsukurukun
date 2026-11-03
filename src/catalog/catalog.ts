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
