import { expect, test, type Page } from '@playwright/test'

const tasks = '- [ ] Open task\n- [/] Partial task\n- [x] Done task\n  - [/] Nested task'

async function sourceClipboard(page: Page, type: 'copy' | 'cut' = 'copy') {
  return page.getByTestId('task-source-editor').locator('.cm-content').evaluate((content, eventType) => {
    const clipboard = new DataTransfer()
    const event = new Event(eventType, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: clipboard })
    content.dispatchEvent(event)
    return clipboard.getData('text/plain')
  }, type)
}

async function pasteDestination(page: Page, plain: string, html = '', focus = true) {
  if (focus) await page.getByRole('button', { name: 'Focus paste destination' }).click()
  await page.getByTestId('task-target-editor').locator('.cm-content').evaluate((content, data) => {
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', data.plain)
    clipboard.setData('text/html', data.html)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: clipboard })
    content.dispatchEvent(event)
  }, { plain, html })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?fixture=task-clipboard')
})

test('copies and pastes exact task Markdown with every state and nested item', async ({ page }) => {
  await page.getByRole('button', { name: 'Select all source items' }).click()
  expect(await sourceClipboard(page)).toBe(tasks)
  await pasteDestination(page, tasks)
  await expect(page.getByTestId('task-target-markdown')).toHaveText(tasks)
  await expect(page.getByTestId('task-target-editor').locator('.me-checkbox')).toHaveCount(4)
})

test('normalizes a copied partial task into the empty item created by Enter', async ({ page }) => {
  await page.getByRole('button', { name: 'Select clipped partial marker' }).click()
  const copied = await sourceClipboard(page)
  await page.getByRole('button', { name: 'Prepare task before Enter' }).click()
  const content = page.getByTestId('task-target-editor').locator('.cm-content')
  await content.press('Enter')
  await expect(page.getByTestId('task-target-markdown')).toHaveText('- [x] Existing task\n- [ ] ')
  await pasteDestination(page, copied, '', false)
  await expect(page.getByTestId('task-target-markdown')).toHaveText('- [x] Existing task\n- [/] Partial task')
  const checkboxes = page.getByTestId('task-target-editor').locator('.me-checkbox')
  await expect(checkboxes).toHaveCount(2)
  await expect(checkboxes.nth(1)).toHaveAttribute('aria-checked', 'mixed')
  await content.press('ControlOrMeta+z')
  await expect(page.getByTestId('task-target-markdown')).toHaveText('- [x] Existing task\n- [ ] ')
})

test('normalizes rendered HTML tasks into an Enter-created item without losing nesting', async ({ page }) => {
  await page.getByRole('button', { name: 'Prepare task before Enter' }).click()
  await page.getByTestId('task-target-editor').locator('.cm-content').press('Enter')
  await page.getByRole('button', { name: 'Simulate rendered HTML paste' }).click()
  await expect(page.getByTestId('task-target-markdown')).toHaveText('- [x] Existing task\n' + tasks)
  await expect(page.getByTestId('task-target-editor').locator('.me-checkbox')).toHaveCount(5)
})

test('keeps the new empty checkbox when pasting only a label', async ({ page }) => {
  await page.getByRole('button', { name: 'Prepare task before Enter' }).click()
  await page.getByTestId('task-target-editor').locator('.cm-content').press('Enter')
  await pasteDestination(page, 'Partial task', '', false)
  await expect(page.getByTestId('task-target-markdown')).toHaveText('- [x] Existing task\n- [ ] Partial task')
})

for (const kind of ['bullet', 'numbered'] as const) {
  test(`normalizes copied and rendered ${kind} lists into an Enter-created item`, async ({ page }) => {
    const original = kind === 'bullet' ? '- Existing bullet' : '1. Existing numbered item'
    const empty = kind === 'bullet' ? '- ' : '2. '
    const source = kind === 'bullet' ? '- Pasted bullet\n  - Nested bullet' : '1. Pasted numbered item\n   1. Nested numbered item'
    await page.getByRole('button', { name: `Use ${kind} source` }).click()
    await page.getByRole('button', { name: 'Select all source items' }).click()
    expect(await sourceClipboard(page)).toBe(source)
    await page.getByRole('button', { name: kind === 'bullet' ? 'Prepare bullet before Enter' : 'Prepare numbered item before Enter' }).click()
    const content = page.getByTestId('task-target-editor').locator('.cm-content')
    await content.press('Enter')
    await expect(page.getByTestId('task-target-markdown')).toHaveText(original + '\n' + empty)
    await pasteDestination(page, source, '', false)
    await expect(page.getByTestId('task-target-markdown')).toHaveText(original + '\n' + source)
    await content.press('ControlOrMeta+z')
    await expect(page.getByTestId('task-target-markdown')).toHaveText(original + '\n' + empty)
    await page.getByRole('button', { name: 'Simulate rendered HTML paste' }).click()
    await expect(page.getByTestId('task-target-markdown')).toHaveText(original + '\n' + source)
  })
}

