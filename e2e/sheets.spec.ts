import { expect, test, type Locator, type Page } from '@playwright/test'

/* 解答用紙と模範解答・採点基準。問題用紙と同じテストのデータから描かれ、連動する */

async function openSample(page: Page) {
  page.on('dialog', d => d.accept())
  await page.goto('/?sample=1')
  await page.waitForFunction(() => document.fonts.status === 'loaded' && document.querySelectorAll('.page').length > 0)
}

const sheetSection = (page: Page, label: string) => page.getByLabel(`解答用紙の${label}`, { exact: true })
const questionHeads = (page: Page, label: string) => sheetSection(page, label).locator('.sheet-question')

test('タブで解答用紙に切り替えると、問題用紙は消え、大問ごとの小問の見出しがそろう', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  await expect(page.getByRole('tab', { name: '解答用紙', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.page')).toHaveCount(1)
  await expect(page.getByLabel('解答用紙', { exact: true })).toContainText('令和八年度　第三学期　学年末テスト　国語')
  await expect(page.locator('.sheet-sec-h')).toHaveText(['一', '二', '三', '四', '五', '六'])
  expect(new Set(await questionHeads(page, '三').allTextContents())).toEqual(new Set(['問一', '問二', '問三', '問四']))
  await expect(page.getByLabel('観点別の合計')).toContainText('／60')
  await expect(page.getByLabel('観点別の合計')).toContainText('／100')

  await page.getByRole('tab', { name: '問題用紙', exact: true }).click()
  await expect(page.locator('.page')).toHaveCount(5)
})

test('問題用紙で小問を消すと、解答用紙と模範解答も変わる', async ({ page }) => {
  await openSample(page)
  await page.getByRole('group', { name: '【三】問二の操作' }).getByRole('button', { name: '削除' }).click()
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  expect(new Set(await questionHeads(page, '三').allTextContents())).toEqual(new Set(['問一', '問二', '問三']))
  await expect(sheetSection(page, '三').locator('.sheet-scores')).toContainText('／20')

  await page.getByRole('tab', { name: '模範解答・採点基準', exact: true }).click()
  const meros = page.locator('.key tbody tr')
  await expect(meros.filter({ hasText: '政治のことはわからない村の牧人' }).locator('td').first()).toHaveText('問二')
})

test('模範解答・採点基準の表。配点を上げると配点と合計が変わる', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '模範解答・採点基準', exact: true }).click()
  // 【三】問二（正答イ・知識・技能 (1)エ）の行
  const q2 = page.locator('.key tbody tr').filter({ hasText: /^問二イ.点知識・技能\(1\)エ/ })
  await expect(q2.locator('td')).toHaveText(['問二', 'イ', '四点', /知識・技能\s*\(1\)エ/, '記号が合っていれば正答'])
  await expect(page.locator('.key tbody tr').filter({ hasText: 'ゆりすえ' }).locator('td').nth(1)).toHaveText('② ゆりすえ　③ ただよえ')

  // 会話のボタンで配点を上げる（問題用紙で問二を選ぶ）
  await page.getByRole('tab', { name: '問題用紙', exact: true }).click()
  await page.locator('.page').filter({ hasText: '走れメロス' }).locator('.blk').filter({ hasText: '問二' }).first().click()
  await page.getByRole('button', { name: '配点を一点上げる' }).click()
  await page.getByRole('tab', { name: '模範解答・採点基準', exact: true }).click()
  await expect(q2.locator('td').nth(2)).toHaveText('五点')
  await expect(page.locator('.key tfoot')).toContainText('知識・技能 61点　／　思考・判断・表現 40点　／　合計 101点（満点 100点）')
})

test('解答用紙を印刷すると、その一枚だけが出る', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.sheet-tabs')).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'AIと相談' })).toBeHidden()
  await expect(page.locator('.page')).toHaveCount(1)
  await expect(page.locator('.page.sheet')).toBeVisible()
})

