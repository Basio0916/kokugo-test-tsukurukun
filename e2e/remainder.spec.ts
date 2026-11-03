import { expect, test, type Page } from '@playwright/test'

/* モックとの残りの差: 変換中の Enter、背景で閉じる、選択肢の数、試験時間の知らせ、タッチの端末、動きを減らす設定 */

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })
const q2 = (page: Page) => page.locator('.page .blk[data-target="meros/q2"]')

test('日本語を変換している途中の ⌘ / Ctrl + Enter では送らない', async ({ page }) => {
  const requests: unknown[] = []
  await page.route('/api/chat', async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ json: { ok: true, reply: 'はい。', notes: [], change: { kind: 'none' } } })
  })
  await openSample(page)
  const input = chat(page).getByLabel('AIへの相談')
  await input.fill('記述問題を入れるならどこ')
  await input.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, metaKey: true, isComposing: true, bubbles: true })
  await page.waitForTimeout(300)
  expect(requests).toHaveLength(0)
  await input.press('ControlOrMeta+Enter')
  await expect(chat(page)).toContainText('はい。')
  expect(requests).toHaveLength(1)
})

test('ポップアップの外を押すと閉じる。欄の文字を選びながら外へ出ても閉じない', async ({ page }) => {
  await openSample(page)
  await q2(page).dblclick()
  const dialog = page.getByRole('dialog', { name: '【三】問二を直す' })
  await expect(dialog).toBeVisible()

  // 問い文の欄で選び始め、ポップアップの外で離す
  const stem = dialog.getByLabel('問い文')
  const box = (await stem.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(5, 5, { steps: 5 })
  await page.mouse.up()
  await expect(dialog).toBeVisible()

  await page.mouse.click(5, 5)
  await expect(dialog).toBeHidden()
})

test('選択肢の数を変えると正答の記号を確かめるよう示し、範囲の外の正答はアに戻す', async ({ page }) => {
  await openSample(page)
  await q2(page).dblclick()
  const dialog = page.getByRole('dialog', { name: '【三】問二を直す' })
  await expect(dialog.getByLabel('正答')).toHaveValue('1')
  const choices = (await dialog.getByLabel('選択肢').inputValue()).split('\n')
  await dialog.getByLabel('選択肢').fill(choices[0])
  await expect(dialog.getByRole('status')).toContainText('正答の記号を確かめてください')
  await expect(dialog.getByLabel('正答')).toHaveValue('0')
})

test('試験時間を四十五分より短くすると、時間が足りないかもしれないと知らせる', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'テストの情報を変える' }).click()
  const dialog = page.getByRole('dialog', { name: 'テストの情報を変える' })
  await dialog.getByLabel('試験時間').fill('40')
  await dialog.getByRole('button', { name: 'この情報にする' }).click()
  await expect(chat(page)).toContainText('試験時間を40分にしました。今の問題の量だと、時間が足りないかもしれません。')
})

test('動きを減らす設定では、切り替えの動きがない。マウスの端末では「＋ 小問を追加」は乗せたときだけ見える', async ({ page }) => {
  await openSample(page)
  const add = page.getByRole('button', { name: '【三】の問二として小問を追加' })
  await expect(add).toHaveCSS('opacity', '0')
  // 紙面の操作のボタンは、マウスを乗せると少しずつ現れる
  const tools = page.getByRole('group', { name: '【三】問二の操作' })
  await expect(tools).not.toHaveCSS('transition-duration', '0s')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(tools).toHaveCSS('transition-duration', '0s')
})

test.describe('タッチの端末', () => {
  test.use({ hasTouch: true })

  test('「＋ 小問を追加」がいつも薄く見える', async ({ page }) => {
    await openSample(page)
    const add = page.getByRole('button', { name: '【三】の問二として小問を追加' })
    await expect(add).toHaveCSS('opacity', '1')
    await expect(add).toHaveCSS('color', 'rgba(47, 95, 179, 0.5)')
  })
})
