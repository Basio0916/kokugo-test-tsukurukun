import { z } from 'zod'

/* 教科書の単元データの形。資料の事実情報（単元名・教材名・月・時数・記号）だけを持つ */

// 指導事項の記号。知識及び技能は (1)エ、思考力・判断力・表現力等は C(1)イ の形で、小問の standard と同じ書き方
export const StandardCode = z.string().regex(/^(\([123]\)[ア-カ]|[ABC]\(1\)[ア-オ])$/)
// 言語活動例の記号
export const ActivityCode = z.string().regex(/^[ABC]\(2\)[ア-ウ]$/)

export const Grade = z.union([z.literal(1), z.literal(2), z.literal(3)])

export const Group = z.object({
  month: z.number().int().min(1).max(12),
  materials: z.array(z.string().min(1)).min(1),
  hours: z.number().int().positive(),
  breakdown: z.string().min(1).optional(),
  standards: z.array(StandardCode),
  activities: z.array(ActivityCode),
  // 前の学年の指導事項・言語活動例を扱うまとまり（三年の文法のまとめ、俳句の創作など）
  earlierGradeCodes: z.array(z.object({ grade: Grade, code: z.union([StandardCode, ActivityCode]) })).optional(),
})

export const Unit = z.object({
  // 単元より前に置かれた教材のまとまりは、単元名を持たない
  title: z.string().min(1).nullable(),
  groups: z.array(Group).min(1),
})

export const Source = z.object({
  title: z.string().min(1),
  url: z.url(),
  retrieved: z.iso.date(),
})

export const Catalog = z.object({
  textbook: z.string().min(1),
  sources: z.array(Source).min(1),
  grades: z.array(z.object({ grade: Grade, units: z.array(Unit).min(1) })).length(3),
})

export const StandardTexts = z.object({
  source: Source,
  items: z.array(z.object({ grade: Grade, code: z.union([StandardCode, ActivityCode]), text: z.string().min(1) })).min(1),
})

export type Grade = z.infer<typeof Grade>
export type Group = z.infer<typeof Group>
export type Unit = z.infer<typeof Unit>
export type Catalog = z.infer<typeof Catalog>
export type StandardTexts = z.infer<typeof StandardTexts>
