import { expect, test, type Page } from '@playwright/test'

/* 解答用紙と模範解答・採点基準。問題用紙と同じテストのデータから描かれ、連動する */

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const sheetSection = (page: Page, label: string) => page.getByLabel(`解答用紙の${label}`, { exact: true })
const questionHeads = (page: Page, label: string) => sheetSection(page, label).locator('.sheet-question')

test('タブで解答用紙に切り替えると、問題用紙は消え、大問ごとの小問の見出しがそろう', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '解答用紙' }).click()
  await expect(page.getByRole('tab', { name: '解答用紙' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.page')).toHaveCount(1)
  await expect(page.getByLabel('解答用紙', { exact: true })).toContainText('令和八年度　第三学期　学年末テスト　国語')
  await expect(page.locator('.sheet-sec-h')).toHaveText(['一', '二', '三', '四', '五', '六'])
  expect(new Set(await questionHeads(page, '三').allTextContents())).toEqual(new Set(['問一', '問二', '問三', '問四']))
  await expect(page.getByLabel('観点別の合計')).toContainText('／60')
  await expect(page.getByLabel('観点別の合計')).toContainText('／100')

  await page.getByRole('tab', { name: '問題用紙' }).click()
  await expect(page.locator('.page')).toHaveCount(5)
})

test('問題用紙で小問を消すと、解答用紙と模範解答も変わる', async ({ page }) => {
  await openSample(page)
  await page.getByRole('group', { name: '【三】問二の操作' }).getByRole('button', { name: '削除' }).click()
  await page.getByRole('tab', { name: '解答用紙' }).click()
  expect(new Set(await questionHeads(page, '三').allTextContents())).toEqual(new Set(['問一', '問二', '問三']))
  await expect(sheetSection(page, '三').locator('.sheet-scores')).toContainText('／20')

  await page.getByRole('tab', { name: '模範解答・採点基準' }).click()
  const meros = page.locator('.key tbody tr')
  await expect(meros.filter({ hasText: '政治のことはわからない村の牧人' }).locator('td').first()).toHaveText('問二')
})

test('模範解答・採点基準の表。配点を上げると配点と合計が変わる', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '模範解答・採点基準' }).click()
  // 【三】問二（正答イ・知識・技能 (1)エ）の行
  const q2 = page.locator('.key tbody tr').filter({ hasText: /^問二イ.点知識・技能\(1\)エ/ })
  await expect(q2.locator('td')).toHaveText(['問二', 'イ', '四点', /知識・技能\s*\(1\)エ/, '記号が合っていれば正答'])
  await expect(page.locator('.key tbody tr').filter({ hasText: 'ゆりすえ' }).locator('td').nth(1)).toHaveText('② ゆりすえ　③ ただよえ')

  // 会話のボタンで配点を上げる（問題用紙で問二を選ぶ）
  await page.getByRole('tab', { name: '問題用紙' }).click()
  await page.locator('.page').filter({ hasText: '走れメロス' }).locator('.blk').filter({ hasText: '問二' }).first().click()
  await page.getByRole('button', { name: '配点を一点上げる' }).click()
  await page.getByRole('tab', { name: '模範解答・採点基準' }).click()
  await expect(q2.locator('td').nth(2)).toHaveText('五点')
  await expect(page.locator('.key tfoot')).toContainText('知識・技能 61点　／　思考・判断・表現 40点　／　合計 101点（満点 100点）')
})

test('解答用紙を印刷すると、その一枚だけが出る', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '解答用紙' }).click()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.sheet-tabs')).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'AIと相談' })).toBeHidden()
  await expect(page.locator('.page')).toHaveCount(1)
  await expect(page.locator('.page.sheet')).toBeVisible()
})
