import { useEffect, useRef, useState, type FormEvent } from 'react'
import { splitWords } from './kanjiCandidates'

/* 漢字の大問で出題する語を決める画面。漢字テストでやった語を貼るのがおもな入り口で、本文から拾った候補からも選べる */

type Props = {
  candidates: string[]
  initial: string[]
  onSubmit: (words: string[]) => void
  onClose: () => void
}

export function KanjiWords({ candidates, initial, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState(initial.filter(w => !candidates.includes(w)).join('、'))
  const [checked, setChecked] = useState<Set<string>>(new Set(initial.filter(w => candidates.includes(w))))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  function toggle(word: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(word)) next.delete(word)
      else next.add(word)
      return next
    })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const words = [...new Set([...splitWords(text), ...checked])]
    if (words.length === 0) return setError('出題する語を入れるか、候補から選んでください。')
    onSubmit(words)
  }

  return (
    <dialog ref={ref} className="paste" onClose={onClose} aria-label="出題する漢字を選ぶ">
      <form onSubmit={submit}>
        <h2>出題する漢字を選ぶ</h2>
        <p>授業の漢字テストでやった語（熟語や送り仮名の付いた語）を貼ってください。改行・読点・空白で区切れます。決めると、AI が読みと書きの問題を作ります（数十秒かかります）。</p>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5} aria-label="出題する語" placeholder="例: 約束、信頼、名誉、疲労、漂う" />
        <fieldset className="kanji-candidates">
          <legend>本文から拾った候補（中学校で習う漢字を含む語）</legend>
          {candidates.length === 0
            ? <p>文章の大問に本文を貼ると、ここに候補が出ます。</p>
            : candidates.map(w => (
              <label key={w}>
                <input type="checkbox" checked={checked.has(w)} onChange={() => toggle(w)} />
                {w}
              </label>
            ))}
        </fieldset>
        {error && <p className="start-error" role="alert">{error}</p>}
        <div className="start-actions">
          <button type="submit">この語で AI に作ってもらう</button>
          <button type="button" className="secondary" onClick={() => ref.current?.close()}>やめる</button>
        </div>
      </form>
    </dialog>
  )
}
