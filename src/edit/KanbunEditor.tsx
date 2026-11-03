import { useState } from 'react'
import { lineNotation } from '../model/kanbun'
import type { KanbunPassage } from '../model/schema'
import { Dialog } from './Dialog'

/* 漢文の返り点と送り仮名を、句ごとの「字(送り仮名)[返り点]」の記法で直す。白文の字は変えられない */

type Props = { title: string; passage: KanbunPassage; onSubmit: (text: string) => string[]; onClose: () => void }

export function KanbunEditor({ title, passage, onSubmit, onClose }: Props) {
  const [text, setText] = useState(() => passage.lines.map(lineNotation).join('\n'))
  const [errors, setErrors] = useState<string[]>([])
  return (
    <Dialog title={title} submitLabel="この返り点と送り仮名にする" errors={errors} onSubmit={() => setErrors(onSubmit(text))} onClose={onClose}>
      <p className="edit-hint">一行に一句です。字のあとに、送り仮名を（ ）、返り点を［ ］で書きます（例: 春眠不[レ]覚(エ)[レ]暁(ヲ)）。返り点は レ・一・二・三・上・中・下・一レ・上レ。白文の字は変えられません。</p>
      <textarea rows={Math.max(4, passage.lines.length + 1)} value={text} onChange={e => setText(e.target.value)} aria-label="返り点と送り仮名" />
    </Dialog>
  )
}
