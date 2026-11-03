import { useCallback, useState } from 'react'
import { plainText } from './ai/anchor'
import { requestDraft, requestGrammar, requestKanji, type DraftStates } from './ai/client'
import type { DraftResponse } from './ai/draft'
import { AiDraftPanel } from './AiDraft'
import { sectionPoints } from './model/derive'
import type { ProsePassage, Section, Test } from './model/schema'
import { Paper } from './paper/Paper'
import { longTest } from './sample/longTest'
import { sampleTest } from './sample/sampleTest'
import { kanjiCandidates } from './start/kanjiCandidates'
import { KanjiWords } from './start/KanjiWords'
import { PastePassage } from './start/PastePassage'
import { GRAMMAR_SECTION_ID, type Allotments, type MaterialNames } from './start/skeleton'
import { StartScreen, type Skeleton } from './start/StartScreen'

// ?sample でサンプルのテストを開く（?sample=long は小問の多いサンプル）
const sample = new URLSearchParams(location.search).get('sample')
const initialTest = sample === 'long' ? longTest : sample !== null ? sampleTest : null

// 本文を貼った大問の本文（漢字の候補を拾うのに使う）
const pastedTexts = (test: Test) => test.sections.flatMap(s => (s.passage?.kind === 'prose' ? [plainText(s.passage.segments)] : []))

export function App() {
  const [test, setTest] = useState<Test | null>(initialTest)
  const [allotments, setAllotments] = useState<Allotments>({})
  const [materialNames, setMaterialNames] = useState<MaterialNames>({})
  const [grammarMaterials, setGrammarMaterials] = useState<string[]>([])
  const [kanjiWords, setKanjiWords] = useState<string[]>([])
  const [drafts, setDrafts] = useState<DraftStates>({})
  const [pasting, setPasting] = useState<string | null>(null)
  const [choosingKanji, setChoosingKanji] = useState<string | null>(null)
  const [tooWide, setTooWide] = useState<string[]>([])

  const openPassage = useCallback((sectionId: string) => setPasting(sectionId), [])
  const openKanji = useCallback((sectionId: string) => setChoosingKanji(sectionId), [])
  const reportTooWide = useCallback((ids: string[]) => setTooWide(prev => (prev.join() === ids.join() ? prev : ids)), [])

  const subtotalOf = (section: Section) => allotments[section.id] ?? sectionPoints(section)

  // 大問を AI に作ってもらい、できたら紙面の大問を置き換える。作り方（文章・漢字・文法）は request が決める
  async function draft(section: Section, request: () => Promise<DraftResponse>) {
    setDrafts(d => ({ ...d, [section.id]: { status: 'drafting' } }))
    const result = await request()
    if (!result.ok) {
      setDrafts(d => ({ ...d, [section.id]: { status: 'failed', errors: result.errors } }))
      return
    }
    setTest(t => t && { ...t, sections: t.sections.map(s => (s.id === section.id ? result.section : s)) })
    setDrafts(d => ({ ...d, [section.id]: { status: 'drafted', rationales: result.rationales } }))
  }

  function start(skeleton: Skeleton) {
    setTest(skeleton.test)
    setAllotments(skeleton.allotments)
    setMaterialNames(skeleton.materialNames)
    setGrammarMaterials(skeleton.grammarMaterials)
    // 文法の大問は本文を待たずにすぐ作る（漢字は出題する語を決めてから）
    const grammar = skeleton.test.sections.find(s => s.id === GRAMMAR_SECTION_ID)
    if (grammar) void draft(grammar, () => requestGrammar(skeleton.test, grammar, skeleton.allotments[grammar.id], skeleton.grammarMaterials))
  }

  function pastePassage(sectionId: string, passage: ProsePassage) {
    if (!test) return
    const section = { ...test.sections.find(s => s.id === sectionId)!, passage, questions: [] }
    const next = { ...test, sections: test.sections.map(s => (s.id === sectionId ? section : s)) }
    setTest(next)
    setPasting(null)
    void draft(section, () => requestDraft(next, section, subtotalOf(section)))
  }

  function chooseKanji(sectionId: string, words: string[]) {
    if (!test) return
    const section = test.sections.find(s => s.id === sectionId)!
    const candidates = kanjiCandidates(pastedTexts(test)).filter(w => !words.includes(w))
    setKanjiWords(words)
    setChoosingKanji(null)
    void draft(section, () => requestKanji(test, section, subtotalOf(section), words, candidates))
  }

  function redraft(section: Section) {
    if (!test) return
    if (section.kind === 'kanji') return setChoosingKanji(section.id)
    if (section.kind === 'grammar') return void draft(section, () => requestGrammar(test, section, subtotalOf(section), grammarMaterials))
    void draft(section, () => requestDraft(test, section, subtotalOf(section)))
  }

  if (!test) return <div className="app"><StartScreen onStart={start} /></div>

  return (
    <div className="app">
      <header className="app-bar">
        <b>国語テストつくるくん</b>
        <span>{sample !== null ? 'サンプルのテストを表示しています' : `${test.info.year}　${test.info.name}（${test.info.grade}）`}</span>
        <a href="./">はじめから作る</a>
      </header>
      <AiDraftPanel
        test={test} drafts={drafts} materialNames={materialNames} tooWide={tooWide}
        kanjiGrammar={sample === null}
        onDraft={redraft}
      />
      <Paper test={test} allotments={allotments} onOpenPassage={openPassage} onOpenKanji={openKanji} onTooWide={reportTooWide} />
      {pasting && (
        <PastePassage
          material={materialNames[pasting] ?? ''}
          onSubmit={passage => pastePassage(pasting, passage)}
          onClose={() => setPasting(null)}
        />
      )}
      {choosingKanji && (
        <KanjiWords
          candidates={kanjiCandidates(pastedTexts(test))}
          initial={kanjiWords}
          onSubmit={words => chooseKanji(choosingKanji, words)}
          onClose={() => setChoosingKanji(null)}
        />
      )}
    </div>
  )
}
