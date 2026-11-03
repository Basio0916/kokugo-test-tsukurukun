import { allocatePoints } from '../ai/points'
import type { Section, Test, TestInfo } from '../model/schema'
import type { Material } from './kinds'

/*
 * 選んだ教材から、テストの骨組み（本文も小問もない文章の大問の並び）と配点の枠を作る。
 * 配点の枠はテストのデータに入れず、画面の状態として持つ（小問ができたら小計は小問から求まる）。
 */

export type Allotments = Record<string, number>

// 大問の識別子 → 教材名。本文を貼る前は、出典から教材名を読めないので持っておく
export type MaterialNames = Record<string, string>

export function buildSkeleton(info: TestInfo, materials: Material[]): { test: Test; allotments: Allotments; materialNames: MaterialNames } | null {
  const points = allocatePoints(materials.map(() => 1), info.fullMarks, info.pointStep)
  if (materials.length === 0 || !points) return null
  const sections: Section[] = materials.map((m, i) => ({
    id: `s${i + 1}`,
    kind: m.kind,
    instruction: '次の文章を読んで、あとの問いに答えなさい。',
    questions: [],
  }))
  return {
    test: { info, sections },
    allotments: Object.fromEntries(sections.map((s, i) => [s.id, points[i]])),
    materialNames: Object.fromEntries(sections.map((s, i) => [s.id, materials[i].name])),
  }
}
