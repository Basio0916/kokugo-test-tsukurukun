import { expect, test, type Page, type Route } from '@playwright/test'

/* 古文・漢文の大問。本物の Claude は呼ばず、/api/draft-classical・/api/draft-kanbun・/api/chat を差し替える */

type Body = { material: string; wish?: string; section: { id: string; passage: Record<string, unknown> } }

async function start(page: Page, material: RegExp) {
  page.on('dialog', d => d.accept())
  await page.goto('/')
  await page.getByLabel('二年').check()
  await page.getByLabel(/漢字の大問を入れる/).uncheck()
  await page.getByRole('checkbox', { name: material }).check()
  await page.getByLabel('テストの名前').fill('後期期末テスト')
  await page.getByRole('button', { name: 'テストを作る' }).click()
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

// 送られた大問に、短答の小問を一つ足して返す（edit で本文を変えられる）
function fakeDraft(requests: Body[], edit: (section: Body['section']) => Body['section'] = s => s) {
  return async (route: Route) => {
    const req = route.request().postDataJSON()
    requests.push(req)
    const question = { id: `${req.section.id}-q1`, format: 'short', kanten: 'knowledge', standard: '(3)ア', points: req.subtotal, answer: '答え', stem: [{ kind: 'text', text: '本文について答えなさい。' }] }
    await route.fulfill({ json: { ok: true, section: { ...edit(req.section), questions: [question] }, rationales: [{ questionId: question.id, rationale: '理由', standard: '(3)ア', inUnit: true }] } })
  }
}

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })

test('古文の本文を貼ると、出典が作品名になり、古文の作り方で大問ができる', async ({ page }) => {
  const requests: Body[] = []
  await page.route('/api/draft-classical', fakeDraft(requests, s => ({ ...s, passage: { ...s.passage, segments: [{ kind: 'text', text: 'ころは二月十八日の' }, { kind: 'ruby', base: '酉', reading: 'とり' }, { kind: 'text', text: 'の刻ばかりのことなるに' }] } })))
  await start(page, /扇の的/)
  await expect(page.locator('.page .sec-h')).toContainText(['次の古文を読んで、あとの問いに答えなさい。'])
  await page.locator('.page .passage-slot').click()
  await page.getByRole('dialog').getByLabel('本文').fill('ころは二月十八日の酉の刻ばかりのことなるに')
  await page.getByRole('dialog').getByRole('button', { name: /本文を入れて/ }).click()

  await expect(page.locator('.page .passage .src')).toHaveText('（「平家物語」より）')
  await expect(page.locator('.page .passage rt')).toHaveText('とり')
  await expect(page.locator('.page .stem')).toHaveCount(1)
  expect(requests[0].material).toBe('扇の的　――「平家物語」から')
})

test('漢文の白文を貼ると句が描かれ、漢文の作り方で返り点と送り仮名の付いた大問ができる', async ({ page }) => {
  const requests: Body[] = []
  await page.route('/api/draft-kanbun', fakeDraft(requests, s => {
    const lines = (s.passage.lines as Array<Array<{ char: string }>>).map((l, i) => (i === 0 ? l.map(c => ({ ...c, ...(c.char === '覚' && { okurigana: 'エ', kaeriten: 'レ' }), ...(c.char === '不' && { kaeriten: 'レ' }), ...(c.char === '暁' && { okurigana: 'ヲ' }) })) : l))
    return { ...s, passage: { ...s.passage, lines } }
  }))
  await start(page, /漢詩の風景/)
  await page.locator('.page .passage-slot').click()
  const dialog = page.getByRole('dialog', { name: '「漢詩の風景」の白文を貼り付ける' })
  await dialog.getByRole('button', { name: /白文を入れて/ }).click()
  await expect(dialog.getByRole('alert')).toContainText('題を入れてください')
  await dialog.getByLabel('題').fill('春暁')
  await dialog.getByLabel('作者').fill('孟浩然')
  await dialog.getByLabel('白文').fill('春眠不覚暁\n処処聞啼鳥\n夜来風雨声\n花落知多少')
  await dialog.getByLabel('語注').fill('＊啼鳥……鳴いている鳥。')
  await dialog.getByRole('button', { name: /白文を入れて/ }).click()

  await expect(page.locator('.page .ks-line')).toHaveCount(4)
  await expect(page.locator('.page .ks-title')).toContainText('春暁')
  await expect(page.locator('.page .ks-line').first().locator('.ok')).toHaveText(['エ', 'ヲ'])
  await expect(page.locator('.page .ks-notes')).toContainText('＊啼鳥……鳴いている鳥。')
  expect(requests[0].material).toBe('漢詩の風景')
})

test('漢文の返り点と送り仮名を記法で直す。白文の字は変えられない', async ({ page }) => {
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
  await page.locator('.page .sec-h').nth(4).click()
  await chat(page).getByRole('button', { name: '返り点と送り仮名を直す' }).click()
  const dialog = page.getByRole('dialog', { name: '【五】の返り点と送り仮名を直す' })
  const text = dialog.getByLabel('返り点と送り仮名')
  await expect(text).toHaveValue(/^春眠不\[レ\]覚\(エ\)\[レ\]暁\(ヲ\)\n/)

  await text.fill((await text.inputValue()).replace('春眠', '夏眠'))
  await dialog.getByRole('button', { name: 'この返り点と送り仮名にする' }).click()
  await expect(dialog.getByRole('alert')).toContainText('白文の字を一字も変えず')

  await text.fill((await text.inputValue()).replace('夏眠', '春眠').replace('覚(エ)', '覚(ユ)'))
  await dialog.getByRole('button', { name: 'この返り点と送り仮名にする' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.page .ks-line').first().locator('.ok').first()).toHaveText('ユ')
  // 傍線部は同じ字に付いたまま
  await expect(page.locator('.page .kanshi .mk')).toHaveText(['①'])
  await expect(chat(page).getByRole('button', { name: '元に戻す' })).toBeEnabled()
})

test('会話で漢文の大問の作り直しを頼むと、漢文の作り方で希望を添えて作る', async ({ page }) => {
  const requests: Body[] = []
  await page.route('/api/chat', route => route.fulfill({ json: { ok: true, reply: '書き下し文の問いを増やして作り直します。', notes: [], change: { kind: 'redraftSection', sectionId: 'kanshi', wish: '書き下し文の問いを増やす' } } }))
  await page.route('/api/draft-kanbun', fakeDraft(requests))
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
  await page.locator('.page .sec-h').nth(4).click()
  await chat(page).getByLabel('AIへの相談').fill('書き下し文の問いを増やして作り直して')
  await chat(page).getByRole('button', { name: '送信' }).click()
  await expect(chat(page).getByRole('region', { name: '【五】漢詩の風景 AI の提案の理由' })).toBeVisible()
  expect(requests[0]).toMatchObject({ material: '漢詩の風景', wish: '書き下し文の問いを増やす' })
})
