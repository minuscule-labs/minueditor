import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?fixture=table-inline')
})

test('renders inline formatting in headers and body cells without changing Markdown', async ({ page }) => {
  const editor = page.getByTestId('table-inline-editor')
  const source = await page.getByTestId('table-inline-markdown').textContent()
  await expect(editor.locator('th strong')).toHaveText('Feature')
  await expect(editor.locator('th em')).toHaveText('Example')
  await expect(editor.locator('td strong em')).toHaveText('nested')
  await expect(editor.locator('td del')).toHaveText('old')
  const codes = editor.locator('td code')
  await expect(codes).toHaveText(['inline code', 'a ` b', 'left|right', 'a  b'])
  expect(await codes.last().evaluate(element => getComputedStyle(element).whiteSpace)).toBe('pre')
  expect(await page.getByTestId('table-inline-renderer').locator('td code').last().evaluate(element => getComputedStyle(element).whiteSpace)).toBe('pre')
  await expect(page.getByTestId('table-inline-markdown')).toHaveText(source!)
})

test('edits raw source and returns to formatted previews with undo intact', async ({ page }) => {
  const editor = page.getByTestId('table-inline-editor')
  const before = await page.getByTestId('table-inline-markdown').textContent()
  await editor.locator('td code').first().click()
  const input = editor.locator('.me-table-input').first()
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('**Feature**')
  await expect(editor.locator('.me-table-input').nth(5)).toHaveValue('~~old~~')
  await input.fill('__Changed__')
  await input.press('Escape')
  await expect(editor.locator('th strong')).toHaveText('Changed')
  await editor.locator('.cm-content').press('ControlOrMeta+z')
  await expect(editor.locator('th strong')).toHaveText('Feature')
  await expect(page.getByTestId('table-inline-markdown')).toHaveText(before!)
})

test('keeps read-only previews formatted and inactive', async ({ page }) => {
  await page.getByRole('button', { name: 'Read-only: off' }).click()
  const editor = page.getByTestId('table-inline-editor')
  await editor.locator('td code').first().click()
  await expect(editor.locator('.me-table-input')).toHaveCount(0)
  await expect(editor.locator('th strong')).toHaveText('Feature')
})

test('preserves literal source mode and restores formatted live previews', async ({ page }) => {
  const editor = page.getByTestId('table-inline-editor')
  await page.getByRole('button', { name: 'Mode: live' }).click()
  await expect(editor.locator('.me-table-widget')).toHaveCount(0)
  await expect(editor.locator('.cm-content')).toContainText('**Feature**')
  await page.getByRole('button', { name: 'Mode: source' }).click()
  await expect(editor.locator('th strong')).toHaveText('Feature')
})

test('refreshes inline previews after an external update', async ({ page }) => {
  await page.getByRole('button', { name: 'Replace header externally' }).click()
  await expect(page.getByTestId('table-inline-editor').locator('th code')).toHaveText('Updated')
})

test('shows non-navigating link labels while retaining click-to-edit behavior', async ({ page }) => {
  const editor = page.getByTestId('table-inline-editor')
  await expect(editor.locator('.me-table-inline-link')).toHaveText('link label')
  await expect(editor.locator('.me-table-render a')).toHaveCount(0)
  await editor.locator('.me-table-inline-link').click()
  await expect(editor.locator('.me-table-input').first()).toBeFocused()
  await expect(editor.locator('.me-table-input').nth(9)).toHaveValue('[link label](https://example.com)')
})
