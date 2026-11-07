import { parseFill, stem } from '../model/notation.js'
import { Section, type FillSegment, type Question, type StemSegment } from '../model/schema.js'
import { anchorMarks, plainText } from './anchor.js'
import { allocatePoints } from './points.js'
import type { ProposedQuestion, SectionProposal } from './proposal.js'

/*
 * AI の返答を、テストのデータの大問に組み立てて検証する。
 * 通らなかった理由は、AI にそのまま返して作り直してもらえる日本語で返す。
 */

export type Rationale = { questionId: string; rationale: string; standard: string }

export type Converted =
  | { ok: true; section: Section; rationales: Rationale[]; suggestions?: string[] }
  | { ok: false; errors: string[] }

// 問い文に番号・記号を文字で書いた印（記法を使っていない）
export const WRITTEN_NUMBER = /[①-⑳Ⅰ-Ⅹ]|[ア-オ][〜～-][イ-コ]|傍線部[0-9０-９一二三四五六七八九]/
// 答えに書いた傍線部の番号。番号は振り直されるので、答えに残すと模範解答だけが古くなる
const CIRCLED_NUMBER = /[①-⑳]/

/** subtotal は大問の配点の枠。小問の配点は、この合計になるように割り振る */
export function toSection(base: Section, proposal: SectionProposal, pointStep: number, subtotal: number): Converted {
  if (base.passage?.kind !== 'prose') return { ok: false, errors: ['この大問は本文（文章）を持たない'] }
  const errors: string[] = []
  const label = (i: number) => `問${i + 1}`

  const anchored = anchorMarks(base.passage.segments, proposal.marks, i => `${base.id}-m${i + 1}`)
  if (!anchored.ok) return { ok: false, errors: anchored.errors }
  const passageText = plainText(anchored.segments)

  const points = allocatePoints(proposal.questions.map(q => Math.min(5, Math.max(1, q.weight))), subtotal, pointStep)
  if (!points) errors.push(`小問が多すぎて、小計${subtotal}点を${pointStep}点刻みで配れない`)

  const questions = proposal.questions.map((p, i) => {
    const built = buildQuestion(p, `${base.id}-q${i + 1}`, label(i), anchored.ids, passageText, points?.[i] ?? pointStep)
    errors.push(...built.errors)
    return built.question
  })

  const parsed = Section.safeParse({ ...base, passage: { ...base.passage, segments: anchored.segments }, questions })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [where, index] = issue.path
      errors.push(where === 'questions' && typeof index === 'number' ? `${label(index)}: ${issue.message}` : issue.message)
    }
  }
  if (errors.length || !parsed.success) return { ok: false, errors }
  return {
    ok: true,
    section: parsed.data,
    rationales: proposal.questions.map((p, i) => ({ questionId: questions[i].id, rationale: p.rationale, standard: p.standard })),
    ...(proposal.suggestions?.length && { suggestions: proposal.suggestions }),
  }
}

/** AI の問い文の記法を、問い文に組み立てる。傍線部のキーはシステムの識別子に置き換える */
export function buildStem(text: string, label: string, ids: Map<string, string>): { segments: StemSegment[]; errors: string[] } {
  const errors: string[] = []
  if (WRITTEN_NUMBER.test(text)) errors.push(`${label}: 問い文に番号や記号を文字で書いている（{傍線部:A}・{範囲} の記法を使う）`)
  const segments: StemSegment[] = stem(text).map(s => {
    if (s.kind !== 'markRef') return s
    const markId = ids.get(s.id)
    if (!markId) errors.push(`${label}: 問い文が参照する傍線部${s.id}が marks にない`)
    return { ...s, id: markId ?? s.id }
  })
  return { segments, errors }
}

/** AI の穴埋め文を読んで確かめる。空欄の数や字数の上限はテストのデータの検証で確かめる */
function buildFill(fillText: string, format: ProposedQuestion['format'], label: string, passageText: string): { fill: FillSegment[]; errors: string[] } {
  const parsed = parseFill(fillText)
  if (!parsed.ok) return { fill: [], errors: parsed.errors.map(e => `${label}: ${e}`) }
  const errors: string[] = []
  const written = parsed.fill.flatMap(s => (s.kind === 'text' ? [s.text] : [])).join('')
  if (WRITTEN_NUMBER.test(written)) errors.push(`${label}: 穴埋め文に番号や記号を文字で書いている（番号はシステムが付ける）`)
  for (const s of parsed.fill) {
    if (s.kind !== 'blank') continue
    if (format === 'extract' && !passageText.includes(s.answer)) errors.push(`${label}: 抜き出しの空欄の答え「${s.answer}」が本文にない`)
    if (CIRCLED_NUMBER.test(s.answer)) errors.push(`${label}: 答えに番号（①など）を文字で書いている（番号は振り直されるので、語そのもので書く）`)
    // 一字の答えは別の語に含まれるだけのことが多いので調べない
    if ([...s.answer].length >= 2 && written.includes(s.answer)) errors.push(`${label}: 空欄の答え「${s.answer}」が穴埋め文の地の文にも書かれている（答えが見えてしまう）`)
  }
  return { fill: parsed.fill, errors }
}

/** AI が提案した小問一つを、テストのデータの小問に組み立てる。ids は AI の傍線部のキー → システムの識別子 */
export function buildQuestion(p: ProposedQuestion, id: string, label: string, ids: Map<string, string>, passageText: string, points: number): { question: Question; errors: string[] } {
  const { segments, errors } = buildStem(p.stem, label, ids)
  if (p.fillText?.trim()) {
    const built = buildFill(p.fillText.trim(), p.format, label, passageText)
    return {
      errors: [...errors, ...built.errors],
      question: { id, format: p.format, stem: segments, fill: built.fill, ...(p.rubric && { rubric: p.rubric }), points, kanten: p.kanten, standard: p.standard },
    }
  }
  // 正答は番号ではなく選択肢の文で受け取る（番号だと 0 と 1 のどちらから数えたかで一つずれても、検証で見つからない）
  const correct = p.correctChoice === undefined ? -1 : (p.choices ?? []).indexOf(p.correctChoice)
  if (p.format === 'choice' && correct === -1) errors.push(`${label}: 正答（correctChoice）が選択肢のどれとも一致しない（選択肢の文をそのまま書く）`)
  if (p.format === 'extract' && p.answer && !passageText.includes(p.answer)) errors.push(`${label}: 抜き出しの答え「${p.answer}」が本文にない`)
  if (p.format !== 'choice' && !p.answer) errors.push(`${label}: 正答・模範解答（answer）がない`)
  if (p.answer && CIRCLED_NUMBER.test(p.answer)) errors.push(`${label}: 答えに番号（①など）を文字で書いている（番号は振り直されるので、語そのもので書く）`)
  // 抜き出しの字数は答えから導けるので、AI が付け忘れても解答欄が答えに合うようにする
  const charLimit = p.charLimit ?? (p.format === 'extract' && p.answer ? [...p.answer].length : undefined)
  return {
    errors,
    question: {
      id,
      format: p.format,
      stem: segments,
      ...(p.choices && { choices: p.choices }),
      ...(correct !== -1 && { correct }),
      ...(charLimit !== undefined && { charLimit }),
      ...(p.answer && { answer: p.answer }),
      ...(p.rubric && { rubric: p.rubric }),
      points,
      kanten: p.kanten,
      standard: p.standard,
    },
  }
}
