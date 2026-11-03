import { expect, test, type Page, type Route } from '@playwright/test'

/* テストの作り始めから、本文を貼って大問ができるまで。本物の Claude は呼ばず、/api/draft-section を差し替える */

// 送られた大問の配点の枠どおりに、傍線部のない二問を返す
async function fakeDraft(route: Route) {
  const req = route.request().postDataJSON()
  const half = req.subtotal / 2
  const q = (n: number) => ({
    id: `${req.section.id}-q${n}`, format: 'short', kanten: 'thinking', standard: 'C(1)イ', points: half, answer: '答え',
    stem: [{ kind: 'text', text: `本文を読んで答えなさい（${n}）。` }],
  })
  await route.fulfill({
    json: {
      ok: true,
      section: { ...req.section, questions: [q(1), q(2)] },
      rationales: [1, 2].map(n => ({ questionId: `${req.section.id}-q${n}`, rationale: `理由${n}`, standard: 'C(1)イ', inUnit: true })),
    },
  })
}

async function startTest(page: Page) {
  await page.goto('/')
  await page.getByLabel('二年').check()
  await page.getByRole('checkbox', { name: /アイスプラネット/ }).check()
  await page.getByRole('checkbox', { name: /走れメロス/ }).check()
  await page.getByLabel('テストの名前').fill('前期中間テスト')
  await page.getByLabel('満点').fill('50')
  await page.getByLabel('試験時間').fill('45')
  await page.getByRole('button', { name: 'テストを作る' }).click()
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

test('教材を選ばないとテストは作られない', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('テストの名前').fill('前期中間テスト')
  await page.getByRole('button', { name: 'テストを作る' }).click()
  await expect(page.getByRole('alert')).toContainText('教材を選んでください')
  await expect(page.locator('.page')).toHaveCount(0)
})

test('古文・漢文の教材は選べない', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('checkbox', { name: /扇の的/ })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: /漢詩の風景/ })).toBeDisabled()
})

test('選んだ教材の骨組みができ、本文を貼ると大問ができる', async ({ page }) => {
  await page.route('/api/draft-section', fakeDraft)
  await startTest(page)

  const cover = page.locator('.page').first().locator('.cover')
  await expect(cover).toContainText('前期中間テスト')
  await expect(cover).toContainText('時間　四十五分')
  await expect(cover).toContainText('五十点満点です')
  // 配点の枠は二十五点ずつ。本文欄が二つ
  await expect(page.locator('.page .sec-h')).toHaveText([/【一】.*（二十五点）/, /【二】.*（二十五点）/])
  await expect(page.locator('.page .passage-slot')).toHaveCount(2)

  await page.locator('.page .passage-slot').nth(1).click()
  const dialog = page.getByRole('dialog', { name: /走れメロス/ })
  await dialog.getByLabel('作者名').fill('太宰治')
  await dialog.getByLabel('本文').fill('　メロスは激怒した。\n\n　必ず、かの邪智暴虐の王を除かなければならぬと決意した。\n　メロスには政治がわからぬ。')
  await dialog.getByRole('button', { name: /本文を入れて/ }).click()

  await expect(page.getByRole('region', { name: /【二】走れメロス AI の提案の理由/ })).toBeVisible()
  const second = page.locator('.page').filter({ hasText: '【二】' })
  await expect(second.locator('.passage p:not(.src)')).toHaveCount(3)
  await expect(second.locator('.passage .src')).toHaveText('（太宰治「走れメロス」より）')
  await expect(second.locator('.stem')).toHaveCount(2)
  await expect(second.locator('.sec-h')).toContainText('（二十五点）')
  // 【一】はまだ本文欄のまま
  await expect(page.locator('.page .passage-slot')).toHaveCount(1)
})

test('一枚に収まらない本文は知らせる', async ({ page }) => {
  await page.route('/api/draft-section', fakeDraft)
  await startTest(page)
  await page.locator('.page .passage-slot').first().click()
  await page.getByRole('dialog').getByLabel('本文').fill(Array.from({ length: 80 }, () => '春の野にすみれ摘みにと来しわれぞ野をなつかしみ一夜寝にける。').join('\n'))
  await page.getByRole('dialog').getByRole('button', { name: /本文を入れて/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: '一枚に収まりません' })).toBeVisible()
})

test('作り始めからサンプルを開ける', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'サンプルを見る' }).click()
  await expect(page.locator('.page')).toHaveCount(5)
})
