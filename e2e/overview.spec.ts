import { expect, test, type Page } from '@playwright/test'

/* 作り始めの画面の骨組みと指導目標、テストの情報の変更と会話の知らせ、狭い画面の切り替え */

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })

async function openSample(page: Page) {
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

async function changeInfo(page: Page, fill: (dialog: ReturnType<Page['getByRole']>) => Promise<unknown>) {
  await page.getByRole('button', { name: 'テストの情報を変える' }).click()
  const dialog = page.getByRole('dialog', { name: 'テストの情報を変える' })
  await fill(dialog)
  await dialog.getByRole('button', { name: 'この情報にする' }).click()
}

test('作り始めの画面で、時数と記号、できあがる骨組み、この範囲の指導目標、出典が見える', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('二年').check()
  await expect(page.getByLabel('教科書')).toHaveValue('mitsumura')
  await expect(page.locator('.start-materials li').filter({ hasText: '走れメロス' })).toContainText('8時間・(1)エ・C(1)イ・C(1)オ・B(1)ウ・(1)ウ')
  const side = page.getByRole('complementary', { name: 'できあがる骨組みと指導目標' })
  await expect(side).toContainText('教材を選ぶと、ここに大問が並びます。')

  await page.getByRole('checkbox', { name: /走れメロス/ }).check()
  await expect(side.locator('.start-skeleton li')).toHaveText([/【一】漢字.*漢字・\d+点/, /【二】走れメロス.*文学的文章・\d+点/])
  await expect(side.locator('.start-goals')).toContainText('思考・判断・表現 C(1)イ')
  await expect(side.locator('.start-goals')).toContainText('登場人物の言動の意味')
  await expect(side.getByRole('link', { name: /年間指導計画例/ })).toHaveAttribute('href', 'https://www.mitsumura-tosho.co.jp/kyokasho/c-kokugo/keikaku')
})

test('満点を変えると会話に知らせ、配点をそろえるボタンが出る', async ({ page }) => {
  await openSample(page)
  await changeInfo(page, d => d.getByLabel('満点').fill('50'))
  await expect(chat(page)).toContainText('満点を50点にしました。配点の合計は100点で、満点と合っていません。')
  await chat(page).getByRole('button', { name: '配点を満点にそろえる' }).click()
  await expect(page.locator('.totals')).toContainText('配点の合計 50 点 / 満点 50 点')
})

test('刻みを〇・五点にして半端な配点を作り、一点に戻すと満点にそろえ直す', async ({ page }) => {
  await openSample(page)
  await changeInfo(page, d => d.getByLabel('配点の刻み').selectOption('0.5'))
  await expect(chat(page)).toContainText('配点の刻みを〇・五点にしました。')
  await page.locator('.page').filter({ hasText: '走れメロス' }).locator('.blk').filter({ hasText: '問二' }).first().click()
  await chat(page).getByRole('button', { name: '配点を〇・五点上げる' }).click()
  await expect(page.locator('.totals')).toContainText('100.5')

  await changeInfo(page, d => d.getByLabel('配点の刻み').selectOption('1'))
  await expect(chat(page)).toContainText('配点の刻みを一点にしました。刻みに合わない配点があったので、合計を100点にそろえ直しています。')
  await expect(page.locator('.totals')).toContainText('配点の合計 100 点 / 満点 100 点')
})

test('狭い画面では会話と紙面を切り替え、会話を見ている間に紙面が変わると印が付く', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('/api/chat', route => route.fulfill({ json: { ok: true, reply: '入れ替えました。', notes: [], change: { kind: 'reorderSections', order: ['kanji', 'meros', 'grammar', 'ougi', 'kanshi', 'sakubun'] } } }))
  await page.goto('/?sample=1')
  const toggle = page.getByRole('navigation', { name: '表示の切り替え' })
  await expect(toggle.getByRole('button', { name: '会話' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.page')).toHaveCount(0)

  await chat(page).getByLabel('AIへの相談').fill('大問二と三を入れ替えて')
  await chat(page).getByRole('button', { name: '送信' }).click()
  await expect(chat(page)).toContainText('入れ替えました。')
  await expect(toggle.getByLabel('紙面が変わりました')).toBeVisible()

  await toggle.getByRole('button', { name: /紙面/ }).click()
  await expect(page.locator('.page').first()).toBeVisible()
  await expect(toggle.getByLabel('紙面が変わりました')).toHaveCount(0)
  await expect(chat(page)).toHaveCount(0)
})
