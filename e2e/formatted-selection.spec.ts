import { expect, test, type Page } from '@playwright/test'

async function clipboardText(page: Page, type: 'copy' | 'cut' = 'copy') {
  return page.locator('.cm-content').evaluate((content, eventType) => {
    const clipboard = new DataTransfer()
    const event = new Event(eventType, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: clipboard })
    content.dispatchEvent(event)
    return clipboard.getData('text/plain')
  }, type)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?fixture=formatted-selection')
})

test('copies an upward multiline selection with its complete opening bold marker', async ({ page }) => {
  await page.getByRole('button', { name: 'Select upward snippet' }).click()
  const text = await clipboardText(page)
  expect(text).toBe('**Bold opening** starts this snippet.\nContinue copying upward from here.')
  await page.getByRole('textbox', { name: 'Paste copied Markdown here' }).fill(text)
  await expect(page.locator('.me-renderer strong')).toHaveText('Bold opening')
})

for (const [button, expected] of [
  ['Select clipped closing marker', '**Bold opening**'],
  ['Select underscore bold', '__Underscore bold__'],
  ['Select nested formatting', '***bold italic***'],
]) {
  test(`restores complete markers: ${button}`, async ({ page }) => {
    await page.getByRole('button', { name: button }).click()
    expect(await clipboardText(page)).toBe(expected)
  })
}

test('cuts only the expanded formatted span and undo restores it', async ({ page }) => {
  const source = page.getByTestId('markdown-output')
  const original = await source.textContent()
  await page.getByRole('button', { name: 'Select underscore bold' }).click()
  expect(await clipboardText(page, 'cut')).toBe('__Underscore bold__')
  await expect(source).toHaveText(original!.replace('__Underscore bold__', ''))
  await page.locator('.cm-content').press('ControlOrMeta+z')
  await expect(source).toHaveText(original!)
})

test('keeps markers when extending a selection upward with the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Focus snippet end' }).click()
  const editor = page.locator('.cm-content')
  await editor.press('Home')
  await editor.press('Shift+ArrowUp')
  const text = await clipboardText(page)
  expect(text).toBe('**Bold opening** starts this snippet.\n')
})

test('keeps markers when dragging upward from the next line', async ({ page }) => {
  // Exercise native pointer selection across ordinary text and hidden markers.
  const lines = page.locator('.cm-content > .cm-line')
  await expect(lines.first()).toBeVisible()
  const end = await lines.nth(1).boundingBox()
  const start = await lines.first().boundingBox()
  await page.mouse.move(end!.x + 120, end!.y + end!.height / 2)
  await page.mouse.down()
  await page.mouse.move(start!.x, start!.y + start!.height / 2, { steps: 8 })
  await page.mouse.up()
  const text = await clipboardText(page)
  expect(text).toMatch(/^\*\*Bold opening\*\* starts this snippet\.\nContinue/)
})
