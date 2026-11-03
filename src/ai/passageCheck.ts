import { z } from 'zod'
import { Test } from '../model/schema.js'
import { describeSection } from './chat.js'
import { draftWithRetry, jsonHandler, type Checked } from './claude.js'
import { PASSAGE_CHECK_PROMPT, passageCheckPrompt } from './prompt.js'

/* 本文を直したあと、選択肢・正答・模範解答・採点の観点が直した本文と食い違う小問を AI に確かめてもらう */

export const PassageCheckRequest = z.object({
  // 本文を直した後のテスト
  test: Test,
  sectionId: z.string().min(1),
  changes: z.array(z.object({ before: z.string(), after: z.string() })).min(1),
  // 小問ごとに、先生がこのままにした点の文
  acked: z.record(z.string(), z.array(z.string())),
})
export type PassageCheckRequest = z.infer<typeof PassageCheckRequest>

export const PassageCheckAnswer = z.object({
  issues: z.array(z.object({
    questionId: z.string().min(1).describe('食い違う小問の識別子。いまの大問の識別子をそのまま書く'),
    issue: z.string().min(1).describe('何が直した本文と合わないかを、先生に向けて一文で'),
  })),
})
export type PassageCheckAnswer = z.infer<typeof PassageCheckAnswer>

export type PassageCheckResponse = Checked<{ issues: PassageCheckAnswer['issues'] }>

/** 小問の識別子が大問にあることだけを確かめる */
export function toIssues(questionIds: string[], answer: PassageCheckAnswer): PassageCheckResponse {
  const unknown = answer.issues.filter(i => !questionIds.includes(i.questionId))
  if (unknown.length) return { ok: false, errors: unknown.map(i => `小問 ${i.questionId} がこの大問にない`) }
  return { ok: true, issues: answer.issues }
}

export async function checkPassage(request: PassageCheckRequest): Promise<PassageCheckResponse> {
  const { test, sectionId, changes, acked } = request
  const index = test.sections.findIndex(s => s.id === sectionId)
  if (index < 0) return { ok: false, errors: ['その大問はテストにありません'] }
  const section = test.sections[index]
  return draftWithRetry({
    label: '本文の確かめ',
    schema: PassageCheckAnswer,
    system: PASSAGE_CHECK_PROMPT,
    prompt: passageCheckPrompt({
      section: describeSection(test, section, index),
      changes,
      acked: Object.entries(acked).flatMap(([qid, texts]) => texts.map(t => `- 小問 ${qid}: ${t}`)),
    }),
    effort: 'medium',
    convert: answer => toIssues(section.questions.map(q => q.id), answer),
  })
}

export const handlePassageCheckRequest = jsonHandler(PassageCheckRequest, checkPassage)
