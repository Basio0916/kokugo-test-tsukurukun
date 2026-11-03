import { useState, type ReactNode } from 'react'
import { choiceLabel } from '../model/derive'
import { itemSegments } from '../model/notation'
import type { Item, Question } from '../model/schema'
import { circled } from '../paper/kansuji'
import { Dialog } from './Dialog'
import { stemToText, textToStem } from './stemText'

/*
 * 小問を直すポップアップ。問い文は紙面と同じ番号の印（{傍線部①}・{①}・{ア〜エ}）で、
 * 項目は一行に「例文｜答え」（傍線は [[ ]]）で、選択肢・採点の観点・作文の条件は一行に一つで直す。
 */

const lines = (text: string) => text.split('\n').map(l => l.trim()).filter(Boolean)

function itemToLine(item: Item, numbers: Map<string, number>): string {
  const sentence = item.segments
    ? item.segments.map(s => (s.kind === 'underline' ? `[[${s.text}]]` : s.text)).join('')
    : `{傍線部${circled(numbers.get(item.markId ?? '') ?? 0)}}`
  return `${sentence}｜${item.answer}`
}

function lineToItem(line: string, idOf: Map<number, string>): Item | string {
  const [sentence, answer] = line.split('｜')
  if (!answer?.trim()) return `「${line}」に答えがない（「例文｜答え」の形で書く）`
  const ref = sentence.trim().match(/^\{傍線部(.)\}$/)
  if (ref) {
    const id = idOf.get('①②③④⑤⑥⑦⑧⑨⑩'.indexOf(ref[1]) + 1)
    return id ? { markId: id, answer: answer.trim() } : `「${sentence}」の傍線部が本文にない`
  }
  return { segments: itemSegments(sentence.trim()), answer: answer.trim() }
}

type Props = {
  title: string
  question: Question
  numbers: Map<string, number>
  // 置き換えを試し、だめなら理由を返す
  onSubmit: (question: Question) => string[]
  onClose: () => void
  submitLabel?: string
  // ポップアップの上に添える説明（AI が整えたところなど）
  note?: string
  // 問い文などの上に足す欄（線を引いて作った案の、形式と字数の選び直しなど）
  extra?: ReactNode
}

