import { draftable, gradeOf, materialOf, type DraftState } from './ai/client'
import type { Section, Test } from './model/schema'
import { kansuji } from './paper/kansuji'

/* 大問を AI に作ってもらう操作と、作った後の理由の一覧。紙面の外に置き、印刷には出さない */

export function AiDraftPanel({ test, state, onDraft }: { test: Test; state: DraftState; onDraft: (section: Section) => void }) {
  const targets = gradeOf(test) ? test.sections.filter(draftable) : []
  const busy = state.status === 'drafting'
  const numberOf = (id: string) => kansuji(test.sections.findIndex(s => s.id === id) + 1)
  return (
    <aside className="ai-panel" aria-label="AI と作る">
      {targets.map(s => (
        <button key={s.id} type="button" disabled={busy} onClick={() => onDraft(s)}>
          【{numberOf(s.id)}】{materialOf(s)}の大問を AI に作ってもらう
        </button>
      ))}
      {state.status === 'drafting' && (
        <p className="ai-status" role="status">【{numberOf(state.sectionId)}】の大問を作っています（数十秒かかります）</p>
      )}
      {state.status === 'failed' && (
        <div className="ai-status ai-error" role="alert">
          <p>【{numberOf(state.sectionId)}】の大問を作れませんでした。紙面は元のままです。</p>
          <ul>{state.errors.map(e => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {state.status === 'drafted' && (
        <section className="ai-notes" aria-label="AI の提案の理由">
          <h2>【{numberOf(state.sectionId)}】AI の提案の理由</h2>
          <ol>
            {state.rationales.map((r, i) => (
              <li key={r.questionId}>
                <b>問{kansuji(i + 1)}</b>（{r.standard}）
                {!r.inUnit && <span className="ai-outside">単元の指導事項にない</span>}
                <p>{r.rationale}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  )
}
