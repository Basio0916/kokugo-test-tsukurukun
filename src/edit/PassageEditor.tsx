import { useState, type SyntheticEvent } from 'react'
import { markRefsOf } from '../model/derive'
import type { ProseSegment, Section } from '../model/schema'
import { circled, kansuji } from '../paper/kansuji'
import { Dialog } from './Dialog'
import { markAtCaret, passageToText } from './passageEdit'

/*
 * 本文を直すポップアップ。本文は段落を改行でつないだ文字だけで直し、傍線部とルビは保存したときにシステムが付け直す。
 * 文字を入れる位置が傍線部の中にあるときは、どの小問の傍線部かを知らせる。
 */

type Props = {
  title: string
  section: Section
  numbers: Map<string, number>
  // 保存する。通らなければ理由を返す
  onSubmit: (text: string) => string[]
  onClose: () => void
}

export function PassageEditor({ title, section, numbers, onSubmit, onClose }: Props) {
  const segments: ProseSegment[] = section.passage?.kind === 'prose' ? section.passage.segments : []
  const [text, setText] = useState(() => passageToText(segments))
  const [caret, setCaret] = useState<[number, number]>([0, 0])
  const [errors, setErrors] = useState<string[]>([])

  // 傍線部を参照している小問（問一・問三）
  const usedBy = (markId: string) => section.questions.flatMap((q, i) => (markRefsOf(q).includes(markId) ? [`問${kansuji(i + 1)}`] : [])).join('・')
  const marks = segments.flatMap(s => (s.kind === 'mark' && numbers.has(s.id) ? [{ id: s.id, text: passageToText(s.children) }] : []))
  const inside = markAtCaret(segments, text, caret[0], caret[1])
  const track = (e: SyntheticEvent<HTMLTextAreaElement>) => setCaret([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])

  return (
    <Dialog
      title={title} submitLabel="この本文にする" errors={errors} onClose={onClose}
      onSubmit={() => setErrors(text.trim() ? onSubmit(text) : ['本文を入れてください'])}
    >
      <p className="edit-hint">段落は改行で分けます。傍線とルビは文字に付いているので、前後を直しても一緒に動きます。</p>
      <textarea
        rows={12} value={text} aria-label="本文"
        onChange={e => { setText(e.target.value); track(e) }}
        onSelect={track} onKeyUp={track} onClick={track}
      />
      {inside && numbers.has(inside) && (
        <p className="edit-note" role="status">
          ここは傍線部{circled(numbers.get(inside)!)}（{usedBy(inside)}）です。書き換えると、{usedBy(inside)}を確かめる必要が出ます。
        </p>
      )}
      {marks.length > 0 && (
        <ul className="passage-marks" aria-label="本文の傍線部">
          {marks.map(m => <li key={m.id}>傍線部{circled(numbers.get(m.id)!)}「{m.text}」（{usedBy(m.id)}）</li>)}
        </ul>
      )}
    </Dialog>
  )
}
