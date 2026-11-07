import { z } from 'zod'
import { findGroup, standardText } from '../catalog/catalog.js'
import { choiceLabel, markNumbers, questionPoints, sectionPoints, totalPoints } from '../model/derive.js'
import { needsPassage, Section, Test, type Question, type StemSegment } from '../model/schema.js'
import { reorderQuestions, reorderSections } from '../edit/operations.js'
import { addKanbunMarks, lineNotation, lineText } from '../model/kanbun.js'
import { fillToText } from '../model/notation.js'
import { circled, kansuji } from '../paper/kansuji.js'
import { freshIds } from './addQuestion.js'
import { addMarks, plainText } from './anchor.js'
import { draftWithRetry, jsonHandler, type Checked } from './claude.js'
import { gradeOf, materialOf, redraftable, revisable } from './client.js'
import { CHAT_SYSTEM_PROMPT, chatUserPrompt } from './prompt.js'
import { ProposedMark, ProposedQuestion } from './proposal.js'
import { buildQuestion } from './toSection.js'

/*
 * 会話で AI に頼む。AI は今のテストと会話を読み、返答と、必要なら変更を一つ返す。
 * 変更は識別子で大問・小問を指し、テストに当てはめて確かめてから画面に返す（番号は AI に持たせない）。
 */

export const Selection = z.object({ sectionId: z.string().min(1), questionId: z.string().min(1).optional() })
export type Selection = z.infer<typeof Selection>

export const ChatRequest = z.object({
  test: Test,
  selection: Selection.optional(),
  // 直近の会話（先生の言葉と AI の返答の文だけ）
  history: z.array(z.object({ who: z.enum(['me', 'ai']), text: z.string() })).max(20),
  message: z.string().trim().min(1),
})
export type ChatRequest = z.infer<typeof ChatRequest>

const id = (what: string) => z.string().min(1).describe(`${what}の識別子。いまのテストの識別子をそのまま書く`)

export const ChatAnswer = z.object({
  reply: z.string().min(1).describe('先生への返答。です・ます調で三文以内'),
  notes: z.array(z.string().min(1)).optional().describe('気づいたこと。あるときだけ、一つ一文で'),
  change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({
      kind: z.literal('reviseQuestion'),
      sectionId: id('大問'),
      questionId: id('直す小問'),
      marks: z.array(ProposedMark).describe('直した小問で傍線を引く箇所。今ある傍線部を使うときも、その文字列を本文からそのまま引用する'),
      question: ProposedQuestion.omit({ weight: true }),
    }),
    z.object({ kind: z.literal('redraftSection'), sectionId: id('作り直す大問'), wish: z.string().min(1).describe('先生の希望を、問いを作る人に伝わる短い文で') }),
    z.object({ kind: z.literal('reorderSections'), order: z.array(z.string().min(1)).describe('すべての大問の識別子を、新しい順にもれなく並べる') }),
    z.object({ kind: z.literal('remove'), sectionId: id('大問'), questionId: id('消す小問（大問を消すときは書かない）').optional() }),
    z.object({ kind: z.literal('addSection') }),
    z.object({ kind: z.literal('reorderQuestions'), sectionId: id('大問'), order: z.array(z.string().min(1)).describe('その大問のすべての小問の識別子を、新しい順にもれなく並べる') }),
    z.object({ kind: z.literal('sortQuestions'), sectionId: id('本文の順に並べる大問') }),
    z.object({ kind: z.literal('addQuestion'), sectionId: id('小問を足す大問'), afterQuestionId: id('この小問の後ろに足す（大問の最後なら書かない）').optional() }),
  ]).describe('頼みに合う変更を一つだけ。紙面を変えないときは none'),
})
export type ChatAnswer = z.infer<typeof ChatAnswer>

