import { expect, test, type Page, type Route } from '@playwright/test'

/* 本文を直し、食い違った小問を要確認にする。本物の Claude は呼ばず、/api/check-passage と /api/chat を差し替える */

type Issue = { questionId: string; issue: string }
type CheckBody = { sectionId: string; changes: Array<{ before: string; after: string }>; acked: Record<string, string[]> }

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })
const merosPage = (page: Page) => page.locator('.page').filter({ hasText: '走れメロス' })
const question = (page: Page, label: string) => merosPage(page).locator('.blk').filter({ hasText: label }).first()
const editor = (page: Page) => page.getByRole('dialog', { name: '【三】の本文を直す' })

// AI の確かめは、issues を返す（requests に要求を残す）
function fakeCheck(issues: Issue[], requests: CheckBody[] = []) {
  return (route: Route) => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: { ok: true, issues } })
  }
}

async function editPassage(page: Page, edit: (text: string) => string) {
  await page.locator('.page .sec-h').nth(2).click()
  await chat(page).getByRole('button', { name: '本文を直す' }).click()
  const text = editor(page).getByLabel('本文', { exact: true })
  await text.fill(edit(await text.inputValue()))
  await editor(page).getByRole('button', { name: 'この本文にする' }).click()
}

test('本文を開くと傍線部の一覧が出て、傍線部の中では注意が出る。空では保存できない', async ({ page }) => {
  await openSample(page)
  await page.locator('.page .sec-h').nth(2).click()
  await chat(page).getByRole('button', { name: '本文を直す' }).click()
  await expect(editor(page).getByRole('list', { name: '本文の傍線部' }).getByRole('listitem'))
    .toHaveText(['傍線部①「激怒した」（問一）', '傍線部②「邪智暴虐」（問二）', '傍線部③「メロスには政治がわからぬ」（問三）'])

  const text = editor(page).getByLabel('本文', { exact: true })
  const at = (await text.inputValue()).indexOf('邪智暴虐')
  await text.evaluate((el: HTMLTextAreaElement, i) => el.setSelectionRange(i, i), at + 1)
  await text.press('ArrowRight')
  await expect(editor(page).getByRole('status')).toHaveText('ここは傍線部②（問二）です。書き換えると、問二を確かめる必要が出ます。')

  await text.fill('')
  await editor(page).getByRole('button', { name: 'この本文にする' }).click()
  await expect(editor(page).getByRole('alert')).toContainText('本文を入れてください')
})

test('傍線部の前を直しても、傍線部は文字に付いて動き、問一は要確認にならない', async ({ page }) => {
  await page.route('/api/check-passage', fakeCheck([]))
  await openSample(page)
  await editPassage(page, t => t.replace('メロスは激怒した。', 'メロスはひどく激怒した。'))
  await expect(chat(page)).toContainText('【三】の本文を直しました')
  await expect(merosPage(page).locator('.passage')).toContainText('メロスはひどく①激怒した')
  await expect(question(page, '問四')).toHaveClass(/blk-flagged/)
  await expect(question(page, '問一')).not.toHaveClass(/blk-flagged/)
})

test('傍線部の文字を変えると要確認になり、このままにすると次は知らせない', async ({ page }) => {
  const requests: CheckBody[] = []
  await page.route('/api/check-passage', fakeCheck([{ questionId: 'q3', issue: '模範解答の人物像が本文と合いません' }], requests))
  await openSample(page)
  await page.getByRole('group', { name: '【三】の操作' }).getByRole('button', { name: '確定する' }).click()
  await editPassage(page, t => t.replace('邪智暴虐', '邪知暴虐'))

  const flags = chat(page).getByRole('region', { name: '【三】要確認の小問' })
  await expect(flags).toContainText('傍線部②の文字が「邪智暴虐」から「邪知暴虐」に変わりました')
  await expect(flags).toContainText('模範解答の人物像が本文と合いません')
  await expect(page.locator('.page .blk-flagged')).toHaveCount(2)
  await expect(question(page, '問二').locator('.blk-flag')).toHaveText('要確認')
  await expect(page.getByRole('group', { name: '【三】の操作' }).getByRole('button', { name: '確定する' })).toBeAttached()
  expect(requests[0].changes).toEqual([{ before: 'た。必ず、かの邪智', after: 'た。必ず、かの邪知' }])

  await chat(page).getByRole('button', { name: '問二はこのままにする' }).click()
  await expect(chat(page).getByRole('button', { name: '問二を消す' })).toBeDisabled()
  await expect(chat(page).getByRole('button', { name: '問三を消す' })).toBeEnabled()
  await chat(page).getByRole('button', { name: '問三はこのままにする' }).click()
  await expect(chat(page)).toContainText('【三】の小問と直した本文の食い違いはなくなりました')
  await expect(page.locator('.page .blk-flagged')).toHaveCount(0)

  // また本文を直すと、このままにした点を AI に伝え、同じ指摘は出さない
  await editPassage(page, t => t.replace('きょう未明', 'その日の朝'))
  await expect(chat(page)).toContainText('【三】の小問と直した本文の食い違いは見つかりませんでした')
  expect(requests[1].acked).toEqual({ q2: ['傍線部②の文字が「邪智暴虐」から「邪知暴虐」に変わりました'], q3: ['模範解答の人物像が本文と合いません'] })

  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.blk-flag')).toHaveCount(0)
})

