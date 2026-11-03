import { allocatePoints } from '../ai/points'
import type { Section, Test, TestInfo } from '../model/schema'
import type { GrammarMaterial, Material } from './kinds'

/*
 * 選んだ教材から、テストの骨組み（本文も小問もない大問の並び）と配点の枠を作る。
 * 配点の枠はテストのデータに入れず、画面の状態として持つ（小問ができたら小計は小問から求まる）。
 */

export type Allotments = Record<string, number>

// 大問の識別子 → 教材名。本文を貼る前は、出典から教材名を読めないので持っておく
export type MaterialNames = Record<string, string>

export type SkeletonOptions = {
  kanji: boolean
  grammar: GrammarMaterial[]
}

export type Skeleton = {
  test: Test
  allotments: Allotments
  materialNames: MaterialNames
  // 文法の大問を作るときに渡す、選んだ文法の教材名
  grammarMaterials: string[]
}

/** 教材の大問の指示文 */
export function instructionFor(kind: Section['kind']): string {
  if (kind === 'classical') return '次の古文を読んで、あとの問いに答えなさい。'
  if (kind === 'kanbun') return '次の漢文を読んで、あとの問いに答えなさい。'
  return '次の文章を読んで、あとの問いに答えなさい。'
}

/** 加えた直後の作文の大問（AI が題と条件を作るまでの、決まった条件の作文の問） */
export function blankComposition(id: string, points: number): Section {
  return {
    id, kind: 'composition', instruction: 'あなたの考えを、次の条件にしたがって書きなさい。',
    questions: [{
      id: `${id}-c1`, format: 'composition', stem: [], charLimit: 200, points, kanten: 'thinking', standard: 'C(1)オ',
      conditions: ['二段落で書くこと。', '百六十字以上、二百字以内で書くこと。'],
    }],
  }
}

export const KANJI_SECTION_ID = 'kanji'
export const GRAMMAR_SECTION_ID = 'grammar'

/**
 * 漢字・文法の枠: 漢字・文法を重み 1、文章を重み 2 として按分した値に最も近い「刻みの二倍」の倍数（同じなら小さいほう、最低でも刻みの二倍）。
 * 漢字・文法は各◯点の項目で並ぶので、二点刻みに寄せて項目の数を切りよくする。端数は文章の大問が吸収する。
 */
function shortAllotment(fullMarks: number, step: number, totalWeight: number): number {
  const unit = step * 2
  const raw = fullMarks / totalWeight
  const lower = Math.max(unit, Math.floor(raw / unit) * unit)
  const upper = lower + unit
  return raw - lower <= upper - raw ? lower : upper
}

export function buildSkeleton(info: TestInfo, materials: Material[], options: SkeletonOptions = { kanji: false, grammar: [] }): Skeleton | null {
  if (materials.length === 0) return null
  const shorts: Section[] = [
    ...(options.kanji ? [{ id: KANJI_SECTION_ID, kind: 'kanji' as const, instruction: '次の問いに答えなさい。', questions: [] }] : []),
    ...(options.grammar.length ? [{ id: GRAMMAR_SECTION_ID, kind: 'grammar' as const, instruction: '次の問いに答えなさい。', questions: [] }] : []),
  ]
  const readings: Section[] = materials.map((m, i) => ({
    id: `s${i + 1}`,
    kind: m.kind,
    material: m.name,
    instruction: instructionFor(m.kind),
    questions: [],
  }))

  const each = shortAllotment(info.fullMarks, info.pointStep, shorts.length + readings.length * 2)
  const rest = info.fullMarks - each * shorts.length
  const readingPoints = rest > 0 ? allocatePoints(readings.map(() => 1), rest, info.pointStep) : null
  if (!readingPoints) return null

  return {
    test: { info, sections: [...shorts, ...readings] },
    allotments: Object.fromEntries([...shorts.map(s => [s.id, each]), ...readings.map((s, i) => [s.id, readingPoints[i]])]),
    materialNames: Object.fromEntries(readings.map((s, i) => [s.id, materials[i].name])),
    grammarMaterials: options.grammar.map(g => g.name),
  }
}
