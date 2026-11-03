import { describe, expect, it } from 'vitest'
import { sampleTest } from '../sample/sampleTest'
import { toCompositionSection, type CompositionProposal } from './composition'

const base = () => sampleTest.sections.find(s => s.id === 'sakubun')!
const proposal = (over: Partial<CompositionProposal> = {}): CompositionProposal => ({
  instruction: '「走れメロス」を読んで、「約束を守ること」について、あなたの考えを次の条件にしたがって書きなさい。',
  conditions: ['二段落で書くこと。', '百二十字以上、百五十字以内で書くこと。'],
  charLimit: 150,
  rubric: ['条件に沿っている', '体験と考えが結びついている'],
  standard: 'C(1)オ',
  rationale: '走れメロスの指導事項 C(1)オ を確かめるため',
  ...over,
})

describe('作文の大問', () => {
  it('指示文と作文の問一つ（思考・判断・表現、配点は枠）に組み立てる', () => {
    const r = toCompositionSection(base(), proposal(), 12)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.section.instruction).toContain('約束を守ること')
    expect(r.section.questions).toEqual([{ id: 'sakubun-c1', format: 'composition', stem: [], conditions: ['二段落で書くこと。', '百二十字以上、百五十字以内で書くこと。'], charLimit: 150, points: 12, kanten: 'thinking', standard: 'C(1)オ', rubric: ['条件に沿っている', '体験と考えが結びついている'] }])
    expect(r.rationales).toEqual([{ questionId: 'sakubun-c1', rationale: '走れメロスの指導事項 C(1)オ を確かめるため', standard: 'C(1)オ' }])
  })

  it('字数が範囲の外、条件がない、番号の文字は通さない', () => {
    expect(toCompositionSection(base(), proposal({ charLimit: 800 }), 12)).toMatchObject({ ok: false, errors: [expect.stringContaining('字数 800')] })
    expect(toCompositionSection(base(), proposal({ conditions: [] }), 12).ok).toBe(false)
    expect(toCompositionSection(base(), proposal({ conditions: ['①二段落で書くこと。'] }), 12).ok).toBe(false)
  })
})
