import { expect, test, type Page } from '@playwright/test'

/* 紙面の上での編集。サンプルのテストで、大問・小問の操作、確定、満点の変更とそろえ直しを確かめる */

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const headers = (page: Page) => page.locator('.page .sec-h')
const tools = (page: Page, name: string) => page.getByRole('group', { name: `${name}の操作` })
const merosPage = (page: Page) => page.locator('.page').filter({ hasText: '走れメロス' })

test('大問を上へ動かし、削除する', async ({ page }) => {
  await openSample(page)
  await expect(headers(page).nth(2)).toContainText('次の文章を読んで')
  await tools(page, '【三】').getByRole('button', { name: '上へ' }).click()
  await expect(headers(page).nth(1)).toContainText('【二】　次の文章を読んで')

  await tools(page, '【一】').getByRole('button', { name: '削除' }).click()
  await expect(headers(page)).toHaveCount(5)
  await expect(headers(page).first()).toContainText('【一】　次の文章を読んで')
})

test('小問を削除すると、問と傍線部の番号が振り直る', async ({ page }) => {
  await openSample(page)
  await expect(merosPage(page).locator('.mk')).toHaveText(['①', '②', '③'])
  await tools(page, '【三】問二').getByRole('button', { name: '削除' }).click()
  await expect(merosPage(page).locator('.mk')).toHaveText(['①', '②'])
  await expect(merosPage(page).locator('.stem').nth(1)).toContainText('問二　傍線部②「メロスには政治がわからぬ」')
})

test('小問を直す。本文にない番号の印は直せない', async ({ page }) => {
  await openSample(page)
  await tools(page, '【三】問二').getByRole('button', { name: '直す' }).click()
  const dialog = page.getByRole('dialog', { name: '【三】問二を直す' })
  const stem = dialog.getByLabel('問い文')
  await expect(stem).toHaveValue(/^\{傍線部②\}「邪智暴虐」の意味として最も適切なもの/)

  await stem.fill('{傍線部⑨}「邪智暴虐」の意味として最も適当なものを、次の{ア〜エ}から一つ選び、記号で答えなさい。')
  await dialog.getByRole('button', { name: 'この内容で直す' }).click()
  await expect(dialog.getByRole('alert')).toContainText('{傍線部⑨}')

  await stem.fill('{傍線部②}「邪智暴虐」の意味として最も適当なものを、次の{ア〜エ}から一つ選び、記号で答えなさい。')
  await dialog.getByRole('button', { name: 'この内容で直す' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(merosPage(page).locator('.stem').nth(1)).toContainText('問二　傍線部②「邪智暴虐」の意味として最も適当なものを、次のア〜エから')
})

test('見出しのダブルクリックで指示文を直す', async ({ page }) => {
  await openSample(page)
  await headers(page).nth(2).dblclick()
  const dialog = page.getByRole('dialog', { name: '【三】の指示文を直す' })
  await dialog.getByLabel('指示文').fill('次の文章を読んで、後の問いに答えなさい。')
  await dialog.getByRole('button', { name: 'この指示文にする' }).click()
  await expect(headers(page).nth(2)).toContainText('【三】　次の文章を読んで、後の問いに答えなさい。')
})

test('確定した大問を直すと確定が外れる', async ({ page }) => {
  await openSample(page)
  await tools(page, '【三】').getByRole('button', { name: '確定する' }).click()
  await expect(tools(page, '【三】')).toContainText('確定')
  await tools(page, '【三】問一').getByRole('button', { name: '下へ' }).click()
  await expect(tools(page, '【三】').getByRole('button', { name: '確定する' })).toBeVisible()
})

test('満点を変えて、配点を満点にそろえる', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'テストの情報を変える' }).click()
  const dialog = page.getByRole('dialog', { name: 'テストの情報を変える' })
  await dialog.getByLabel('満点').fill('50')
  await dialog.getByRole('button', { name: 'この情報にする' }).click()
  await expect(page.locator('.totals')).toContainText('満点と合っていません')
  // 合計の欄のボタン（会話にも同じボタンが出る）
  await page.locator('.totals').getByRole('button', { name: '配点を満点にそろえる' }).click()
  await expect(page.locator('.totals')).toContainText('配点の合計 50 点 / 満点 50 点')
  await expect(page.locator('.page').first().locator('.cover')).toContainText('五十点満点です')
})

test('大問を追加すると、最後に空の大問が加わる。印刷には操作が出ない', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: '＋ 大問を追加' }).click()
  const dialog = page.getByRole('dialog', { name: '大問を追加する' })
  await dialog.getByLabel('1月　走れメロス').check()
  await dialog.getByRole('button', { name: 'この大問を加える' }).click()
  await expect(headers(page)).toHaveCount(7)
  await expect(headers(page).last()).toContainText('【七】　次の文章を読んで、あとの問いに答えなさい。（十点）')
  await expect(page.locator('.page .passage-slot')).toHaveCount(1)

  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.page .blk-tools').first()).toBeHidden()
  await expect(page.locator('.totals')).toBeHidden()
})