export type ChatChange =
  | { kind: 'none' }
  // 直した小問の入った大問（本文に傍線部が増えることがあるので、大問ごと返す）
  | { kind: 'reviseQuestion'; sectionId: string; questionId: string; section: Section }
  | { kind: 'redraftSection'; sectionId: string; wish: string }
  | { kind: 'reorderSections'; order: string[] }
  | { kind: 'remove'; sectionId: string; questionId?: string }
  | { kind: 'addSection' }
  | { kind: 'reorderQuestions'; sectionId: string; order: string[] }
  | { kind: 'sortQuestions'; sectionId: string }
  | { kind: 'addQuestion'; sectionId: string; afterQuestionId?: string }
export type ChatResult = { reply: string; notes: string[]; change: ChatChange }
export type ChatResponse = Checked<ChatResult>

const KIND_NAMES: Record<Section['kind'], string> = {
  kanji: '漢字', grammar: '文法', literary: '文学的文章', expository: '説明的文章', classical: '古文', kanbun: '漢文', composition: '作文',
}
const FORMAT_NAMES: Record<Question['format'], string> = {
  choice: '記号選択', extract: '本文からの抜き出し', description: '記述', kanji: '漢字', short: '短答', kana: '仮名遣い', composition: '作文',
}

const pt = (n: number) => `${n}点`

// 問い文を紙面と同じ見え方の文にする
function stemText(stem: StemSegment[], numbers: Map<string, number>, choiceCount: number): string {
  return stem.map(s => {
    if (s.kind === 'text') return s.text
    if (s.kind === 'choiceRange') return `ア〜${choiceLabel(Math.max(choiceCount, 1) - 1)}`
    const n = circled(numbers.get(s.id) ?? 0)
    return s.form === 'label' ? `傍線部${n}` : n
  }).join('')
}

function questionText(q: Question, i: number, numbers: Map<string, number>): string {
  const points = q.pointsEach !== undefined ? `各${pt(q.pointsEach)}×${q.items?.length ?? 0}項目` : pt(questionPoints(q))
  const head = `### 問${kansuji(i + 1)}（識別子 ${q.id}、${FORMAT_NAMES[q.format]}${q.charLimit ? ` ${q.charLimit}字` : ''}、${points}、${q.kanten === 'knowledge' ? '知識・技能' : '思考・判断・表現'}、${q.standard}）`
  const lines = [head, stemText(q.stem, numbers, q.choices?.length ?? 0)].filter(Boolean)
  if (q.fill) lines.push(`穴埋め文: ${fillToText(q.fill)}`)
  if (q.conditions) lines.push(`条件: ${q.conditions.join('／')}`)
  if (q.items) {
    lines.push(`項目: ${q.items.map((it, j) => {
      const text = it.markId ? circled(numbers.get(it.markId) ?? 0) : (it.segments ?? []).map(s => (s.kind === 'underline' ? `[[${s.text}]]` : s.text)).join('')
      return `${circled(j + 1)}${text && ` ${text}`} → ${it.answer}`
    }).join('／')}`)
  }
  if (q.choices) lines.push(`選択肢: ${q.choices.map((c, j) => `${choiceLabel(j)} ${c}`).join('／')}${q.correct !== undefined ? `（正答 ${choiceLabel(q.correct)}）` : ''}`)
  if (q.answer) lines.push(`答え: ${q.answer}`)
  if (q.rubric) lines.push(`採点の観点: ${q.rubric.join('／')}`)
  return lines.join('\n')
}

