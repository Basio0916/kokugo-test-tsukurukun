import { describe, expect, it } from 'vitest'
import { ADD_QUESTION_PROMPT, CHAT_SYSTEM_PROMPT, CLASSICAL_SYSTEM_PROMPT, COMPOSITION_SYSTEM_PROMPT, KANBUN_SYSTEM_PROMPT, SYSTEM_PROMPT, kanbunUserPrompt, userPrompt } from './prompt'

const prompts = { 大問を作る: SYSTEM_PROMPT, 古文: CLASSICAL_SYSTEM_PROMPT, 漢文: KANBUN_SYSTEM_PROMPT, 小問を足す: ADD_QUESTION_PROMPT, 会話: CHAT_SYSTEM_PROMPT }

describe('問いの作り方の指示', () => {
  it.each(Object.entries(prompts))('%s: 問い方の引き出しと、繰り返さない指示がある', (_, prompt) => {
    for (const word of ['同じ問い方を繰り返さない', '当てはまらないもの', 'に続くように', '熟語の構成', '段落の役割', '並べ替え', '続く問いで掘り下げる']) {
      expect(prompt).toContain(word)
    }
  })

  it('並べ替えの答えは語で書き、番号や記号で書かないよう指示する', () => {
    expect(SYSTEM_PROMPT).toContain('答えは語そのもので書く')
  })

  it('本文の外の知識は、先生の希望にあるときだけ問うよう指示する', () => {
    expect(SYSTEM_PROMPT).toContain('本文の外の知識')
    expect(SYSTEM_PROMPT).toContain('書かれているときだけ問う')
  })

  it('選択肢は四つを基本に三〜七つまで認める', () => {
    expect(SYSTEM_PROMPT).toContain('四つを基本')
    expect(SYSTEM_PROMPT).toContain('三〜七つ')
  })

  it('掘り下げる問いは独立して答えられ、別の問いの答えを明かさないよう指示する', () => {
    expect(SYSTEM_PROMPT).toContain('前の問いの答えがわからなくても答えられる')
    expect(SYSTEM_PROMPT).toContain('問い文に「前の問い」とは書かない')
    expect(SYSTEM_PROMPT).toContain('別の問いの答えがわかるようにしない')
  })

  it('解答欄と観点が崩れないよう、答えの数・字数・観点の決め方を指示する', () => {
    for (const rule of ['答えは一つにする', '字数（charLimit）を必ず', '二十〜六十字を基本', '百字まで', '(1)〜(3) の記号は知識・技能']) {
      expect(SYSTEM_PROMPT).toContain(rule)
    }
  })
})

describe('小問の数の目安', () => {
  const unit = { grade: 3 as const, material: '教材', standards: [], instruction: '指示文', subtotal: 30, pointStep: 1 as const }

  it('文章と古文は四〜八問', () => {
    expect(userPrompt({ ...unit, passage: '本文', source: '出典' })).toContain('四〜八問')
  })

  it('漢文は三〜七問', () => {
    expect(kanbunUserPrompt({ ...unit, title: '題', author: '', lines: ['一句'], notes: [] })).toContain('三〜七問')
  })
})

describe('教材ごとの指示', () => {
  it('漢文は、漢詩と論語などの文章で問うことを書き分け、論語に詩の形式や起承転結を問わない', () => {
    expect(KANBUN_SYSTEM_PROMPT).toContain('漢詩')
    expect(KANBUN_SYSTEM_PROMPT).toContain('論語などの文章')
    expect(KANBUN_SYSTEM_PROMPT).toContain('現代語訳')
    expect(KANBUN_SYSTEM_PROMPT).toContain('詩の形式や起承転結は問わない')
  })

  it('作文の条件は字数を必ず入れ、立場の明示や文単位の構成なども選べる', () => {
    expect(COMPOSITION_SYSTEM_PROMPT).toContain('字数は必ず入れ')
    for (const word of ['段落の構成', '立場', '第一文', '理由を二つ']) expect(COMPOSITION_SYSTEM_PROMPT).toContain(word)
  })
})
