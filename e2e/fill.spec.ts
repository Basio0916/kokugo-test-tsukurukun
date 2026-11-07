import { expect, test, type Page } from '@playwright/test'

/* 空欄補充の小問。本物の Claude は呼ばず、大問と小問の案の返答を差し替える。問題用紙・解答用紙・模範解答が連動することを確かめる */

const STEM = '次の文の空欄に当てはまる言葉を、本文からそれぞれ抜き出しなさい。'

const fillQuestion = {
  id: 'meros-q1', format: 'extract', stem: [{ kind: 'text', text: STEM }], points: 24, kanten: 'thinking', standard: 'C(1)イ',
  fill: [{ kind: 'text', text: 'メロスは' }, { kind: 'blank', answer: '激怒' }, { kind: 'text', text: 'し、' }, { kind: 'blank', answer: '邪智暴虐' }, { kind: 'text', text: 'の王を除こうと決意した。' }],
}

async function openSample(page: Page) {
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
  await page.waitForTimeout(200)
}

const chat = (page: Page) => page.getByRole('complementary', { name: 'AIと相談' })
const tools = (page: Page, name: string) => page.getByRole('group', { name: `${name}の操作` })
const sheetHeads = (page: Page) => page.getByLabel('解答用紙の三', { exact: true }).locator('.sheet-item')
const sheetCells = (page: Page) => page.getByLabel('解答用紙の三', { exact: true }).locator('.sheet-grid').evaluateAll(grids => grids.map(g => g.children.length))
const keyAnswer = (page: Page) => page.locator('.key-answer', { hasText: /^(Ⅰ |王を除く)/ })

// 走れメロスの大問を、空欄補充の小問一つに作り直してもらう
async function draftFillSection(page: Page) {
  await page.route('/api/draft-section', async route => {
    const { section } = route.request().postDataJSON()
    await route.fulfill({ json: { ok: true, section: { ...section, questions: [fillQuestion] }, rationales: [{ questionId: 'meros-q1', rationale: '要約して確かめる', standard: 'C(1)イ', inUnit: true }] } })
  })
  await openSample(page)
  await page.locator('.page .sec-h').nth(2).click()
  await chat(page).getByRole('button', { name: 'AIに作り直してもらう' }).click()
  await expect(page.locator('.page .fill')).toBeVisible()
}

