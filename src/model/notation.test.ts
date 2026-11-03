import { describe, expect, it } from 'vitest'
import { itemSegments, kanbunLine, prose, stem } from './notation'

describe('記法', () => {
  it('本文の傍線部とルビを区切りにする', () => {
    expect(prose('メロスは<m:a>激怒した</m>。陸{くが}には')).toEqual([
      { kind: 'text', text: 'メロスは' },
      { kind: 'mark', id: 'a', children: [{ kind: 'text', text: '激怒した' }] },
      { kind: 'text', text: '。' },
      { kind: 'ruby', base: '陸', reading: 'くが' },
      { kind: 'text', text: 'には' },
    ])
  })

  it('傍線部の中のルビも読む', () => {
    expect(prose('<m:a>酉{とり}の刻{こく}</m>')).toEqual([
      { kind: 'mark', id: 'a', children: [
        { kind: 'ruby', base: '酉', reading: 'とり' },
        { kind: 'text', text: 'の' },
        { kind: 'ruby', base: '刻', reading: 'こく' },
      ] },
    ])
  })

  it('漢文の送り仮名と返り点を文字に付ける', () => {
    expect(kanbunLine('不[レ]覚(エ)[レ]暁(ヲ)')).toEqual([
      { kind: 'char', char: '不', kaeriten: 'レ' },
      { kind: 'char', char: '覚', okurigana: 'エ', kaeriten: 'レ' },
      { kind: 'char', char: '暁', okurigana: 'ヲ' },
    ])
  })

  it('漢文の傍線部は文字の並びを包む', () => {
    const line = kanbunLine('<m:a>花落(ツルコト)</m>')
    expect(line).toEqual([{ kind: 'mark', id: 'a', children: [
      { kind: 'char', char: '花' },
      { kind: 'char', char: '落', okurigana: 'ツルコト' },
    ] }])
  })

  it('問い文の傍線部の参照と選択肢の範囲を読む', () => {
    expect(stem('{傍線部:b}「揺りすゑ」・{番号:c}を、次の{範囲}から')).toEqual([
      { kind: 'markRef', id: 'b', form: 'label' },
      { kind: 'text', text: '「揺りすゑ」・' },
      { kind: 'markRef', id: 'c', form: 'number' },
      { kind: 'text', text: 'を、次の' },
      { kind: 'choiceRange' },
      { kind: 'text', text: 'から' },
    ])
  })

  it('項目の傍線を読む', () => {
    expect(itemSegments('友との[[ヤクソク]]を守る。')).toEqual([
      { kind: 'text', text: '友との' },
      { kind: 'underline', text: 'ヤクソク' },
      { kind: 'text', text: 'を守る。' },
    ])
  })
})
