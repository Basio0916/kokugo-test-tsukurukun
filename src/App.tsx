import { useState } from 'react'
import { requestDraft, type DraftState } from './ai/client'
import { AiDraftPanel } from './AiDraft'
import type { Section } from './model/schema'
import { Paper } from './paper/Paper'
import { longTest } from './sample/longTest'
import { sampleTest } from './sample/sampleTest'

const initialTest = new URLSearchParams(location.search).get('sample') === 'long' ? longTest : sampleTest

export function App() {
  const [test, setTest] = useState(initialTest)
  const [draft, setDraft] = useState<DraftState>({ status: 'idle' })

  async function draftSection(section: Section) {
    setDraft({ status: 'drafting', sectionId: section.id })
    const result = await requestDraft(test, section)
    if (!result.ok) {
      setDraft({ status: 'failed', sectionId: section.id, errors: result.errors })
      return
    }
    setTest(t => ({ ...t, sections: t.sections.map(s => (s.id === section.id ? result.section : s)) }))
    setDraft({ status: 'drafted', sectionId: section.id, rationales: result.rationales })
  }

  return (
    <div className="app">
      <header className="app-bar">
        <b>国語テストつくるくん</b>
        <span>サンプルのテストを表示しています</span>
      </header>
      <AiDraftPanel test={test} state={draft} onDraft={draftSection} />
      <Paper test={test} />
    </div>
  )
}
