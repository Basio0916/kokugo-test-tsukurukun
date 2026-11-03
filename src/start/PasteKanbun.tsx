import { useState } from 'react'
import { Dialog } from '../edit/Dialog'
import type { KanbunPassage } from '../model/schema'
import { pastedKanbun } from './passage'

/* 漢文の白文を貼る画面。題・作者・白文（一行に一句）・語注を入れると、AI が返り点と送り仮名を付けて大問を作る */

type Props = { material: string; onSubmit: (passage: KanbunPassage) => void; onClose: () => void }

export function PasteKanbun({ material, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [white, setWhite] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  function submit() {
    if (!title.trim()) return setErrors(['題を入れてください'])
    const passage = pastedKanbun(title, author, white, notes)
    if (!passage) return setErrors(['白文を入れてください'])
    onSubmit(passage)
  }
  return (
    <Dialog title={`「${material}」の白文を貼り付ける`} submitLabel="白文を入れて AI に作ってもらう" errors={errors} onSubmit={submit} onClose={onClose}>
      <p>白文を一行に一句で貼り付けてください。返り点と送り仮名は AI が付けて紙面に出します（数十秒かかります）。教科書の訓読と違うところは、あとから直せます。</p>
      <div className="edit-row">
        <label>題<input value={title} onChange={e => setTitle(e.target.value)} aria-label="題" placeholder="例: 春暁" /></label>
        <label>作者（任意）<input value={author} onChange={e => setAuthor(e.target.value)} aria-label="作者" placeholder="例: 孟浩然" /></label>
      </div>
      <label className="edit-fields">白文<textarea rows={6} value={white} onChange={e => setWhite(e.target.value)} aria-label="白文" /></label>
      <label className="edit-fields">語注（任意。一行に一つ）<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} aria-label="語注" placeholder="例: ＊啼鳥……鳴いている鳥。" /></label>
    </Dialog>
  )
}
