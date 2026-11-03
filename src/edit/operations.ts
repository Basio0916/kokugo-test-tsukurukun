import { Test, type Question, type Section } from '../model/schema'

/* 紙面の上での操作。どれもテストのデータを受け取り、新しいテストのデータを返す（元のデータは変えない） */

export type Edited = { ok: true; test: Test } | { ok: false; errors: string[] }

const move = <T,>(list: T[], index: number, delta: number): T[] => {
  const to = index + delta
  if (index < 0 || to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

const mapSection = (test: Test, sectionId: string, f: (s: Section) => Section): Test => ({
  ...test,
  sections: test.sections.map(s => (s.id === sectionId ? f(s) : s)),
})

export function moveSection(test: Test, sectionId: string, delta: -1 | 1): Test {
  return { ...test, sections: move(test.sections, test.sections.findIndex(s => s.id === sectionId), delta) }
}

export function removeSection(test: Test, sectionId: string): Test {
  return { ...test, sections: test.sections.filter(s => s.id !== sectionId) }
}

export function setInstruction(test: Test, sectionId: string, instruction: string): Edited {
  const text = instruction.trim()
  if (!text) return { ok: false, errors: ['指示文を入れてください'] }
  return { ok: true, test: mapSection(test, sectionId, s => ({ ...s, instruction: text })) }
}

export function appendSection(test: Test, section: Section): Test {
  return { ...test, sections: [...test.sections, section] }
}

/** prefix に番号を付けた、テストの中でまだ使っていない大問の識別子 */
export function newSectionId(test: Test, prefix: string): string {
  const used = new Set(test.sections.map(s => s.id))
  if (!used.has(prefix)) return prefix
  for (let n = 2; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`
}

export function moveQuestion(test: Test, sectionId: string, questionId: string, delta: -1 | 1): Test {
  return mapSection(test, sectionId, s => ({ ...s, questions: move(s.questions, s.questions.findIndex(q => q.id === questionId), delta) }))
}

export function removeQuestion(test: Test, sectionId: string, questionId: string): Test {
  return mapSection(test, sectionId, s => ({ ...s, questions: s.questions.filter(q => q.id !== questionId) }))
}

/** 小問を置き換える。テストのデータとして正しくなければ（選択肢がない、配点が刻みの倍数でないなど）理由を返す */
export function replaceQuestion(test: Test, sectionId: string, question: Question): Edited {
  const next = mapSection(test, sectionId, s => ({ ...s, questions: s.questions.map(q => (q.id === question.id ? question : q)) }))
  const parsed = Test.safeParse(next)
  if (!parsed.success) return { ok: false, errors: [...new Set(parsed.error.issues.map(i => i.message))] }
  return { ok: true, test: parsed.data }
}

/**
 * 小問を at の位置（0 なら問一の前）に差し込む。section を渡すと、大問の本文などをそれに置き換えてから差し込む
 * （AI の案で本文に傍線部が増えたとき）。テストのデータとして正しくなければ理由を返す。
 */
export function insertQuestion(test: Test, sectionId: string, at: number, question: Question, section?: Section): Edited {
  const next = mapSection(test, sectionId, s => {
    const base = section ?? s
    const questions = [...s.questions]
    questions.splice(at, 0, question)
    return { ...base, questions }
  })
  const parsed = Test.safeParse(next)
  if (!parsed.success) return { ok: false, errors: [...new Set(parsed.error.issues.map(i => i.message))] }
  return { ok: true, test: parsed.data }
}
