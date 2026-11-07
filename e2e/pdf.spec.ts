import { expect, test, type Page } from '@playwright/test'

/*
 * 開いている紙を PDF で出力する。PDF はブラウザの印刷で作るので、印刷の画面（window.print）は差し替えて
 * 印刷の間のページの題を記録する。印刷で出るものは、page.pdf で実際に PDF を作って確かめる
 */

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.addInitScript(() => {
    const printed: string[] = []
    Object.assign(window, { printed })
    window.print = () => {
      window.dispatchEvent(new Event('beforeprint'))
      printed.push(document.title)
      window.dispatchEvent(new Event('afterprint'))
    }
  })
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const SHEETS = ['問題用紙', '解答用紙', '模範解答つき解答用紙', '模範解答・採点基準']
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: string[] }).printed)

test('ボタンの名前は、開いている紙に合わせて変わる', async ({ page }) => {
  await openSample(page)
  await expect(page.getByText('印刷の画面で「PDFに保存」を選びます')).toBeVisible()
  for (const name of SHEETS) {
    await tab(page, name).click()
    await expect(page.getByRole('button', { name: /をPDFで出力$/ })).toHaveText(`${name}をPDFで出力`)
  }
})

test('押すと印刷の画面を開き、その間だけページの題を「年度　テストの名前　国語　紙の名前」にする', async ({ page }) => {
  await openSample(page)
  const title = await page.title()
  await page.getByRole('button', { name: '問題用紙をPDFで出力' }).click()
  await tab(page, '解答用紙').click()
  await page.getByRole('button', { name: '解答用紙をPDFで出力' }).click()
  expect(await printed(page)).toEqual(['令和八年度　第三学期　学年末テスト　国語　問題用紙', '令和八年度　第三学期　学年末テスト　国語　解答用紙'])
  // 印刷の画面を閉じたら元の題に戻る
  expect(await page.title()).toBe(title)
})

test('ボタンを使わずに印刷を開いても、開いている紙の名前の題になる', async ({ page }) => {
  await openSample(page)
  const title = await page.title()
  await tab(page, '模範解答つき解答用紙').click()
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  expect(await page.title()).toBe('令和八年度　第三学期　学年末テスト　国語　模範解答つき解答用紙')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  expect(await page.title()).toBe(title)
})

// B4 横（364mm × 257mm）をポイントで表した大きさ
const B4 = { width: (364 / 25.4) * 72, height: (257 / 25.4) * 72 }

test('印刷で出るのは開いている紙だけで、紙ごとに B4 横のページになる', async ({ page }, testInfo) => {
  await openSample(page)
  const counts: Record<string, number> = {}
  for (const name of SHEETS) {
    await tab(page, name).click()
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true')
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, path: testInfo.outputPath(`${name}.pdf`) })
    const text = pdf.toString('latin1')
    const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => ({ width: Number(m[1]), height: Number(m[2]) }))
    counts[name] = (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length
    expect(boxes.length).toBe(counts[name])
    // 白紙ではなく、文字が描かれている（字形が埋め込まれている）
    expect(text, `${name}のPDFに文字がない`).toMatch(/\/FontFile\d?\b/)
    for (const box of boxes) {
      expect(Math.abs(box.width - B4.width)).toBeLessThan(1)
      expect(Math.abs(box.height - B4.height)).toBeLessThan(1)
    }
  }
  expect(counts['問題用紙']).toBe(5)
  expect(counts['解答用紙']).toBe(1)
  expect(counts['模範解答つき解答用紙']).toBe(1)
  expect(counts['模範解答・採点基準']).toBeGreaterThanOrEqual(1)
})
