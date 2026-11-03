import { useState, type FormEvent } from 'react'
import { standardText } from '../catalog/catalog'
import type { Grade } from '../catalog/schema'
import type { Section, TestInfo } from '../model/schema'
import { kansuji } from '../paper/kansuji'
import { grammarMaterialsOf, kantenOfStandard, materialsOf, type Material } from './kinds'
import { buildSkeleton } from './skeleton'

/* テストを作り始める画面。学年・教材・テストの情報を入れると、骨組みと配点の枠を作る */

const GRADE_NAMES = ['一年', '二年', '三年']
const KIND_NAMES: Record<Section['kind'], string> = { kanji: '漢字', grammar: '文法', literary: '文学的文章', expository: '説明的文章', classical: '古文', kanbun: '漢文', composition: '作文' }
const KANTEN_NAMES = { knowledge: '知識・技能', thinking: '思考・判断・表現' } as const
// 単元データの出典（光村図書の年間指導計画例）
const SOURCE_URL = 'https://www.mitsumura-tosho.co.jp/kyokasho/c-kokugo/keikaku'

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

  const selected = materials.filter(m => chosen.has(m.name))
  const info: TestInfo = { year: year.trim(), name: name.trim(), grade: GRADE_NAMES[grade - 1], fullMarks, minutes, pointStep }
  // 選ぶたびに、決めたときと同じ骨組みを作って見せる
  const preview = buildSkeleton(info, selected, { kanji, grammar: grammarMaterials.filter(g => grammar.has(g.name)) })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (selected.length === 0) return setError('テストに入れる教材を選んでください。')
    if (!name.trim()) return setError('テストの名前を入れてください。')
    const skeleton = preview
    if (!skeleton) return setError(`満点${fullMarks}点を、大問に${pointStep}点刻みで割り振れません。満点を大きくするか、大問を減らしてください。`)
    onStart(skeleton)
  }

  // 骨組みの大問の名前（教材名、漢字、文法）
  const sectionName = (s: Section) => (s.material ?? (s.kind === 'grammar' ? `文法（${[...grammar].join('・')}）` : KIND_NAMES[s.kind]))

  return (
    <div className="start-wrap">
    <form className="start" onSubmit={submit} aria-label="テストを作る">
      <h1>テストを作る</h1>
      <p className="start-lead">学年とテストに入れる教材を選び、テストの情報を入れてください。</p>

      <label className="start-textbook">教科書
        <select defaultValue="mitsumura" aria-label="教科書">
          <option value="mitsumura">光村図書「国語」（令和七年度版）</option>
          <option disabled>東京書籍（まだ選べません）</option>
          <option disabled>教育出版（まだ選べません）</option>
          <option disabled>三省堂（まだ選べません）</option>
        </select>
      </label>

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
              <label>
                <input type="checkbox" checked={chosen.has(m.name)} onChange={() => toggle(m)} />
                <span className="start-month">{m.month}月</span>
                {m.name}
                {m.unit && <span className="start-unit">{m.unit}</span>}
                <span className="start-unit">{m.hours}時間・{m.standards.join('・')}</span>
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
    <aside className="start-side" aria-label="できあがる骨組みと指導目標">
      <h2>できあがる骨組み</h2>
      {preview
        ? (
          <ol className="start-skeleton">
            {preview.test.sections.map((s, i) => (
              <li key={s.id}><b>【{kansuji(i + 1)}】</b>{sectionName(s)}<span className="start-unit">{KIND_NAMES[s.kind]}・{preview.allotments[s.id]}点</span></li>
            ))}
          </ol>
        )
        : <p className="start-sub">{selected.length ? `満点${fullMarks}点を、大問に${pointStep}点刻みで割り振れません。` : '教材を選ぶと、ここに大問が並びます。'}</p>}
      <h2>この範囲の指導目標</h2>
      {selected.length === 0 && <p className="start-sub">教材を選ぶと表示されます。</p>}
      {selected.map(m => (
        <div key={m.name} className="start-goals">
          <p><b>{m.name}</b></p>
          <ul>
            {m.standards.map(code => (
              <li key={code}><span className={`start-kanten k-${kantenOfStandard(code)}`}>{KANTEN_NAMES[kantenOfStandard(code)]} {code}</span>　{standardText(grade, code)}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="start-sub">出典: <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">光村図書「令和7年度版 中学校国語 年間指導計画例」</a>。指導事項の文言は学習指導要領（告示）から引いています。</p>
    </aside>
    </div>
  )
}
