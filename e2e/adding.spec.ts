import { expect, test, type Page, type Route } from '@playwright/test'

/* 小問を足す。本物の Claude は呼ばず、/api/draft-question を差し替える */

async function openSample(page: Page) {
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const merosPage = (page: Page) => page.locator('.page').filter({ hasText: '走れメロス' })
const stems = (page: Page) => merosPage(page).locator('.stem')

// 送られた大問の本文に新しい傍線部を付けた案を返す（引用は本文の「人一倍に敏感であった」）
function fakeIdeas(count: number, requests: unknown[] = []) {
  return async (route: Route) => {
    const req = route.request().postDataJSON()
    requests.push(req)
    const segments = req.section.passage.segments.flatMap((s: { kind: string; text?: string }) => {
      if (s.kind !== 'text' || !s.text!.includes('人一倍に敏感であった')) return [s]
      const [head, tail] = s.text!.split('人一倍に敏感であった')
      return [{ kind: 'text', text: head }, { kind: 'mark', id: 'meros-n1', children: [{ kind: 'text', text: '人一倍に敏感であった' }] }, { kind: 'text', text: tail }]
    })
    const idea = (n: number) => ({
      section: { ...req.section, passage: { ...req.section.passage, segments } },
      question: {
        id: `meros-a${n}`, format: 'short', kanten: 'thinking', standard: 'C(1)イ', points: 4, answer: '答え',
        ...(req.how.charLimit && { charLimit: req.how.charLimit }),
        stem: [{ kind: 'markRef', id: 'meros-n1', form: 'label' }, { kind: 'text', text: `とありますが、どういうことですか（案${n}${req.how.charLimit ? `・${req.how.charLimit}字` : ''}）。` }],
      },
      rationale: `理由${n}`,
      ...(req.how.kind === 'mark' && { adjustments: '短答にし、二十字以内にしました' }),
    })
    await route.fulfill({ json: { ok: true, ideas: Array.from({ length: count }, (_, i) => idea(i + 1)) } })
  }
}

test('問一の後にAIのおすすめを足すと問二になる', async ({ page }) => {
  await page.route('/api/draft-question', fakeIdeas(3))
  await openSample(page)
  await page.getByRole('button', { name: '【三】の問二として小問を追加' }).click()
  await page.getByRole('button', { name: 'AI のおすすめから選ぶ' }).click()
  await expect(page.getByRole('button', { name: /案\d+を入れる/ })).toHaveCount(3)
  await page.getByRole('button', { name: '案2を入れる' }).click()
  await expect(stems(page)).toHaveCount(5)
  await expect(stems(page).nth(1)).toContainText('問二　傍線部④とありますが、どういうことですか（案2）。')
  await expect(merosPage(page).locator('.mk')).toHaveText(['①', '②', '③', '④'])
})

test('形式を選んで作ってもらい、入れる前に直す', async ({ page }) => {
  const requests: Array<{ how: unknown }> = []
  await page.route('/api/draft-question', fakeIdeas(1, requests))
  await openSample(page)
  await page.getByRole('button', { name: '【三】の問五として小問を追加' }).click()
  await page.getByRole('button', { name: '形式を選んで AI に作ってもらう' }).click()
  await page.getByLabel('記述').check()
  await page.getByLabel('ねらい').fill('メロスの人物像')
  await page.getByRole('button', { name: 'AI に作ってもらう', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '【三】の問五として入れる小問' })
  await dialog.getByLabel('問い文').fill('{傍線部④}とありますが、メロスはどのような人物ですか。')
  await dialog.getByRole('button', { name: 'この問題で入れる' }).click()
  await expect(stems(page).nth(4)).toContainText('問五　傍線部④とありますが、メロスはどのような人物ですか。')
  expect(requests[0].how).toEqual({ kind: 'format', format: 'description', aim: 'メロスの人物像' })
})

// 本文の「人一倍に敏感であった」を選び、指を離す（マウスかタッチ）
async function selectInPassage(page: Page, event: 'mouseup' | 'touchend' = 'mouseup') {
  await page.evaluate(event => {
    const p = [...document.querySelectorAll('.page .passage[data-section="meros"] p')].find(e => e.textContent!.includes('人一倍'))!
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const i = node.textContent!.indexOf('人一倍に敏感であった')
      if (i >= 0) {
        const range = document.createRange()
        range.setStart(node, i)
        range.setEnd(node, i + '人一倍に敏感であった'.length)
        getSelection()!.removeAllRanges()
        getSelection()!.addRange(range)
        break
      }
    }
    document.dispatchEvent(new Event(event))
  }, event)
}

