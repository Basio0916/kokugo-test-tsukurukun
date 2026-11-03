import { expect, test, type Page, type Route } from '@playwright/test'

/* AI との会話。本物の Claude は呼ばず、/api/chat を差し替える */

type Section = { id: string; questions: Array<{ id: string; choices?: string[] }> }
type ChatBody = { test: { sections: Section[] }; selection?: { sectionId: string; questionId?: string }; history: unknown[]; message: string }

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })
const merosPage = (page: Page) => page.locator('.page').filter({ hasText: '走れメロス' })
const q2 = (page: Page) => merosPage(page).locator('.blk').filter({ hasText: '問二' }).first()
const headers = (page: Page) => page.locator('.page .sec-h')

// 問二の選択肢を易しくした大問を返す
function easierQ2(requests: ChatBody[] = [], wait?: Promise<void>) {
  return async (route: Route) => {
    const body: ChatBody = route.request().postDataJSON()
    requests.push(body)
    await wait
    const meros = body.test.sections.find(s => s.id === 'meros')!
    const section = { ...meros, questions: meros.questions.map(q => (q.id === 'q2' ? { ...q, choices: ['良い王のこと。', '悪知恵がはたらき、乱暴で残虐なこと。', '晴れた日のこと。', '走るのが速いこと。'] } : q)) }
    await route.fulfill({ json: { ok: true, reply: '問二の選択肢を易しくしました。', notes: ['正答はイのままです'], change: { kind: 'reviseQuestion', sectionId: 'meros', questionId: 'q2', section } } })
  }
}

const answer = (json: object) => (route: Route) => route.fulfill({ json: { ok: true, notes: [], ...json } })

test('問二を選ぶと選択中が出て、頼み方のボタンが並ぶ。選択は外せる', async ({ page }) => {
  await openSample(page)
  await expect(chat(page)).toContainText('紙面の本文欄に教材の本文を貼ると')
  await q2(page).click()
  await expect(chat(page)).toContainText('選択中：【三】問二')
  await expect(page.locator('.page .blk-selected')).toHaveCount(1)
  await expect(chat(page).getByRole('group', { name: '【三】問二について頼む' }).getByRole('button'))
    .toHaveText(['もう少し易しく', '選択肢を五つに', '記述問題にする', 'AIに作り直してもらう', 'この後ろに小問を足す', '配点を一点上げる', '配点を一点下げる'])
  await chat(page).getByRole('button', { name: '選択を外す' }).click()
  await expect(page.locator('.page .blk-selected')).toHaveCount(0)
  await expect(chat(page)).toContainText('紙面の大問や小問をクリックすると')
})

test('ボタンで頼むと問二が直り、元に戻せる', async ({ page }) => {
  const requests: ChatBody[] = []
  await page.route('/api/chat', easierQ2(requests))
  await openSample(page)
  await q2(page).click()
  await chat(page).getByRole('button', { name: 'もう少し易しく' }).click()

  await expect(chat(page).locator('.msg-me')).toHaveText('【三】問二をもう少し易しくしてください')
  await expect(chat(page)).toContainText('問二の選択肢を易しくしました。')
  await expect(chat(page).getByRole('region', { name: '気づいたこと' })).toContainText('正答はイのままです')
  await expect(q2(page)).toContainText('ア　良い王のこと。')
  await expect(page.locator('.page .blk-changed')).toHaveCount(1)
  expect(requests[0].selection).toEqual({ sectionId: 'meros', questionId: 'q2' })
  expect(requests[0].message).toBe('【三】問二をもう少し易しくしてください')

  await chat(page).getByRole('button', { name: '元に戻す' }).click()
  await expect(q2(page)).toContainText('ア　知恵がはたらき、人々をよく治めること。')
  await expect(chat(page).getByRole('button', { name: '元に戻す' })).toBeDisabled()
})

test('会話で直した後に紙面を変えると、元に戻せない。確定も外れる', async ({ page }) => {
  await page.route('/api/chat', easierQ2())
  await openSample(page)
  await page.getByRole('group', { name: '【三】の操作' }).getByRole('button', { name: '確定する' }).click()
  await q2(page).click()
  await chat(page).getByRole('button', { name: 'もう少し易しく' }).click()
  await expect(q2(page)).toContainText('ア　良い王のこと。')
  await expect(page.getByRole('group', { name: '【三】の操作' }).getByRole('button', { name: '確定する' })).toBeAttached()

  await page.getByRole('group', { name: '【三】問三の操作' }).getByRole('button', { name: '削除' }).click()
  // 会話で直した返答の「元に戻す」は押せない（紙面で消した知らせの「元に戻す」は押せる）
  await expect(chat(page).getByRole('button', { name: '元に戻す' })).toHaveCount(2)
  await expect(chat(page).getByRole('button', { name: '元に戻す' }).first()).toBeDisabled()
  await expect(chat(page).getByRole('button', { name: '元に戻す' }).last()).toBeEnabled()
})

