import { useRef, useState } from 'react'
import type { Question } from '../model/schema'

/*
 * 線を引いて作った案を入れる前に、解答形式と字数を選び直して AI に整え直してもらう欄と、希望を書き直す。
 * 形式は選んだとたん、字数は欄を離れたとき（Enter を含む）に整え直す。記号選択のときは字数だけ変えても頼まない
 */

type Format = 'choice' | 'extract' | 'description' | 'short'
const FORMATS: Array<[Format, string]> = [['choice', '記号選択'], ['extract', '抜き出し'], ['description', '記述'], ['short', '短答']]

type Props = {
  question: Question
  // 整え直す。できなければ理由を返す。後から頼み直されて、この返答を入れなかったときは null
  onReshape: (format: Format, charLimit?: number) => Promise<string[] | null>
  onRewrite: () => void
}

export function MarkReshape({ question, onReshape, onRewrite }: Props) {
  const [format, setFormat] = useState<Format>(FORMATS.some(([f]) => f === question.format) ? question.format as Format : 'description')
  const [limit, setLimit] = useState(question.charLimit ?? 30)
  // 最後に整え直しに使った字数（変えていなければ、欄を離れても頼まない）
  const asked = useRef(limit)
  const [waiting, setWaiting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  async function reshape(f: Format, l: number) {
    asked.current = l
    setWaiting(true)
    setErrors([])
    const result = await onReshape(f, f === 'choice' ? undefined : l)
    if (result === null) return
    setErrors(result)
    setWaiting(false)
  }
  const commitLimit = () => {
    if (format !== 'choice' && limit > 0 && limit !== asked.current) void reshape(format, limit)
  }
  return (
    <div className="mark-reshape" role="group" aria-label="形式と字数を選び直す">
      <p className="edit-hint">形式を選び直すか、字数を変えて欄を離れると、AI が問い文をその形に整え直します。</p>
      <div className="edit-row">
        <label>解答形式
          <select
            value={format} aria-label="解答形式"
            onChange={e => {
              const f = e.target.value as Format
              setFormat(f)
              void reshape(f, limit)
            }}
          >
            {FORMATS.map(([f, l]) => <option key={f} value={f}>{l}</option>)}
          </select>
        </label>
        <label>字数
          <input
            type="number" min={1} max={400} value={limit} aria-label="字数"
            onChange={e => setLimit(Number(e.target.value))}
            onBlur={commitLimit}
            onKeyDown={e => {
              // Enter で小問を入れてしまわないよう、ここでは整え直すだけにする
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                commitLimit()
              }
            }}
          />
        </label>
        <button type="button" onClick={onRewrite}>書き直して、もう一度整えてもらう</button>
      </div>
      {waiting && <p className="ai-status" role="status">AI が問い文を整え直しています</p>}
      {errors.length > 0 && <p className="start-error" role="alert">{errors.join(' ')}</p>}
    </div>
  )
}
