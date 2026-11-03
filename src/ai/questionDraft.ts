import { z } from 'zod'
import { findGroup, standardText } from '../catalog/catalog.js'
import { Grade } from '../catalog/schema.js'
import { markNumbers } from '../model/derive.js'
import { PointStep, Section, type Question } from '../model/schema.js'
import { circled } from '../paper/kansuji.js'
import { QuestionIdeas, toIdeas, type Idea } from './addQuestion.js'
import { plainText } from './anchor.js'
import { draftWithRetry, jsonHandler } from './claude.js'
import { ADD_QUESTION_PROMPT, formatPrompt, markPrompt, suggestPrompt, type AddQuestionContext } from './prompt.js'

/* サーバー側で、小問を一つ足す案を Claude に作ってもらう。足し方（おすすめ・形式・線を引く）は判別付きの要求で分ける */

const FORMAT_NAMES = { choice: '記号選択', extract: '本文からの抜き出し', description: '記述', short: '短答' } as const

export const QuestionDraftRequest = z.object({
  grade: Grade,
  material: z.string().min(1),
  pointStep: PointStep,
  subtotal: z.number().positive(),
  section: Section,
  how: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('suggest') }),
    z.object({ kind: z.literal('format'), format: z.enum(['choice', 'extract', 'description', 'short']), aim: z.string().optional() }),
    z.object({ kind: z.literal('mark'), quote: z.string().min(1), before: z.string().optional(), wish: z.string().min(1) }),
  ]),
})
export type QuestionDraftRequest = z.infer<typeof QuestionDraftRequest>
export type QuestionDraftResponse = { ok: true; ideas: Idea[] } | { ok: false; errors: string[] }

// 今ある小問を、紙面と同じ番号で読める一行にする（AI に重複を避けさせるため）
function questionLine(q: Question, numbers: Map<string, number>, i: number): string {
  const text = q.stem.map(s => (s.kind === 'text' ? s.text : s.kind === 'choiceRange' ? 'ア〜エ' : `傍線部${circled(numbers.get(s.id) ?? 0)}`)).join('')
  return `- 問${i + 1}（${q.standard}）${text}`
}

export async function draftQuestion(request: QuestionDraftRequest): Promise<QuestionDraftResponse> {
  const { grade, material, pointStep, subtotal, section, how } = request
  const group = findGroup(grade, material)
  if (!group) return { ok: false, errors: [`単元データに「${material}」がありません`] }
  if (section.passage?.kind !== 'prose') return { ok: false, errors: ['この大問は本文（文章）を持たない'] }
  const numbers = markNumbers(section)
  const context: AddQuestionContext = {
    grade, material,
    standards: group.standards.map(code => ({ code, text: standardText(grade, code) ?? '' })),
    passage: plainText(section.passage.segments),
    marks: section.passage.segments.flatMap(s => (s.kind === 'mark' && numbers.has(s.id) ? [`- 傍線部${circled(numbers.get(s.id)!)}「${plainText(s.children)}」`] : [])),
    questions: section.questions.map((q, i) => questionLine(q, numbers, i)),
  }
  const prompt = how.kind === 'suggest' ? suggestPrompt(context)
    : how.kind === 'format' ? formatPrompt(context, FORMAT_NAMES[how.format], how.aim)
      : markPrompt(context, how.quote, how.wish)
  return draftWithRetry({
    label: `${material} 小問（${how.kind}）`,
    schema: QuestionIdeas,
    system: ADD_QUESTION_PROMPT,
    prompt,
    convert: proposal => toIdeas(section, how.kind === 'mark'
      // 線を引いた箇所は、先生が選んだ位置（直前の文字）で決める
      ? { ideas: proposal.ideas.map(idea => ({ ...idea, marks: idea.marks.map(m => (m.quote === how.quote && how.before ? { ...m, before: how.before } : m)) })) }
      : proposal, { pointStep, subtotal, quote: how.kind === 'mark' ? how.quote : undefined }),
  })
}

export const handleQuestionDraftRequest = jsonHandler(QuestionDraftRequest, draftQuestion)
