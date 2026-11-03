import type { ReactNode } from 'react'
import { markNumbers } from '../model/derive'
import type { Section, Test } from '../model/schema'
import { Cover, QuestionView, SectionHeader } from './parts'

/* 紙面をブロック（表紙・大問の見出しと本文・小問・結び）に分ける。ページへの割り付けはブロック単位で行う */

export type Block = {
  key: string
  node: ReactNode
  newPage: boolean
  keepWithNext: boolean
}

const SHORT_KINDS: Section['kind'][] = ['kanji', 'grammar']

export function buildBlocks(test: Test): Block[] {
  const blocks: Block[] = [{ key: 'cover', node: <Cover test={test} />, newPage: false, keepWithNext: false }]
  test.sections.forEach((section, si) => {
    const numbers = markNumbers(section)
    // 漢字・文法は前のページに続けて詰める。文章を扱う大問と作文は新しいページから始める
    const newPage = !SHORT_KINDS.includes(section.kind)
    blocks.push({ key: `${section.id}:h`, node: <SectionHeader section={section} index={si} numbers={numbers} />, newPage, keepWithNext: true })
    section.questions.forEach((q, qi) => {
      blocks.push({ key: `${section.id}:${q.id}`, node: <QuestionView question={q} index={qi} numbers={numbers} />, newPage: false, keepWithNext: false })
    })
  })
  blocks.push({ key: 'end', node: <p className="end">（問題は以上です。見直しをしましょう。）</p>, newPage: false, keepWithNext: false })
  return blocks
}