test('自分の言葉で頼んで大問を入れ替える', async ({ page }) => {
  await page.route('/api/chat', answer({ reply: '【二】と【三】を入れ替えました。', change: { kind: 'reorderSections', order: ['kanji', 'meros', 'grammar', 'ougi', 'kanshi', 'sakubun'] } }))
  await openSample(page)
  await chat(page).getByLabel('AIへの相談').fill('大問二と三を入れ替えて')
  await chat(page).getByLabel('AIへの相談').press('ControlOrMeta+Enter')
  await expect(headers(page).nth(1)).toContainText('【二】　次の文章を読んで')
  await expect(chat(page).getByLabel('AIへの相談')).toHaveValue('')
})

test('作り直しを頼むと、希望を添えて大問を作ってもらう', async ({ page }) => {
  const drafts: Array<{ wish?: string }> = []
  await page.route('/api/chat', answer({ reply: '記述を中心に作り直します。', change: { kind: 'redraftSection', sectionId: 'meros', wish: '記述を中心に' } }))
  await page.route('/api/draft-section', route => {
    drafts.push(route.request().postDataJSON())
    return route.fulfill({ json: { ok: false, errors: ['確かめるための失敗'] } })
  })
  await openSample(page)
  await headers(page).nth(2).click()
  await chat(page).getByLabel('AIへの相談').fill('記述を中心に作り直して')
  await chat(page).getByRole('button', { name: '送信' }).click()
  await expect(chat(page)).toContainText('記述を中心に作り直します。')
  await expect(chat(page).getByRole('alert')).toContainText('【三】走れメロスの大問を作れませんでした')
  expect(drafts[0].wish).toBe('記述を中心に')
})

test('配点を上げると紙面と合計が変わり、会話に出る', async ({ page }) => {
  await openSample(page)
  await q2(page).click()
  await chat(page).getByRole('button', { name: '配点を一点上げる' }).click()
  await expect(q2(page)).toContainText('（五点）')
  await expect(chat(page)).toContainText('【三】問二の配点を4点から5点にしました。合計は101点です。')
  await expect(page.locator('.totals')).toContainText('101')
})

test('相談だけなら紙面は変わらない。空のままでは送らない', async ({ page }) => {
  let requests = 0
  await page.route('/api/chat', route => {
    requests++
    return answer({ reply: '問三の記述がよいと思います。', change: { kind: 'none' } })(route)
  })
  await openSample(page)
  const before = await merosPage(page).locator('.stem').allTextContents()
  await chat(page).getByRole('button', { name: '送信' }).click()
  expect(requests).toBe(0)
  await chat(page).getByLabel('AIへの相談').fill('記述問題を入れるならどこがいいですか')
  await chat(page).getByRole('button', { name: '送信' }).click()
  await expect(chat(page)).toContainText('問三の記述がよいと思います。')
  expect(await merosPage(page).locator('.stem').allTextContents()).toEqual(before)
  await expect(chat(page).getByRole('button', { name: '元に戻す' })).toHaveCount(0)
})

test('考えている間に紙面で同じ大問を直すと、会話の変更は入れない', async ({ page }) => {
  let release: () => void = () => {}
  const answered = new Promise<void>(resolve => { release = resolve })
  await page.route('/api/chat', easierQ2([], answered))
  await openSample(page)
  await q2(page).click()
  await chat(page).getByRole('button', { name: 'もう少し易しく' }).click()
  await expect(chat(page).getByRole('status')).toContainText('AI が考えています')
  await expect(chat(page).getByRole('button', { name: '送信' })).toBeDisabled()

  await page.getByRole('group', { name: '【三】問四の操作' }).getByRole('button', { name: '上へ' }).click()
  release()
  await expect(chat(page)).toContainText('考えている間に紙面のその部分が変わったので')
  await expect(q2(page)).toContainText('ア　知恵がはたらき、人々をよく治めること。')
})

test('大問を足したいと頼むと、大問を足す画面を開くボタンが出る', async ({ page }) => {
  await page.route('/api/chat', answer({ reply: 'どの教材の大問にするかを選んでください。', change: { kind: 'addSection' } }))
  await openSample(page)
  await chat(page).getByLabel('AIへの相談').fill('大問を足したい')
  await chat(page).getByRole('button', { name: '送信' }).click()
  await chat(page).getByRole('button', { name: '大問を追加する' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
