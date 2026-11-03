import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ProsePassage, Section } from '../model/schema'
import { pastedPassage, workOf } from './passage'

/* 本文を貼り付ける画面。教材 CD などからコピーした本文を貼り、作者名を添えて決める */

type Props = { material: string; kind?: Section['kind']; onSubmit: (passage: ProsePassage) => void; onClose: () => void }

export function PastePassage({ material, kind, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    // 古文の出典は作品名（「平家物語」より）
    const passage = pastedPassage(text, kind === 'classical' ? workOf(material) : material, author)
    if (!passage) return setError('本文を入れてください。')
    onSubmit(passage)
  }

  return (
    <dialog ref={ref} className="paste" onClose={onClose} aria-label={`「${material}」の本文を貼り付ける`}>
      <form onSubmit={submit}>
        <h2>「{material}」の本文を貼り付ける</h2>
        <p>テストで扱う範囲を貼り付けてください。一枚の紙面に収まるのは二千字ほどまでです。改行は段落になります。決めると、AI がこの大問を作ります（数十秒かかります）。</p>
        <label>作者名（任意）<input value={author} onChange={e => setAuthor(e.target.value)} placeholder="例: 太宰治" /></label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={14} aria-label="本文" />
        {error && <p className="start-error" role="alert">{error}</p>}
        <div className="start-actions">
          <button type="submit">本文を入れて AI に作ってもらう</button>
          <button type="button" className="secondary" onClick={() => ref.current?.close()}>やめる</button>
        </div>
      </form>
    </dialog>
  )
}
