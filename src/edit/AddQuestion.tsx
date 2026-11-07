import { useState } from 'react'
import type { Idea } from '../ai/addQuestion'
import type { QuestionDraftRequest, QuestionDraftResponse } from '../ai/questionDraft'
import type { Section } from '../model/schema'
import { AI_FORMATS, OWN_FORMATS, ideaChoices, ideaFill, ideaStem, type AiFormat, type OwnFormat } from './addQuestionModel'
import { Dialog } from './Dialog'

/*
 * 小問の足し方を選ぶ画面と、AI の案を待つ・選ぶ画面。
 * AI のおすすめは押すとすぐ入る。形式を選ぶ・線を引く案と、自分で書く小問は、入れる前に小問を直すポップアップで示す（呼ぶ側）。
 */

type Step =
  | { step: 'menu' }
  | { step: 'format'; own: boolean }
  | { step: 'waiting' }
  | { step: 'ideas'; ideas: Idea[] }
  | { step: 'failed'; errors: string[] }

type Props = {
  title: string
  section: Section
  // AI を使う足し方が使えるか（本文を持つ文学的文章・説明的文章の大問だけ）
  aiAvailable: boolean
  request: (how: QuestionDraftRequest['how']) => Promise<QuestionDraftResponse>
  onPick: (idea: Idea) => void
  // 形式を選んで作ってもらった案（入れる前に直す）
  onReview: (idea: Idea) => void
  onOwn: (format: OwnFormat) => void
  onClose: () => void
}

export function AddQuestion({ title, section, aiAvailable, request, onPick, onReview, onOwn, onClose }: Props) {
  const ownFormats: Array<{ value: OwnFormat; label: string }> = section.kind === 'kanji'
    ? [{ value: 'kanji-items', label: '漢字の読み書き（項目のある問い）' }]
    : section.kind === 'grammar'
      ? [{ value: 'choice-items', label: '記号選択（項目のある問い）' }, { value: 'short-items', label: '短答（項目のある問い）' }]
      : OWN_FORMATS
  const [state, setState] = useState<Step>({ step: 'menu' })
  const [format, setFormat] = useState<OwnFormat | AiFormat>(ownFormats[0].value)
  const [aim, setAim] = useState('')

  // AI と自分で書くでは形式の一覧が違うので、開くたびにその一覧の先頭を選ぶ
  function openFormats(own: boolean) {
    setFormat((own ? ownFormats : AI_FORMATS)[0].value)
    setState({ step: 'format', own })
  }

  async function ask(how: QuestionDraftRequest['how'], review: boolean) {
    setState({ step: 'waiting' })
    const result = await request(how)
    if (!result.ok) return setState({ step: 'failed', errors: result.errors })
    if (review) return onReview(result.ideas[0])
    setState({ step: 'ideas', ideas: result.ideas })
  }

  if (state.step === 'menu') {
    return (
      <Dialog title={title} errors={[]} onSubmit={() => {}} onClose={onClose}>
        <div className="add-menu">
          <button type="button" disabled={!aiAvailable} onClick={() => void ask({ kind: 'suggest' }, false)}>AI のおすすめから選ぶ</button>
          <button type="button" disabled={!aiAvailable} onClick={() => openFormats(false)}>形式を選んで AI に作ってもらう</button>
          <button type="button" onClick={() => openFormats(true)}>自分で書く</button>
          {!aiAvailable && <p className="edit-hint">AI に作ってもらう足し方は、本文を持つ文章・古文・漢文の大問で使えます。この大問では「自分で書く」で足せます。</p>}
          <p className="edit-hint">本文に線を引いて作るときは、紙面の本文の一部を選んでください。</p>
        </div>
      </Dialog>
    )
  }

  if (state.step === 'format') {
    const formats = state.own ? ownFormats : AI_FORMATS
    return (
      <Dialog
        title={state.own ? `${title}（自分で書く）` : `${title}（形式を選ぶ）`}
        submitLabel={state.own ? '空の小問を開く' : 'AI に作ってもらう'}
        errors={[]}
        onSubmit={() => (state.own ? onOwn(format as OwnFormat) : void ask({ kind: 'format', format: format as AiFormat, ...(aim.trim() && { aim: aim.trim() }) }, true))}
        onClose={onClose}
      >
        <fieldset className="kanji-candidates">
          <legend>解答形式</legend>
          {formats.map(f => (
            <label key={f.value}><input type="radio" name="format" checked={format === f.value} onChange={() => setFormat(f.value)} />{f.label}</label>
          ))}
        </fieldset>
        {!state.own && (
          <label className="edit-fields">ねらい（任意）
            <textarea rows={2} value={aim} onChange={e => setAim(e.target.value)} aria-label="ねらい" placeholder="例: メロスの人物像" />
          </label>
        )}
      </Dialog>
    )
  }

  if (state.step === 'waiting') {
    return (
      <Dialog title={title} errors={[]} onSubmit={() => {}} onClose={onClose}>
        <p className="ai-status" role="status">AI が小問の案を作っています（数十秒かかります）</p>
      </Dialog>
    )
  }

  if (state.step === 'failed') {
    return (
      <Dialog title={title} errors={state.errors} onSubmit={() => setState({ step: 'menu' })} submitLabel="足し方を選び直す" onClose={onClose}>
        <p>小問の案を作れませんでした。</p>
      </Dialog>
    )
  }

  return (
    <Dialog title={`${title}（AI のおすすめ）`} errors={[]} onSubmit={() => {}} onClose={onClose}>
      <p className="edit-hint">押した案が、その位置に入ります。入れたあとも「直す」で直せます。</p>
      <ol className="idea-list">
        {state.ideas.map((idea, i) => (
          <li key={i}>
            <button type="button" onClick={() => onPick(idea)} aria-label={`案${i + 1}を入れる`}>
              <span className="idea-stem">{ideaStem(idea)}</span>
              {idea.question.fill && <span className="idea-choices">{ideaFill(idea)}</span>}
              {idea.question.choices && <span className="idea-choices">{ideaChoices(idea)}</span>}
              <span className="idea-why">（{idea.question.standard}）{idea.rationale}</span>
            </button>
          </li>
        ))}
      </ol>
    </Dialog>
  )
}