test('AI に直してもらうと要確認が外れ、消すと小問がなくなる', async ({ page }) => {
  await page.route('/api/check-passage', fakeCheck([{ questionId: 'q3', issue: '模範解答が本文と合いません' }]))
  const chats: Array<{ message: string; selection: unknown }> = []
  await page.route('/api/chat', async route => {
    const body = route.request().postDataJSON()
    chats.push(body)
    const meros = body.test.sections.find((s: { id: string }) => s.id === 'meros')
    const section = { ...meros, questions: meros.questions.map((q: { id: string }) => (q.id === 'q3' ? { ...q, answer: '素朴な村の牧人。' } : q)) }
    await route.fulfill({ json: { ok: true, reply: '問三の模範解答を直しました。', notes: [], change: { kind: 'reviseQuestion', sectionId: 'meros', questionId: 'q3', section } } })
  })
  await openSample(page)
  await editPassage(page, t => t.replace('邪智暴虐', '邪知暴虐'))

  await chat(page).getByRole('button', { name: '問三をAIに直してもらう' }).click()
  await expect(chat(page)).toContainText('問三の模範解答を直しました。')
  expect(chats[0].message).toBe('【三】問三を、直した本文に合わせて直してください。食い違い: 模範解答が本文と合いません')
  expect(chats[0].selection).toEqual({ sectionId: 'meros', questionId: 'q3' })
  await expect(question(page, '問三')).not.toHaveClass(/blk-flagged/)
  await expect(chat(page).getByRole('button', { name: '問三はこのままにする' })).toBeDisabled()

  await chat(page).getByRole('button', { name: '問二を消す' }).click()
  await expect(merosPage(page).locator('.stem')).toHaveCount(3)
  await expect(chat(page)).toContainText('【三】の小問と直した本文の食い違いはなくなりました')
})

test('本文の直しを元に戻すと、本文と要確認が戻る', async ({ page }) => {
  await page.route('/api/check-passage', fakeCheck([]))
  await openSample(page)
  await editPassage(page, t => t.replace('邪智暴虐', '邪知暴虐'))
  await expect(page.locator('.page .blk-flagged')).toHaveCount(1)
  await chat(page).getByRole('button', { name: '元に戻す' }).click()
  await expect(merosPage(page).locator('.passage')).toContainText('②邪智暴虐')
  await expect(page.locator('.page .blk-flagged')).toHaveCount(0)
})

test('何も変えずに保存すると、そう知らせる。AI に確かめてもらえなくても機械の結果は出る', async ({ page }) => {
  await page.route('/api/check-passage', route => route.fulfill({ json: { ok: false, errors: ['AI の呼び出しに失敗しました（500）'] } }))
  await openSample(page)
  await editPassage(page, t => t)
  await expect(chat(page)).toContainText('【三】の本文は変わっていません。')

  await editPassage(page, t => t.replace('邪智暴虐', '邪知暴虐'))
  await expect(chat(page).getByRole('region', { name: '【三】要確認の小問' })).toContainText('邪知暴虐')
  await expect(chat(page)).toContainText('AI に確かめてもらえませんでした')
})