test('知識・技能の見出しと小計の知・技の行を網掛けにし、小計は観点ごとの段に置く', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  const background = (l: Locator) => l.evaluate(e => getComputedStyle(e).backgroundColor)
  // 三（走れメロス）は問二だけが知識・技能
  const meros = sheetSection(page, '三')
  await expect(meros.locator('.sheet-question.sheet-shaded')).toHaveText(['問二'])
  expect(await background(meros.locator('.sheet-question', { hasText: '問二' }))).not.toBe('rgba(0, 0, 0, 0)')
  expect(await background(meros.locator('.sheet-question', { hasText: '問一' }))).toBe('rgba(0, 0, 0, 0)')
  await expect(page.getByLabel('観点別の合計').locator('.sheet-shaded')).toContainText('知・技')

  // 一（漢字）は知・技だけで上の段、六（作文）は思・判・表だけで下の段
  await expect(sheetSection(page, '一').locator('.sheet-scores p')).toHaveCount(1)
  await expect(sheetSection(page, '六').locator('.sheet-scores p')).toHaveCount(1)
  const upper = (await sheetSection(page, '一').locator('.sheet-score-knowledge').boundingBox())!
  const lower = (await sheetSection(page, '六').locator('.sheet-score-thinking').boundingBox())!
  expect(Math.abs(upper.y + upper.height - lower.y)).toBeLessThan(1.5)
  expect(await background(sheetSection(page, '六').locator('.sheet-score-thinking'))).toBe('rgba(0, 0, 0, 0)')
})

test('名前の欄の文字は欄の幅の中央に並ぶ', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  const box = (await page.locator('.sheet-name').boundingBox())!
  for (const label of ['組', '番', '氏名']) {
    const text = (await page.locator('.sheet-name span', { hasText: label }).boundingBox())!
    expect(Math.abs(text.x + text.width / 2 - (box.x + box.width / 2))).toBeLessThan(1.5)
  }
})

