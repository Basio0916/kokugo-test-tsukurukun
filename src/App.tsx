import { useCallback, useMemo, useState } from 'react'
import { plainText } from './ai/anchor'
import { gradeOf, requestDraft, requestGrammar, requestKanji, type DraftStates } from './ai/client'
import type { DraftResponse } from './ai/draft'
import { AiDraftPanel } from './AiDraft'
import { AddSection, InstructionEditor, TestInfoEditor, type NewSection } from './edit/Dialogs'
import { appendSection, moveQuestion, moveSection, newSectionId, removeQuestion, removeSection, replaceQuestion, setInstruction } from './edit/operations'
import { QuestionEditor } from './edit/QuestionEditor'
import { rescalePoints } from './edit/rescale'
import type { QuestionAction, SectionAction } from './edit/Tools'
import { TotalsBar } from './edit/TotalsBar'
import { markNumbers, sectionPoints } from './model/derive'
import type { ProsePassage, Section, Test } from './model/schema'
import { kansuji } from './paper/kansuji'
import { Paper } from './paper/Paper'
import { longTest } from './sample/longTest'
import { sampleTest } from './sample/sampleTest'
import { kanjiCandidates } from './start/kanjiCandidates'
import { KanjiWords } from './start/KanjiWords'
import { PastePassage } from './start/PastePassage'
import { GRAMMAR_SECTION_ID, KANJI_SECTION_ID, type Allotments, type MaterialNames } from './start/skeleton'
import { StartScreen, type Skeleton } from './start/StartScreen'

// ?sample でサンプルのテストを開く（?sample=long は小問の多いサンプル）
const sample = new URLSearchParams(location.search).get('sample')
const initialTest = sample === 'long' ? longTest : sample !== null ? sampleTest : null

// 本文を貼った大問の本文（漢字の候補を拾うのに使う）
const pastedTexts = (test: Test) => test.sections.flatMap(s => (s.passage?.kind === 'prose' ? [plainText(s.passage.segments)] : []))

// 加えた大問の配点の枠: 同じ種類の大問の配点の枠（なければ十点）
const DEFAULT_ALLOTMENT = 10

