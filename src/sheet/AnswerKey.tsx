import { kantenTotals, totalPoints } from '../model/derive'
import type { Section, Test } from '../model/schema'
import { keyRows } from './keyRows'
import './sheet.css'

/* 模範解答・採点基準の表。大問ごとのまとまりの下に、小問ごとの行を並べる */

export function AnswerKey({ test, nameOf }: { test: Test; nameOf: (section: Section) => string }) {
  const totals = kantenTotals(test)
  return (
    <section className="key" aria-label="模範解答・採点基準">
      <h2>{test.info.year}　{test.info.name}　国語　模範解答・採点基準</h2>
      <table>
        <thead>
          <tr><th>設問</th><th>正答・模範解答</th><th>配点</th><th>観点・指導事項</th><th>採点基準</th></tr>
        </thead>
        <tbody>
          {test.sections.map(s => {
            const rows = keyRows(s)
            const prose = s.kind === 'literary' || s.kind === 'expository' || s.kind === 'classical'
            return [
              <tr key={s.id} className="key-group"><td colSpan={5}>{nameOf(s)}</td></tr>,
              ...(rows.length === 0
                ? [<tr key={`${s.id}:none`}><td colSpan={5} className="key-muted">{prose && !s.passage ? '本文を貼ると、小問と一緒に作られます。' : '小問はまだありません。'}</td></tr>]
                : rows.map((r, i) => (
                  <tr key={`${s.id}:${i}`}>
                    <td>{r.label}</td>
                    <td className="key-answer">{r.answer}</td>
                    <td className="key-points">{r.points}</td>
                    <td className="key-kanten">{r.kanten}<br /><small>{r.standard}</small></td>
                    <td>{r.rubric.length > 1 ? <ul>{r.rubric.map(x => <li key={x}>{x}</li>)}</ul> : r.rubric[0]}</td>
                  </tr>
                ))),
            ]
          })}
        </tbody>
        <tfoot>
          <tr><td colSpan={5}>知識・技能 {totals.knowledge}点　／　思考・判断・表現 {totals.thinking}点　／　合計 {totalPoints(test)}点（満点 {test.info.fullMarks}点）</td></tr>
        </tfoot>
      </table>
    </section>
  )
}
