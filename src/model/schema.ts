import { z } from 'zod'

/* テストのデータの形。型はここから作り、読み込み時と AI の出力を受け取るときに検証する */

export const PointStep = z.union([z.literal(1), z.literal(0.5)])

export const TestInfo = z.object({
  year: z.string().min(1),
  name: z.string().min(1),
  grade: z.string().min(1),
  fullMarks: z.number().positive(),
  minutes: z.number().int().positive(),
  pointStep: PointStep,
})

/* 本文。傍線部は文字を包むので、本文を直しても傍線は文字と一緒に動く */
const Text = z.object({ kind: z.literal('text'), text: z.string().min(1) })
const Ruby = z.object({ kind: z.literal('ruby'), base: z.string().min(1), reading: z.string().min(1) })
const ProseInline = z.discriminatedUnion('kind', [Text, Ruby])
const ProseMark = z.object({ kind: z.literal('mark'), id: z.string().min(1), children: z.array(ProseInline).min(1) })
// 段落の区切り。傍線部は段落をまたがないので、傍線部の中には入らない
const ParagraphBreak = z.object({ kind: z.literal('break') })
export const ProseSegment = z.discriminatedUnion('kind', [Text, Ruby, ProseMark, ParagraphBreak])

export const ProsePassage = z.object({
  kind: z.literal('prose'),
  segments: z.array(ProseSegment).min(1),
  source: z.string().min(1),
})

/* 漢文。句ごとに、文字に送り仮名と返り点を付ける */
export const KanbunChar = z.object({
  kind: z.literal('char'),
  char: z.string().length(1),
  okurigana: z.string().min(1).optional(),
  kaeriten: z.string().min(1).optional(),
})
const KanbunMark = z.object({ kind: z.literal('mark'), id: z.string().min(1), children: z.array(KanbunChar).min(1) })
export const KanbunToken = z.discriminatedUnion('kind', [KanbunChar, KanbunMark])

export const KanbunPassage = z.object({
  kind: z.literal('kanbun'),
  title: z.string().min(1),
  // 作者がわからない（論語の章など）ときは空にできる
  author: z.string(),
  lines: z.array(z.array(KanbunToken).min(1)).min(1),
  notes: z.array(z.string().min(1)),
})

export const Passage = z.discriminatedUnion('kind', [ProsePassage, KanbunPassage])

/* 問い文。傍線部は番号ではなく識別子への参照で持ち、番号は描くときに決まる */
export const StemSegment = z.discriminatedUnion('kind', [
  Text,
  z.object({ kind: z.literal('markRef'), id: z.string().min(1), form: z.enum(['label', 'number']) }),
  z.object({ kind: z.literal('choiceRange') }),
])

/* 小問の項目（①〜⑤ など）。傍線部への参照だけを持つ項目もある */
const ItemSegment = z.discriminatedUnion('kind', [Text, z.object({ kind: z.literal('underline'), text: z.string().min(1) })])
export const Item = z.object({
  segments: z.array(ItemSegment).optional(),
  markId: z.string().min(1).optional(),
  answer: z.string().min(1),
})

export const Kanten = z.enum(['knowledge', 'thinking'])
export const AnswerFormat = z.enum(['choice', 'extract', 'description', 'kanji', 'short', 'kana', 'composition'])

