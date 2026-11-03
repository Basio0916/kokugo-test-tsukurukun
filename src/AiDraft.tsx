import { draftable, materialOf, type DraftStates } from './ai/client'
import type { Section, Test } from './model/schema'
import { kansuji } from './paper/kansuji'

/* 大問を AI に作ってもらう操作と、大問ごとの状態・理由の一覧。紙面の外に置き、印刷には出さない */

type Props = {
  test: Test
  drafts: DraftStates
  materialNames: Record<string, string>
  tooWide: string[]
  // 漢字・文法の大問を作り直せるか（作り方の手がかりの教材がわかる大問だけ）
  redraftable: (section: Section) => boolean
  onDraft: (section: Section) => void
}

const NAMES: Partial<Record<Section['kind'], string>> = { kanji: '漢字', grammar: '文法' }

export function AiDraftPanel({ test, drafts, materialNames, tooWide, redraftable, onDraft }: Props) {
  const label = (s: Section) => `【${kansuji(test.sections.indexOf(s) + 1)}】${materialOf(s) ?? materialNames[s.id] ?? NAMES[s.kind] ?? ''}`
  return (
    <aside className="ai-panel" aria-label="AI と作る">
      {test.sections.filter(s => draftable(s) || redraftable(s)).map(s => (
        <button key={s.id} type="button" disabled={drafts[s.id]?.status === 'drafting'} onClick={() => onDraft(s)}>
          {s.kind === 'kanji' ? `${label(s)}の出題する漢字を選び直す` : `${label(s)}の大問を AI に作ってもらう`}
        </button>
      ))}
      {test.sections.map(s => {
        const d = drafts[s.id]
        const wide = tooWide.includes(s.id)
        if (!d && !wide) return null
        return (
          <div key={s.id} className="ai-section">
            {wide && (
              <p className="ai-status ai-error" role="alert">{label(s)}の本文が一枚に収まりません。範囲を短くして貼り直してください。</p>
            )}
            {d?.status === 'drafting' && <p className="ai-status" role="status">{label(s)}の大問を作っています（数十秒かかります）</p>}
            {d?.status === 'failed' && (
              <div className="ai-status ai-error" role="alert">
                <p>{label(s)}の大問を作れませんでした。紙面は元のままです。</p>
                <ul>{d.errors.map(e => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
            {d?.status === 'drafted' && (
              <section className="ai-notes" aria-label={`${label(s)} AI の提案の理由`}>
                <h2>{label(s)} AI の提案の理由</h2>
                <ol>
                  {d.rationales.map((r, i) => (
                    <li key={r.questionId}>
                      <b>問{kansuji(i + 1)}</b>（{r.standard}）
                      {!r.inUnit && <span className="ai-outside">単元の指導事項にない</span>}
                      <p>{r.rationale}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )
      })}
    </aside>
  )
}