test('本文に線を引いて作ると、選んだところに傍線部が付く', async ({ page }) => {
  const requests: Array<{ how: { kind: string; quote?: string; before?: string } }> = []
  await page.route('/api/draft-question', fakeIdeas(1, requests))
  await openSample(page)
  await selectInPassage(page)
  await page.getByRole('button', { name: '傍線を引いて小問を作る' }).click()
  const dialog = page.getByRole('dialog', { name: '【三】の本文に線を引いて小問を作る' })
  await expect(dialog).toContainText('人一倍に敏感であった')

  // 何も書かずに決めると頼まない
  await dialog.getByRole('button', { name: 'AI に問題の形にしてもらう' }).click()
  await expect(dialog.getByRole('alert')).toContainText('どんな問題にしたいか')
  expect(requests).toHaveLength(0)

  await dialog.getByLabel('どんな問題にしたいか').fill('メロスがどういう人か答えさせたい')
  await dialog.getByRole('button', { name: 'AI に問題の形にしてもらう' }).click()
  const review = page.getByRole('dialog', { name: /として入れる小問/ })
  await expect(review).toContainText('AI が整えたところ: 短答にし、二十字以内にしました')
  await review.getByRole('button', { name: 'この問題で入れる' }).click()
  await expect(merosPage(page).locator('.mk')).toHaveText(['①', '②', '③', '④'])
  expect(requests[0].how).toMatchObject({ kind: 'mark', quote: '人一倍に敏感であった', before: '邪悪に対しては、' })
})

test('タッチで選んでも線を引いて作れる。形式・字数を選び直して整え直し、希望を書き直せる', async ({ page }) => {
  const requests: Array<{ how: { kind: string; wish?: string; format?: string; charLimit?: number } }> = []
  await page.route('/api/draft-question', fakeIdeas(1, requests))
  await openSample(page)
  await selectInPassage(page, 'touchend')
  await page.getByRole('button', { name: '傍線を引いて小問を作る' }).click()
  const mark = page.getByRole('dialog', { name: '【三】の本文に線を引いて小問を作る' })
  await mark.getByLabel('どんな問題にしたいか').fill('メロスがどういう人か答えさせたい')
  await mark.getByRole('button', { name: 'AI に問題の形にしてもらう' }).click()

  const review = page.getByRole('dialog', { name: /として入れる小問/ })
  await expect(review).toContainText('（案1）')
  const reshape = review.getByRole('group', { name: '形式と字数を選び直す' })
  await reshape.getByLabel('解答形式').selectOption({ label: '短答' })
  await reshape.getByLabel('字数', { exact: true }).fill('40')
  await review.getByRole('button', { name: '整え直す' }).click()
  await expect(review.getByLabel('問い文')).toHaveValue(/（案1・40字）/)
  expect(requests[1].how).toMatchObject({ kind: 'mark', wish: 'メロスがどういう人か答えさせたい', format: 'short', charLimit: 40 })

  await review.getByRole('button', { name: '書き直して、もう一度整えてもらう' }).click()
  const again = page.getByRole('dialog', { name: '【三】の本文に線を引いて小問を作る' })
  await expect(again.getByLabel('どんな問題にしたいか')).toHaveValue('メロスがどういう人か答えさせたい')
  await again.getByLabel('どんな問題にしたいか').fill('メロスの性格を二十字で書かせたい')
  await again.getByRole('button', { name: 'AI に問題の形にしてもらう' }).click()
  await page.getByRole('dialog', { name: /として入れる小問/ }).getByRole('button', { name: 'この問題で入れる' }).click()
  expect(requests[2].how).toMatchObject({ kind: 'mark', wish: 'メロスの性格を二十字で書かせたい', quote: '人一倍に敏感であった' })
  await expect(merosPage(page).locator('.mk')).toHaveText(['①', '②', '③', '④'])
})

test('漢字の大問は自分で書くだけ。書いた小問が入る', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: '【一】の問三として小問を追加' }).click()
  await expect(page.getByRole('button', { name: 'AI のおすすめから選ぶ' })).toBeDisabled()
  await page.getByRole('button', { name: '自分で書く' }).click()
  await page.getByRole('button', { name: '空の小問を開く' }).click()
  const dialog = page.getByRole('dialog', { name: '【一】の問三として入れる小問' })
  await dialog.getByLabel('問い文').fill('次の傍線部の漢字の読みを、ひらがなで書きなさい。')
  await dialog.getByLabel('項目').fill('[[濁流]]を泳ぐ。｜だくりゅう\n人を[[欺く]]。｜あざむく')
  await dialog.getByRole('button', { name: 'この問題で入れる' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.page').first().locator('.stem')).toContainText(['問三　次の傍線部の漢字の読みを'])
})
