import { kantenTotals, totalPoints } from '../model/derive'
import type { Test } from '../model/schema'

/* 配点の合計・満点・観点別の合計と、テスト全体の操作。紙面の外に置き、印刷には出さない */

type Props = {
  test: Test
  message: string | null
  onRescale: () => void
  onEditInfo: () => void
}

export function TotalsBar({ test, message, onRescale, onEditInfo }: Props) {
  const total = totalPoints(test)
  const { knowledge, thinking } = kantenTotals(test)
  const matches = total === test.info.fullMarks
  return (
    <div className="totals" aria-label="配点の合計">
      <span className={matches ? '' : 'totals-off'}>
        配点の合計 <b>{total}</b> 点 / 満点 {test.info.fullMarks} 点
        {!matches && '（満点と合っていません）'}
      </span>
      <span className="totals-kanten">
        <span className="totals-meter" aria-hidden="true"><i className="m-k" style={{ flex: knowledge }} /><i className="m-t" style={{ flex: thinking }} /></span>
        知識・技能 {knowledge} 点・思考・判断・表現 {thinking} 点
      </span>
      <button type="button" onClick={onRescale}>配点を満点にそろえる</button>
      <button type="button" onClick={onEditInfo}>テストの情報を変える</button>
      {message && <span className="totals-message" role="status">{message}</span>}
    </div>
  )
}