export function App() {
  const [test, setTest] = useState<Test | null>(initialTest)
  const [allotments, setAllotments] = useState<Allotments>({})
  const [materialNames, setMaterialNames] = useState<MaterialNames>({})
  // 大問の識別子 → 文法の大問を作るときに渡す教材名
  const [grammarBySection, setGrammarBySection] = useState<Record<string, string[]>>({})
  const [kanjiWords, setKanjiWords] = useState<string[]>([])
  const [drafts, setDrafts] = useState<DraftStates>({})
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [pasting, setPasting] = useState<string | null>(null)
  const [choosingKanji, setChoosingKanji] = useState<string | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<{ sectionId: string; questionId: string } | null>(null)
  const [editingInstruction, setEditingInstruction] = useState<string | null>(null)
  const [editingInfo, setEditingInfo] = useState(false)
  const [adding, setAdding] = useState(false)
  const [totalsMessage, setTotalsMessage] = useState<string | null>(null)
  const [tooWide, setTooWide] = useState<string[]>([])

  const openPassage = useCallback((sectionId: string) => setPasting(sectionId), [])
  const openKanji = useCallback((sectionId: string) => setChoosingKanji(sectionId), [])
  const reportTooWide = useCallback((ids: string[]) => setTooWide(prev => (prev.join() === ids.join() ? prev : ids)), [])

  const subtotalOf = (section: Section) => allotments[section.id] ?? sectionPoints(section)
  const unconfirm = (sectionId: string) => setConfirmed(prev => {
    if (!prev.has(sectionId)) return prev
    const next = new Set(prev)
    next.delete(sectionId)
    return next
  })
  const labelOf = (sectionId: string) => (test ? `【${kansuji(test.sections.findIndex(s => s.id === sectionId) + 1)}】` : '')

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
    unconfirm(section.id)
  }

  function start(skeleton: Skeleton) {
    setTest(skeleton.test)
    setAllotments(skeleton.allotments)
    setMaterialNames(skeleton.materialNames)
    // 文法の大問は本文を待たずにすぐ作る（漢字は出題する語を決めてから）
    const grammar = skeleton.test.sections.find(s => s.id === GRAMMAR_SECTION_ID)
    if (grammar) {
      setGrammarBySection({ [grammar.id]: skeleton.grammarMaterials })
      void draft(grammar, () => requestGrammar(skeleton.test, grammar, skeleton.allotments[grammar.id], skeleton.grammarMaterials))
    }
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
    if (section.kind === 'grammar') return void draft(section, () => requestGrammar(test, section, subtotalOf(section), grammarBySection[section.id]))
    void draft(section, () => requestDraft(test, section, subtotalOf(section)))
  }

  const onSection = useCallback((sectionId: string, action: SectionAction | 'instruction') => {
    if (action === 'instruction') return setEditingInstruction(sectionId)
    if (action === 'confirm') return setConfirmed(prev => new Set(prev).add(sectionId))
    if (action === 'unconfirm') return unconfirm(sectionId)
    if (action === 'delete') {
      if (!window.confirm('この大問を削除しますか？（本文と小問も消えます）')) return
      return setTest(t => t && removeSection(t, sectionId))
    }
    setTest(t => t && moveSection(t, sectionId, action === 'up' ? -1 : 1))
  }, [])

  const onQuestion = useCallback((sectionId: string, questionId: string, action: QuestionAction) => {
    if (action === 'edit') return setEditingQuestion({ sectionId, questionId })
    if (action === 'delete' && !window.confirm('この小問を削除しますか？')) return
    setTest(t => t && (action === 'delete' ? removeQuestion(t, sectionId, questionId) : moveQuestion(t, sectionId, questionId, action === 'up' ? -1 : 1)))
    unconfirm(sectionId)
  }, [])

  const editing = useMemo(() => ({ confirmed, onSection, onQuestion }), [confirmed, onSection, onQuestion])

  function addSection(added: NewSection) {
    if (!test) return
    const sameKind = (kind: Section['kind']) => test.sections.find(s => s.kind === kind && allotments[s.id] !== undefined)
    const base = { questions: [] }
    const section: Section =
      added.kind === 'kanji' ? { ...base, id: newSectionId(test, KANJI_SECTION_ID), kind: 'kanji', instruction: '次の問いに答えなさい。' }
        : added.kind === 'grammar' ? { ...base, id: newSectionId(test, GRAMMAR_SECTION_ID), kind: 'grammar', instruction: '次の問いに答えなさい。' }
          : { ...base, id: newSectionId(test, 's'), kind: added.material.kind, instruction: '次の文章を読んで、あとの問いに答えなさい。' }
    const like = sameKind(section.kind)
    const allotment = like ? allotments[like.id] : DEFAULT_ALLOTMENT
    const next = appendSection(test, section)
    setTest(next)
    setAllotments(a => ({ ...a, [section.id]: allotment }))
    setAdding(false)
    if (added.kind === 'reading') setMaterialNames(m => ({ ...m, [section.id]: added.material.name }))
    if (added.kind === 'grammar') {
      setGrammarBySection(g => ({ ...g, [section.id]: added.materials }))
      void draft(section, () => requestGrammar(next, section, allotment, added.materials))
    }
  }

  function rescale() {
    if (!test) return
    const r = rescalePoints(test)
    if (!r.ok) return setTotalsMessage(r.error)
    setTest(r.test)
    setConfirmed(new Set())
    setTotalsMessage(`配点の合計を ${test.info.fullMarks} 点にそろえました`)
  }

  if (!test) return <div className="app"><StartScreen onStart={start} /></div>

  const editedSection = editingQuestion && test.sections.find(s => s.id === editingQuestion.sectionId)
  const editedQuestion = editedSection?.questions.find(q => q.id === editingQuestion!.questionId)

  return (
    <div className="app">
      <header className="app-bar">
        <b>国語テストつくるくん</b>
        <span>{sample !== null ? 'サンプルのテストを表示しています' : `${test.info.year}　${test.info.name}（${test.info.grade}）`}</span>
        <a href="./">はじめから作る</a>
      </header>
      <TotalsBar
        test={test} message={totalsMessage} onRescale={rescale} onEditInfo={() => setEditingInfo(true)}
        onAddSection={gradeOf(test) ? () => setAdding(true) : undefined}
      />
      <AiDraftPanel
        test={test} drafts={drafts} materialNames={materialNames} tooWide={tooWide}
        redraftable={s => s.questions.length > 0 && (s.kind === 'kanji' || (s.kind === 'grammar' && grammarBySection[s.id] !== undefined))}
        onDraft={redraft}
      />
      <Paper test={test} allotments={allotments} onOpenPassage={openPassage} onOpenKanji={openKanji} editing={editing} onTooWide={reportTooWide} />
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
      {editedSection && editedQuestion && (
        <QuestionEditor
          title={`${labelOf(editedSection.id)}問${kansuji(editedSection.questions.indexOf(editedQuestion) + 1)}を直す`}
          question={editedQuestion}
          numbers={markNumbers(editedSection)}
          onSubmit={q => {
            const r = replaceQuestion(test, editedSection.id, q)
            if (!r.ok) return r.errors
            setTest(r.test)
            unconfirm(editedSection.id)
            setEditingQuestion(null)
            return []
          }}
          onClose={() => setEditingQuestion(null)}
        />
      )}
      {editingInstruction && (
        <InstructionEditor
          title={`${labelOf(editingInstruction)}の指示文を直す`}
          value={test.sections.find(s => s.id === editingInstruction)?.instruction ?? ''}
          onSubmit={text => {
            const r = setInstruction(test, editingInstruction, text)
            if (!r.ok) return r.errors
            setTest(r.test)
            unconfirm(editingInstruction)
            setEditingInstruction(null)
            return []
          }}
          onClose={() => setEditingInstruction(null)}
        />
      )}
      {editingInfo && (
        <TestInfoEditor
          info={test.info}
          onSubmit={info => {
            setTest({ ...test, info })
            setEditingInfo(false)
          }}
          onClose={() => setEditingInfo(false)}
        />
      )}
      {adding && gradeOf(test) && (
        <AddSection grade={gradeOf(test)!} onSubmit={addSection} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}
