import { expect, test } from '@playwright/test'

test('edits and restructures a table through the production widget command path', async ({ page }) => {
  await page.goto('/?fixture=table-commands')

  const markdown = page.getByTestId('markdown-output')
  const widget = page.locator('.me-table-widget')
  await widget.click()

  const firstBodyCell = page.locator('.me-table-input[data-row-index="1"][data-col-index="0"]')
  await firstBodyCell.click()
  await expect(firstBodyCell).toBeFocused()
  await firstBodyCell.fill('Grace')
  await expect(markdown).toHaveText('| Name | Age |\n| --- | --- |\n| Grace | 42 |')

  await page.keyboard.press('Meta+Control+ArrowRight')
  await expect(markdown).toHaveText('| Name |  | Age |\n| --- | --- | --- |\n| Grace |  | 42 |')

  const insertedCell = page.locator('.me-table-input[data-row-index="1"][data-col-index="1"]')
  await expect(insertedCell).toBeFocused()
  await expect(page.locator('.me-table-input')).toHaveCount(6)
  await page.keyboard.press('Meta+Control+Shift+Backspace')
  await expect(markdown).toHaveText('| Name | Age |\n| --- | --- |\n| Grace | 42 |')
  await expect(page.locator('.me-table-input')).toHaveCount(4)

  await firstBodyCell.click()
  await page.keyboard.press('Meta+Control+ArrowRight')
  await expect(insertedCell).toBeFocused()
  await insertedCell.fill('Compiler')
  await expect(markdown).toHaveText('| Name |  | Age |\n| --- | --- | --- |\n| Grace | Compiler | 42 |')
})

test('uses terminal Tab to add a row and Shift+Tab to exit the table', async ({ page }) => {
  await page.goto('/?fixture=table-commands')

  await page.locator('.me-table-widget').click()
  const finalBodyCell = page.locator('.me-table-input[data-row-index="1"][data-col-index="1"]')
  await finalBodyCell.click()
  await finalBodyCell.press('Tab')

  const addedRowCell = page.locator('.me-table-input[data-row-index="2"][data-col-index="0"]')
  await expect(addedRowCell).toBeFocused()
  await expect(page.getByTestId('markdown-output')).toHaveText('| Name | Age |\n| --- | --- |\n| Ada | 42 |\n|  |  |')

  const firstHeaderCell = page.locator('.me-table-input[data-row-index="0"][data-col-index="0"]')
  await firstHeaderCell.click()
  await firstHeaderCell.press('Shift+Tab')
  await expect(page.locator('.cm-content')).toBeFocused()
})

test('uses the active cell as the Shift-click anchor after an ordinary edit', async ({ page }) => {
  await page.goto('/?fixture=table-commands')

  await page.locator('.me-table-widget').click()
  const firstBodyCell = page.locator('.me-table-input[data-row-index="1"][data-col-index="0"]')
  const secondBodyCell = page.locator('.me-table-input[data-row-index="1"][data-col-index="1"]')
  await firstBodyCell.click()
  await firstBodyCell.fill('Ada Lovelace')
  const widget = page.locator('.me-table-widget')
  await expect(widget).toHaveAttribute('data-shift-anchor-row', '1')
  await expect(widget).toHaveAttribute('data-shift-anchor-col', '0')

  await secondBodyCell.click({ modifiers: ['Shift'] })
  await expect(widget).toHaveAttribute('data-selection-anchor-row', '1')
  await expect(widget).toHaveAttribute('data-selection-anchor-col', '0')
  await expect(page.locator('.me-table-cell--selected')).toHaveCount(2)
  await expect(firstBodyCell.locator('xpath=ancestor::td')).toHaveClass(/me-table-cell--selected/)
  await expect(secondBodyCell.locator('xpath=ancestor::td')).toHaveClass(/me-table-cell--selected/)
})

