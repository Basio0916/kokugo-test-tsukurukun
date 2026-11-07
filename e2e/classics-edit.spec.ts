import { expect, test, type Page, type Route } from '@playwright/test'

/* 漢詩の白文と古文の本文を直し、外れた返り点・送り仮名とルビを付け直す。本物の Claude は呼ばず API を差し替える */

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })
const kanshiPage = (page: Page) => page.locator('.page').filter({ hasText: '春暁' })
const ougiPage = (page: Page) => page.locator('.page').filter({ hasText: '平家物語' })

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.route('/api/check-passage', route => route.fulfill({ json: { ok: true, issues: [] } }))
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

async function editPassage(page: Page, header: number, edit: (text: string) => string) {
  await page.locator('.page .sec-h').nth(header).click()
  await chat(page).getByRole('button', { name: '本文を直す' }).click()
  const text = page.getByRole('dialog').getByLabel('本文', { exact: true })
  await text.fill(edit(await text.inputValue()))
  await page.getByRole('dialog').getByRole('button', { name: 'この本文にする' }).click()
}

const annotate = (json: object, bodies: unknown[] = []) => (route: Route) => {
  bodies.push(route.request().postDataJSON())
  return route.fulfill({ json: { ok: true, ...json } })
}

test('漢詩の白文を一行一句で開き、一句を直すと、その句だけ返り点と送り仮名が付け直される', async ({ page }) => {
  const bodies: Array<{ kind: string; targets?: number[] }> = []
  await page.route('/api/annotate', annotate({ lines: [{ index: 2, notation: '夜来風雨(ノ)音' }] }, bodies))
  await openSample(page)
  await page.locator('.page .sec-h').nth(4).click()
  await chat(page).getByRole('button', { name: '本文を直す' }).click()
  await expect(page.getByRole('dialog').getByLabel('本文', { exact: true })).toHaveValue('春眠不覚暁\n処処聞啼鳥\n夜来風雨声\n花落知多少')
  await page.getByRole('dialog').getByRole('button', { name: 'やめる' }).click()

  await editPassage(page, 4, t => t.replace('夜来風雨声', '夜来風雨音'))
  await expect(chat(page)).toContainText('直した句の返り点と送り仮名を付け直しました。')
  const lines = kanshiPage(page).locator('.ks-line')
  await expect(lines.nth(2)).toContainText('音')
  await expect(lines.nth(2).locator('.ok')).toHaveText(['ノ'])
  await expect(lines.nth(0).locator('.ok')).toHaveText(['エ', 'ヲ'])
  expect(bodies[0]).toMatchObject({ kind: 'kanbun', targets: [2] })
})

test('漢詩の傍線部の句を直すと、傍線部は残り、参照する小問が要確認になる', async ({ page }) => {
  await page.route('/api/annotate', annotate({ lines: [{ index: 3, notation: '花落(ツルコト)知(ル)何多' }] }))
  await openSample(page)
  await editPassage(page, 4, t => t.replace('花落知多少', '花落知何多'))
  await expect(chat(page).getByRole('region', { name: '【五】要確認の小問' })).toContainText('傍線部①の文字が「花落知多少」から「花落知何多」に変わりました')
  await expect(kanshiPage(page).locator('.mk')).toHaveText(['①'])
})

test('古文の本文を直してルビが外れたら、直した箇所のルビを付け直す', async ({ page }) => {
  const bodies: Array<{ kind: string; lost?: string[] }> = []
  await page.route('/api/annotate', annotate({ ruby: [{ base: '浜辺', reading: 'はまべ' }] }, bodies))
  await openSample(page)
  await editPassage(page, 3, t => t.replace('磯打つ波も', '浜辺打つ波も'))
  await expect(chat(page)).toContainText('直した箇所のルビを付け直しました。')
  await expect(ougiPage(page).locator('.passage rt')).toContainText(['はまべ'])
  await expect(ougiPage(page).locator('.passage rt')).toContainText(['くが'])
  await expect(ougiPage(page).locator('.mk')).toHaveText(['①', '②', '③', '④'])
  expect(bodies[0]).toMatchObject({ kind: 'ruby', lost: ['磯'] })
})

test('付け直している間は、紙面のその大問の見出しと本文のブロックだけに印が付く', async ({ page }) => {
  let release: () => void = () => {}
  const answered = new Promise<void>(resolve => { release = resolve })
  await page.route('/api/annotate', async route => {
    await answered
    await route.fulfill({ json: { ok: true, lines: [{ index: 2, notation: '夜来風雨(ノ)音' }] } })
  })
  await openSample(page)
  await editPassage(page, 4, t => t.replace('夜来風雨声', '夜来風雨音'))
  const busy = page.locator('.page [aria-busy="true"]')
  await expect(busy).toHaveCount(1)
  await expect(busy).toHaveAttribute('data-target', 'kanshi')
  await expect(busy.locator('.blk-ai-badge')).toHaveText('AI が付け直しています')

  release()
  await expect(chat(page)).toContainText('直した句の返り点と送り仮名を付け直しました。')
  await expect(busy).toHaveCount(0)
})
