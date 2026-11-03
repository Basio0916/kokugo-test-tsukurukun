import type { Section, Test } from '../model/schema'
import type { SectionStatus } from './guide'

/* 状態つきの大問の一覧。紙面の上に置き、押すとその大問へ移る。印刷には出さない */

type Props = {
  test: Test
  nameOf: (section: Section) => string
  statusOf: (section: Section) => SectionStatus
  onGo: (sectionId: string) => void
  onAddSection?: () => void
}

export function Outline({ test, nameOf, statusOf, onGo, onAddSection }: Props) {
  return (
    <nav className="outline" aria-label="大問の一覧">
      {test.sections.map(s => {
        const status = statusOf(s)
        return (
          <button key={s.id} type="button" className="outline-item" onClick={() => onGo(s.id)}>
            {nameOf(s)}<span className={`outline-st st-${status.tone}`}>{status.label}</span>
          </button>
        )
      })}
      {onAddSection && <button type="button" className="outline-add" onClick={onAddSection}>＋ 大問を追加</button>}
    </nav>
  )
}
