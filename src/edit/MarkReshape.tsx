import { useState } from 'react'
import type { Question } from '../model/schema'

/* 線を引いて作った案を入れる前に、解答形式と字数を選び直して AI に整え直してもらう欄と、希望を書き直す */

type Format = 'choice' | 'extract' | 'description' | 'short'
const FORMATS: Array<[Format, string]> = [['choice', '記号選択'], ['extract', '抜き出し'], ['description', '記述'], ['short', '短答']]

type Props = {
  question: Question
  // 整え直す。できなければ理由を返す
  onReshape: (format: Format, charLimit?: number) => Promise<string[]>
  onRewrite: () => void
}

export function MarkReshape({ question, onReshape, onRewrite }: Props) {
  const [format, setFormat] = useState<Format>(FORMATS.some(([f]) => f === question.format) ? question.format as Format : 'description')
  const [limit, setLimit] = useState(question.charLimit ?? 30)
  const [waiting, setWaiting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  async function reshape() {
    setWaiting(true)
    setErrors(await onReshape(format, format === 'choice' ? undefined : limit))
    setWaiting(false)
  }
  return (
    <div className="mark-reshape" role="group" aria-label="形式と字数を選び直す">
      <p className="edit-hint">形式や字数を選び直して「整え直す」を押すと、AI が問い文をその形に整え直します。</p>
      <div className="edit-row">
        <label>解答形式
          <select value={format} onChange={e => setFormat(e.target.value as Format)} aria-label="解答形式" disabled={waiting}>
            {FORMATS.map(([f, l]) => <option key={f} value={f}>{l}</option>)}
          </select>
        </label>
        <label>字数<input type="number" min={1} max={400} value={limit} onChange={e => setLimit(Number(e.target.value))} aria-label="字数" disabled={waiting || format === 'choice'} /></label>
        <button type="button" onClick={() => void reshape()} disabled={waiting}>整え直す</button>
        <button type="button" onClick={onRewrite} disabled={waiting}>書き直して、もう一度整えてもらう</button>
      </div>
      {waiting && <p className="ai-status" role="status">AI が問い文を整え直しています</p>}
      {errors.length > 0 && <p className="start-error" role="alert">{errors.join(' ')}</p>}
    </div>
  )
}
