import { expect, test, type Page } from '@playwright/test'
import drafted from './fixtures/draft-meros.json' with { type: 'json' }

/* 大問を AI に作ってもらう流れ。本物の Claude は呼ばず、/api/draft-section を固定の返答に差し替える */

async function openPaper(page: Page) {
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
  await page.waitForTimeout(200)
}

const merosStems = (page: Page) => page.locator('.page').nth(1).locator('.stem').allTextContents()

test('作った小問で大問が置き換わり、理由の一覧が出る', async ({ page }) => {
  // 最後の小問は単元の指導事項にないことにする
  const body = { ...drafted, rationales: drafted.rationales.map((r, i, all) => ({ ...r, inUnit: i < all.length - 1 })) }
  let release: () => void = () => {}
  const answered = new Promise<void>(resolve => { release = resolve })
  await page.route('/api/draft-section', async route => {
    await answered
    await route.fulfill({ json: body })
  })
  await openPaper(page)

  const button = page.getByRole('button', { name: /走れメロスの大問を AI に作ってもらう/ })
  await button.click()
  await expect(page.getByRole('status')).toContainText('作っています')
  await expect(button).toBeDisabled()

  release()
  await expect(page.getByRole('region', { name: /AI の提案の理由/ })).toBeVisible()
  await expect(button).toBeEnabled()
  const stems = await merosStems(page)
  expect(stems).toHaveLength(drafted.section.questions.length)
  expect(stems[0]).toContain('問一')
  await expect(page.locator('.ai-notes li')).toHaveCount(drafted.rationales.length)
  await expect(page.locator('.ai-outside')).toHaveCount(1)
  // 合計は百点のまま、紙面からはみ出さない
  await expect(page.locator('.page').first().locator('.cover')).toContainText('百点満点です')
  const overflowing = await page.$$eval('.page-in', els => els.filter(el => el.scrollWidth > el.clientWidth + 1).length)
  expect(overflowing).toBe(0)

  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.ai-panel')).toBeHidden()
})

test('作れなかったときは理由を出し、紙面は元のまま', async ({ page }) => {
  await page.route('/api/draft-section', route => route.fulfill({ json: { ok: false, errors: ['傍線部A「激怒しました」が本文にない'] } }))
  await openPaper(page)
  const before = await merosStems(page)

  await page.getByRole('button', { name: /走れメロスの大問を AI に作ってもらう/ }).click()
  await expect(page.getByRole('alert')).toContainText('作れませんでした')
  await expect(page.getByRole('alert')).toContainText('激怒しました')
  expect(await merosStems(page)).toEqual(before)
})
