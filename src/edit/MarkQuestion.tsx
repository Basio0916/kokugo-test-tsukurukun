import { useState } from 'react'
import type { Idea } from '../ai/addQuestion'
import type { QuestionDraftRequest, QuestionDraftResponse } from '../ai/questionDraft'
import { Dialog } from './Dialog'

/*
 * 本文に線を引いて小問を作る画面。どんな問題にしたいかを先生が自由に書き（選択肢から選ばせない）、
 * AI が問い文の形に整えた案を、入れる前に直す画面（呼ぶ側）に渡す。
 */

type Props = {
  title: string
  quote: string
  before?: string
  request: (how: QuestionDraftRequest['how']) => Promise<QuestionDraftResponse>
  onReview: (idea: Idea, wish: string) => void
  onClose: () => void
  // 書き直すときの、前に書いた希望
  initialWish?: string
}

export function MarkQuestion({ title, quote, before, request, onReview, onClose, initialWish = '' }: Props) {
  const [wish, setWish] = useState(initialWish)
  const [waiting, setWaiting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function submit() {
    if (!wish.trim()) return setErrors(['どんな問題にしたいかを書いてください'])
    setWaiting(true)
    setErrors([])
    const result = await request({ kind: 'mark', quote, ...(before && { before }), wish: wish.trim() })
    setWaiting(false)
    if (!result.ok) return setErrors(result.errors)
    onReview(result.ideas[0], wish.trim())
  }

  return (
    <Dialog title={title} submitLabel={waiting ? undefined : 'AI に問題の形にしてもらう'} errors={errors} onSubmit={() => void submit()} onClose={onClose}>
      <p>線を引くところ: <b className="mark-quote">{quote}</b></p>
      <label className="edit-fields">どんな問題にしたいか
        <textarea rows={3} value={wish} onChange={e => setWish(e.target.value)} aria-label="どんな問題にしたいか" placeholder="例: メロスがどういう人か、本文の言葉を使って答えさせたい" disabled={waiting} />
      </label>
      {waiting && <p className="ai-status" role="status">AI が問い文の形に整えています（数十秒かかります）</p>}
    </Dialog>
  )
}
