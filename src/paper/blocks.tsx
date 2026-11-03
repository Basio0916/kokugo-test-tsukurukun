import type { ReactNode } from 'react'
import { QuestionTools, SectionTools, type QuestionAction, type SectionAction } from '../edit/Tools'
import { markNumbers } from '../model/derive'
import type { Section, Test } from '../model/schema'
import { kansuji } from './kansuji'
import { Cover, QuestionView, SectionHeader } from './parts'

/* 紙面をブロック（表紙・大問の見出しと本文・小問・結び）に分ける。ページへの割り付けはブロック単位で行う */

export type Block = {
  key: string
  node: ReactNode
  newPage: boolean
  keepWithNext: boolean
}

const SHORT_KINDS: Section['kind'][] = ['kanji', 'grammar']

export type PaperActions = {
  allotments?: Record<string, number>
  onOpenPassage?: (sectionId: string) => void
  onOpenKanji?: (sectionId: string) => void
  // 紙面の上での操作（画面だけ）。渡したときだけ操作の表示を重ねる
  editing?: {
    confirmed: Set<string>
    onSection: (sectionId: string, action: SectionAction | 'instruction') => void
    onQuestion: (sectionId: string, questionId: string, action: QuestionAction) => void
  }
}

export function buildBlocks(test: Test, actions: PaperActions = {}): Block[] {
  const blocks: Block[] = [{ key: 'cover', node: <Cover test={test} />, newPage: false, keepWithNext: false }]
  test.sections.forEach((section, si) => {
    const numbers = markNumbers(section)
    // 漢字・文法は前のページに続けて詰める。文章を扱う大問と作文は新しいページから始める
    const newPage = !SHORT_KINDS.includes(section.kind)
    const header = (
      <SectionHeader
        section={section} index={si} numbers={numbers}
        allotment={actions.allotments?.[section.id]}
        onOpenPassage={actions.onOpenPassage && (() => actions.onOpenPassage!(section.id))}
        onOpenKanji={actions.onOpenKanji && (() => actions.onOpenKanji!(section.id))}
        onEditInstruction={actions.editing && (() => actions.editing!.onSection(section.id, 'instruction'))}
      />
    )
    const editing = actions.editing
    const name = `【${kansuji(si + 1)}】`
    blocks.push({
      key: `${section.id}:h`,
      node: editing
        ? <>{header}<SectionTools name={name} confirmed={editing.confirmed.has(section.id)} onAction={a => editing.onSection(section.id, a)} /></>
        : header,
      newPage,
      keepWithNext: true,
    })
    section.questions.forEach((q, qi) => {
      const view = <QuestionView question={q} index={qi} numbers={numbers} />
      blocks.push({
        key: `${section.id}:${q.id}`,
        node: editing
          ? <>{view}<QuestionTools name={`${name}問${kansuji(qi + 1)}`} onAction={a => editing.onQuestion(section.id, q.id, a)} /></>
          : view,
        newPage: false,
        keepWithNext: false,
      })
    })
  })
  blocks.push({ key: 'end', node: <p className="end">（問題は以上です。見直しをしましょう。）</p>, newPage: false, keepWithNext: false })
  return blocks
}