test('repairs a clipped slash prefix but leaves a deliberately selected label plain', async ({ page }) => {
  await page.getByRole('button', { name: 'Select clipped partial marker' }).click()
  expect(await sourceClipboard(page)).toBe('- [/] Partial task')
  await page.getByRole('button', { name: 'Select partial-task label' }).click()
  expect(await sourceClipboard(page)).toBe('Partial task')
})

test('cuts a complete partial-task marker and undo restores it', async ({ page }) => {
  await page.getByRole('button', { name: 'Select clipped partial marker' }).click()
  expect(await sourceClipboard(page, 'cut')).toBe('- [/] Partial task')
  await expect(page.getByTestId('task-source-markdown')).toHaveText(tasks.replace('- [/] Partial task', ''))
  await page.getByTestId('task-source-editor').locator('.cm-content').press('ControlOrMeta+z')
  await expect(page.getByTestId('task-source-markdown')).toHaveText(tasks)
})

test('recovers all states from the renderer HTML rather than dropping checkboxes', async ({ page }) => {
  await page.getByRole('button', { name: 'Simulate rendered HTML paste' }).click()
  await expect(page.getByTestId('task-target-markdown')).toHaveText(tasks)
  const checkboxes = page.getByTestId('task-target-editor').locator('.me-checkbox')
  await expect(checkboxes).toHaveCount(4)
  await expect(checkboxes.nth(0)).toHaveAttribute('aria-checked', 'false')
  await expect(checkboxes.nth(1)).toHaveAttribute('aria-checked', 'mixed')
  await expect(checkboxes.nth(2)).toHaveAttribute('aria-checked', 'true')
  await expect(checkboxes.nth(3)).toHaveAttribute('aria-checked', 'mixed')
})

test('imports the updated checkbox state after the source task is toggled', async ({ page }) => {
  await page.getByTestId('task-source-editor').locator('.me-checkbox').nth(2).click()
  const updated = tasks.replace('- [x] Done task', '- [ ] Done task')
  await expect(page.getByTestId('task-source-markdown')).toHaveText(updated)
  await page.getByRole('button', { name: 'Simulate rendered HTML paste' }).click()
  await expect(page.getByTestId('task-target-markdown')).toHaveText(updated)
})

test('preserves tab-indented task source instead of making a table', async ({ page }) => {
  const plain = '- [ ] Parent\n\t- [/] Child'
  await pasteDestination(page, plain, '<ul><li><input type="checkbox" checked>Different</li></ul>')
  await expect(page.getByTestId('task-target-markdown')).toHaveText(plain)
  await expect(page.getByTestId('task-target-editor').locator('.me-table-widget')).toHaveCount(0)
})

test('uses HTML task structure instead of mistaking browser indentation for TSV', async ({ page }) => {
  await pasteDestination(page, 'Parent\n\tChild', '<ul><li><input type="checkbox">Parent<ul><li><span role="checkbox" aria-checked="mixed"></span>Child</li></ul></li></ul>')
  await expect(page.getByTestId('task-target-markdown')).toHaveText('- [ ] Parent\n  - [/] Child')
  await expect(page.getByTestId('task-target-editor').locator('.me-table-widget')).toHaveCount(0)
})

test('keeps raw prefix copying exact in source mode', async ({ page }) => {
  await page.getByRole('button', { name: 'Source mode: live' }).click()
  await page.getByRole('button', { name: 'Select clipped partial marker' }).click()
  expect(await sourceClipboard(page)).toBe('/] Partial task')
})

test('supports the plain-text paste escape hatch without recreating checkbox states', async ({ page }) => {
  await page.getByRole('button', { name: 'Focus paste destination' }).click()
  // Pair one synthetic gesture with one synthetic paste; a real shortcut can
  // consume the request with its own native clipboard event in Firefox.
  await page.getByTestId('task-target-editor').locator('.cm-content').dispatchEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true })
  await pasteDestination(page, 'Task', '<ul><li><input type="checkbox" checked>Task</li></ul>', false)
  await expect(page.getByTestId('task-target-markdown')).toHaveText('Task')
  await expect(page.getByTestId('task-target-editor').locator('.me-checkbox')).toHaveCount(0)
})
