import { expect, test, type Page } from '@playwright/test'

// 明朝体の読み込みと、読み込み後の割り付け直しが終わるのを待つ
async function openPaper(page: Page, path = '/?sample=1') {
  await page.goto(path)
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
  await page.waitForTimeout(200)
}

async function overflowingPages(page: Page) {
  return page.$$eval('.page-in', els => els.map((el, i) => (el.scrollWidth > el.clientWidth + 1 ? i + 1 : 0)).filter(Boolean))
}

test('サンプルの全ページが表示され、文字がはみ出さない', async ({ page }) => {
  await openPaper(page)
  await expect(page.locator('.page')).toHaveCount(5)
  expect(await overflowingPages(page)).toEqual([])
  const cover = page.locator('.page').first().locator('.cover')
  await expect(cover).toContainText('時間　五十分')
  await expect(cover).toContainText('百点満点です')
  await expect(page.locator('.page').last()).toContainText('問題は以上です')
})

test('問い文の傍線部の番号が、本文の傍線部の番号と一致する', async ({ page }) => {
  await openPaper(page)
  const mismatches = await page.$$eval('.page', pages => pages.flatMap((p, i) => {
    const drawn = new Set([...p.querySelectorAll('.mk')].map(m => m.textContent))
    const referred = [...p.querySelectorAll('.stem')].flatMap(s => [...(s.textContent ?? '').matchAll(/傍線部([①-⑨])/g)].map(m => m[1]))
    return referred.filter(n => !drawn.has(n)).map(n => `${i + 1}ページ: ${n}`)
  }))
  expect(mismatches).toEqual([])
  const meros = page.locator('.page').nth(1)
  await expect(meros.locator('.mk')).toHaveText(['①', '②', '③'])
  await expect(meros.locator('.stem').nth(2)).toContainText('傍線部③「メロスには政治がわからぬ」')
})

test('一枚に収まらない小問は次のページへ送られる', async ({ page }) => {
  await openPaper(page, '/?sample=long')
  expect(await overflowingPages(page)).toEqual([])
  // 走れメロスの十二問が、二枚目から三枚目にまたがる
  const second = await page.locator('.page').nth(1).locator('.stem').count()
  const third = await page.locator('.page').nth(2).locator('.stem').count()
  expect(second).toBeGreaterThan(0)
  expect(second + third).toBe(12)
  await expect(page.locator('.page').nth(2).locator('.stem').last()).toContainText('問十二')
})

test('PDF に印刷すると、B4 横の紙が一ページずつ並ぶ', async ({ page }) => {
  await openPaper(page)
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1')
  const sheets = pdf.match(/\/Type\s*\/Page(?!s)/g) ?? []
  expect(sheets).toHaveLength(5)
  const box = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)
  // PDF の紙の大きさはポイント単位で、端数が丸められる
  expect(Math.abs(Number(box![1]) - (364 / 25.4) * 72)).toBeLessThan(1.5)
  expect(Math.abs(Number(box![2]) - (257 / 25.4) * 72)).toBeLessThan(1.5)
})

test('印刷では操作部分が消え、紙面が B4 横の実寸で並ぶ', async ({ page }) => {
  await openPaper(page)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.app-bar')).toBeHidden()
  const box = await page.locator('.page').first().boundingBox()
  const mm = 96 / 25.4
  expect(box!.width).toBeCloseTo(364 * mm, 0)
  expect(box!.height).toBeCloseTo(257 * mm, 0)
  expect(await page.locator('.page').first().evaluate(el => getComputedStyle(el).transform)).toBe('none')
})