export function QuestionEditor({ title, question: q, numbers, onSubmit, onClose, submitLabel = 'この内容で直す', note, extra }: Props) {
  const [stem, setStem] = useState(stemToText(q.stem, numbers, q.choices?.length ?? 4))
  const [choices, setChoices] = useState((q.choices ?? []).join('\n'))
  const [correct, setCorrect] = useState(q.correct ?? 0)
  const [items, setItems] = useState((q.items ?? []).map(it => itemToLine(it, numbers)).join('\n'))
  const [answer, setAnswer] = useState(q.answer ?? '')
  const [rubric, setRubric] = useState((q.rubric ?? []).join('\n'))
  const [conditions, setConditions] = useState((q.conditions ?? []).join('\n'))
  const [charLimit, setCharLimit] = useState(q.charLimit?.toString() ?? '')
  const [points, setPoints] = useState(String(q.pointsEach ?? q.points ?? ''))
  const [kanten, setKanten] = useState(q.kanten)
  const [standard, setStandard] = useState(q.standard)
  const [errors, setErrors] = useState<string[]>([])

  const hasItems = q.items !== undefined
  const choiceList = lines(choices)

  function submit() {
    const problems: string[] = []
    const parsed = textToStem(stem, numbers)
    if (!parsed.ok) problems.push(...parsed.errors)
    if (q.format !== 'composition' && !stem.trim()) problems.push('問い文を入れてください')
    const idOf = new Map([...numbers].map(([id, n]) => [n, id]))
    const newItems = hasItems ? lines(items).map(l => lineToItem(l, idOf)) : undefined
    newItems?.forEach(it => typeof it === 'string' && problems.push(it))
    const value = Number(points)
    if (!(value > 0)) problems.push('配点を入れてください')
    if (problems.length) return setErrors(problems)
    const next: Question = {
      ...q,
      stem: parsed.ok ? parsed.stem : q.stem,
      kanten,
      standard: standard.trim(),
      ...(q.choices !== undefined || q.format === 'choice' ? { choices: choiceList } : {}),
      ...(q.correct !== undefined ? { correct } : {}),
      ...(hasItems ? { items: newItems as Item[] } : {}),
      ...(q.answer !== undefined || answer.trim() ? { answer: answer.trim() || undefined } : {}),
      ...(q.rubric !== undefined ? { rubric: lines(rubric) } : {}),
      ...(q.conditions !== undefined ? { conditions: lines(conditions) } : {}),
      charLimit: charLimit.trim() ? Number(charLimit) : undefined,
      ...(q.pointsEach !== undefined ? { pointsEach: value } : { points: value }),
    }
    setErrors(onSubmit(next))
  }

  return (
    <Dialog title={title} submitLabel={submitLabel} errors={errors} onSubmit={submit} onClose={onClose}>
      {extra}
      {note && <p className="edit-note">{note}</p>}
      <div className="edit-fields">
        {q.format !== 'composition' && (
          <label>問い文<span className="edit-hint">傍線部は {'{傍線部①}'}・{'{①}'}、選択肢の範囲は {'{ア〜エ}'} のまま残してください</span>
            <textarea rows={3} value={stem} onChange={e => setStem(e.target.value)} aria-label="問い文" />
          </label>
        )}
        {(q.choices !== undefined || q.format === 'choice') && (
          <label>選択肢（一行に一つ）
            <textarea rows={4} value={choices} onChange={e => setChoices(e.target.value)} aria-label="選択肢" />
          </label>
        )}
        {q.correct !== undefined && (
          <label>正答
            <select value={correct} onChange={e => setCorrect(Number(e.target.value))} aria-label="正答">
              {choiceList.map((c, i) => <option key={i} value={i}>{choiceLabel(i)}　{c.slice(0, 20)}</option>)}
            </select>
          </label>
        )}
        {hasItems && (
          <label>項目（一行に「例文｜答え」。傍線は [[ ]]）
            <textarea rows={5} value={items} onChange={e => setItems(e.target.value)} aria-label="項目" />
          </label>
        )}
        {q.conditions !== undefined && (
          <label>条件（一行に一つ）
            <textarea rows={3} value={conditions} onChange={e => setConditions(e.target.value)} aria-label="条件" />
          </label>
        )}
        {(q.answer !== undefined || (q.format !== 'choice' && !hasItems && q.format !== 'composition')) && (
          <label>答え・模範解答
            <textarea rows={2} value={answer} onChange={e => setAnswer(e.target.value)} aria-label="答え" />
          </label>
        )}
        {q.rubric !== undefined && (
          <label>採点の観点（一行に一つ）
            <textarea rows={3} value={rubric} onChange={e => setRubric(e.target.value)} aria-label="採点の観点" />
          </label>
        )}
        <div className="edit-row">
          <label>{q.pointsEach !== undefined ? '配点（各）' : '配点'}<input type="number" step="0.5" min="0.5" value={points} onChange={e => setPoints(e.target.value)} aria-label="配点" /></label>
          <label>字数<input type="number" min="1" value={charLimit} onChange={e => setCharLimit(e.target.value)} aria-label="字数" /></label>
          <label>観点
            <select value={kanten} onChange={e => setKanten(e.target.value as Question['kanten'])} aria-label="観点">
              <option value="knowledge">知識・技能</option>
              <option value="thinking">思考・判断・表現</option>
            </select>
          </label>
          <label>指導事項<input value={standard} onChange={e => setStandard(e.target.value)} aria-label="指導事項" /></label>
        </div>
      </div>
    </Dialog>
  )
}
