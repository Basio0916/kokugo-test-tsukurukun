import { blankLabel } from '../model/derive'
import type { FillSegment } from '../model/schema'
import { kansuji } from './kansuji'

/** 穴埋め文を紙面の見え方の文にする。答えは出さず、空欄は番号と字数を括弧に入れる */
export function fillDisplay(fill: FillSegment[]): string {
  const count = fill.filter(s => s.kind === 'blank').length
  let index = 0
  return fill.map(s => {
    if (s.kind === 'text') return s.text
    const label = blankLabel(index++, count)
    const chars = s.charLimit === undefined ? `${kansuji([...s.answer].length)}字` : `${kansuji(s.charLimit)}字以内`
    return `（${label ? `${label}　` : ''}${chars}）`
  }).join('')
}
