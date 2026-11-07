import { z } from 'zod'
import { isJuniorHighKanji } from '../catalog/kanji.js'
import { itemSegments, stem } from '../model/notation.js'
import { Section, type Question } from '../model/schema.js'
import type { Converted } from './toSection.js'

/*
 * 漢字の大問。AI は例文と答えだけを返し、問い文・項目の数・配点はシステムが決める。
 * 傍線部は一字ではなく語の単位（熟語・送り仮名を含む）。
 */

const KanjiItem = z.object({
  sentence: z.string().min(1).describe('短い例文。出題する語を [[ ]] で一か所だけ囲む。書きの問いでは [[ ]] の中をかたかなにする'),
  answer: z.string().min(1).describe('読みはひらがなだけ、書きは漢字（送り仮名を含む）で書く'),
})

export const KanjiProposal = z.object({
  reading: z.array(KanjiItem).describe('読みの項目。[[ ]] の中は漢字の語'),
  writing: z.array(KanjiItem).describe('書きの項目。[[ ]] の中はかたかな'),
  readingRationale: z.string().min(1).describe('読みの問いの語を選んだ理由。先生に向けて一〜二文で'),
  writingRationale: z.string().min(1).describe('書きの問いの語を選んだ理由。先生に向けて一〜二文で'),
})
export type KanjiProposal = z.infer<typeof KanjiProposal>

export const READING_STEM = '次の傍線部の漢字の読みを、ひらがなで書きなさい。'
export const WRITING_STEM = '次の傍線部のかたかなを、漢字に直して書きなさい。'

const KANJI = /[一-鿿々\u{20000}-\u{2ffff}]/u
const HIRAGANA_ONLY = /^[ぁ-ゖー]+$/
const KATAKANA_ONLY = /^[ァ-ヶー]+$/
// 送り仮名などの仮名を除いた漢字の部分（「漂う」→「漂」）。語の単位で照らし合わせるために使う
export const kanjiPart = (word: string) => [...word].filter(c => KANJI.test(c)).join('')

export type KanjiPlan = { each: number; reading: number; writing: number; standard: string }

/**
 * words は先生が決めた語。出題した語（読みの傍線部、書きの答え）は漢字の部分で照らし合わせ、
 * 先生の語を項目の数まで使い切っているか、補った語が中学校で習う漢字を含むかを確かめる
 */
export function toKanjiSection(base: Section, proposal: KanjiProposal, plan: KanjiPlan, words: string[]): Converted {
  const errors: string[] = []
  const allowed = new Set(words.map(kanjiPart).filter(Boolean))
  const used = new Set<string>()
  const seen = new Set<string>()
  const supplied = { 読み: [] as string[], 書き: [] as string[] }
  if (proposal.reading.length !== plan.reading) errors.push(`読みの項目が ${proposal.reading.length} 個（${plan.reading} 個ちょうどにする）`)
  if (proposal.writing.length !== plan.writing) errors.push(`書きの項目が ${proposal.writing.length} 個（${plan.writing} 個ちょうどにする）`)

  const tally = (kind: '読み' | '書き', label: string, word: string) => {
    const part = kanjiPart(word)
    if (!part) return
    if (seen.has(part)) errors.push(`${label}: 「${word}」をほかの項目でも出している（同じ語は一度だけ出す）`)
    seen.add(part)
    if (allowed.has(part)) used.add(part)
    else if (![...part].some(isJuniorHighKanji)) errors.push(`${label}: 「${word}」は先生が決めた語になく、中学校で習う漢字を含まない（補う語は中学校で習う漢字を含める）`)
    else supplied[kind].push(word)
  }

  const check = (kind: '読み' | '書き', i: number, item: { sentence: string; answer: string }) => {
    const label = `${kind}${i + 1}`
    const targets = [...item.sentence.matchAll(/\[\[(.+?)\]\]/g)].map(m => m[1])
    if (targets.length !== 1) return errors.push(`${label}: 例文の傍線部（[[ ]]）が ${targets.length} か所（一か所にする）`)
    const target = targets[0]
    if (kind === '読み') {
      if (!KANJI.test(target)) errors.push(`${label}: 傍線部「${target}」に漢字がない`)
      if (!HIRAGANA_ONLY.test(item.answer)) errors.push(`${label}: 答え「${item.answer}」はひらがなだけで書く`)
      tally(kind, label, target)
    } else {
      if (!KATAKANA_ONLY.test(target)) errors.push(`${label}: 傍線部「${target}」はかたかなだけで書く`)
      if (!KANJI.test(item.answer)) errors.push(`${label}: 答え「${item.answer}」に漢字がない`)
      tally(kind, label, item.answer)
    }
  }
  proposal.reading.forEach((item, i) => check('読み', i, item))
  proposal.writing.forEach((item, i) => check('書き', i, item))
  const need = Math.min(allowed.size, plan.reading + plan.writing)
  if (used.size < need) errors.push(`先生が決めた語が ${used.size} 個しか使われていない（${need} 個使う）`)

  const question = (id: string, text: string, items: KanjiProposal['reading']): Question => ({
    id, format: 'kanji', stem: stem(text), kanten: 'knowledge', standard: plan.standard, pointsEach: plan.each,
    items: items.map(item => ({ segments: itemSegments(item.sentence), answer: item.answer })),
  })
  const questions = [
    question(`${base.id}-q1`, READING_STEM, proposal.reading),
    question(`${base.id}-q2`, WRITING_STEM, proposal.writing),
  ]
  const parsed = Section.safeParse({ ...base, questions })
  if (!parsed.success) errors.push(...parsed.error.issues.map(issue => issue.message))
  if (errors.length || !parsed.success) return { ok: false, errors }
  // どの語を AI が補ったかはシステムが確実に分かるので、AI に書かせずに書き添える
  const withSupplied = (rationale: string, list: string[]) => (list.length ? `${rationale}　AI が補った語: ${list.join('、')}` : rationale)
  return {
    ok: true,
    section: parsed.data,
    rationales: [
      { questionId: questions[0].id, rationale: withSupplied(proposal.readingRationale, supplied.読み), standard: plan.standard },
      { questionId: questions[1].id, rationale: withSupplied(proposal.writingRationale, supplied.書き), standard: plan.standard },
    ],
  }
}
