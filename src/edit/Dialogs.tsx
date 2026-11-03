import { useState } from 'react'
import type { Grade } from '../catalog/schema'
import type { TestInfo } from '../model/schema'
import { grammarMaterialsOf, materialsOf, type Material } from '../start/kinds'
import { Dialog } from './Dialog'

/* 指示文・テストの情報・大問の追加のポップアップ */

export function InstructionEditor({ title, value, onSubmit, onClose }: { title: string; value: string; onSubmit: (v: string) => string[]; onClose: () => void }) {
  const [text, setText] = useState(value)
  const [errors, setErrors] = useState<string[]>([])
  return (
    <Dialog title={title} submitLabel="この指示文にする" errors={errors} onSubmit={() => setErrors(onSubmit(text))} onClose={onClose}>
      <textarea rows={3} value={text} onChange={e => setText(e.target.value)} aria-label="指示文" />
    </Dialog>
  )
}

export function TestInfoEditor({ info, onSubmit, onClose }: { info: TestInfo; onSubmit: (info: TestInfo) => void; onClose: () => void }) {
  const [year, setYear] = useState(info.year)
  const [name, setName] = useState(info.name)
  const [fullMarks, setFullMarks] = useState(info.fullMarks)
  const [minutes, setMinutes] = useState(info.minutes)
  const [pointStep, setPointStep] = useState(info.pointStep)
  const [errors, setErrors] = useState<string[]>([])
  function submit() {
    if (!name.trim() || !year.trim()) return setErrors(['年度とテストの名前を入れてください'])
    if (!(fullMarks > 0) || !(minutes > 0)) return setErrors(['満点と試験時間を入れてください'])
    onSubmit({ ...info, year: year.trim(), name: name.trim(), fullMarks, minutes, pointStep })
  }
  return (
    <Dialog title="テストの情報を変える" submitLabel="この情報にする" errors={errors} onSubmit={submit} onClose={onClose}>
      <div className="edit-row">
        <label>年度<input value={year} onChange={e => setYear(e.target.value)} aria-label="年度" /></label>
        <label>テストの名前<input value={name} onChange={e => setName(e.target.value)} aria-label="テストの名前" /></label>
        <label>満点<input type="number" min="1" value={fullMarks} onChange={e => setFullMarks(Number(e.target.value))} aria-label="満点" />点</label>
        <label>試験時間<input type="number" min="1" value={minutes} onChange={e => setMinutes(Number(e.target.value))} aria-label="試験時間" />分</label>
        <label>配点の刻み
          <select value={pointStep} onChange={e => setPointStep(Number(e.target.value) as TestInfo['pointStep'])} aria-label="配点の刻み">
            <option value={1}>一点</option>
            <option value={0.5}>〇・五点</option>
          </select>
        </label>
      </div>
      <p className="edit-hint">満点を変えたら、「配点を満点にそろえる」で配点を割り直せます。刻みを変えて合わない配点があれば、満点にそろえ直します。</p>
    </Dialog>
  )
}

export type NewSection =
  | { kind: 'reading'; material: Material }
  | { kind: 'kanji' }
  | { kind: 'grammar'; materials: string[] }
  | { kind: 'composition' }

// テストに入っている大問（足す画面で選べなくする）
export type PresentSections = { materials: Set<string>; grammar: Set<string>; kanji: boolean; composition: boolean }

const IN_TEST = '（入っています）'

export function AddSection({ grade, present, onSubmit, onClose }: { grade: Grade; present: PresentSections; onSubmit: (s: NewSection) => void; onClose: () => void }) {
  const materials = materialsOf(grade)
  const grammar = grammarMaterialsOf(grade)
  const [choice, setChoice] = useState('')
  const [grammarChosen, setGrammarChosen] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<string[]>([])
  function submit() {
    if (choice === 'kanji') return onSubmit({ kind: 'kanji' })
    if (choice === 'composition') return onSubmit({ kind: 'composition' })
    if (choice === 'grammar') {
      if (grammarChosen.size === 0) return setErrors(['文法の教材を選んでください'])
      return onSubmit({ kind: 'grammar', materials: [...grammarChosen] })
    }
    const material = materials.find(m => m.name === choice)
    if (!material) return setErrors(['加える大問を選んでください'])
    onSubmit({ kind: 'reading', material })
  }
  return (
    <Dialog title="大問を追加する" submitLabel="この大問を加える" errors={errors} onSubmit={submit} onClose={onClose}>
      <fieldset className="kanji-candidates">
        <legend>漢字・文法・作文</legend>
        <label><input type="radio" name="add" checked={choice === 'kanji'} onChange={() => setChoice('kanji')} disabled={present.kanji} />漢字の大問{present.kanji && IN_TEST}</label>
        <label><input type="radio" name="add" checked={choice === 'grammar'} onChange={() => setChoice('grammar')} />文法の大問</label>
        <label><input type="radio" name="add" checked={choice === 'composition'} onChange={() => setChoice('composition')} disabled={present.composition} />作文の大問{present.composition ? IN_TEST : '（題と条件は AI が作ります）'}</label>
        {choice === 'grammar' && grammar.map(g => (
          <label key={g.name}>
            <input type="checkbox" checked={grammarChosen.has(g.name)} disabled={present.grammar.has(g.name)} onChange={() => setGrammarChosen(prev => {
              const next = new Set(prev)
              if (next.has(g.name)) next.delete(g.name)
              else next.add(g.name)
              return next
            })} />
            {g.name}{present.grammar.has(g.name) && IN_TEST}
          </label>
        ))}
      </fieldset>
      <fieldset className="kanji-candidates add-materials">
        <legend>文章の教材</legend>
        {materials.map(m => (
          <label key={m.name}><input type="radio" name="add" checked={choice === m.name} onChange={() => setChoice(m.name)} disabled={present.materials.has(m.name)} />{m.month}月　{m.name}{present.materials.has(m.name) && IN_TEST}</label>
        ))}
      </fieldset>
    </Dialog>
  )
}
