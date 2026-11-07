import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useBackdropClose } from '../edit/backdrop'
import { kansuji } from '../paper/kansuji'
import { splitWords } from './splitWords'

/* 漢字の大問で出題する語を決める画面。漢字テストでやった語を貼り、足りない分は AI が補う */

type Props = {
  initial: string[]
  /** この大問の読みと書きの項目の数。配点の枠を項目に分けられないときは null */
  counts: { reading: number; writing: number } | null
  onSubmit: (words: string[]) => void
  onClose: () => void
}

export function KanjiWords({ initial, counts, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const backdrop = useBackdropClose(ref)
  const [text, setText] = useState(initial.join('、'))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    const words = splitWords(text)
    if (words.length === 0) return setError('出題する語を入れてください。')
    onSubmit(words)
  }

  return (
    <dialog ref={ref} className="paste" onClose={onClose} aria-label="出題する漢字を選ぶ" {...backdrop}>
      <form onSubmit={submit}>
        <h2>出題する漢字を選ぶ</h2>
        <p>授業の漢字テストでやった語（熟語や送り仮名の付いた語）を貼ってください。改行・読点・空白で区切れます。決めると、AI が読みと書きの問題を作ります（数十秒かかります）。</p>
        {counts && (
          <p>
            この大問は読み{kansuji(counts.reading)}・書き{kansuji(counts.writing)}の{kansuji(counts.reading + counts.writing)}項目です。語が足りない分は、AI が中学校で習う漢字を含む語で補います。
          </p>
        )}
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5} aria-label="出題する語" placeholder="例: 約束、信頼、名誉、疲労、漂う" />
        {error && <p className="start-error" role="alert">{error}</p>}
        <div className="start-actions">
          <button type="submit">この語で AI に作ってもらう</button>
          <button type="button" className="secondary" onClick={() => ref.current?.close()}>やめる</button>
        </div>
      </form>
    </dialog>
  )
}
