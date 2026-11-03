import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { plainText } from './ai/anchor'
import { defaultPoints, type Idea } from './ai/addQuestion'
import { draftable, gradeOf, materialOf, requestChat, requestDraft, requestGrammar, requestIdeas, requestKanji } from './ai/client'
import type { DraftResponse } from './ai/draft'
import { applyChatChange } from './chat/apply'
import { ChatPanel } from './chat/ChatPanel'
import { chipsFor, type Chip } from './chat/chips'
import { draftedMessage, failedMessage, liveTarget, sectionLabel, targetLabel, WELCOME, type ChatButton, type ChatMessage, type NewMessage, type Target } from './chat/messages'
import { AddQuestion } from './edit/AddQuestion'
import { blankQuestion, type OwnFormat } from './edit/addQuestionModel'
import { AddSection, InstructionEditor, TestInfoEditor, type NewSection } from './edit/Dialogs'
import { MarkQuestion } from './edit/MarkQuestion'
import { readPassageSelection, type PassageSelection } from './edit/selection'
import { appendSection, insertQuestion, moveQuestion, moveSection, newSectionId, removeQuestion, removeSection, replaceQuestion, setInstruction, stepPoints } from './edit/operations'
import { QuestionEditor } from './edit/QuestionEditor'
import { rescalePoints } from './edit/rescale'
import type { QuestionAction, SectionAction } from './edit/Tools'
import { TotalsBar } from './edit/TotalsBar'
import { markNumbers, sectionPoints, totalPoints } from './model/derive'
import type { ProsePassage, Question, Section, Test } from './model/schema'
import { kansuji } from './paper/kansuji'
import { Paper } from './paper/Paper'
import { longTest } from './sample/longTest'
import { sampleTest } from './sample/sampleTest'
import { findGroup } from './catalog/catalog'
import { kanjiStandardOf } from './start/kinds'
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
  // AI に大問を作ってもらっている大問
  const [drafting, setDrafting] = useState<Set<string>>(new Set())
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [pasting, setPasting] = useState<string | null>(null)
  const [choosingKanji, setChoosingKanji] = useState<string | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<{ sectionId: string; questionId: string } | null>(null)
  const [editingInstruction, setEditingInstruction] = useState<string | null>(null)
  const [editingInfo, setEditingInfo] = useState(false)
  const [adding, setAdding] = useState(false)
  const [totalsMessage, setTotalsMessage] = useState<string | null>(null)
  const [tooWide, setTooWide] = useState<string[]>([])
  // 小問を足す: 足し方を選んでいる位置、入れる前に直している案・自分で書いている小問、本文の選択、線を引いて作る箇所
  const [addingAt, setAddingAt] = useState<{ sectionId: string; at: number } | null>(null)
  const [reviewing, setReviewing] = useState<{ sectionId: string; at: number; question: Question; section?: Section; note?: string; own: boolean } | null>(null)
  const [selected, setSelected] = useState<PassageSelection | null>(null)
  const [marking, setMarking] = useState<PassageSelection | null>(null)
  // 会話: メッセージ、AI が考えている間、紙面で選んでいるもの、会話の変更で変わったもの
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 0, ...WELCOME }])
  const [chatBusy, setChatBusy] = useState(false)
  const [target, setTarget] = useState<Target | null>(null)
  const [changed, setChanged] = useState<Target | null>(null)
  const nextMessageId = useRef(1)
  // AI の返答を待つ間に紙面が変わることがあるので、返答を当てはめるときは最新のテストを読む
  const testRef = useRef(test)
  useEffect(() => { testRef.current = test }, [test])

  // 紙面の本文を選ぶと「傍線を引いて小問を作る」を出す
  useEffect(() => {
    const onUp = () => setTimeout(() => setSelected(readPassageSelection()), 0)
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [])

  const say = (message: NewMessage) => {
    const id = nextMessageId.current++
    setMessages(ms => [...ms, { ...message, id }])
  }
  // テストを変えて、すぐ最新のテストとして読めるようにする（続けて届く返答が、変える前のテストに当てはめないように）
  const commit = (next: Test) => {
    testRef.current = next
    setTest(next)
  }

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
  const nameOf = (t: Test, section: Section) => sectionLabel(t, section, materialNames, materialOf(section))

  // 大問を AI に作ってもらい、できたら紙面の大問を置き換えて会話で知らせる。作り方（文章・漢字・文法）は request が決める
  async function draft(section: Section, request: () => Promise<DraftResponse>) {
    const label = nameOf(testRef.current!, section)
    setDrafting(d => new Set(d).add(section.id))
    const result = await request()
    setDrafting(d => {
      const next = new Set(d)
      next.delete(section.id)
      return next
    })
    if (!result.ok) return say(failedMessage(label, section.id, result.errors))
    const before = testRef.current!
    const after = { ...before, sections: before.sections.map(s => (s.id === section.id ? result.section : s)) }
    commit(after)
    setChanged({ sectionId: section.id })
    unconfirm(section.id)
    say(draftedMessage(label, section.id, result.rationales, { before, after }))
  }

  function start(skeleton: Skeleton) {
    commit(skeleton.test)
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
    commit(next)
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

  const onAddQuestion = useCallback((sectionId: string, at: number) => setAddingAt({ sectionId, at }), [])
  const editing = useMemo(() => ({ confirmed, onSection, onQuestion, onAddQuestion }), [confirmed, onSection, onQuestion, onAddQuestion])

  // 小問を at の位置に入れる。AI の案で本文に傍線部が増えたときは、大問をその本文に置き換えてから入れる
  function putQuestion(sectionId: string, at: number, question: Question, section?: Section): string[] {
    if (!test) return []
    const r = insertQuestion(test, sectionId, at, question, section)
    if (!r.ok) return r.errors
    setTest(r.test)
    unconfirm(sectionId)
    return []
  }

  // 線を引いて作った小問は、本文の順になる位置に入れる（傍線部の番号が問の順に並ぶように）
  function positionByMark(idea: Idea): number {
    const numbers = markNumbers({ ...idea.section, questions: [...idea.section.questions, idea.question] })
    const first = (q: Question) => Math.min(...q.stem.flatMap(s => (s.kind === 'markRef' && numbers.has(s.id) ? [numbers.get(s.id)!] : [])))
    const mine = first(idea.question)
    return idea.section.questions.filter(q => first(q) < mine).length
  }

  // 自分で書く小問の既定の観点と指導事項
  function defaultsFor(section: Section): { kanten: Question['kanten']; standard: string } {
    const grade = test && gradeOf(test)
    if (section.kind === 'kanji') return { kanten: 'knowledge', standard: grade ? kanjiStandardOf(grade) : '(1)ウ' }
    if (section.kind === 'grammar') return { kanten: 'knowledge', standard: section.questions[0]?.standard ?? '(1)オ' }
    const material = materialOf(section)
    const group = grade && material ? findGroup(grade, material) : undefined
    return { kanten: 'thinking', standard: group?.standards.find(c => c.startsWith('C(1)')) ?? section.questions[0]?.standard ?? 'C(1)イ' }
  }

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
    commit(next)
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

  // 会話で頼む。AI の返答の変更は、考えている間に紙面が変わっていなければすぐ入れ、元に戻せるようにする
  async function ask(text: string) {
    if (!test || chatBusy) return
    const sent = test
    const history = messages.slice(-10).map(m => ({ who: m.who, text: m.text }))
    say({ who: 'me', text })
    setChatBusy(true)
    const r = await requestChat(sent, liveTarget(sent, target) ?? undefined, history, text)
    setChatBusy(false)
    const failed = (errors: string[]): NewMessage => ({ who: 'ai', text: 'うまくできませんでした。紙面は元のままです。', notes: { title: '理由', label: 'うまくできなかった理由', items: errors.map(e => ({ text: e })) }, error: true })
    if (!r.ok) return say(failed(r.errors))
    const reply: NewMessage = { who: 'ai', text: r.reply, ...(r.notes.length && { notes: { title: '気づいたこと', label: '気づいたこと', items: r.notes.map(n => ({ text: n })) } }) }
    const change = r.change
    if (change.kind === 'none') return say(reply)
    if (change.kind === 'addSection') return say({ ...reply, buttons: [{ label: '大問を追加する', action: 'addSection' }] })
    const current = testRef.current!
    const applied = applyChatChange(sent, current, change)
    if (applied.kind === 'stale') return say({ who: 'ai', text: '考えている間に紙面のその部分が変わったので、この変更は入れませんでした。もう一度頼んでください。' })
    if (applied.kind === 'failed') return say(failed(applied.errors))
    if (applied.kind === 'redraft') {
      say(reply)
      return void draft(applied.section, () => requestDraft(current, applied.section, subtotalOf(applied.section), applied.wish))
    }
    commit(applied.test)
    setChanged(applied.changed)
    if (applied.unconfirm) unconfirm(applied.unconfirm)
    say({ ...reply, buttons: [{ label: '元に戻す', action: 'undo' }], undo: { before: current, after: applied.test } })
  }

  function onButton(message: ChatMessage, button: ChatButton) {
    if (!test) return
    setMessages(ms => ms.map(m => (m.id === message.id ? { ...m, used: true } : m)))
    if (button.action === 'confirm') return setConfirmed(prev => new Set(prev).add(button.sectionId))
    if (button.action === 'addSection') return setAdding(true)
    if (button.action === 'redraft') {
      const section = test.sections.find(s => s.id === button.sectionId)
      return section && redraft(section)
    }
    if (message.undo && test === message.undo.after) {
      commit(message.undo.before)
      setChanged(null)
      say({ who: 'me', text: '（元に戻しました）' })
    }
  }

  function onChip(chip: Chip) {
    if (!test) return
    if (chip.kind === 'ask') return void ask(chip.text)
    if (chip.kind === 'addQuestion') return setAddingAt({ sectionId: chip.sectionId, at: chip.at })
    if (chip.kind === 'kanji') return setChoosingKanji(chip.sectionId)
    if (chip.kind === 'openPassage') return setPasting(chip.sectionId)
    if (chip.kind === 'draft') {
      const section = test.sections.find(s => s.id === chip.sectionId)
      return section && redraft(section)
    }
    // 配点の上げ下げは AI を使わずに変える
    const r = stepPoints(test, chip.sectionId, chip.questionId, chip.delta)
    if (!r.ok) return say({ who: 'ai', text: r.errors.join(' ') })
    const points = (t: Test) => {
      const q = t.sections.find(s => s.id === chip.sectionId)!.questions.find(x => x.id === chip.questionId)!
      return q.pointsEach !== undefined ? `各${q.pointsEach}点` : `${q.points}点`
    }
    const where = { sectionId: chip.sectionId, questionId: chip.questionId }
    commit(r.test)
    setChanged(where)
    unconfirm(chip.sectionId)
    say({ who: 'ai', text: `${targetLabel(test, where)}の配点を${points(test)}から${points(r.test)}にしました。合計は${totalPoints(r.test)}点です。`, buttons: [{ label: '元に戻す', action: 'undo' }], undo: { before: test, after: r.test } })
  }

  if (!test) return <div className="app"><StartScreen onStart={start} /></div>

  const editedSection = editingQuestion && test.sections.find(s => s.id === editingQuestion.sectionId)
  const editedQuestion = editedSection?.questions.find(q => q.id === editingQuestion!.questionId)
  const active = liveTarget(test, target)
  const nameById = (id: string) => {
    const section = test.sections.find(s => s.id === id)
    return section ? nameOf(test, section) : ''
  }

  return (
    <div className="app app-edit">
      <header className="app-bar">
        <b>国語テストつくるくん</b>
        <span>{sample !== null ? 'サンプルのテストを表示しています' : `${test.info.year}　${test.info.name}（${test.info.grade}）`}</span>
        <a href="./">はじめから作る</a>
      </header>
      <div className="workspace">
        <ChatPanel
          messages={messages}
          canUndo={m => !!m.undo && test === m.undo.after}
          onButton={onButton}
          target={active && targetLabel(test, active)}
          onClearTarget={() => setTarget(null)}
          chips={active ? chipsFor(test, active, { pointStep: test.info.pointStep, drafting, busy: chatBusy, grammarKnown: id => grammarBySection[id] !== undefined }) : []}
          onChip={onChip}
          statuses={[
            ...[...drafting].map(id => `${nameById(id)}の大問を作っています（数十秒かかります）`),
            ...(chatBusy ? ['AI が考えています（十数秒かかります）'] : []),
          ]}
          alerts={tooWide.map(id => `${nameById(id)}の本文が一枚に収まりません。範囲を短くして貼り直してください。`)}
          busy={chatBusy}
          onSend={text => void ask(text)}
        />
        <main className="paper-col" onScroll={() => setSelected(null)}>
          <TotalsBar
            test={test} message={totalsMessage} onRescale={rescale} onEditInfo={() => setEditingInfo(true)}
            onAddSection={gradeOf(test) ? () => setAdding(true) : undefined}
          />
          <Paper
            test={test} allotments={allotments} onOpenPassage={openPassage} onOpenKanji={openKanji} editing={editing} onTooWide={reportTooWide}
            selected={active} changed={changed} onSelect={setTarget}
          />
        </main>
      </div>
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
      {selected && !marking && draftable(test.sections.find(s => s.id === selected.sectionId) ?? test.sections[0]) && (
        <button
          type="button" className="mark-float"
          // 選んだところの下に出す。画面の外に出ないように収める
          style={{ left: Math.max(8, Math.min(selected.x, window.innerWidth - 220)), top: Math.max(8, Math.min(selected.y + 6, window.innerHeight - 48)) }}
          onMouseDown={e => e.preventDefault()}
          onClick={() => { setMarking(selected); setSelected(null) }}
        >傍線を引いて小問を作る</button>
      )}
      {marking && (() => {
        const section = test.sections.find(s => s.id === marking.sectionId)!
        return (
          <MarkQuestion
            title={`${labelOf(section.id)}の本文に線を引いて小問を作る`}
            quote={marking.quote} before={marking.before}
            request={how => requestIdeas(test, section, subtotalOf(section), how)}
            onReview={idea => {
              setMarking(null)
              setReviewing({ sectionId: section.id, at: positionByMark(idea), question: idea.question, section: idea.section, note: idea.adjustments && `AI が整えたところ: ${idea.adjustments}`, own: false })
            }}
            onClose={() => setMarking(null)}
          />
        )
      })()}
      {addingAt && (() => {
        const section = test.sections.find(s => s.id === addingAt.sectionId)!
        return (
          <AddQuestion
            title={`${labelOf(section.id)}の問${kansuji(addingAt.at + 1)}として小問を追加`}
            section={section}
            aiAvailable={draftable(section)}
            request={how => requestIdeas(test, section, subtotalOf(section), how)}
            onPick={idea => {
              const errors = putQuestion(section.id, addingAt.at, idea.question, idea.section)
              if (errors.length) return window.alert(errors.join('\n'))
              setAddingAt(null)
            }}
            onReview={idea => {
              setReviewing({ sectionId: section.id, at: addingAt.at, question: idea.question, section: idea.section, own: false })
              setAddingAt(null)
            }}
            onOwn={(format: OwnFormat) => {
              const { kanten, standard } = defaultsFor(section)
              const id = `${section.id}-w${Date.now().toString(36)}`
              setReviewing({ sectionId: section.id, at: addingAt.at, question: blankQuestion(format, id, defaultPoints(section, subtotalOf(section), test.info.pointStep), standard, kanten), own: true })
              setAddingAt(null)
            }}
            onClose={() => setAddingAt(null)}
          />
        )
      })()}
      {reviewing && (() => {
        const section = reviewing.section ?? test.sections.find(s => s.id === reviewing.sectionId)!
        return (
          <QuestionEditor
            title={`${labelOf(reviewing.sectionId)}の問${kansuji(reviewing.at + 1)}として入れる小問`}
            question={reviewing.question}
            numbers={markNumbers({ ...section, questions: [...section.questions, reviewing.question] })}
            submitLabel="この問題で入れる"
            note={reviewing.note}
            onSubmit={q => {
              const errors = putQuestion(reviewing.sectionId, reviewing.at, q, reviewing.section)
              if (!errors.length) setReviewing(null)
              return errors
            }}
            onClose={() => setReviewing(null)}
          />
        )
      })()}
      {adding && gradeOf(test) && (
        <AddSection grade={gradeOf(test)!} onSubmit={addSection} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}
