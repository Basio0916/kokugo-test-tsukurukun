import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { defaultPoints, type Idea } from './ai/addQuestion'
import { gradeOf, ideasAvailable, materialOf, requestChat, requestClassical, requestComposition, requestDraft, requestGrammar, requestIdeas, requestKanji, requestPassageCheck, requestAnnotate } from './ai/client'
import type { DraftResponse } from './ai/draft'
import { itemPlan, kanjiSplit } from './ai/items'
import { applyChatChange } from './chat/apply'
import { ChatPanel } from './chat/ChatPanel'
import { chipsFor, type Chip } from './chat/chips'
import { flagKey, flagsMessage, liveFlags, mergeFlags, type Flags } from './chat/flags'
import { guideMessage, nextStep, outOfOrder, sectionStatus, startMessage } from './chat/guide'
import { Outline } from './chat/Outline'
import { draftedMessage, failedMessage, liveTarget, sectionLabel, targetLabel, WELCOME, type ChatButton, type ChatMessage, type NewMessage, type Target } from './chat/messages'
import { AddQuestion } from './edit/AddQuestion'
import { blankQuestion, ideaStem, type OwnFormat } from './edit/addQuestionModel'
import { AddSection, InstructionEditor, TestInfoEditor, type NewSection } from './edit/Dialogs'
import { MarkQuestion } from './edit/MarkQuestion'
import { MarkReshape } from './edit/MarkReshape'
import { readPassageSelection, type PassageSelection } from './edit/selection'
import { insertSection, insertQuestion, moveQuestion, moveSection, newSectionId, removeQuestion, removeSection, replaceQuestion, replaceSection, setInstruction, stepPoints } from './edit/operations'
import { changedParts, passageIssues, passageToText, rebuildPassage, type Issue } from './edit/passageEdit'
import { kanbunToText, rebuildKanbun } from './edit/kanbunEdit'
import { applyRuby } from './ai/classical'
import { KanbunEditor } from './edit/KanbunEditor'
import { editKanbun, lineText, readLine, rewrap } from './model/kanbun'
import { PassageEditor } from './edit/PassageEditor'
import { QuestionEditor } from './edit/QuestionEditor'
import { rescalePoints } from './edit/rescale'
import type { QuestionAction, SectionAction } from './edit/Tools'
import { TotalsBar } from './edit/TotalsBar'
import { markNumbers, sectionPoints, totalPoints } from './model/derive'
import type { KanbunPassage, ProsePassage, Question, Section, Test } from './model/schema'
import { kansuji } from './paper/kansuji'
import { Paper } from './paper/Paper'
import { useMediaQuery } from './useMediaQuery'
import { AnswerKey } from './sheet/AnswerKey'
import { AnswerSheet } from './sheet/AnswerSheet'
import { answerOverflows, layoutAnswerSheet } from './sheet/layout'
import { longTest } from './sample/longTest'
import { sampleTest } from './sample/sampleTest'
import { findGroup } from './catalog/catalog'
import { kanjiStandardOf } from './start/kinds'
import { KanjiWords } from './start/KanjiWords'
import { PasteKanbun } from './start/PasteKanbun'
import { PastePassage } from './start/PastePassage'
import { blankComposition, GRAMMAR_SECTION_ID, instructionFor, KANJI_SECTION_ID, type Allotments, type MaterialNames } from './start/skeleton'
import { StartScreen, type Skeleton } from './start/StartScreen'

// ?sample でサンプルのテストを開く（?sample=long は小問の多いサンプル）
const sample = new URLSearchParams(location.search).get('sample')
const initialTest = sample === 'long' ? longTest : sample !== null ? sampleTest : null

