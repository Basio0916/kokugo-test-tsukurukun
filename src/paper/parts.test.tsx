import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { toCompositionSection } from '../ai/composition'
import type { ProposedQuestion } from '../ai/proposal'
import { toSection } from '../ai/toSection'
import { sectionPoints } from '../model/derive'
import { stem } from '../model/notation'
import type { Question } from '../model/schema'
import { sampleTest } from '../sample/sampleTest'
import { keyRows } from '../sheet/keyRows'
import { QuestionView } from './parts'

const question = (src: string, choices = ['あ', 'い', 'う', 'え', 'お']): Question => ({
  id: 'q', format: 'choice', stem: stem(src), choices, correct: 0, points: 4, kanten: 'thinking', standard: 'C(1)イ',
})

describe('小問の描き方', () => {
  it('傍線部の参照は番号で、選択肢の範囲は選択肢の数で描く', () => {
    const html = renderToStaticMarkup(<QuestionView question={question('{傍線部:a}・{番号:b}を、次の{範囲}から')} index={1} numbers={new Map([['a', 2], ['b', 3]])} />)
    expect(html).toContain('問二')
    expect(html).toContain('傍線部②・③を、次のア〜オから')
    expect(html).toContain('（四点）')
  })

  it('参照先の傍線部がないときは「消えた傍線」と描く', () => {
    const html = renderToStaticMarkup(<QuestionView question={question('{傍線部:z}「激怒した」とありますが')} index={0} numbers={new Map()} />)
    expect(html).toContain('傍線部（消えた傍線）「激怒した」')
  })
})

describe('穴埋め文を描く', () => {
  const filled: Question = {
    id: 'q', format: 'extract', stem: stem('次の文の空欄に当てはまる言葉を抜き出しなさい。'), points: 6, kanten: 'thinking', standard: 'C(1)イ',
    fill: [{ kind: 'text', text: 'メロスは' }, { kind: 'blank', answer: '激怒' }, { kind: 'text', text: 'し、' }, { kind: 'blank', answer: '邪智暴虐' }, { kind: 'text', text: 'の王を除こうと決意した。' }],
  }

  it('問い文の次に◎と穴埋め文を描き、答えの文字は描かない', () => {
    const html = renderToStaticMarkup(<QuestionView question={filled} index={0} numbers={new Map()} />)
    expect(html.indexOf('次の文の空欄に')).toBeLessThan(html.indexOf('◎メロスは（Ⅰ　二字）し、（Ⅱ　四字）の王を除こうと決意した。'))
    expect(html).toContain('◎メロスは（Ⅰ　二字）し、（Ⅱ　四字）の王を除こうと決意した。')
    expect(html).not.toContain('激怒')
    expect(html).not.toContain('邪智暴虐')
  })
})

describe('AI の返答を紙面に描く', () => {
  const seventh: ProposedQuestion = {
    format: 'choice', stem: '当てはまらないものを、次の{範囲}から一つ選び、記号で答えなさい。', choices: ['一', '二', '三', '四', '五', '六', '七'], correctChoice: '七',
    kanten: 'thinking', standard: 'C(1)イ', weight: 1, rationale: '理由',
  }

  it('七問・七択の返答は、範囲と記号がキまで描かれ、配点の合計が枠になり、正答の記号が模範解答に出る', () => {
    const meros = sampleTest.sections.find(s => s.id === 'meros')!
    const r = toSection(meros, { marks: [], questions: Array(7).fill(seventh) }, 1, 30)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.section.questions).toHaveLength(7)
    expect(sectionPoints(r.section)).toBe(30)
    const html = renderToStaticMarkup(<QuestionView question={r.section.questions[0]} index={0} numbers={new Map()} />)
    expect(html).toContain('当てはまらないものを、次のア〜キから一つ選び')
    expect(html).toContain('キ　七')
    expect(keyRows(r.section)[0].answer).toBe('キ')
  })

  it('立場を明らかにする条件の作文は、紙面に条件として描かれる', () => {
    const base = sampleTest.sections.find(s => s.id === 'sakubun')!
    const r = toCompositionSection(base, {
      instruction: '「約束を守ること」と「友を信じること」について、あなたの考えを次の条件にしたがって書きなさい。',
      conditions: ['七十字以上、百字以内で書くこと。', '第一文に、どちらがより大切だと思うか、立場を明らかにして書くこと。', '二文目以降に、その理由を二つ挙げて書くこと。'],
      charLimit: 100, rubric: ['条件に沿っている'], standard: 'C(1)オ', rationale: '理由',
    }, 12)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const html = renderToStaticMarkup(<QuestionView question={r.section.questions[0]} index={0} numbers={new Map()} />)
    expect(html).toContain('条件二</b>　第一文に、どちらがより大切だと思うか')
    expect(html).toContain('条件三</b>　二文目以降に')
  })
})
