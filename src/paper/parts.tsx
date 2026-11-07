import type { ReactNode } from 'react'
import { choiceLabel, questionPoints, sectionPoints } from '../model/derive'
import { needsPassage, type Item, type KanbunChar, type KanbunPassage, type ProsePassage, type ProseSegment, type Question, type Section, type StemSegment, type Test } from '../model/schema'
import { fillDisplay } from './fill'
import { circled, kansuji } from './kansuji'

/* 紙面の部品。番号は呼び出し側で計算した傍線部の番号を受け取って描く */

export type Numbers = Map<string, number>

export function Cover({ test }: { test: Test }) {
  const { info } = test
  return (
    <>
      <div className="cover">
        <p className="c-term">{info.year}　{info.name}</p>
        <p className="c-title">国語</p>
        <p>（{info.grade}）　時間　{kansuji(info.minutes)}分</p>
        <div className="c-notes">
          <p>《注意》</p>
          <p>一、答えは、すべて解答用紙に記入しなさい。</p>
          <p>二、字は、ていねいに、はっきりと書きなさい。</p>
          <p>三、{kansuji(info.fullMarks)}点満点です。配点は各問題のはじめに示してあります。</p>
        </div>
      </div>
      <div className="rule" />
    </>
  )
}

function Mark({ id, numbers, children }: { id: string; numbers: Numbers; children: ReactNode }) {
  const n = numbers.get(id)
  if (!n) return <>{children}</>
  return (
    <>
      <span className="mk">{circled(n)}</span>
      <span className="bs" data-mark={n}>{children}</span>
    </>
  )
}

function Prose({ passage, numbers, sectionId }: { passage: ProsePassage; numbers: Numbers; sectionId: string }) {
  const inline = (s: { kind: 'text'; text: string } | { kind: 'ruby'; base: string; reading: string }, key: number) =>
    s.kind === 'text' ? <span key={key}>{s.text}</span> : <ruby key={key}>{s.base}<rt>{s.reading}</rt></ruby>
  // 段落の区切りで <p> を分ける（段落ごとに一字下げ）
  const paragraphs: Array<Exclude<ProseSegment, { kind: 'break' }>[]> = [[]]
  for (const s of passage.segments) {
    if (s.kind === 'break') paragraphs.push([])
    else paragraphs.at(-1)!.push(s)
  }
  return (
    <div className="passage" data-section={sectionId}>
      {paragraphs.map((segments, pi) => (
        <p key={pi}>
          {segments.map((s, i) =>
            s.kind === 'mark' ? <Mark key={i} id={s.id} numbers={numbers}>{s.children.map(inline)}</Mark> : inline(s, i),
          )}
        </p>
      ))}
      <p className="src">（{passage.source}）</p>
    </div>
  )
}

function KanbunCharView({ c }: { c: KanbunChar }) {
  // 送り仮名が長いと次の字に重なるので、そのぶん字の間をあける
  const gap = Math.max(0.55, (c.okurigana?.length ?? 0) * 0.5 - 0.2)
  return (
    <span className="kc" style={{ marginInlineEnd: `${gap}em` }}>
      {c.char}
      {c.okurigana && <span className="ok">{c.okurigana}</span>}
      {c.kaeriten && <span className="kten">{c.kaeriten}</span>}
    </span>
  )
}

function Kanbun({ passage, numbers }: { passage: KanbunPassage; numbers: Numbers }) {
  return (
    <div className="passage kanshi">
      <p className="ks-title">{passage.title}<span>{passage.author}</span></p>
      {passage.lines.map((line, li) => (
        <p className="ks-line" key={li}>
          {line.map((t, ti) =>
            t.kind === 'mark'
              ? <Mark key={ti} id={t.id} numbers={numbers}>{t.children.map((c, ci) => <KanbunCharView key={ci} c={c} />)}</Mark>
              : <KanbunCharView key={ti} c={t} />,
          )}
        </p>
      ))}
      <div className="ks-notes">{passage.notes.map((n, i) => <p key={i}>{n}</p>)}</div>
    </div>
  )
}

