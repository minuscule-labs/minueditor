import { expect, test, type Locator, type Page } from '@playwright/test'

type Clipboard = Record<string, string>

async function clipboard(input: Locator, type: 'copy' | 'cut' | 'paste', payload: Clipboard = {}) {
  return input.evaluate((element, { type, payload }) => {
    const data = new DataTransfer()
    for (const [format, value] of Object.entries(payload)) data.setData(format, value)
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: data })
    element.dispatchEvent(event)
    return { prevented: event.defaultPrevented, data: Object.fromEntries(Array.from(data.types, format => [format, data.getData(format)])) }
  }, { type, payload })
}

const cell = (page: Page, row: number, column: number) =>
  page.locator(`.me-table-input[data-row-index="${row}"][data-col-index="${column}"]`)

async function activate(page: Page) {
  await page.goto('/?fixture=table-commands')
  await page.locator('.me-table-widget').click()
  await expect(cell(page, 0, 0)).toBeFocused()
}

for (const type of ['copy', 'cut'] as const) {
  test(`cell-text ${type} does not fall through to CodeMirror's document clipboard`, async ({ page }) => {
    await activate(page)
    const input = cell(page, 1, 0)
    await input.click()
    await input.evaluate((element: HTMLInputElement) => { element.setSelectionRange(0, 2) })
    const result = await clipboard(input, type)
    expect(result.prevented).toBe(false)
    expect(result.data).toEqual({}) // Native default action, not the document header.
    await expect(page.getByTestId('markdown-output')).toHaveText('| Name | Age |\n| --- | --- |\n| Ada | 42 |')
  })
}

test('native cell-text copy/paste targets the selection, not the table header', async ({ page }) => {
  await activate(page)
  const input = cell(page, 1, 0)
  await input.click()
  await input.evaluate((element: HTMLInputElement) => { element.setSelectionRange(0, 2) })
  await input.press('ControlOrMeta+c')
  const destination = cell(page, 1, 1)
  await destination.click()
  await destination.evaluate((element: HTMLInputElement) => { element.select() })
  await destination.press('ControlOrMeta+v')
  await expect(destination).toHaveValue('Ad')
  await expect(page.getByTestId('markdown-output')).toHaveText('| Name | Age |\n| --- | --- |\n| Ada | Ad |')
})

test('native cell-text cut updates only that cell and undo preserves the table', async ({ page }) => {
  await activate(page)
  const input = cell(page, 1, 0)
  await input.click()
  expect(await input.evaluate((element: HTMLInputElement) => {
    element.setSelectionRange(0, 2)
    return document.execCommand('cut')
  })).toBe(true)
  await expect(input).toHaveValue('a')
  await expect(page.getByTestId('markdown-output')).toHaveText('| Name | Age |\n| --- | --- |\n| a | 42 |')
  await input.press('ControlOrMeta+z')
  await expect(page.getByTestId('markdown-output')).toHaveText('| Name | Age |\n| --- | --- |\n| Ada | 42 |')
})

test('copies and pastes a single-column range as rows with undo intact', async ({ page }) => {
  await activate(page)
  await cell(page, 1, 1).press('Tab')
  await expect(cell(page, 2, 0)).toBeFocused()
  await cell(page, 2, 0).fill('Grace')
  await cell(page, 1, 0).click()
  await cell(page, 2, 0).click({ modifiers: ['Shift'] })
  const copied = await clipboard(cell(page, 2, 0), 'copy')
  expect(copied.data['text/plain']).toBe('Ada\nGrace')
  expect(copied.data['text/html']).toContain('<table>')
  await cell(page, 2, 1).press('Tab')
  await expect(cell(page, 3, 0)).toBeFocused()
  await clipboard(cell(page, 3, 0), 'paste', copied.data)
  await expect(cell(page, 4, 0)).toHaveValue('Grace')
  await expect(page.getByTestId('markdown-output')).toHaveText('| Name | Age |\n| --- | --- |\n| Ada | 42 |\n| Grace |  |\n| Ada |  |\n| Grace |  |')
  await cell(page, 3, 0).press('ControlOrMeta+z')
  await expect(page.getByTestId('markdown-output')).toHaveText('| Name | Age |\n| --- | --- |\n| Ada | 42 |\n| Grace |  |\n|  |  |')
})

test('accepts paragraph-wrapped HTML cells without flattening multiple paragraphs', async ({ page }) => {
  await activate(page)
  await cell(page, 1, 1).press('Tab')
  await expect(cell(page, 2, 0)).toBeFocused()
  await clipboard(cell(page, 2, 0), 'paste', { 'text/html': '<table><tr><td><div><p>Ada</p></div></td><td><p>42</p></td></tr></table>' })
  await expect(cell(page, 2, 0)).toHaveValue('Ada')
  const before = await page.getByTestId('markdown-output').textContent()
  await clipboard(cell(page, 2, 0), 'paste', { 'text/html': '<table><tr><td><p>one</p><p>two</p></td></tr></table>' })
  await expect(page.locator('[data-table-status]')).toContainText('multiline')
  expect(await page.getByTestId('markdown-output').textContent()).toBe(before)
})

test('rejects merged HTML with a useful message instead of shifting columns', async ({ page }) => {
  await activate(page)
  const before = await page.getByTestId('markdown-output').textContent()
  await clipboard(cell(page, 1, 0), 'paste', { 'text/html': '<table><tr><td colspan="2">A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>' })
  await expect(page.locator('[data-table-status]')).toContainText('merged cells')
  await expect(page.locator('[role=alertdialog]')).toHaveCount(0)
  expect(await page.getByTestId('markdown-output').textContent()).toBe(before)
})