test('解答用紙に切り替えると、最初に描いたときから紙を置き場所の幅に収めて描く', async ({ page }) => {
  await openSample(page)
  // 解答用紙が現れたあとの最初のコマで、紙の幅と置き場所の幅を測る
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const sheet = document.querySelector('.page.sheet')
      if (!sheet) return
      observer.disconnect()
      requestAnimationFrame(() => {
        (window as unknown as { firstFrame: unknown }).firstFrame = { sheet: sheet.getBoundingClientRect().width, paper: sheet.closest('.paper')!.clientWidth }
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  const first = await (await page.waitForFunction(() => (window as unknown as { firstFrame?: { sheet: number; paper: number } }).firstFrame)).jsonValue()
  expect(first!.sheet).toBeLessThanOrEqual(first!.paper)
})

test('隣り合う欄の枠の線は、二本並ばずに重なって一本になる', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  const overlaps = await sheetSection(page, '三').evaluate(sec => {
    const scale = Number(getComputedStyle(sec.closest('.paper-pages')!).getPropertyValue('--s')) || 1
    const units = [...sec.querySelectorAll('.sheet-head, .sheet-box')].map(e => e.getBoundingClientRect())
    const near = (a: number, b: number) => Math.abs(a - b) < 0.5
    // 問二の見出しと、そのすぐ下の欄。問一の見出しと、その左の列の見出し
    const head = sec.querySelector('.sheet-question.sheet-shaded')!.getBoundingClientRect()
    const below = units.filter(u => near(u.left, head.left) && u.top > head.top + 1).sort((a, b) => a.top - b.top)[0]
    const tops = units.filter(u => near(u.top, units[0].top)).sort((a, b) => b.left - a.left)
    const title = sec.querySelector('.sheet-sec-h')!.getBoundingClientRect()
    return { line: scale, vertical: head.bottom - below.top, horizontal: tops[1].right - tops[0].left, titleToHead: title.bottom - units[0].top }
  })
  expect(overlaps.vertical).toBeCloseTo(overlaps.line, 1)
  expect(overlaps.horizontal).toBeCloseTo(overlaps.line, 1)
  expect(overlaps.titleToHead).toBeCloseTo(overlaps.line, 1)
})

test('模範解答つき解答用紙には、模範解答を赤字で書き込み、題に「模範解答」を入れる', async ({ page }) => {
  await openSample(page)
  await page.getByRole('tab', { name: '模範解答つき解答用紙', exact: true }).click()
  await expect(page.getByLabel('模範解答つき解答用紙', { exact: true }).locator('.sheet-title')).toHaveText('令和八年度　第三学期　学年末テスト　国語　模範解答')
  const meros = sheetSection(page, '三')
  // 問二・問四（記号選択）は正答の記号を欄に書く
  await expect(meros.locator('.sheet-box:not(.sheet-grid) > .sheet-answer')).toHaveText(['イ', 'ア'])
  expect(await meros.locator('.sheet-answer').first().evaluate(e => getComputedStyle(e).color)).toBe('rgb(200, 22, 29)')
  // 問三（記述・四十マス）は一マスに一字ずつ書き、使わなかったマスは空く
  const cells = await meros.locator('.sheet-grid').nth(1).locator('> span').allTextContents()
  expect(cells).toHaveLength(40)
  expect(cells.join('')).toBe('政治のことはわからない村の牧人だが、邪悪に対しては人一倍に敏感な人物。')
  expect(cells.slice(0, 3)).toEqual(['政', '治', 'の'])
  expect(cells.slice(35)).toEqual(['', '', '', '', ''])
  // 作文の欄には書かない
  await expect(sheetSection(page, '六').locator('.sheet-answer')).toHaveCount(0)

  // 模範解答のない解答用紙には、答えも「模範解答」も書かない
  await page.getByRole('tab', { name: '解答用紙', exact: true }).click()
  await expect(page.getByLabel('解答用紙', { exact: true }).locator('.sheet-title')).toHaveText('令和八年度　第三学期　学年末テスト　国語')
  await expect(page.locator('.sheet-answer')).toHaveCount(0)
})

test('問題用紙で正答を変えると、模範解答つき解答用紙も変わる', async ({ page }) => {
  await openSample(page)
  await page.locator('.page .blk[data-target="meros/q2"]').dblclick()
  const dialog = page.getByRole('dialog', { name: '【三】問二を直す' })
  await dialog.getByLabel('正答').selectOption('2')
  await dialog.getByRole('button', { name: 'この内容で直す' }).click()
  await page.getByRole('tab', { name: '模範解答つき解答用紙', exact: true }).click()
  await expect(sheetSection(page, '三').locator('.sheet-box:not(.sheet-grid) > .sheet-answer')).toHaveText(['ウ', 'ア'])
})

test('模範解答がマス目に入りきらないと、入る分だけ書いて会話に知らせ、直すと知らせが消える', async ({ page }) => {
  await openSample(page)
  const alert = page.getByRole('alert').filter({ hasText: '【三】問三の模範解答（四十五字）が、マス目（四十字）に入りきりません' })
  const edit = async (answer: string) => {
    await page.locator('.page .blk[data-target="meros/q3"]').dblclick()
    const dialog = page.getByRole('dialog', { name: '【三】問三を直す' })
    await dialog.getByLabel('答え').fill(answer)
    await dialog.getByRole('button', { name: 'この内容で直す' }).click()
  }
  await edit('あ'.repeat(45))
  await expect(alert).toBeVisible()
  await page.getByRole('tab', { name: '模範解答つき解答用紙', exact: true }).click()
  expect((await sheetSection(page, '三').locator('.sheet-grid').nth(1).locator('> span').allTextContents()).join('')).toBe('あ'.repeat(40))

  await page.getByRole('tab', { name: '問題用紙', exact: true }).click()
  await edit('あ'.repeat(40))
  await expect(alert).toHaveCount(0)
})
