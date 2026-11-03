import { expect, test, type Page, type Route } from '@playwright/test'

/* 作文の大問。本物の Claude は呼ばず、/api/draft-composition と /api/chat を差し替える */

type Body = { materials: string[]; subtotal: number; wish?: string; section: { id: string; questions: Array<Record<string, unknown>> } }

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

function fakeComposition(requests: Body[], release?: Promise<void>) {
  return async (route: Route) => {
    const req: Body = route.request().postDataJSON()
    requests.push(req)
    await release
    const q = req.section.questions[0]
    await route.fulfill({
      json: {
        ok: true,
        section: { ...req.section, instruction: '「走れメロス」を読んで、「約束を守ること」について、あなたの考えを次の条件にしたがって書きなさい。', questions: [{ ...q, conditions: ['二段落で書くこと。', '百二十字以上、百五十字以内で書くこと。'], charLimit: 150 }] },
        rationales: [{ questionId: q.id, rationale: '走れメロスの C(1)オ を確かめるため', standard: 'C(1)オ', inUnit: true }],
      },
    })
  }
}

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })

test('作文を加えると決まった条件の作文が入り、AI の題と条件に置き換わる', async ({ page }) => {
  const requests: Body[] = []
  let release: () => void = () => {}
  const answered = new Promise<void>(resolve => { release = resolve })
  await page.route('/api/draft-composition', fakeComposition(requests, answered))
  await openSample(page)
  // 作文はテストに一つだけ。サンプルの作文を消してから加える
  await page.getByRole('group', { name: '【六】の操作' }).getByRole('button', { name: '削除' }).click()
  await page.getByRole('button', { name: '＋ 大問を追加' }).click()
  await page.getByRole('dialog').getByLabel(/作文の大問/).check()
  await page.getByRole('dialog').getByRole('button', { name: 'この大問を加える' }).click()

  const headers = page.locator('.page .sec-h')
  await expect(headers).toHaveCount(6)
  await expect(headers.last()).toContainText('【六】　あなたの考えを、次の条件にしたがって書きなさい。（十点）')
  await expect(chat(page).getByRole('status')).toContainText('【六】作文の大問を作っています')

  release()
  await expect(headers.last()).toContainText('「約束を守ること」について')
  await expect(page.locator('.page .cond').last()).toContainText('百二十字以上、百五十字以内で書くこと。')
  await expect(chat(page).getByRole('region', { name: '【六】作文 AI の提案の理由' })).toContainText('走れメロスの C(1)オ を確かめるため')
  expect(requests[0].materials).toEqual(['走れメロス', '扇の的　――「平家物語」から', '漢詩の風景'])
  expect(requests[0].subtotal).toBe(10)
})

test('会話で作文の作り直しを頼むと、作文の作り方で希望を添えて作る', async ({ page }) => {
  const requests: Body[] = []
  await page.route('/api/chat', route => route.fulfill({ json: { ok: true, reply: '字数を百五十字にして作り直します。', notes: [], change: { kind: 'redraftSection', sectionId: 'sakubun', wish: '字数を百五十字にし、身近な体験を書かせる' } } }))
  await page.route('/api/draft-composition', fakeComposition(requests))
  await openSample(page)
  await page.locator('.page .sec-h').nth(5).click()
  await expect(chat(page).getByRole('button', { name: 'AIに作り直してもらう' })).toBeVisible()
  await chat(page).getByLabel('AIへの相談').fill('字数を百五十字にして、身近な体験を書かせたい')
  await chat(page).getByRole('button', { name: '送信' }).click()
  await expect(page.locator('.page .sec-h').nth(5)).toContainText('「約束を守ること」について')
  expect(requests[0].wish).toBe('字数を百五十字にし、身近な体験を書かせる')
})
