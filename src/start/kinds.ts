import { unitsOf } from '../catalog/catalog'
import type { Grade, Group } from '../catalog/schema'
import type { Section } from '../model/schema'

type SectionKind = Section['kind']

/*
 * 教材の大問の種類。資料にはない、こちらの判断による分類なので、単元データ（資料の事実）とは分けて置く。
 * 教材名は、単元データのまとまりの最初の教材名と一字も違わずに書く。
 */

const EXPOSITORY = new Set([
  'ダイコンは大きな根？', 'ちょっと立ち止まって', '比喩で広がる言葉の世界', '「言葉」をもつ鳥、シジュウカラ', '「不便」の価値を見つめ直す',
  'クマゼミ増加の原因を探る', '言葉の力', 'モアイは語る――地球の未来', '君は「最後の晩餐」を知っているか', '「自分らしさ」を認め合う社会へ',
  '作られた「物語」を超えて', '言葉の釣り糸を垂らす', '実用的な文章を読もう', '複数の意見を読んで、考えよう――正解が一つに決まらない課題と向き合う', 'それでも、言葉を',
])

const CLASSICAL = new Set([
  '蓬萊の玉の枝――「竹取物語」から', '枕草子', '扇の的　――「平家物語」から', '仁和寺にある法師――「徒然草」から',
  '君待つと――万葉・古今・新古今', '夏草――「おくのほそ道」から',
])

const KANBUN = new Set(['今に生きる言葉', '漢詩の風景', '学びて時に之を習ふ――「論語」から'])

// 読書や情報の扱い方の単元で、定期テストの文章の大問にはしないもの
const NOT_FOR_TEST = new Set([
  '国語の力試し', '情報収集の達人になろう', 'メディアの特徴を生かして情報を集めよう', '本の中の中学生', '翻訳作品を読み比べよう',
  '「私の一冊」を探しにいこう羊と鋼の森', '本は世界への扉', '研究の現場にようこそ',
])

export const CLASSIFIED_NAMES = [...EXPOSITORY, ...CLASSICAL, ...KANBUN, ...NOT_FOR_TEST]

export function kindOf(material: string): SectionKind {
  if (KANBUN.has(material)) return 'kanbun'
  if (CLASSICAL.has(material)) return 'classical'
  if (EXPOSITORY.has(material)) return 'expository'
  return 'literary'
}

export type Material = {
  name: string
  unit: string | null
  month: number
  kind: SectionKind
}

/** その学年で、文章の大問にできる教材（読むことの指導事項を持つまとまり）を年間指導計画の順に並べる */
export function materialsOf(grade: Grade): Material[] {
  return unitsOf(grade).flatMap(unit =>
    unit.groups
      .filter((g: Group) => g.standards.some(c => c.startsWith('C(1)')) && !NOT_FOR_TEST.has(g.materials[0]))
      .map(g => {
        return { name: g.materials[0], unit: unit.title, month: g.month, kind: kindOf(g.materials[0]) }
      }),
  )
}


// 文法の教材と漢字の指導事項の記号は、サーバー側の関数も使うので単元データの側に置く
export { grammarMaterialsOf, kanjiStandardOf, type GrammarMaterial } from '../catalog/catalog'
