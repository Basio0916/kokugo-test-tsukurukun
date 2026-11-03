import { useCallback, useState } from 'react'
import { requestDraft, type DraftStates } from './ai/client'
import { AiDraftPanel } from './AiDraft'
import { sectionPoints } from './model/derive'
import type { ProsePassage, Section, Test } from './model/schema'
import { Paper } from './paper/Paper'
import { longTest } from './sample/longTest'
import { sampleTest } from './sample/sampleTest'
import { PastePassage } from './start/PastePassage'
import type { Allotments, MaterialNames } from './start/skeleton'
import { StartScreen, type Skeleton } from './start/StartScreen'

// ?sample でサンプルのテストを開く（?sample=long は小問の多いサンプル）
const sample = new URLSearchParams(location.search).get('sample')
const initialTest = sample === 'long' ? longTest : sample !== null ? sampleTest : null

export function App() {
  const [test, setTest] = useState<Test | null>(initialTest)
  const [allotments, setAllotments] = useState<Allotments>({})
  const [materialNames, setMaterialNames] = useState<MaterialNames>({})
  const [drafts, setDrafts] = useState<DraftStates>({})
  const [pasting, setPasting] = useState<string | null>(null)
  const [tooWide, setTooWide] = useState<string[]>([])

  const openPassage = useCallback((sectionId: string) => setPasting(sectionId), [])
  const reportTooWide = useCallback((ids: string[]) => setTooWide(prev => (prev.join() === ids.join() ? prev : ids)), [])

  function start(skeleton: Skeleton) {
    setTest(skeleton.test)
    setAllotments(skeleton.allotments)
    setMaterialNames(skeleton.materialNames)
  }

  async function draftSection(current: Test, section: Section) {
    setDrafts(d => ({ ...d, [section.id]: { status: 'drafting' } }))
    const result = await requestDraft(current, section, allotments[section.id] ?? sectionPoints(section))
    if (!result.ok) {
      setDrafts(d => ({ ...d, [section.id]: { status: 'failed', errors: result.errors } }))
      return
    }
    setTest(t => t && { ...t, sections: t.sections.map(s => (s.id === section.id ? result.section : s)) })
    setDrafts(d => ({ ...d, [section.id]: { status: 'drafted', rationales: result.rationales } }))
  }

  function pastePassage(sectionId: string, passage: ProsePassage) {
    if (!test) return
    const section = { ...test.sections.find(s => s.id === sectionId)!, passage, questions: [] }
    const next = { ...test, sections: test.sections.map(s => (s.id === sectionId ? section : s)) }
    setTest(next)
    setPasting(null)
    void draftSection(next, section)
  }

  if (!test) return <div className="app"><StartScreen onStart={start} /></div>

  return (
    <div className="app">
      <header className="app-bar">
        <b>国語テストつくるくん</b>
        <span>{sample !== null ? 'サンプルのテストを表示しています' : `${test.info.year}　${test.info.name}（${test.info.grade}）`}</span>
        <a href="./">はじめから作る</a>
      </header>
      <AiDraftPanel test={test} drafts={drafts} materialNames={materialNames} tooWide={tooWide} onDraft={s => void draftSection(test, s)} />
      <Paper test={test} allotments={allotments} onOpenPassage={openPassage} onTooWide={reportTooWide} />
      {pasting && (
        <PastePassage
          material={materialNames[pasting] ?? ''}
          onSubmit={passage => pastePassage(pasting, passage)}
          onClose={() => setPasting(null)}
        />
      )}
    </div>
  )
}
