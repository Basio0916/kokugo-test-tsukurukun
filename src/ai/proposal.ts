import { z } from 'zod'

/*
 * AI が大問の小問を提案するときの返答の形。AI は中身だけを返す。
 * 傍線部の位置・識別子・番号・配点の点数はシステムが決めるので、ここには持たせない。
 */

export const ProposedMark = z.object({
  key: z.string().min(1).describe('傍線部のキー。A, B, C… と付け、問い文の {傍線部:A} などから参照する'),
  quote: z.string().min(1).describe('傍線を引く箇所。本文から一字も変えずにそのまま引用する'),
  before: z.string().optional().describe('引用が本文に二回以上出てくるときだけ、引用の直前の数文字を本文のとおりに書く'),
})

export const ProposedQuestion = z.object({
  format: z.enum(['choice', 'extract', 'description', 'short']).describe('記号選択・本文からの抜き出し・記述・短答'),
  stem: z.string().min(1).describe('問い文。傍線部は {傍線部:A}（「傍線部①」の形）か {番号:A}（「①」だけの形）、選択肢の範囲は {範囲} と書き、番号や記号の文字は書かない'),
  choices: z.array(z.string().min(1)).optional().describe('記号選択の選択肢。記号（ア・イ…）は付けない'),
  correctChoice: z.string().optional().describe('記号選択の正答。choices のうち正しいものを、一字も変えずにそのまま書く'),
  charLimit: z.number().int().optional().describe('抜き出し・記述・短答の字数'),
  answer: z.string().optional().describe('正答または模範解答。抜き出しは本文のとおりに書く'),
  fillText: z.string().optional().describe('空欄補充の穴埋め文。空欄の場所に答えを [[答え]] と書く。「◯字以内」で答えさせるときは [[答え｜10]] と字数の上限を添える。番号は書かない。空欄補充のときは answer と charLimit を書かない'),
  rubric: z.array(z.string().min(1)).optional().describe('記述の採点の観点'),
  kanten: z.enum(['knowledge', 'thinking']).describe('観点。知識・技能は knowledge、思考・判断・表現は thinking'),
  standard: z.string().min(1).describe('指導事項の記号。C(1)イ、(1)エ のように書く'),
  weight: z.number().int().describe('配点の重み。1〜5 の整数で、大問の中での相対的な重さ'),
  rationale: z.string().min(1).describe('この問いを入れる理由。先生に向けて一〜二文で'),
})

// 先生が次に頼みそうなことの例（会話の「こう伝えてみる」に出す）
export const Suggestions = z.array(z.string().min(1)).optional()
  .describe('先生がこの大問について、次にあなた（AI）へ送りそうな頼みの文の例を一つか二つ。先生の立場・口調で、授業で重視したことや直したいことを伝える頼みとして書く（例: 授業ではメロスの人物像に力を入れました。人物像は記述で聞きたいです。）。あなたからの助言や注意は書かない')

export const SectionProposal = z.object({
  marks: z.array(ProposedMark),
  questions: z.array(ProposedQuestion).min(1),
  suggestions: Suggestions,
})

export type ProposedMark = z.infer<typeof ProposedMark>
export type ProposedQuestion = z.infer<typeof ProposedQuestion>
export type SectionProposal = z.infer<typeof SectionProposal>