test('clears mirrored cell-range state after a same-shape range deletion', async ({ page }) => {
  await page.goto('/?fixture=table-commands')

  await page.locator('.me-table-widget').click()
  const firstBodyCell = page.locator('.me-table-input[data-row-index="1"][data-col-index="0"]')
  await firstBodyCell.click()
  await firstBodyCell.click({ modifiers: ['Shift'] })
  await expect(page.locator('.me-table-cell--selected')).toHaveCount(1)

  await firstBodyCell.press('Delete')
  const widget = page.locator('.me-table-widget')
  await expect(page.getByTestId('markdown-output')).toHaveText('| Name | Age |\n| --- | --- |\n|  | 42 |')
  await expect(page.locator('.me-table-cell--selected')).toHaveCount(0)
  await expect(widget).not.toHaveAttribute('data-selection-anchor-row')
  await expect(widget).not.toHaveAttribute('data-selection-anchor-col')
  await expect(widget).not.toHaveAttribute('data-selection-focus-row')
  await expect(widget).not.toHaveAttribute('data-selection-focus-col')
})

test('restores persistent active-cell state after an external document update', async ({ page }) => {
  await page.goto('/?fixture=table-interaction')

  await page.locator('.me-table-widget').click()
  await page.locator('.me-table-input[data-row-index="1"][data-col-index="1"]').click()
  await expect(page.locator('.me-table-widget')).toHaveAttribute('data-active-row-index', '1')
  await expect(page.locator('.me-table-widget')).toHaveAttribute('data-active-col-index', '1')

  await page.getByRole('button', { name: 'Prepend prose' }).click()
  await expect(page.locator('.me-table-widget')).toHaveAttribute('data-active-row-index', '1')
  await expect(page.locator('.me-table-widget')).toHaveAttribute('data-active-col-index', '1')
})

test('keeps contextual control availability in sync after undo', async ({ page }) => {
  await page.goto('/?fixture=table-commands')

  const widget = page.locator('.me-table-widget')
  await widget.click()
  const firstBodyCell = page.locator('.me-table-input[data-row-index="1"][data-col-index="0"]')
  await firstBodyCell.click()
  await page.keyboard.press('Meta+Control+ArrowRight')

  const insertedCell = page.locator('.me-table-input[data-row-index="1"][data-col-index="1"]')
  await insertedCell.fill('Temporary value')
  const removeColumn = page.getByRole('button', { name: 'Remove column' })
  await expect(removeColumn).toBeDisabled()

  await insertedCell.press('Meta+z')
  await expect(removeColumn).toBeEnabled()
})

test('returns focus to the editor after deleting a table', async ({ page }) => {
  await page.goto('/?fixture=table-commands')

  await page.locator('.me-table-widget').click()
  await page.getByRole('button', { name: 'Delete table' }).click()

  await expect(page.getByTestId('markdown-output')).toHaveText('')
  await expect(page.locator('.cm-content')).toBeFocused()
})

test('rejects picker insertion after the document changes', async ({ page }) => {
  await page.goto('/?fixture=table-commands')

  await page.locator('.me-table-widget').click()
  await page.getByTitle('Insert table').click()
  const picker = page.getByRole('dialog', { name: 'Insert table' })
  const firstBodyCell = page.locator('.me-table-input[data-row-index="1"][data-col-index="0"]')
  await firstBodyCell.fill('Ada Lovelace')

  await picker.getByRole('button', { name: 'Insert' }).click()
  await expect(picker.getByRole('alert')).toHaveText('The document changed. Reopen the picker to choose a new insertion location.')
  await expect(page.getByTestId('markdown-output')).toHaveText('| Name | Age |\n| --- | --- |\n| Ada Lovelace | 42 |')
  await expect(page.locator('.me-table-input')).toHaveCount(4)
})

test('creates a table through the shared toolbar picker', async ({ page }) => {
  await page.goto('/?fixture=table-commands')

  await page.getByTitle('Insert table').click()
  const picker = page.getByRole('dialog', { name: 'Insert table' })
  await expect(picker).toBeVisible()
  await picker.getByRole('spinbutton', { name: 'Columns' }).fill('3')
  const bodyRows = picker.getByRole('spinbutton', { name: 'Body rows' })
  await bodyRows.fill('2')
  await bodyRows.press('Enter')

  await expect(page.getByTestId('markdown-output')).toHaveText(
    '| Name | Age |\n| --- | --- |\n| Ada | 42 |\n\n|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n\n',
  )
  await expect(page.locator('.me-table-input[data-row-index="0"][data-col-index="0"]')).toBeFocused()
})