/** AI に読ませる大問の文。番号は紙面と同じに書き、識別子を添える */
export function describeSection(test: Test, section: Section, i: number): string {
  const numbers = markNumbers(section)
  const material = materialOf(section)
  const grade = gradeOf(test)
  const group = grade && material ? findGroup(grade, material) : undefined
  const lines = [`## 【${kansuji(i + 1)}】${KIND_NAMES[section.kind]}${material ? `「${material}」` : ''}（識別子 ${section.id}、小計 ${pt(sectionPoints(section))}）`, `指示文: ${section.instruction}`]
  if (group && grade) lines.push(`単元の指導事項:\n${group.standards.map(code => `- ${code}: ${standardText(grade, code) ?? ''}`).join('\n')}`)
  const passage = section.passage
  if (passage?.kind === 'prose') {
    lines.push(`本文（${passage.source}）:\n${plainText(passage.segments)}`)
    const marks = passage.segments.flatMap(s => (s.kind === 'mark' && numbers.has(s.id) ? [`- 傍線部${circled(numbers.get(s.id)!)}「${plainText(s.children)}」`] : []))
    lines.push(`傍線部:\n${marks.length ? marks.join('\n') : '（なし）'}`)
  } else if (passage?.kind === 'kanbun') {
    const chars = (cs: Array<{ char: string }>) => cs.map(c => c.char).join('')
    lines.push(`本文（${passage.title}　${passage.author}。一句ごとに「字(送り仮名)[返り点]」の記法）:\n${passage.lines.map(lineNotation).join('\n')}`)
    const marks = passage.lines.flat().flatMap(t => (t.kind === 'mark' && numbers.has(t.id) ? [`- 傍線部${circled(numbers.get(t.id)!)}「${chars(t.children)}」`] : []))
    lines.push(`傍線部:\n${marks.length ? marks.join('\n') : '（なし）'}`)
    if (passage.notes.length) lines.push(`語注:\n${passage.notes.map(n => `- ${n}`).join('\n')}`)
  } else if (needsPassage(section.kind)) {
    lines.push('本文: （まだ貼られていない）')
  }
  lines.push(...(section.questions.length ? section.questions.map((q, qi) => questionText(q, qi, numbers)) : ['小問: （なし）']))
  return lines.join('\n')
}

/** AI に読ませるテストの文。番号は紙面と同じに書き、識別子を添える */
export function describeTest(test: Test): string {
  const { info } = test
  return [
    `# いまのテスト\n中学${info.grade}　${info.name}　満点 ${pt(info.fullMarks)}（いまの合計 ${pt(totalPoints(test))}）、配点は${info.pointStep}点刻み`,
    ...test.sections.map((s, i) => describeSection(test, s, i)),
  ].join('\n\n')
}

/** 選んでいる大問・小問を、紙面の番号と識別子で書く */
export function describeSelection(test: Test, selection?: Selection): string {
  const i = selection ? test.sections.findIndex(s => s.id === selection.sectionId) : -1
  if (!selection || i < 0) return '（なし）'
  const qi = selection.questionId ? test.sections[i].questions.findIndex(q => q.id === selection.questionId) : -1
  return qi < 0
    ? `【${kansuji(i + 1)}】の大問（識別子 ${selection.sectionId}）`
    : `【${kansuji(i + 1)}】問${kansuji(qi + 1)}（大問の識別子 ${selection.sectionId}、小問の識別子 ${selection.questionId}）`
}

function reviseQuestion(test: Test, change: Extract<ChatAnswer['change'], { kind: 'reviseQuestion' }>): Checked<{ change: ChatChange }> {
  const section = test.sections.find(s => s.id === change.sectionId)
  if (!section) return { ok: false, errors: [`大問 ${change.sectionId} がテストにない`] }
  const passage = section.passage
  if (!revisable(section) || !passage) return { ok: false, errors: [`大問 ${change.sectionId} は本文を持つ文章・古文・漢文の大問ではないので、会話では小問を直せない（none にして、紙面の「直す」を案内する）`] }
  const old = section.questions.find(q => q.id === change.questionId)
  if (!old) return { ok: false, errors: [`小問 ${change.questionId} が大問 ${change.sectionId} にない`] }
  if (old.items) return { ok: false, errors: [`小問 ${change.questionId} は項目を持つので、会話では直せない（none にして、紙面の「直す」を案内する）`] }
  const used = passage.kind === 'prose' ? passage.segments.flatMap(s => (s.kind === 'mark' ? [s.id] : [])) : passage.lines.flat().flatMap(t => (t.kind === 'mark' ? [t.id] : []))
  const markId = freshIds(new Set(used), `${section.id}-n`)
  // 文章・古文は本文の引用、漢文は句の中の字の引用に、今ある傍線部を残して付ける
  const anchored = passage.kind === 'prose'
    ? (() => { const r = addMarks(passage.segments, change.marks, () => markId()); return r.ok ? { ok: true as const, passage: { ...passage, segments: r.segments }, ids: r.ids, text: plainText(r.segments) } : r })()
    : (() => { const r = addKanbunMarks(passage.lines, change.marks, () => markId()); return r.ok ? { ok: true as const, passage: { ...passage, lines: r.lines }, ids: r.ids, text: r.lines.map(lineText).join('') } : r })()
  if (!anchored.ok) return { ok: false, errors: anchored.errors }
  const built = buildQuestion({ ...change.question, weight: 1 }, old.id, '直した小問', anchored.ids, anchored.text, questionPoints(old))
  if (built.errors.length) return { ok: false, errors: built.errors }
  const parsed = Section.safeParse({ ...section, passage: anchored.passage, questions: section.questions.map(q => (q.id === old.id ? built.question : q)) })
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map(issue => `直した小問: ${issue.message}`) }
  return { ok: true, change: { kind: 'reviseQuestion', sectionId: section.id, questionId: old.id, section: parsed.data } }
}

