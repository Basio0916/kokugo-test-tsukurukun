import { markNumbers, markRefsOf, totalPoints } from '../model/derive'
import { needsPassage, type Section, type Test } from '../model/schema'
import type { NewMessage } from './messages'

/* 会話の案内と大問の一覧で使う判定。次にすることと大問の状態を、テストと画面の状態から決める */

export type NextStep =
  | { kind: 'passage'; sectionId: string }
  | { kind: 'kanji'; sectionId: string }
  | { kind: 'offerComposition' }
  | { kind: 'complete' }

/** 次にすること: 本文を待つ大問 → 出題する漢字を待つ大問 → 作文を勧める（作文がなく、まだ勧めていない） → そろった */
export function nextStep(test: Test, compositionOffered: boolean): NextStep {
  const waiting = test.sections.find(s => needsPassage(s.kind) && !s.passage)
  if (waiting) return { kind: 'passage', sectionId: waiting.id }
  const kanji = test.sections.find(s => s.kind === 'kanji' && s.questions.length === 0)
  if (kanji) return { kind: 'kanji', sectionId: kanji.id }
  if (!compositionOffered && !test.sections.some(s => s.kind === 'composition')) return { kind: 'offerComposition' }
  return { kind: 'complete' }
}

export type SectionStatus = { label: string; tone: 'busy' | 'wait' | 'warn' | 'fixed' | 'prop' }

/** 一覧に出す大問の状態。作っています → 本文待ち → 小問待ち → 要確認 → 確定 → 相談中 の順に、先に当てはまるもの */
export function sectionStatus(section: Section, state: { drafting: boolean; flagged: number; confirmed: boolean }): SectionStatus {
  if (state.drafting) return { label: '作っています', tone: 'busy' }
  if (needsPassage(section.kind) && !section.passage) return { label: '本文待ち', tone: 'wait' }
  if (section.questions.length === 0) return { label: '小問待ち', tone: 'wait' }
  if (state.flagged > 0) return { label: `要確認 ${state.flagged}`, tone: 'warn' }
  if (state.confirmed) return { label: '確定', tone: 'fixed' }
  return { label: '相談中', tone: 'prop' }
}

/** 傍線部の順と問の順がそろっていないか（各小問が最初に参照する傍線部の番号が、問の順に増えていない） */
export function outOfOrder(section: Section): boolean {
  const numbers = markNumbers(section)
  const firsts = section.questions
    .map(q => Math.min(...markRefsOf(q).map(id => numbers.get(id) ?? Infinity)))
    .filter(n => Number.isFinite(n))
  return firsts.some((n, i) => i > 0 && n < firsts[i - 1])
}

const pts = (n: number) => `${n}点`

/** 次にすることの案内のメッセージ。nameOf は大問を会話で呼ぶ名前（【二】走れメロス） */
export function guideMessage(test: Test, step: NextStep, nameOf: (section: Section) => string): NewMessage {
  const total = totalPoints(test)
  const full = test.info.fullMarks
  if (step.kind === 'passage' || step.kind === 'kanji') {
    const section = test.sections.find(s => s.id === step.sectionId)!
    const name = nameOf(section)
    const bracket = name.match(/^【.+?】/)?.[0] ?? name
    return step.kind === 'passage'
      ? { who: 'ai', text: `次は${name}です。紙面の本文欄に、教材 CD などから本文を貼ってください。貼ると、AI が小問を作ります。`, buttons: [{ label: `${bracket}の本文欄を開く`, action: 'openPassage', sectionId: section.id }] }
      : { who: 'ai', text: `次は${name}です。授業の漢字テストでやった語などを入れて、出題する漢字を選んでください。`, buttons: [{ label: `${bracket}の出題する漢字を選ぶ`, action: 'chooseKanji', sectionId: section.id }] }
  }
  if (step.kind === 'offerComposition') {
    const names = test.sections.filter(s => s.kind !== 'kanji' && s.kind !== 'grammar').map(s => nameOf(s).replace(/^【.+?】/, '')).filter(Boolean)
    return {
      who: 'ai',
      text: `ここまでで、配点の合計は${pts(total)}です（満点は${pts(full)}）。${names.length ? `「${names.join('」「')}」の指導事項をもとに、` : ''}作文の大問を入れるのはどうでしょう。作文を足すと、AI が題と条件を考え、ほかの配点を少しずつ調整して合計を満点にそろえます。作文の大問を足しますか？`,
      buttons: [{ label: '作文の大問を足す', action: 'addComposition' }, { label: '作文は入れない', action: 'skipComposition' }],
    }
  }
  const off = total !== full
  return {
    who: 'ai',
    text: `これでテスト一式がそろいました。${off ? `合計が${pts(total)}で、満点（${pts(full)}）と合っていません。` : ''}解答用紙と模範解答・採点基準も、問題用紙と同じデータから作っているので、番号や配点がずれません。`,
    buttons: [
      ...(off ? [{ label: '配点を満点にそろえる', action: 'rescale' as const }] : []),
      { label: '解答用紙を見る', action: 'showSheet', sheet: 'answer' },
      { label: '模範解答・採点基準を見る', action: 'showSheet', sheet: 'key' },
    ],
  }
}

/** 作り始めの案内: 骨組みの大問の並びと、配点の割り振り方 */
export function startMessage(test: Test, allotments: Record<string, number>, nameOf: (section: Section) => string): NewMessage {
  return {
    who: 'ai',
    text: `${test.info.year}「${test.info.name}」の範囲から、骨組みを作りました。配点は満点の${pts(test.info.fullMarks)}に収まるように、大問ごとに割り振っています。紙面の大問や小問をクリックすると、それについて相談できます。`,
    notes: { title: '骨組み', label: '骨組みの大問', items: test.sections.map(s => ({ text: `${nameOf(s)}（${pts(allotments[s.id] ?? 0)}）` })) },
  }
}
