import { expect, test, type Page } from '@playwright/test'

/* 紙面の仕上げ: 確定していない大問を薄く描く、キーボードで選ぶ、上に残る欄、作文の見出し */

async function openSample(page: Page) {
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })

test('確定していない大問の小問は薄く、確定すると普通の濃さ。印刷では薄くしない', async ({ page }) => {
  await openSample(page)
  const q1 = page.locator('.page .blk[data-target="meros/q1"]')
  await expect(q1).toHaveClass(/blk-prop/)
  // 見出しと本文は薄くしない
  await expect(page.locator('.page .blk[data-target="meros"]').first()).not.toHaveClass(/blk-prop/)
  const color = () => q1.evaluate(e => getComputedStyle(e).color)
  const faint = await color()

  await page.emulateMedia({ media: 'print' })
  expect(await color()).not.toBe(faint)
  await page.emulateMedia({ media: 'screen' })

  await page.getByRole('group', { name: '【三】の操作' }).getByRole('button', { name: '確定する' }).click()
  await expect(q1).not.toHaveClass(/blk-prop/)
  await expect(page.locator('.page .blk[data-target="ougi/o1"]')).toHaveClass(/blk-prop/)
})

test('紙面の小問にキーボードで移り、Enter で選ぶ', async ({ page }) => {
  await openSample(page)
  const q2 = page.getByRole('group', { name: '【三】問二を選んで相談する' })
  await q2.focus()
  await page.keyboard.press('Enter')
  await expect(chat(page)).toContainText('選択中：【三】問二')
  await page.getByRole('group', { name: '【四】を選んで相談する' }).focus()
  await page.keyboard.press(' ')
  await expect(chat(page)).toContainText('選択中：【四】')
})

test('紙面を送っても、合計・一覧・タブの欄は上に残る', async ({ page }) => {
  await openSample(page)
  const head = page.locator('.paper-head')
  await page.locator('.page').last().scrollIntoViewIfNeeded()
  const box = await head.boundingBox()
  const column = await page.locator('.paper-head').evaluate(e => e.parentElement!.getBoundingClientRect().top)
  expect(box).not.toBeNull()
  expect(box!.y).toBeLessThanOrEqual(Math.max(column, 0) + 1)
  await expect(page.getByRole('tab', { name: '解答用紙' })).toBeInViewport()
})

test('作文の問は、解答用紙と模範解答で「作文」と書く', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '解答用紙' }).click()
  await expect(page.getByLabel('解答用紙の六', { exact: true })).toContainText('作文')
  await expect(page.getByLabel('解答用紙の六', { exact: true })).not.toContainText('問一')
  await page.getByRole('tab', { name: '模範解答' }).click()
  await expect(page.getByLabel('模範解答・採点基準').getByRole('row').filter({ hasText: '条件に沿って書けている' }).first()).toContainText('作文')
})
