import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { stem } from '../model/notation'
import type { Question } from '../model/schema'
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
