import { expect, test, type Page, type Route } from '@playwright/test'

/* 会話の案内と大問の一覧。本物の Claude は呼ばず、大問を作る API を差し替える */

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })
const outline = (page: Page) => page.getByRole('navigation', { name: '大問の一覧' })

async function openSample(page: Page) {
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

// 送られた大問に、配点の枠の小問を一つ足して返す
async function fakeDraft(route: Route) {
  const req = route.request().postDataJSON()
  const q = { id: `${req.section.id}-q1`, format: 'short', kanten: 'thinking', standard: 'C(1)イ', points: req.subtotal, answer: '答え', stem: [{ kind: 'text', text: '本文を読んで答えなさい。' }] }
  const section = req.section.kind === 'composition' ? req.section : { ...req.section, questions: [q] }
  await route.fulfill({ json: { ok: true, section, rationales: [{ questionId: section.questions[0].id, rationale: '理由', standard: 'C(1)イ', inUnit: true }] } })
}

test('作り始めから案内に沿って、本文を貼り、確定し、作文を足して、解答用紙へ進む', async ({ page }) => {
  await page.route('/api/draft-section', fakeDraft)
  await page.route('/api/draft-composition', fakeDraft)
  await page.goto('/')
  await page.getByLabel('二年').check()
  await page.getByLabel(/漢字の大問を入れる/).uncheck()
  await page.getByRole('checkbox', { name: /走れメロス/ }).check()
  await page.getByLabel('テストの名前').fill('学年末テスト')
  await page.getByRole('button', { name: 'テストを作る' }).click()

  // 作り始めの案内と、本文欄を開くボタン
  await expect(chat(page).getByRole('region', { name: '骨組みの大問' })).toContainText('【一】走れメロス（100点）')
  await expect(outline(page).getByRole('button', { name: /【一】走れメロス/ })).toContainText('本文待ち')
  await chat(page).getByRole('button', { name: '【一】の本文欄を開く' }).click()
  await page.getByRole('dialog').getByLabel('本文').fill('メロスは激怒した。')
  await page.getByRole('dialog').getByRole('button', { name: /本文を入れて/ }).click()
  await expect(outline(page).getByRole('button', { name: /【一】走れメロス/ })).toContainText('相談中')

  // 確定すると作文を勧める。足すと作文が加わり、合計は満点のまま
  await chat(page).getByRole('button', { name: '【一】を確定する' }).click()
  await expect(chat(page)).toContainText('【一】を確定しました。')
  await expect(outline(page).getByRole('button', { name: /【一】走れメロス/ })).toContainText('確定')
  await chat(page).getByRole('button', { name: '作文の大問を足す' }).click()
  await expect(page.locator('.page .sec-h')).toHaveCount(2)
  await expect(page.locator('.totals')).toContainText('配点の合計 100 点 / 満点 100 点')

  // 作文を確定すると、そろったことと解答用紙へのボタン。作文はもう勧めない
  await chat(page).getByRole('button', { name: '【二】を確定する' }).click()
  await expect(chat(page)).toContainText('これでテスト一式がそろいました。')
  await expect(chat(page).getByRole('button', { name: '作文の大問を足す' })).toHaveCount(1)
  await chat(page).getByRole('button', { name: '解答用紙を見る' }).click()
  await expect(page.getByRole('tab', { name: '解答用紙', exact: true })).toHaveAttribute('aria-selected', 'true')
})

test('紙面で消すと会話に知らせ、元に戻せる。確定した大問を直すと確定が外れたことを知らせる', async ({ page }) => {
  await openSample(page)
  await page.getByRole('group', { name: '【三】の操作' }).getByRole('button', { name: '確定する' }).click()
  await expect(outline(page).getByRole('button', { name: /【三】走れメロス/ })).toContainText('確定')

  await page.getByRole('group', { name: '【三】問二の操作' }).getByRole('button', { name: '削除' }).click()
  await expect(chat(page)).toContainText('【三】問二を削除しました。')
  await expect(chat(page)).toContainText('【三】は確定を外して直しました。')
  await expect(page.locator('.page').filter({ hasText: '走れメロス' }).locator('.stem')).toHaveCount(3)
  await chat(page).getByRole('button', { name: '元に戻す' }).click()
  await expect(page.locator('.page').filter({ hasText: '走れメロス' }).locator('.stem')).toHaveCount(4)
  await chat(page).getByRole('button', { name: '【三】を確定する' }).last().click()
  await expect(outline(page).getByRole('button', { name: /【三】走れメロス/ })).toContainText('確定')

  await page.getByRole('group', { name: '【一】の操作' }).getByRole('button', { name: '削除' }).click()
  await expect(page.locator('.page .sec-h')).toHaveCount(5)
  await chat(page).getByRole('button', { name: '元に戻す' }).last().click()
  await expect(page.locator('.page .sec-h')).toHaveCount(6)
})

test('小問を動かして傍線部の順とずれると知らせる。配点をそろえても確定は外れない', async ({ page }) => {
  await openSample(page)
  await page.getByRole('group', { name: '【三】問一の操作' }).getByRole('button', { name: '下へ' }).click()
  await expect(chat(page)).toContainText('【三】問一を【三】問二に移しました。')
  await expect(chat(page).getByRole('region', { name: '気づいたこと' }).last()).toContainText('傍線部の順と問の順がそろっていません')

  await page.getByRole('group', { name: '【四】の操作' }).getByRole('button', { name: '確定する' }).click()
  await page.getByRole('button', { name: '配点を満点にそろえる' }).first().click()
  await expect(outline(page).getByRole('button', { name: /【四】/ })).toContainText('確定')
})

test('一覧から大問へ移り、小問のダブルクリックで直す', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  await outline(page).getByRole('button', { name: /【四】/ }).click()
  await expect(page.getByRole('tab', { name: '問題用紙', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(chat(page)).toContainText('選択中：【四】')

  await page.locator('.page').filter({ hasText: '走れメロス' }).locator('.blk').filter({ hasText: '問二' }).first().dblclick()
  await expect(page.getByRole('dialog', { name: '【三】問二を直す' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'やめる' }).click()
})