// 紙の名前。タブ・PDF で出力するボタン・印刷するときのページの題で使う
const SHEETS = { paper: '問題用紙', answer: '解答用紙', answered: '模範解答つき解答用紙', key: '模範解答・採点基準' } as const
type SheetKind = keyof typeof SHEETS

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
  // 確定したかを、紙面の操作（固定した関数）からも最新で読めるようにする
  const confirmedRef = useRef(confirmed)
  useEffect(() => { confirmedRef.current = confirmed }, [confirmed])
  // 作文を一度勧めたか
  const [compositionOffered, setCompositionOffered] = useState(false)
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
  // mark は線を引いて作った案（選んだ箇所と書いた希望）。version は整え直したときに直す画面を開き直すため
  const [reviewing, setReviewing] = useState<{ sectionId: string; at: number; question: Question; section?: Section; note?: string; own: boolean; mark?: { selection: PassageSelection; wish: string }; version?: number } | null>(null)
  // 線を引いて作る画面を、書き直しで開き直したときの希望
  const [markWish, setMarkWish] = useState('')
  // 線を引いて作る案の整え直しの番号（最後に頼んだものの返答だけを入れる）
  const reshapeSeq = useRef(0)
  const [selected, setSelected] = useState<PassageSelection | null>(null)
  const [marking, setMarking] = useState<PassageSelection | null>(null)
  // 会話: メッセージ、AI が考えている間、紙面で選んでいるもの、会話の変更で変わったもの
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 0, ...WELCOME }])
  const [chatBusy, setChatBusy] = useState(false)
  // 最後に作った大問の、頼み方の例（何かを送ったら消す）
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [target, setTarget] = useState<Target | null>(null)
  const [changed, setChanged] = useState<Target | null>(null)
  const nextMessageId = useRef(1)
  // AI の返答を待つ間に紙面が変わることがあるので、返答を当てはめるときは最新のテストを読む
  const testRef = useRef(test)
  useEffect(() => { testRef.current = test }, [test])
  // 本文を直したあとの要確認と、先生が「このままにする」とした点（どちらも「大問/小問」ごと）。本文を直す大問、AI が確かめている大問
  const [flags, setFlags] = useState<Flags>({})
  const [acks, setAcks] = useState<Record<string, Issue[]>>({})
  const flagsRef = useRef(flags)
  useEffect(() => { flagsRef.current = flags }, [flags])
  const [editingPassage, setEditingPassage] = useState<string | null>(null)
  // 返り点と送り仮名を直している漢文の大問
  const [editingKaeriten, setEditingKaeriten] = useState<string | null>(null)
  // 開いている紙（問題用紙・解答用紙・模範解答つき解答用紙・模範解答と採点基準）。解答用紙の割り付けは、収まらない知らせにも使う
  const [sheet, setSheet] = useState<SheetKind>('paper')
  const sheetLayout = useMemo(() => test && layoutAnswerSheet(test), [test])
  const overflows = useMemo(() => (test ? answerOverflows(test) : []), [test])
  // 印刷の間だけ、ページの題を年度・テストの名前・国語・紙の名前を並べたものにする。PDF に保存するときのファイル名の既定になる
  useEffect(() => {
    if (!test) return
    const title = `${test.info.year}　${test.info.name}　国語　${SHEETS[sheet]}`
    let saved: string | null = null
    const before = () => {
      saved ??= document.title
      document.title = title
    }
    const after = () => {
      if (saved !== null) document.title = saved
      saved = null
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
      after()
    }
  }, [test, sheet])
  const [checking, setChecking] = useState<Set<string>>(new Set())
  // 本文を直して外れた訓読・ルビを AI が付け直している大問
  const [annotating, setAnnotating] = useState<Set<string>>(new Set())
  // 幅の狭い画面では会話と紙面を切り替えて一つずつ出す。会話を見ている間に紙面が変わったら「紙面」に印を付ける
  // 印刷を始めると紙の幅で判定されて狭い画面に当てはまり、紙面の列が消えて白紙になるので、画面のときだけ判定する
  const narrow = useMediaQuery('screen and (max-width: 899px)')
  // 狭い画面で、紙面で選んだものについて相談しに会話へ移った（会話の入力欄へ移る）
  const [consulting, setConsulting] = useState(false)
  const [view, setView] = useState<'chat' | 'paper'>('chat')
  const [paperDot, setPaperDot] = useState(false)
  const shownTest = useRef(test)
  useEffect(() => {
    if (shownTest.current !== test && narrow && view === 'chat') setPaperDot(true)
    shownTest.current = test
  }, [test, narrow, view])
  const showPaper = () => {
    setView('paper')
    setPaperDot(false)
    setConsulting(false)
  }

  // 紙面の本文を選ぶと「傍線を引いて小問を作る」を出す
  useEffect(() => {
    // タッチで選んだときは、選択が決まるまで少し待つ
    const onUp = () => setTimeout(() => setSelected(readPassageSelection()), 0)
    const onTouch = () => setTimeout(() => setSelected(readPassageSelection()), 60)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onTouch)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onTouch)
    }
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

  const putFlags = (next: Flags) => {
    flagsRef.current = next
    setFlags(next)
  }
  const bracketOf = (sectionId: string) => `【${kansuji((testRef.current?.sections.findIndex(s => s.id === sectionId) ?? -1) + 1)}】`

  // 小問の要確認を外す。その小問のボタンを押せなくし、大問の要確認がなくなったら知らせる
  function clearFlag(sectionId: string, questionId: string) {
    const key = flagKey(sectionId, questionId)
    if (!flagsRef.current[key]) return
    const next = { ...flagsRef.current }
    delete next[key]
    putFlags(next)
    setMessages(ms => ms.map(m => (m.buttons?.some(b => 'questionId' in b && b.questionId === questionId && b.sectionId === sectionId)
      ? { ...m, usedGroups: [...(m.usedGroups ?? []), questionId] }
      : m)))
    if (!Object.keys(liveFlags(testRef.current!, next)).some(k => k.startsWith(`${sectionId}/`))) {
      const bracket = bracketOf(sectionId)
      say({ who: 'ai', text: `${bracket}の小問と直した本文の食い違いはなくなりました。よければ確定してください。`, buttons: [{ label: `${bracket}を確定する`, action: 'confirm', sectionId }] })
    }
  }

  const openPassage = useCallback((sectionId: string) => setPasting(sectionId), [])
  const openKanji = useCallback((sectionId: string) => setChoosingKanji(sectionId), [])
  const reportTooWide = useCallback((ids: string[]) => setTooWide(prev => (prev.join() === ids.join() ? prev : ids)), [])

  const subtotalOf = (section: Section) => allotments[section.id] ?? sectionPoints(section)
  // 確定を外す。外したら会話で知らせ、もう一度確定するボタンを付ける（quiet なら知らせない）
  const unconfirm = (sectionId: string, quiet = false) => {
    if (!confirmedRef.current.has(sectionId)) return
    const next = new Set(confirmedRef.current)
    next.delete(sectionId)
    confirmedRef.current = next
    setConfirmed(next)
    if (quiet) return
    const bracket = bracketOf(sectionId)
    say({ who: 'ai', text: `${bracket}は確定を外して直しました。よければもう一度確定してください。`, buttons: [{ label: `${bracket}を確定する`, action: 'confirm', sectionId }] })
  }

  // 次にすることを会話で案内する。作文を勧めるのは一度だけ
  function guide(prefix = '') {
    const current = testRef.current!
    const step = nextStep(current, compositionOffered)
    if (step.kind === 'offerComposition') setCompositionOffered(true)
    const message = guideMessage(current, step, s => nameOf(current, s))
    say({ ...message, text: prefix + message.text })
  }

  // 大問を確定し、次にすることを案内する
  function confirmSection(sectionId: string) {
    if (confirmedRef.current.has(sectionId)) return
    const next = new Set(confirmedRef.current).add(sectionId)
    confirmedRef.current = next
    setConfirmed(next)
    guide(`${bracketOf(sectionId)}を確定しました。`)
  }
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
    unconfirm(section.id, true)
    if (result.suggestions) setSuggestions(result.suggestions)
    say(draftedMessage(label, section.id, result.rationales, { before, after }))
  }

  function start(skeleton: Skeleton) {
    commit(skeleton.test)
    setAllotments(skeleton.allotments)
    setMaterialNames(skeleton.materialNames)
    const names = (s: Section) => sectionLabel(skeleton.test, s, skeleton.materialNames, materialOf(s))
    say(startMessage(skeleton.test, skeleton.allotments, names))
    say(guideMessage(skeleton.test, nextStep(skeleton.test, true), names))
    // 文法の大問は本文を待たずにすぐ作る（漢字は出題する語を決めてから）
    const grammar = skeleton.test.sections.find(s => s.id === GRAMMAR_SECTION_ID)
    if (grammar) {
      setGrammarBySection({ [grammar.id]: skeleton.grammarMaterials })
      void draft(grammar, () => requestGrammar(skeleton.test, grammar, skeleton.allotments[grammar.id], skeleton.grammarMaterials))
    }
  }

  function pastePassage(sectionId: string, passage: ProsePassage | KanbunPassage) {
    if (!test) return
    const section = { ...test.sections.find(s => s.id === sectionId)!, passage, questions: [] }
    const next = { ...test, sections: test.sections.map(s => (s.id === sectionId ? section : s)) }
    commit(next)
    setPasting(null)
    void draft(section, requestFor(section))
  }

  // 大問の種類に合った作り方（文章・古文・漢文・文法）。wish は会話で頼んだときの先生の希望
  function requestFor(section: Section, wish?: string): () => Promise<DraftResponse> {
    const current = testRef.current!
    if (section.kind === 'grammar') return () => requestGrammar(current, section, subtotalOf(section), grammarBySection[section.id])
    if (section.kind === 'classical' || section.kind === 'kanbun') return () => requestClassical(current, section, subtotalOf(section), wish)
    if (section.kind === 'composition') return () => requestComposition(current, section, subtotalOf(section), wish)
    return () => requestDraft(current, section, subtotalOf(section), wish)
  }

  function chooseKanji(sectionId: string, words: string[]) {
    if (!test) return
    const section = test.sections.find(s => s.id === sectionId)!
    setKanjiWords(words)
    setChoosingKanji(null)
    void draft(section, () => requestKanji(test, section, subtotalOf(section), words))
  }

  // 漢字の大問の読みと書きの項目の数。サーバーと同じ計算で、出題する語を選ぶ画面に示す
  function kanjiCounts(sectionId: string) {
    const section = test?.sections.find(s => s.id === sectionId)
    const plan = section && test ? itemPlan(subtotalOf(section), test.info.pointStep) : null
    return plan ? kanjiSplit(plan.count) : null
  }

  function redraft(section: Section) {
    if (section.kind === 'kanji') return setChoosingKanji(section.id)
    void draft(section, requestFor(section))
  }

  // 紙面の操作。消す・動かすときは確かめずに行い、会話で知らせて元に戻せるようにする
  function sectionAction(sectionId: string, action: SectionAction | 'instruction') {
    if (action === 'instruction') return setEditingInstruction(sectionId)
    if (action === 'confirm') return confirmSection(sectionId)
    if (action === 'unconfirm') return unconfirm(sectionId, true)
    const before = testRef.current!
    const section = before.sections.find(s => s.id === sectionId)!
    const name = nameOf(before, section)
    const after = action === 'delete' ? removeSection(before, sectionId) : moveSection(before, sectionId, action === 'up' ? -1 : 1)
    if (after.sections.map(s => s.id).join() === before.sections.map(s => s.id).join()) return
    commit(after)
    const text = action === 'delete'
      ? `${name}を削除しました。後ろの大問の番号は繰り上がっています。`
      : `${name}を${bracketOf(sectionId)}に移しました。`
    say({ who: 'ai', text, buttons: [{ label: '元に戻す', action: 'undo' }], undo: { before, after } })
  }

  function questionAction(sectionId: string, questionId: string, action: QuestionAction) {
    if (action === 'edit') return setEditingQuestion({ sectionId, questionId })
    const before = testRef.current!
    const label = targetLabel(before, { sectionId, questionId })
    const after = action === 'delete' ? removeQuestion(before, sectionId, questionId) : moveQuestion(before, sectionId, questionId, action === 'up' ? -1 : 1)
    const moved = after.sections.find(s => s.id === sectionId)!
    if (action !== 'delete' && moved.questions.map(q => q.id).join() === before.sections.find(s => s.id === sectionId)!.questions.map(q => q.id).join()) return
    commit(after)
    const text = action === 'delete'
      ? `${label}を削除しました。後ろの問と傍線部の番号は振り直しています。`
      : `${label}を${targetLabel(after, { sectionId, questionId })}に移しました。`
    const note = action !== 'delete' && outOfOrder(moved)
      ? { notes: { title: '気づいたこと', label: '気づいたこと', items: [{ text: '傍線部の順と問の順がそろっていません。本文の順に並べ直すなら、会話で「本文の順に並べて」と頼んでください。' }] } }
      : {}
    say({ who: 'ai', text, ...note, buttons: [{ label: '元に戻す', action: 'undo' }], undo: { before, after } })
    unconfirm(sectionId)
  }

  // 紙面に渡す関数は固定し（変わると紙面を測り直す）、中から最新の処理を呼ぶ
  const paperActions = useRef({ sectionAction, questionAction })
  useEffect(() => { paperActions.current = { sectionAction, questionAction } })
  const onSection = useCallback((sectionId: string, action: SectionAction | 'instruction') => paperActions.current.sectionAction(sectionId, action), [])
  const onQuestion = useCallback((sectionId: string, questionId: string, action: QuestionAction) => paperActions.current.questionAction(sectionId, questionId, action), [])

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

  // fit なら、加えた大問の配点を残して、ほかの配点を満点に合わせ直す（会話で勧めた作文を足すとき）
  function addSection(added: NewSection, fit = false) {
    if (!test) return
    const sameKind = (kind: Section['kind']) => test.sections.find(s => s.kind === kind && allotments[s.id] !== undefined)
    if (added.kind === 'composition') {
      // 決まった条件の作文を置いてから、AI に題と条件を作ってもらう
      const like = sameKind('composition')
      const allotment = like ? allotments[like.id] : DEFAULT_ALLOTMENT
      const section = blankComposition(newSectionId(test, 'sakubun'), allotment)
      const added = insertSection(test, section)
      const fitted = fit ? rescalePoints(added, [section.id]) : null
      commit(fitted?.ok ? fitted.test : added)
      setAllotments(a => ({ ...a, [section.id]: allotment }))
      setAdding(false)
      if (fit) say({ who: 'ai', text: `${bracketOf(section.id)}に作文の大問を${allotment}点で入れました。${fitted?.ok ? `ほかの配点を少しずつ調整して、合計を${test.info.fullMarks}点にそろえています。` : ''}題と条件は AI が考えています。` })
      return void draft(section, requestFor(section))
    }
    const base = { questions: [] }
    const section: Section =
      added.kind === 'kanji' ? { ...base, id: newSectionId(test, KANJI_SECTION_ID), kind: 'kanji', instruction: '次の問いに答えなさい。' }
        : added.kind === 'grammar' ? { ...base, id: newSectionId(test, GRAMMAR_SECTION_ID), kind: 'grammar', instruction: '次の問いに答えなさい。' }
          : { ...base, id: newSectionId(test, 's'), kind: added.material.kind, material: added.material.name, instruction: instructionFor(added.material.kind) }
    const like = sameKind(section.kind)
    const allotment = like ? allotments[like.id] : DEFAULT_ALLOTMENT
    const next = insertSection(test, section)
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
    commit(r.test)
    setTotalsMessage(`配点の合計を ${test.info.fullMarks} 点にそろえました`)
  }

  // テストの情報を変える。刻みに合わない配点があれば満点にそろえ直し、満点・試験時間・刻みを変えたら会話で知らせる
  function changeInfo(info: Test['info']) {
    if (!test) return
    const before = test.info
    let next: Test = { ...test, info }
    const fits = (t: Test) => t.sections.every(s => s.questions.every(q => Number.isInteger((q.points ?? q.pointsEach ?? 0) / info.pointStep)))
    let refit = false
    if (!fits(next)) {
      const r = rescalePoints(next)
      if (!r.ok) return say({ who: 'ai', text: `配点の刻みを${info.pointStep}点にできませんでした。${r.error}` })
      next = r.test
      refit = true
    }
    commit(next)
    const changes = [
      ...(info.fullMarks !== before.fullMarks ? [`満点を${info.fullMarks}点に`] : []),
      ...(info.minutes !== before.minutes ? [`試験時間を${info.minutes}分に`] : []),
      ...(info.pointStep !== before.pointStep ? [`配点の刻みを${info.pointStep === 1 ? '一点' : '〇・五点'}に`] : []),
    ]
    if (!changes.length) return
    const total = totalPoints(next)
    const off = total !== info.fullMarks
    say({
      who: 'ai',
      text: `${changes.join('、')}しました。${info.minutes !== before.minutes && info.minutes < 45 ? '今の問題の量だと、時間が足りないかもしれません。' : ''}${refit ? `刻みに合わない配点があったので、合計を${info.fullMarks}点にそろえ直しています。` : ''}${off ? `配点の合計は${total}点で、満点と合っていません。` : ''}`,
      ...(off && { buttons: [{ label: '配点を満点にそろえる', action: 'rescale' as const }] }),
    })
  }

  // 大問の一覧から、その大問を選び、問題用紙のそのブロックへ移る（ほかの紙を開いていたら問題用紙に切り替える）
  function goToSection(sectionId: string) {
    showPaper()
    setSheet('paper')
    setTarget({ sectionId })
    const scroll = (tries: number) => {
      const el = document.querySelector(`.page [data-target="${sectionId}"]`)
      if (el) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      else if (tries > 0) setTimeout(() => scroll(tries - 1), 100)
    }
    setTimeout(() => scroll(10), 0)
  }

  // 会話で頼む。AI の返答の変更は、考えている間に紙面が変わっていなければすぐ入れ、元に戻せるようにする
  async function ask(text: string, about = test && liveTarget(test, target)) {
    if (!test || chatBusy) return
    const sent = test
    const history = messages.slice(-10).map(m => ({ who: m.who, text: m.text }))
    say({ who: 'me', text })
    setSuggestions([])
    setChatBusy(true)
    const r = await requestChat(sent, about ?? undefined, history, text)
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
    if (applied.kind === 'addQuestion') {
      say(reply)
      return void offerIdeas(applied.section, applied.at)
    }
    if (applied.kind === 'redraft') {
      say(reply)
      return void draft(applied.section, requestFor(applied.section, applied.wish))
    }
    commit(applied.test)
    setChanged(applied.changed)
    if (applied.unconfirm) unconfirm(applied.unconfirm)
    say({ ...reply, buttons: [{ label: '元に戻す', action: 'undo' }], undo: { before: current, after: applied.test } })
    // 直した・消した小問の要確認は外す
    if ((change.kind === 'reviseQuestion' || change.kind === 'remove') && change.questionId) clearFlag(change.sectionId, change.questionId)
  }

  // 漢文の返り点と送り仮名を直す。白文の字は変えず、傍線部は同じ字に付けたまま
  function saveKaeriten(section: Section, text: string): string[] {
    if (!test || section.passage?.kind !== 'kanbun') return []
    const edited = editKanbun(section.passage, text)
    if (!edited.ok) return edited.errors
    const r = replaceSection(test, { ...section, passage: edited.passage })
    if (!r.ok) return r.errors
    setEditingKaeriten(null)
    commit(r.test)
    unconfirm(section.id)
    setChanged({ sectionId: section.id })
    const bracket = bracketOf(section.id)
    say({ who: 'me', text: `（紙面で${bracket}の返り点と送り仮名を直しました）` })
    say({ who: 'ai', text: `${bracket}の返り点と送り仮名を直しました。返り点に従って読めることを確かめています。`, buttons: [{ label: '元に戻す', action: 'undo' }], undo: { before: test, after: r.test } })
    return []
  }

  // 会話で「小問を足して」と頼まれたら、AI の案を作って会話のボタンに並べる（案が使えない大問は、足し方を選ぶ画面を開く）
  async function offerIdeas(section: Section, at: number) {
    if (!ideasAvailable(section)) return setAddingAt({ sectionId: section.id, at })
    setChatBusy(true)
    const r = await requestIdeas(testRef.current!, section, subtotalOf(section), { kind: 'suggest' })
    setChatBusy(false)
    const bracket = bracketOf(section.id)
    if (!r.ok) return say({ who: 'ai', text: `${bracket}の小問の案を作れませんでした。`, notes: { title: '理由', label: '作れなかった理由', items: r.errors.map(e => ({ text: e })) }, error: true })
    say({
      who: 'ai',
      text: `${bracket}に足せる小問の案です。押した案が問${kansuji(at + 1)}として入ります。`,
      notes: { title: '案', label: '小問の案', items: r.ideas.map((idea, i) => ({ head: `案${i + 1}（${idea.question.standard}）`, text: `${ideaStem(idea)}　${idea.rationale}` })) },
      buttons: r.ideas.map((idea, i) => ({ label: `案${i + 1}を入れる`, action: 'insertIdea' as const, sectionId: section.id, at, idea })),
    })
  }

  // 本文を直す。傍線とルビを付け直して紙面に入れ、続けて小問との食い違いを確かめる
  function savePassage(sectionId: string, text: string): string[] {
    if (!test) return []
    const section = test.sections.find(s => s.id === sectionId)
    const passage = section?.passage
    if (!section || !passage) return []
    const bracket = bracketOf(sectionId)
    // 文章・古文は字の差分で傍線とルビを付け直し、漢文は句ごとに直した句の返り点と送り仮名を外す
    const rebuilt = passage.kind === 'prose' ? rebuildPassage(passage.segments, text) : rebuildKanbun(passage, text)
    if (!rebuilt) return ['本文を入れてください']
    const nextPassage = 'segments' in rebuilt ? { ...passage, segments: rebuilt.segments } : rebuilt.passage
    if (JSON.stringify(nextPassage) === JSON.stringify(passage)) {
      setEditingPassage(null)
      say({ who: 'ai', text: `${bracket}の本文は変わっていません。` })
      return []
    }
    const r = replaceSection(test, { ...section, passage: nextPassage })
    if (!r.ok) return r.errors
    setEditingPassage(null)
    commit(r.test)
    unconfirm(sectionId)
    setChanged({ sectionId })
    say({ who: 'me', text: `（紙面で${bracket}の本文を直しました）` })
    const oldText = passage.kind === 'prose' ? passageToText(passage.segments) : kanbunToText(passage)
    const lostRuby = 'lostRuby' in rebuilt ? rebuilt.lostRuby : []
    const changedLines = 'changed' in rebuilt ? rebuilt.changed : []
    const reannotate = changedLines.length > 0 || (section.kind === 'classical' && lostRuby.length > 0)
    const lost = lostRuby.length ? `「${lostRuby.join('」「')}」のルビは、親字を消したので外れました。` : ''
    const next = changedLines.length
      ? '直した句の返り点と送り仮名を、AI が付け直しています。'
      : reannotate ? '直した箇所のルビを、AI が付け直しています。' : '続けて、小問と食い違っていないかを確かめます。'
    say({ who: 'ai', text: `${bracket}の本文を直しました。傍線は文字に付いているので、前後を直したぶんは一緒に動いています。${lost}${next}`, buttons: [{ label: '元に戻す', action: 'undo' }], undo: { before: test, after: r.test, clearFlags: sectionId } })
    void (async () => {
      const edited = reannotate ? await reannotateSection(sectionId, r.test, oldText, text, lostRuby, changedLines) : r.test
      void checkPassage(section, edited, oldText, text)
    })()
    return []
  }

  // 本文を直して外れた漢文の訓読・古文のルビを AI に付け直してもらう。届いたとき大問が変わっていなければ入れる
  async function reannotateSection(sectionId: string, edited: Test, oldText: string, newText: string, lostRuby: string[], changedLines: number[]): Promise<Test> {
    const section = edited.sections.find(s => s.id === sectionId)!
    const passage = section.passage!
    const bracket = bracketOf(sectionId)
    setAnnotating(c => new Set(c).add(sectionId))
    const r = passage.kind === 'kanbun'
      ? await requestAnnotate({ kind: 'kanbun', title: passage.title, author: passage.author, lines: passage.lines.map(lineText), targets: changedLines })
      : await requestAnnotate({ kind: 'ruby', passage: passageToText(passage.kind === 'prose' ? passage.segments : []), changes: changedParts(oldText, newText), lost: lostRuby })
    setAnnotating(c => {
      const next = new Set(c)
      next.delete(sectionId)
      return next
    })
    const current = testRef.current!
    if (current.sections.find(s => s.id === sectionId) !== section) {
      say({ who: 'ai', text: `${bracket}がまた変わったので、付け直した結果は入れません。` })
      return current
    }
    let annotated: Section | null = null
    let problems: string[] = r.ok ? [] : r.errors
    if (r.ok && passage.kind === 'kanbun') {
      const lines = passage.lines.map((line, i) => {
        const got = r.lines?.find(l => l.index === i)
        const read = got && readLine(got.notation, lineText(line))
        return read && read.ok ? rewrap(line, read.chars) : line
      })
      annotated = { ...section, passage: { ...passage, lines } }
    } else if (r.ok && passage.kind === 'prose') {
      // 仮名遣いを問う傍線部の中には付けない
      const blocked = new Set(section.questions.flatMap(q => (q.format === 'kana' ? (q.items ?? []).flatMap(it => (it.markId ? [it.markId] : [])) : [])))
      const applied = applyRuby(passage.segments, r.ruby ?? [], blocked)
      problems = applied.errors
      annotated = { ...section, passage: { ...passage, segments: applied.segments } }
    }
    const replaced = annotated && replaceSection(current, annotated)
    if (!replaced?.ok) {
      say({ who: 'ai', text: `${bracket}の${passage.kind === 'kanbun' ? '返り点と送り仮名' : 'ルビ'}を付け直せませんでした。外れたままです。`, ...(problems.length && { notes: { title: '理由', label: '付け直せなかった理由', items: problems.map(t => ({ text: t })) } }) })
      return current
    }
    commit(replaced.test)
    say({ who: 'ai', text: `${bracket}の${passage.kind === 'kanbun' ? '直した句の返り点と送り仮名' : '直した箇所のルビ'}を付け直しました。続けて、小問と食い違っていないかを確かめます。` })
    return replaced.test
  }

  // 機械で確かめた食い違いと、AI が確かめた選択肢・模範解答の食い違いを合わせて要確認にする
  async function checkPassage(before: Section, edited: Test, oldText: string, newText: string) {
    const sectionId = before.id
    const after = edited.sections.find(s => s.id === sectionId)!
    const ackOf = (questionId: string) => acks[flagKey(sectionId, questionId)] ?? []
    const found = passageIssues(before, after, Object.fromEntries(after.questions.map(q => [q.id, ackOf(q.id).map(i => i.key)])))
    const changes = changedParts(oldText, newText)
    let note = ''
    if (changes.length) {
      setChecking(c => new Set(c).add(sectionId))
      const r = await requestPassageCheck({
        test: edited, sectionId, changes,
        acked: Object.fromEntries(after.questions.flatMap(q => (ackOf(q.id).length ? [[q.id, ackOf(q.id).map(i => i.text)]] : []))),
      })
      setChecking(c => {
        const next = new Set(c)
        next.delete(sectionId)
        return next
      })
      if (r.ok) {
        for (const { questionId, issue } of r.issues) {
          if (ackOf(questionId).some(i => i.text === issue)) continue
          found[questionId] = [...(found[questionId] ?? []), { key: `ai:${issue}`, text: issue }]
        }
      } else note = `（選択肢と模範解答は、AI に確かめてもらえませんでした: ${r.errors.join(' ')}）`
    }
    const bracket = bracketOf(sectionId)
    if (testRef.current?.sections.find(s => s.id === sectionId) !== after) return say({ who: 'ai', text: `${bracket}がまた変わったので、確かめた結果は出しません。` })
    const next = mergeFlags(flagsRef.current, sectionId, found)
    putFlags(next)
    const message = flagsMessage(testRef.current, sectionId, next, note)
    say(message ?? { who: 'ai', text: `${bracket}の小問と直した本文の食い違いは見つかりませんでした。よければ確定してください。${note}`, buttons: [{ label: `${bracket}を確定する`, action: 'confirm', sectionId }] })
  }

  function onButton(message: ChatMessage, button: ChatButton) {
    if (!test) return
    // AI に直してもらうときは、直るまでボタンを押せるままにする（直ったら要確認を外すときに押せなくなる）
    if (button.action !== 'fixFlag') setMessages(ms => ms.map(m => (m.id === message.id ? { ...m, usedGroups: [...(m.usedGroups ?? []), button.group ?? ''] } : m)))
    if (button.action === 'confirm') return confirmSection(button.sectionId)
    if (button.action === 'openPassage') return setPasting(button.sectionId)
    if (button.action === 'chooseKanji') return setChoosingKanji(button.sectionId)
    if (button.action === 'rescale') return rescale()
    if (button.action === 'showSheet') {
      showPaper()
      return setSheet(button.sheet)
    }
    if (button.action === 'addComposition') return addSection({ kind: 'composition' }, true)
    if (button.action === 'insertIdea') {
      const errors = putQuestion(button.sectionId, button.at, button.idea.question, button.idea.section)
      return void (errors.length ? say({ who: 'ai', text: `入れられませんでした。${errors.join(' ')}`, error: true }) : setChanged({ sectionId: button.sectionId, questionId: button.idea.question.id }))
    }
    if (button.action === 'skipComposition') return guide('作文は入れずにおきます。')
    if (button.action === 'fixFlag' || button.action === 'keepFlag' || button.action === 'removeFlagged') {
      const { sectionId, questionId } = button
      const key = flagKey(sectionId, questionId)
      if (button.action === 'fixFlag') {
        const about = { sectionId, questionId }
        setTarget(about)
        return void ask(`${targetLabel(test, about)}を、直した本文に合わせて直してください。食い違い: ${(flags[key] ?? []).map(i => i.text).join('／')}`, about)
      }
      if (button.action === 'keepFlag') setAcks(a => ({ ...a, [key]: [...(a[key] ?? []), ...(flags[key] ?? [])] }))
      else {
        commit(removeQuestion(test, sectionId, questionId))
        unconfirm(sectionId)
      }
      return clearFlag(sectionId, questionId)
    }
    if (button.action === 'addSection') return setAdding(true)
    if (button.action === 'redraft') {
      const section = test.sections.find(s => s.id === button.sectionId)
      return section && redraft(section)
    }
    if (message.undo && test === message.undo.after) {
      commit(message.undo.before)
      setChanged(null)
      const cleared = message.undo.clearFlags
      if (cleared) putFlags(Object.fromEntries(Object.entries(flagsRef.current).filter(([k]) => !k.startsWith(`${cleared}/`))))
      say({ who: 'me', text: '（元に戻しました）' })
    }
  }

  function onChip(chip: Chip) {
    if (!test) return
    if (chip.kind === 'ask') return void ask(chip.text)
    if (chip.kind === 'addQuestion') return setAddingAt({ sectionId: chip.sectionId, at: chip.at })
    if (chip.kind === 'kanji') return setChoosingKanji(chip.sectionId)
    if (chip.kind === 'openPassage') return setPasting(chip.sectionId)
    if (chip.kind === 'editPassage') return setEditingPassage(chip.sectionId)
    if (chip.kind === 'kaeriten') return setEditingKaeriten(chip.sectionId)
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
        {narrow && (
          <nav className="mview" aria-label="表示の切り替え">
            <button type="button" aria-pressed={view === 'chat'} onClick={() => setView('chat')}>会話</button>
            <button type="button" aria-pressed={view === 'paper'} onClick={showPaper}>紙面{paperDot && <span className="mview-dot" aria-label="紙面が変わりました" />}</button>
          </nav>
        )}
        {/* 狭い画面では選んだほうだけを描く（紙面は見えない状態で測ると割り付けが崩れる） */}
        {(!narrow || view === 'chat') && <ChatPanel
          messages={messages}
          canUndo={m => !!m.undo && test === m.undo.after}
          onButton={onButton}
          target={active && targetLabel(test, active)}
          onClearTarget={() => setTarget(null)}
          chips={active ? chipsFor(test, active, { pointStep: test.info.pointStep, drafting, busy: chatBusy, grammarKnown: id => grammarBySection[id] !== undefined }) : []}
          onChip={onChip}
          statuses={[
            ...[...drafting].map(id => `${nameById(id)}の大問を作っています（数十秒かかります）`),
            ...[...annotating].map(id => `${nameById(id)}の外れた返り点・送り仮名やルビを、AI が付け直しています`),
            ...[...checking].map(id => `${nameById(id)}の小問と直した本文を、AI が確かめています`),
            ...(chatBusy ? ['AI が考えています（十数秒かかります）'] : []),
          ]}
          alerts={[
            ...tooWide.map(id => `${nameById(id)}の本文が一枚に収まりません。範囲を短くして貼り直してください。`),
            ...(sheetLayout && !sheetLayout.fits ? ['解答用紙が一枚に収まりません。記述や作文の字数を減らしてください。'] : []),
            ...overflows.map(o => `${o.label}の模範解答（${kansuji(o.chars)}字）が、マス目（${kansuji(o.cells)}字）に入りきりません。`),
          ]}
          busy={chatBusy}
          onSend={text => void ask(text)}
          suggestions={suggestions}
          focusInput={consulting}
        />}
        {(!narrow || view === 'paper') && <main className="paper-col" onScroll={() => setSelected(null)}>
          {/* 合計の欄・大問の一覧・紙のタブは、紙面を送っても上に残す */}
          <div className="paper-head">
          <TotalsBar test={test} message={totalsMessage} onRescale={rescale} onEditInfo={() => setEditingInfo(true)} />
          <Outline
            test={test} nameOf={s => nameOf(test, s)}
            statusOf={s => sectionStatus(s, { drafting: drafting.has(s.id), flagged: Object.keys(liveFlags(test, flags)).filter(k => k.startsWith(`${s.id}/`)).length, confirmed: confirmed.has(s.id) })}
            onGo={goToSection}
            onAddSection={gradeOf(test) ? () => setAdding(true) : undefined}
          />
          <div className="sheet-bar">
            <div className="sheet-tabs" role="tablist" aria-label="表示する紙">
              {(Object.entries(SHEETS) as Array<[SheetKind, string]>).map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={sheet === value} onClick={() => setSheet(value)}>{label}</button>
              ))}
            </div>
            {/* 開いている紙だけをブラウザの印刷で出す。送信先で「PDFに保存」を選ぶと PDF になる */}
            <div className="sheet-pdf">
              <button type="button" onClick={() => window.print()}>{SHEETS[sheet]}をPDFで出力</button>
              <small>印刷の画面で「PDFに保存」を選びます</small>
            </div>
          </div>
          </div>
          {/* 開いていない紙は描かない（問題用紙は見えない状態で測ると割り付けが崩れる） */}
          {sheet === 'paper' && (
            <Paper
              test={test} allotments={allotments} onOpenPassage={openPassage} onOpenKanji={openKanji} editing={editing} onTooWide={reportTooWide}
              selected={active} changed={changed} onSelect={setTarget}
              onOpenQuestion={t => t.questionId && setEditingQuestion({ sectionId: t.sectionId, questionId: t.questionId })}
              flagged={new Set(Object.keys(liveFlags(test, flags)))}
              confirmed={confirmed}
              drafting={drafting} annotating={annotating}
            />
          )}
          {(sheet === 'answer' || sheet === 'answered') && sheetLayout && <AnswerSheet test={test} layout={sheetLayout} answered={sheet === 'answered'} />}
          {sheet === 'key' && <AnswerKey test={test} nameOf={s => nameOf(test, s)} />}
        </main>}
      </div>
      {pasting && test.sections.find(s => s.id === pasting)?.kind === 'kanbun' && (
        <PasteKanbun
          material={materialNames[pasting] ?? materialOf(test.sections.find(s => s.id === pasting)!) ?? ''}
          onSubmit={passage => pastePassage(pasting, passage)}
          onClose={() => setPasting(null)}
        />
      )}
      {pasting && test.sections.find(s => s.id === pasting)?.kind !== 'kanbun' && (
        <PastePassage
          material={materialNames[pasting] ?? ''}
          kind={test.sections.find(s => s.id === pasting)?.kind}
          onSubmit={passage => pastePassage(pasting, passage)}
          onClose={() => setPasting(null)}
        />
      )}
      {choosingKanji && (
        <KanjiWords
          initial={kanjiWords}
          counts={kanjiCounts(choosingKanji)}
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
            clearFlag(editedSection.id, q.id)
            return []
          }}
          onClose={() => setEditingQuestion(null)}
        />
      )}
      {editingPassage && (() => {
        const section = test.sections.find(s => s.id === editingPassage)
        return section && (
          <PassageEditor
            title={`${labelOf(section.id)}の本文を直す`}
            section={section}
            numbers={markNumbers(section)}
            onSubmit={text => savePassage(section.id, text)}
            onClose={() => setEditingPassage(null)}
          />
        )
      })()}
      {editingKaeriten && (() => {
        const section = test.sections.find(s => s.id === editingKaeriten)
        return section?.passage?.kind === 'kanbun' && (
          <KanbunEditor
            title={`${labelOf(section.id)}の返り点と送り仮名を直す`}
            passage={section.passage}
            onSubmit={text => saveKaeriten(section, text)}
            onClose={() => setEditingKaeriten(null)}
          />
        )
      })()}
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
            setEditingInfo(false)
            changeInfo(info)
          }}
          onClose={() => setEditingInfo(false)}
        />
      )}
      {/* 狭い画面で紙面を見ているときは会話が見えないので、選んだものについて相談する入口を出す */}
      {narrow && view === 'paper' && active && !selected && (
        <button type="button" className="mark-float consult-float" onClick={() => { setConsulting(true); setView('chat') }}>
          {targetLabel(test, active)}について AI に相談する
        </button>
      )}
      {selected && !marking && (s => !!s && ideasAvailable(s) && s.passage?.kind === 'prose')(test.sections.find(s => s.id === selected.sectionId)) && (
        <button
          type="button" className="mark-float"
          // 選んだところの下に出す。画面の外に出ないように収める
          style={{ left: Math.max(8, Math.min(selected.x, window.innerWidth - 220)), top: Math.max(8, Math.min(selected.y + 6, window.innerHeight - 48)) }}
          onMouseDown={e => e.preventDefault()}
          onClick={() => { setMarkWish(''); setMarking(selected); setSelected(null) }}
        >傍線を引いて小問を作る</button>
      )}
      {marking && (() => {
        const section = test.sections.find(s => s.id === marking.sectionId)!
        return (
          <MarkQuestion
            title={`${labelOf(section.id)}の本文に線を引いて小問を作る`}
            quote={marking.quote} before={marking.before}
            request={how => requestIdeas(test, section, subtotalOf(section), how)}
            initialWish={markWish}
            onReview={(idea, wish) => {
              // 前の案の整え直しが遅れて届いても入れない
              reshapeSeq.current++
              setMarking(null)
              setReviewing({ sectionId: section.id, at: positionByMark(idea), question: idea.question, section: idea.section, note: idea.adjustments && `AI が整えたところ: ${idea.adjustments}`, own: false, mark: { selection: marking, wish } })
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
            aiAvailable={ideasAvailable(section)}
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
            key={reviewing.version ?? 0}
            title={`${labelOf(reviewing.sectionId)}の問${kansuji(reviewing.at + 1)}として入れる小問`}
            extra={reviewing.mark && (() => {
              const mark = reviewing.mark
              const base = test.sections.find(s => s.id === reviewing.sectionId)!
              return (
                <MarkReshape
                  question={reviewing.question}
                  onReshape={async (format, charLimit) => {
                    const seq = ++reshapeSeq.current
                    const r = await requestIdeas(test, base, subtotalOf(base), { kind: 'mark', quote: mark.selection.quote, ...(mark.selection.before && { before: mark.selection.before }), wish: mark.wish, format, ...(charLimit && { charLimit }) })
                    if (seq !== reshapeSeq.current) return null
                    if (!r.ok) return r.errors
                    const idea = r.ideas[0]
                    setReviewing(now => now && { ...now, at: positionByMark(idea), question: idea.question, section: idea.section, note: idea.adjustments && `AI が整えたところ: ${idea.adjustments}`, version: (now.version ?? 0) + 1 })
                    return []
                  }}
                  onRewrite={() => {
                    reshapeSeq.current++
                    setReviewing(null)
                    setMarkWish(mark.wish)
                    setMarking(mark.selection)
                  }}
                />
              )
            })()}
            question={reviewing.question}
            numbers={markNumbers({ ...section, questions: [...section.questions, reviewing.question] })}
            submitLabel="この問題で入れる"
            note={reviewing.note}
            onSubmit={q => {
              const errors = putQuestion(reviewing.sectionId, reviewing.at, q, reviewing.section)
              if (!errors.length) setReviewing(null)
              return errors
            }}
            onClose={() => { reshapeSeq.current++; setReviewing(null) }}
          />
        )
      })()}
      {adding && gradeOf(test) && (
        <AddSection
          grade={gradeOf(test)!}
          present={{
            materials: new Set(test.sections.flatMap(s => [s.material, materialNames[s.id]].filter((m): m is string => !!m))),
            grammar: new Set(test.sections.flatMap(s => grammarBySection[s.id] ?? [])),
            kanji: test.sections.some(s => s.kind === 'kanji'),
            composition: test.sections.some(s => s.kind === 'composition'),
          }}
          onSubmit={addSection} onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}