/** AI の返答の変更を今のテストに当てはめて確かめる。通らなければ、AI に返して作り直してもらう理由 */
export function toChatResult(test: Test, answer: ChatAnswer): Checked<ChatResult> {
  const base = { reply: answer.reply, notes: answer.notes ?? [] }
  const change = answer.change
  const sectionOf = (sid: string) => test.sections.find(s => s.id === sid)
  switch (change.kind) {
    case 'none':
    case 'addSection':
      return { ok: true, ...base, change }
    case 'reviseQuestion': {
      const r = reviseQuestion(test, change)
      return r.ok ? { ok: true, ...base, change: r.change } : r
    }
    case 'redraftSection': {
      const section = sectionOf(change.sectionId)
      if (!section) return { ok: false, errors: [`大問 ${change.sectionId} がテストにない`] }
      if (!redraftable(section)) return { ok: false, errors: [`大問 ${change.sectionId} は本文を持つ文章・古文・漢文の大問か作文の大問ではないので、作り直せない`] }
      return { ok: true, ...base, change }
    }
    case 'reorderSections': {
      const r = reorderSections(test, change.order)
      return r.ok ? { ok: true, ...base, change } : r
    }
    case 'reorderQuestions': {
      const r = reorderQuestions(test, change.sectionId, change.order)
      return r.ok ? { ok: true, ...base, change } : r
    }
    case 'sortQuestions':
      return sectionOf(change.sectionId) ? { ok: true, ...base, change } : { ok: false, errors: [`大問 ${change.sectionId} がテストにない`] }
    case 'addQuestion': {
      const section = sectionOf(change.sectionId)
      if (!section) return { ok: false, errors: [`大問 ${change.sectionId} がテストにない`] }
      if (change.afterQuestionId && !section.questions.some(q => q.id === change.afterQuestionId)) return { ok: false, errors: [`小問 ${change.afterQuestionId} が大問 ${change.sectionId} にない`] }
      return { ok: true, ...base, change }
    }
    case 'remove': {
      const section = sectionOf(change.sectionId)
      if (!section) return { ok: false, errors: [`大問 ${change.sectionId} がテストにない`] }
      if (change.questionId && !section.questions.some(q => q.id === change.questionId)) return { ok: false, errors: [`小問 ${change.questionId} が大問 ${change.sectionId} にない`] }
      return { ok: true, ...base, change }
    }
  }
}

export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const { test, selection, history, message } = request
  return draftWithRetry({
    label: '会話',
    schema: ChatAnswer,
    system: CHAT_SYSTEM_PROMPT,
    prompt: chatUserPrompt({
      test: describeTest(test),
      selection: describeSelection(test, selection),
      history: history.map(m => `${m.who === 'me' ? '先生' : 'AI'}: ${m.text}`),
      message,
    }),
    effort: 'medium',
    convert: answer => toChatResult(test, answer),
  })
}

export const handleChatRequest = jsonHandler(ChatRequest, chat)