test('空欄補充の小問は、問題用紙・解答用紙・模範解答に連動して描かれ、直すとそろって変わる', async ({ page }) => {
  await draftFillSection(page)

  // 問題用紙: 問い文の次に穴埋め文。答えは出ない
  await expect(page.locator('.page .fill')).toHaveText('◎メロスは（Ⅰ　二字）し、（Ⅱ　四字）の王を除こうと決意した。')
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  await expect(sheetHeads(page)).toHaveText(['Ⅰ', 'Ⅱ'])
  expect(await sheetCells(page)).toEqual([2, 4])
  await page.getByRole('tab', { name: '模範解答・採点基準', exact: true }).click()
  await expect(keyAnswer(page)).toHaveText('Ⅰ 激怒　Ⅱ 邪智暴虐')

  // 直す: 空欄を一つにして字数の上限を全角で書く。小問全体の答えと字数の欄は出ない
  await page.getByRole('tab', { name: '問題用紙', exact: true }).click()
  await tools(page, '【三】問一').getByRole('button', { name: '直す' }).click()
  const dialog = page.getByRole('dialog', { name: '【三】問一を直す' })
  await expect(dialog.getByLabel('答え', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('字数', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('穴埋め文')).toHaveValue('メロスは[[激怒]]し、[[邪智暴虐]]の王を除こうと決意した。')
  await dialog.getByLabel('穴埋め文').fill('メロスは[[王を除く｜１０]]と決意した。')
  await dialog.getByRole('button', { name: 'この内容で直す' }).click()
  await expect(dialog).toHaveCount(0)

  await expect(page.locator('.page .fill')).toHaveText('◎メロスは（十字以内）と決意した。')
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  await expect(sheetHeads(page)).toHaveCount(0)
  expect(await sheetCells(page)).toEqual([10])
  await page.getByRole('tab', { name: '模範解答・採点基準', exact: true }).click()
  await expect(keyAnswer(page)).toHaveText('王を除く')
})

test('穴埋め文に空欄がない、字数が数字でないときは、理由を示して決められない', async ({ page }) => {
  await draftFillSection(page)
  await tools(page, '【三】問一').getByRole('button', { name: '直す' }).click()
  const dialog = page.getByRole('dialog', { name: '【三】問一を直す' })
  await dialog.getByLabel('穴埋め文').fill('メロスは激怒した。')
  await dialog.getByRole('button', { name: 'この内容で直す' }).click()
  await expect(dialog).toContainText('穴埋め文に空欄がない')
  await dialog.getByLabel('穴埋め文').fill('メロスは[[激怒｜十]]した。')
  await dialog.getByRole('button', { name: 'この内容で直す' }).click()
  await expect(dialog).toContainText('字数は数字で書く')
})

test('抜き出しの空欄の答えを本文から消すと要確認になる', async ({ page }) => {
  await draftFillSection(page)
  await page.locator('.page .sec-h').nth(2).click()
  await page.route('/api/check-passage', route => route.fulfill({ json: { ok: true, issues: [] } }))
  await chat(page).getByRole('button', { name: '本文を直す' }).click()
  const dialog = page.getByRole('dialog')
  const passage = dialog.locator('textarea').first()
  await passage.fill((await passage.inputValue()).replace('邪智暴虐', '邪悪'))
  await dialog.getByRole('button', { name: 'この本文にする' }).click()
  await expect(chat(page)).toContainText('空欄の答え「邪智暴虐」が本文に見当たりません')
})

test('自分で書く空欄補充は文章の大問で選べて、漢字の大問では選べない', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: '【一】の問三として小問を追加' }).click()
  await page.getByRole('button', { name: '自分で書く' }).click()
  await expect(page.getByLabel('空欄補充（考えて答える）')).toHaveCount(0)
  await page.getByRole('button', { name: 'やめる' }).click()

  await page.getByRole('button', { name: '【三】の問二として小問を追加' }).click()
  await page.getByRole('button', { name: '自分で書く' }).click()
  await page.getByLabel('空欄補充（考えて答える）').check()
  await page.getByRole('button', { name: '空の小問を開く' }).click()
  const dialog = page.getByRole('dialog', { name: '【三】の問二として入れる小問' })
  await dialog.getByLabel('問い文').fill('次の文の空欄に当てはまる言葉を書きなさい。')
  await dialog.getByLabel('穴埋め文').fill('メロスは[[激怒]]した。')
  await dialog.getByRole('button', { name: 'この問題で入れる' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.page .fill')).toHaveText('◎メロスは（二字）した。')
})

test('空欄補充を AI に頼んで作れず、自分で書くに移っても、形式の一覧の先頭を選んだ状態で開く', async ({ page }) => {
  await page.route('/api/draft-question', route => route.fulfill({ json: { ok: false, errors: ['作れませんでした'] } }))
  await openSample(page)
  await page.getByRole('button', { name: '【三】の問二として小問を追加' }).click()
  await page.getByRole('button', { name: '形式を選んで AI に作ってもらう' }).click()
  await page.getByLabel('空欄補充').check()
  await page.getByRole('button', { name: 'AI に作ってもらう', exact: true }).click()
  await page.getByRole('button', { name: '足し方を選び直す' }).click()
  await page.getByRole('button', { name: '自分で書く' }).click()
  await expect(page.getByLabel('記号選択')).toBeChecked()
  await page.getByRole('button', { name: '空の小問を開く' }).click()
  await expect(page.getByRole('dialog', { name: '【三】の問二として入れる小問' }).getByLabel('問い文')).toBeVisible()
})

test('形式を選んで空欄補充を頼むと、穴埋め文を直せる形で示す。おすすめの案には答えを出さない形で示す', async ({ page }) => {
  const asked: unknown[] = []
  await page.route('/api/draft-question', async route => {
    const { section, how } = route.request().postDataJSON()
    asked.push(how)
    await route.fulfill({ json: { ok: true, ideas: [{ section, rationale: '理由', question: { ...fillQuestion, id: 'meros-a1', points: 4 } }] } })
  })
  await openSample(page)
  await page.getByRole('button', { name: '【三】の問二として小問を追加' }).click()
  await page.getByRole('button', { name: 'AI のおすすめから選ぶ' }).click()
  await expect(page.locator('.idea-choices')).toHaveText('◎メロスは（Ⅰ　二字）し、（Ⅱ　四字）の王を除こうと決意した。')
  await page.getByRole('button', { name: '閉じる' }).click()

  await page.getByRole('button', { name: '【三】の問二として小問を追加' }).click()
  await page.getByRole('button', { name: '形式を選んで AI に作ってもらう' }).click()
  await page.getByLabel('空欄補充').check()
  await page.getByRole('button', { name: 'AI に作ってもらう', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '【三】の問二として入れる小問' })
  await expect(dialog.getByLabel('穴埋め文')).toHaveValue('メロスは[[激怒]]し、[[邪智暴虐]]の王を除こうと決意した。')
  expect(asked.at(-1)).toMatchObject({ kind: 'format', format: 'fill' })
})
