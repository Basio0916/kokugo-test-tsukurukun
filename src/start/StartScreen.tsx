import { useState, type FormEvent } from 'react'
import type { Grade } from '../catalog/schema'
import type { TestInfo } from '../model/schema'
import { grammarMaterialsOf, materialsOf, type Material } from './kinds'
import { buildSkeleton } from './skeleton'

/* テストを作り始める画面。学年・教材・テストの情報を入れると、骨組みと配点の枠を作る */

const GRADE_NAMES = ['一年', '二年', '三年']

export type Skeleton = NonNullable<ReturnType<typeof buildSkeleton>>

export function StartScreen({ onStart }: { onStart: (skeleton: Skeleton) => void }) {
  const [grade, setGrade] = useState<Grade>(2)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [kanji, setKanji] = useState(true)
  const [grammar, setGrammar] = useState<Set<string>>(new Set())
  const [year, setYear] = useState('令和八年度')
  const [name, setName] = useState('')
  const [fullMarks, setFullMarks] = useState(100)
  const [minutes, setMinutes] = useState(50)
  const [pointStep, setPointStep] = useState<TestInfo['pointStep']>(1)
  const [error, setError] = useState<string | null>(null)
  const materials = materialsOf(grade)
  const grammarMaterials = grammarMaterialsOf(grade)

  function toggleGrammar(name: string) {
    setGrammar(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggle(m: Material) {
    setChosen(prev => {
      const next = new Set(prev)
      if (next.has(m.name)) next.delete(m.name)
      else next.add(m.name)
      return next
    })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const selected = materials.filter(m => chosen.has(m.name))
    if (selected.length === 0) return setError('テストに入れる教材を選んでください。')
    if (!name.trim()) return setError('テストの名前を入れてください。')
    const info: TestInfo = { year: year.trim(), name: name.trim(), grade: GRADE_NAMES[grade - 1], fullMarks, minutes, pointStep }
    const skeleton = buildSkeleton(info, selected, { kanji, grammar: grammarMaterials.filter(g => grammar.has(g.name)) })
    if (!skeleton) return setError(`満点${fullMarks}点を、大問に${pointStep}点刻みで割り振れません。満点を大きくするか、大問を減らしてください。`)
    onStart(skeleton)
  }

  return (
    <form className="start" onSubmit={submit} aria-label="テストを作る">
      <h1>テストを作る</h1>
      <p className="start-lead">教科書は光村図書（令和7年度版）です。学年とテストに入れる教材を選び、テストの情報を入れてください。</p>

      <fieldset>
        <legend>学年</legend>
        {([1, 2, 3] as const).map(g => (
          <label key={g} className="start-choice">
            <input type="radio" name="grade" checked={grade === g} onChange={() => { setGrade(g); setChosen(new Set()); setGrammar(new Set()) }} />
            {GRADE_NAMES[g - 1]}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>教材（文章を読む大問にする教材）</legend>
        <ul className="start-materials">
          {materials.map(m => (
            <li key={m.name}>
              <label className={m.selectable ? '' : 'start-disabled'}>
                <input type="checkbox" checked={chosen.has(m.name)} disabled={!m.selectable} onChange={() => toggle(m)} />
                <span className="start-month">{m.month}月</span>
                {m.name}
                {m.unit && <span className="start-unit">{m.unit}</span>}
                {!m.selectable && <span className="start-later">{m.kind === 'kanbun' ? '漢文' : '古文'}は後で対応</span>}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend>漢字・文法の大問</legend>
        <label className="start-choice">
          <input type="checkbox" checked={kanji} onChange={e => setKanji(e.target.checked)} />
          漢字の大問を入れる（出題する語はテストを作った後に決めます）
        </label>
        <p className="start-sub">文法の大問に入れる教材</p>
        <ul className="start-materials">
          {grammarMaterials.map(g => (
            <li key={g.name}>
              <label>
                <input type="checkbox" checked={grammar.has(g.name)} onChange={() => toggleGrammar(g.name)} />
                {g.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="start-info">
        <legend>テストの情報</legend>
        <label>年度<input value={year} onChange={e => setYear(e.target.value)} /></label>
        <label>テストの名前<input value={name} placeholder="例: 第三学期　学年末テスト" onChange={e => setName(e.target.value)} /></label>
        <label>満点<input type="number" min={1} value={fullMarks} onChange={e => setFullMarks(Number(e.target.value))} />点</label>
        <label>試験時間<input type="number" min={1} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />分</label>
        <label>配点の刻み
          <select value={pointStep} onChange={e => setPointStep(Number(e.target.value) as TestInfo['pointStep'])}>
            <option value={1}>一点</option>
            <option value={0.5}>〇・五点</option>
          </select>
        </label>
      </fieldset>

      {error && <p className="start-error" role="alert">{error}</p>}
      <div className="start-actions">
        <button type="submit">テストを作る</button>
        <a href="?sample=1">サンプルを見る</a>
      </div>
    </form>
  )
}