type HeaderProps = {
  section: Section
  index: number
  numbers: Numbers
  // 本文を貼る前の大問の配点の枠と、本文欄を押したとき（画面だけ）
  allotment?: number
  onOpenPassage?: () => void
  // 小問のない漢字の大問の「出題する漢字を選ぶ」欄を押したとき（画面だけ）
  onOpenKanji?: () => void
  // 見出しをダブルクリックしたとき（指示文を直す。画面だけ）
  onEditInstruction?: () => void
}

export function SectionHeader({ section, index, numbers, allotment, onOpenPassage, onOpenKanji, onEditInstruction }: HeaderProps) {
  const p = section.passage
  const points = section.questions.length === 0 && allotment !== undefined ? allotment : sectionPoints(section)
  return (
    <>
      <p className="sec-h" onDoubleClick={onEditInstruction} title={onEditInstruction ? 'ダブルクリックで指示文を直す' : undefined}><b>【{kansuji(index + 1)}】</b>　{section.instruction}<span className="pt">（{kansuji(points)}点）</span></p>
      {p?.kind === 'prose' && <Prose passage={p} numbers={numbers} sectionId={section.id} />}
      {!p && needsPassage(section.kind) && (
        <button type="button" className="passage passage-slot" onClick={onOpenPassage} disabled={!onOpenPassage}>
          本文欄<span>（押して本文を貼り付けてください）</span>
        </button>
      )}
      {section.kind === 'kanji' && section.questions.length === 0 && (
        <button type="button" className="passage passage-slot kanji-slot" onClick={onOpenKanji} disabled={!onOpenKanji}>
          出題する漢字を選ぶ<span>（漢字テストでやった語などを入れてください）</span>
        </button>
      )}
      {p?.kind === 'kanbun' && <Kanbun passage={p} numbers={numbers} />}
    </>
  )
}

function stemText(stem: StemSegment[], question: Question, numbers: Numbers): string {
  return stem.map(s => {
    if (s.kind === 'text') return s.text
    if (s.kind === 'choiceRange') return question.choices ? `ア〜${choiceLabel(question.choices.length - 1)}` : ''
    const n = numbers.get(s.id)
    if (!n) return '傍線部（消えた傍線）'
    return s.form === 'label' ? `傍線部${circled(n)}` : circled(n)
  }).join('')
}

const isKatakana = (s: string) => /^[ァ-ヶー]+$/.test(s)

function ItemText({ item }: { item: Item }) {
  return (
    <>
      {item.segments?.map((s, i) =>
        s.kind === 'text' ? <span key={i}>{s.text}</span> : <span key={i} className={isKatakana(s.text) ? 'bs kt' : 'bs'}>{s.text}</span>,
      )}
    </>
  )
}

export function QuestionView({ question, index, numbers }: { question: Question; index: number; numbers: Numbers }) {
  if (question.format === 'composition') {
    return <>{question.conditions?.map((c, i) => <p className="cond" key={i}><b>条件{kansuji(i + 1)}</b>　{c}</p>)}</>
  }
  const points = question.pointsEach !== undefined ? `各${kansuji(question.pointsEach)}` : kansuji(questionPoints(question))
  // 文章を持たない短い項目（「走る」「起きる」など）と短い選択肢は一行に並べる
  const shown = question.items?.filter(it => it.segments) ?? []
  const inlineItems = shown.every(it => it.segments!.every(s => s.kind === 'text') && it.segments!.map(s => s.text).join('').length <= 6)
  const inlineChoices = question.choices?.every(c => c.length <= 8)
  return (
    <>
      <p className="stem"><b>問{kansuji(index + 1)}</b>　{stemText(question.stem, question, numbers)}<span className="pt">（{points}点）</span></p>
      {question.fill && <p className="fill">◎{fillDisplay(question.fill)}</p>}
      {shown.length > 0 && (inlineItems
        ? <p className="item">{shown.map((it, i) => <span key={i}>{i > 0 && '　　'}{circled(i + 1)}　<ItemText item={it} /></span>)}</p>
        : shown.map((it, i) => <p className="item" key={i}>{circled(i + 1)}　<ItemText item={it} /></p>))}
      {question.choices && (inlineChoices
        ? <p className="choice">{question.choices.map((c, i) => `${i > 0 ? '　　' : ''}${choiceLabel(i)}　${c}`).join('')}</p>
        : question.choices.map((c, i) => <p className="choice" key={i}>{choiceLabel(i)}　{c}</p>))}
    </>
  )
}
