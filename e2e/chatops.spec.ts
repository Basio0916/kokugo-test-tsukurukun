import { expect, test, type Page, type Route } from '@playwright/test'
import drafted from './fixtures/draft-meros.json' with { type: 'json' }

/* 会話での小問の操作、古文・漢文への AI の手助け、頼み方の例。本物の Claude は呼ばず API を差し替える */

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })
const sectionPage = (page: Page, text: string) => page.locator('.page').filter({ hasText: text })

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const reply = (change: object) => (route: Route) => route.fulfill({ json: { ok: true, reply: 'わかりました。', notes: [], change } })

async function send(page: Page, text: string) {
  await chat(page).getByLabel('AIへの相談').fill(text)
  await chat(page).getByRole('button', { name: '送信' }).click()
}

// 送られた大問に手を加えず、count 個の案を返す（本文はそのまま、傍線部なし）
function fakeIdeas(count: number) {
  return async (route: Route) => {
    const req = route.request().postDataJSON()
    const idea = (n: number) => ({
      section: req.section,
      question: { id: `${req.section.id}-a${n}`, format: 'short', kanten: 'thinking', standard: 'C(1)エ', points: 2, answer: '答え', stem: [{ kind: 'text', text: `案${n}の問い文。` }] },
      rationale: `理由${n}`,
    })
    await route.fulfill({ json: { ok: true, ideas: Array.from({ length: count }, (_, i) => idea(i + 1)) } })
  }
}

test('会話で小問を入れ替え、本文の順に並べ直す', async ({ page }) => {
  await openSample(page)
  const stems = sectionPage(page, '走れメロス').locator('.stem')
  await page.route('/api/chat', reply({ kind: 'reorderQuestions', sectionId: 'meros', order: ['q1', 'q3', 'q2', 'q4'] }))
  await send(page, '【三】の問二と問三を入れ替えて')
  await expect(stems.nth(1)).toContainText('問二　傍線部③「メロスには政治がわからぬ」')

  await page.unroute('/api/chat')
  await page.route('/api/chat', reply({ kind: 'sortQuestions', sectionId: 'meros' }))
  await send(page, '【三】を本文の順に並べて')
  await expect(stems.nth(1)).toContainText('問二　傍線部②「邪智暴虐」')
})

test('会話で小問を足してもらうと、案が並び、押した案が入る', async ({ page }) => {
  await page.route('/api/chat', reply({ kind: 'addQuestion', sectionId: 'meros', afterQuestionId: 'q1' }))
  await page.route('/api/draft-question', fakeIdeas(3))
  await openSample(page)
  await send(page, '【三】の問一の後ろに小問を足して')
  await expect(chat(page).getByRole('region', { name: '小問の案' }).getByRole('listitem')).toHaveCount(3)
  await chat(page).getByRole('button', { name: '案2を入れる' }).click()
  const stems = sectionPage(page, '走れメロス').locator('.stem')
  await expect(stems).toHaveCount(5)
  await expect(stems.nth(1)).toContainText('問二　案2の問い文。')
  await expect(chat(page).getByRole('button', { name: '案1を入れる' })).toBeDisabled()
})

test('漢文の小問にも AI に頼むボタンが出て、AI のおすすめから小問を足せる', async ({ page }) => {
  await page.route('/api/draft-question', fakeIdeas(3))
  await openSample(page)
  await sectionPage(page, '春暁').locator('.blk').filter({ hasText: '問三' }).first().click()
  await expect(chat(page).getByRole('button', { name: 'もう少し易しく' })).toBeVisible()

  await page.getByRole('button', { name: '【五】の問五として小問を追加' }).click()
  await page.getByRole('button', { name: 'AI のおすすめから選ぶ' }).click()
  await page.getByRole('button', { name: '案1を入れる' }).click()
  await expect(sectionPage(page, '春暁').locator('.stem')).toHaveCount(5)
})

test('大問を作ると「こう伝えてみる」が出て、押すと入力欄に入る（送らない）', async ({ page }) => {
  let chats = 0
  await page.route('/api/chat', route => { chats++; return reply({ kind: 'none' })(route) })
  await page.route('/api/draft-section', route => route.fulfill({ json: { ...drafted, suggestions: ['授業ではメロスの人物像に力を入れました。人物像は記述で聞きたいです。'] } }))
  await openSample(page)
  await page.locator('.page .sec-h').nth(2).click()
  await chat(page).getByRole('button', { name: 'AIに作り直してもらう' }).click()
  const sugs = chat(page).getByRole('group', { name: 'こう伝えてみる' })
  await sugs.getByRole('button').click()
  await expect(chat(page).getByLabel('AIへの相談')).toHaveValue('授業ではメロスの人物像に力を入れました。人物像は記述で聞きたいです。')
  expect(chats).toBe(0)
  await chat(page).getByRole('button', { name: '送信' }).click()
  await expect(sugs).toHaveCount(0)
})