export const Question = z
  .object({
    id: z.string().min(1),
    format: AnswerFormat,
    stem: z.array(StemSegment),
    conditions: z.array(z.string().min(1)).optional(),
    charLimit: z.number().int().positive().optional(),
    choices: z.array(z.string().min(1)).min(2).optional(),
    correct: z.number().int().nonnegative().optional(),
    items: z.array(Item).min(1).optional(),
    points: z.number().positive().optional(),
    pointsEach: z.number().positive().optional(),
    kanten: Kanten,
    standard: z.string().min(1),
    answer: z.string().min(1).optional(),
    rubric: z.array(z.string().min(1)).optional(),
  })
  .superRefine((q, ctx) => {
    if ((q.points === undefined) === (q.pointsEach === undefined)) ctx.addIssue({ code: 'custom', message: '配点は points か pointsEach のどちらか一方だけを持つ' })
    if (q.pointsEach !== undefined && !q.items) ctx.addIssue({ code: 'custom', message: '各◯点の配点は項目を持つ小問にだけ付ける' })
    if (q.format === 'choice' && !q.choices) ctx.addIssue({ code: 'custom', message: '記号選択の小問は選択肢を持つ' })
    if (q.choices && q.correct !== undefined && q.correct >= q.choices.length) ctx.addIssue({ code: 'custom', message: '正答が選択肢の範囲外' })
    if (q.format === 'composition' && !q.conditions) ctx.addIssue({ code: 'custom', message: '作文の問は条件を持つ' })
  })

export const SectionKind = z.enum(['kanji', 'grammar', 'literary', 'expository', 'classical', 'kanbun', 'composition'])
type SectionKind = z.infer<typeof SectionKind>
const PROSE_KINDS = ['literary', 'expository', 'classical'] as const
// 本文を持つ大問の種類（文章・古文は文章の本文、漢文は漢文の本文）
export const PASSAGE_KINDS: readonly SectionKind[] = [...PROSE_KINDS, 'kanbun']
export const needsPassage = (kind: SectionKind) => PASSAGE_KINDS.includes(kind)

export const Section = z
  .object({
    id: z.string().min(1),
    kind: SectionKind,
    instruction: z.string().min(1),
    // 単元データの教材名（教材の大問だけ。単元の指導事項を引くのに使う）
    material: z.string().min(1).optional(),
    passage: Passage.optional(),
    questions: z.array(Question),
  })
  .superRefine((s, ctx) => {
    const prose = (PROSE_KINDS as readonly string[]).includes(s.kind)
    // 本文を貼る前の大問は、本文も小問も持たない
    const beforePaste = !s.passage && s.questions.length === 0
    if (prose && !beforePaste && s.passage?.kind !== 'prose') ctx.addIssue({ code: 'custom', message: '文章を扱う大問は本文を持つ' })
    if (s.kind === 'kanbun' && !beforePaste && s.passage?.kind !== 'kanbun') ctx.addIssue({ code: 'custom', message: '漢文の大問は漢文の本文を持つ' })
    if (!needsPassage(s.kind) && s.passage) ctx.addIssue({ code: 'custom', message: 'この種類の大問は本文を持たない' })
    if (s.kind === 'composition' && (s.questions.length !== 1 || s.questions[0].format !== 'composition')) ctx.addIssue({ code: 'custom', message: '作文の大問は作文の問を一つだけ持つ' })
  })

const isMultiple = (value: number, step: number) => Number.isInteger(value / step)

export const Test = z
  .object({
    info: TestInfo,
    sections: z.array(Section),
  })
  .superRefine((t, ctx) => {
    const step = t.info.pointStep
    t.sections.forEach((s, si) => s.questions.forEach((q, qi) => {
      const value = q.points ?? q.pointsEach
      if (value !== undefined && !isMultiple(value, step)) ctx.addIssue({ code: 'custom', path: ['sections', si, 'questions', qi], message: `配点 ${value} が刻み ${step} の倍数ではない` })
    }))
  })

export type TestInfo = z.infer<typeof TestInfo>
export type ProseSegment = z.infer<typeof ProseSegment>
export type ProsePassage = z.infer<typeof ProsePassage>
export type KanbunChar = z.infer<typeof KanbunChar>
export type KanbunToken = z.infer<typeof KanbunToken>
export type KanbunPassage = z.infer<typeof KanbunPassage>
export type Passage = z.infer<typeof Passage>
export type StemSegment = z.infer<typeof StemSegment>
export type Item = z.infer<typeof Item>
export type Kanten = z.infer<typeof Kanten>
export type Question = z.infer<typeof Question>
export type Section = z.infer<typeof Section>
export type Test = z.infer<typeof Test>
