import { Test } from '../model/schema'
import { sampleTest } from './sampleTest'

// 小問が多く、大問が一枚に収まらないテスト。ページ送りの確認に使う（?sample=long で表示）
export const longTest: Test = Test.parse({
  ...sampleTest,
  sections: sampleTest.sections.map(s => (s.id !== 'meros' ? s : {
    ...s,
    questions: [1, 2, 3].flatMap(k => s.questions.map(q => ({ ...q, id: `${q.id}-${k}` }))),
  })),
})
