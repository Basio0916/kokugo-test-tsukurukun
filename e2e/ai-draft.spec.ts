import { expect, test, type Page } from '@playwright/test'
import drafted from './fixtures/draft-meros.json' with { type: 'json' }

/* 大問を AI に作ってもらう流れ。本物の Claude は呼ばず、/api/draft-section を固定の返答に差し替える */

async function openPaper(page: Page) {
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
  await page.waitForTimeout(200)
}

const merosStems = (page: Page) => page.locator('.page').nth(1).locator('.stem').allTextContents()
const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })

// 走れメロスの大問の見出しをクリックして選び、会話のボタンで作り直してもらう
async function redraftMeros(page: Page) {
  await page.locator('.page .sec-h').nth(2).click()
  await chat(page).getByRole('button', { name: 'AIに作り直してもらう' }).click()
}

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

  await redraftMeros(page)
  const button = chat(page).getByRole('button', { name: 'AIに作り直してもらう' })
  await expect(chat(page).getByRole('status')).toContainText('【三】走れメロスの大問を作っています')
  await expect(button).toBeDisabled()

  release()
  await expect(chat(page).getByRole('region', { name: '【三】走れメロス AI の提案の理由' })).toBeVisible()
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

  // 確定するボタンで確定し、そのメッセージのボタンは押せなくなる
  await chat(page).getByRole('button', { name: '【三】を確定する' }).click()
  await expect(page.getByRole('group', { name: '【三】の操作' })).toContainText('確定')
  await expect(chat(page).getByRole('button', { name: '元に戻す' })).toBeDisabled()

  await page.emulateMedia({ media: 'print' })
  await expect(chat(page)).toBeHidden()
})

test('作れなかったときは理由を出し、紙面は元のまま。もう一度頼める', async ({ page }) => {
  let requests = 0
  await page.route('/api/draft-section', route => {
    requests++
    return route.fulfill({ json: { ok: false, errors: ['傍線部A「激怒しました」が本文にない'] } })
  })
  await openPaper(page)
  const before = await merosStems(page)

  await redraftMeros(page)
  await expect(chat(page).getByRole('alert')).toContainText('作れませんでした')
  await expect(chat(page).getByRole('alert')).toContainText('激怒しました')
  expect(await merosStems(page)).toEqual(before)

  await chat(page).getByRole('button', { name: 'もう一度作ってもらう' }).click()
  await expect(chat(page).getByRole('alert')).toHaveCount(2)
  expect(requests).toBe(2)
})
