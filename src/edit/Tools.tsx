/* 紙面のブロックに重ねる操作の表示。マウスを乗せたときに出し、印刷には出さない。位置を絶対指定するので割り付けは変わらない */

export type SectionAction = 'up' | 'down' | 'delete' | 'confirm' | 'unconfirm'
export type QuestionAction = 'up' | 'down' | 'delete' | 'edit'

type Button<A> = { action: A; label: string }

function Tools<A extends string>({ name, buttons, onAction, badge }: { name: string; buttons: Button<A>[]; onAction: (a: A) => void; badge?: string }) {
  return (
    <div className="blk-tools" role="group" aria-label={`${name}の操作`}>
      {badge && <span className="blk-badge">{badge}</span>}
      {buttons.map(b => (
        <button key={b.action} type="button" onClick={() => onAction(b.action)}>{b.label}</button>
      ))}
    </div>
  )
}

export function SectionTools({ name, confirmed, onAction }: { name: string; confirmed: boolean; onAction: (a: SectionAction) => void }) {
  const buttons: Button<SectionAction>[] = [
    { action: 'up', label: '上へ' },
    { action: 'down', label: '下へ' },
    { action: 'delete', label: '削除' },
    confirmed ? { action: 'unconfirm', label: '確定を外す' } : { action: 'confirm', label: '確定する' },
  ]
  return <Tools name={name} buttons={buttons} onAction={onAction} badge={confirmed ? '確定' : undefined} />
}

export function QuestionTools({ name, onAction }: { name: string; onAction: (a: QuestionAction) => void }) {
  const buttons: Button<QuestionAction>[] = [
    { action: 'edit', label: '直す' },
    { action: 'up', label: '上へ' },
    { action: 'down', label: '下へ' },
    { action: 'delete', label: '削除' },
  ]
  return <Tools name={name} buttons={buttons} onAction={onAction} />
}
