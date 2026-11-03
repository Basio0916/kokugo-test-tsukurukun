import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'

/* 紙面の上での操作に使うポップアップの枠。開いたらすぐモーダルで出し、やめると閉じる */

type Props = {
  title: string
  submitLabel: string
  errors: string[]
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}

export function Dialog({ title, submitLabel, errors, onSubmit, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit()
  }
  return (
    <dialog ref={ref} className="paste" onClose={onClose} aria-label={title}>
      <form onSubmit={submit}>
        <h2>{title}</h2>
        {children}
        {errors.length > 0 && (
          <div className="start-error" role="alert">
            {errors.map(e => <p key={e}>{e}</p>)}
          </div>
        )}
        <div className="start-actions">
          <button type="submit">{submitLabel}</button>
          <button type="button" className="secondary" onClick={() => ref.current?.close()}>やめる</button>
        </div>
      </form>
    </dialog>
  )
}
