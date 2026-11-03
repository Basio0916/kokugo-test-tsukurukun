import type { ReactNode } from 'react'
import { choiceLabel, questionPoints, sectionPoints } from '../model/derive'
import type { Item, KanbunChar, KanbunPassage, ProsePassage, Question, Section, StemSegment, Test } from '../model/schema'
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
          <p>一、先生の合図があるまで、この問題用紙を開いてはいけません。</p>
          <p>二、答えは、すべて解答用紙に記入しなさい。</p>
          <p>三、字は、ていねいに、はっきりと書きなさい。</p>
          <p>四、{kansuji(info.fullMarks)}点満点です。配点は各問題のはじめに示してあります。</p>
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

function Prose({ passage, numbers }: { passage: ProsePassage; numbers: Numbers }) {
  const inline = (s: { kind: 'text'; text: string } | { kind: 'ruby'; base: string; reading: string }, key: number) =>
    s.kind === 'text' ? <span key={key}>{s.text}</span> : <ruby key={key}>{s.base}<rt>{s.reading}</rt></ruby>
  return (
    <div className="passage">
      <p>
        {passage.segments.map((s, i) =>
          s.kind === 'mark' ? <Mark key={i} id={s.id} numbers={numbers}>{s.children.map(inline)}</Mark> : inline(s, i),
        )}
      </p>
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

export function SectionHeader({ section, index, numbers }: { section: Section; index: number; numbers: Numbers }) {
  const p = section.passage
  return (
    <>
      <p className="sec-h"><b>【{kansuji(index + 1)}】</b>　{section.instruction}<span className="pt">（{kansuji(sectionPoints(section))}点）</span></p>
      {p?.kind === 'prose' && <Prose passage={p} numbers={numbers} />}
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
      {shown.length > 0 && (inlineItems
        ? <p className="item">{shown.map((it, i) => <span key={i}>{i > 0 && '　　'}{circled(i + 1)}　<ItemText item={it} /></span>)}</p>
        : shown.map((it, i) => <p className="item" key={i}>{circled(i + 1)}　<ItemText item={it} /></p>))}
      {question.choices && (inlineChoices
        ? <p className="choice">{question.choices.map((c, i) => `${i > 0 ? '　　' : ''}${choiceLabel(i)}　${c}`).join('')}</p>
        : question.choices.map((c, i) => <p className="choice" key={i}>{choiceLabel(i)}　{c}</p>))}
    </>
  )
}
