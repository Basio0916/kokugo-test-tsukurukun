import { allocatePoints } from '../ai/points'
import { questionPoints, totalPoints } from '../model/derive'
import type { Question, Test } from '../model/schema'

export type Rescaled = { ok: true; test: Test } | { ok: false; error: string }

/**
 * 配点の合計を満点ちょうどにそろえる。各◯点の小問は一項目の配点を（満点 ÷ 今の合計）の割合で直して刻みの倍数に丸め（最低でも刻み）、
 * 残りの点を、それ以外の小問に今の配点を重みとして割り振る。
 */
export function rescalePoints(test: Test): Rescaled {
  const { fullMarks, pointStep: step } = test.info
  const current = totalPoints(test)
  if (current === 0) return { ok: false, error: 'まだ小問がないので、配点をそろえられません' }
  const ratio = fullMarks / current
  const all = test.sections.flatMap(s => s.questions)
  const eachOf = new Map<string, number>()
  for (const q of all) {
    if (q.pointsEach !== undefined) eachOf.set(q.id, Math.max(step, Math.round((q.pointsEach * ratio) / step) * step))
  }
  const itemsTotal = all.reduce((a, q) => a + (eachOf.get(q.id) ?? 0) * (q.items?.length ?? 0), 0)
  const plain = all.filter(q => q.pointsEach === undefined)
  const rest = fullMarks - itemsTotal
  let points: number[] = []
  if (plain.length) {
    const allocated = allocatePoints(plain.map(questionPoints), rest, step)
    if (!allocated) return { ok: false, error: `満点${fullMarks}点では、すべての小問に${step}点以上を割り振れません` }
    points = allocated
  } else if (rest !== 0) {
    return { ok: false, error: '各◯点の問いだけなので、合計を満点ちょうどにそろえられません' }
  }
  const pointsOf = new Map(plain.map((q, i) => [q.id, points[i]]))
  const rescale = (q: Question): Question =>
    q.pointsEach !== undefined ? { ...q, pointsEach: eachOf.get(q.id)! } : { ...q, points: pointsOf.get(q.id)! }
  return { ok: true, test: { ...test, sections: test.sections.map(s => ({ ...s, questions: s.questions.map(rescale) })) } }
}
