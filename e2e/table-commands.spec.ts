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

test('creates a table through the shared toolbar picker', async ({ page }) => {
  await page.goto('/?fixture=table-commands')

  await page.getByTitle('Insert table').click()
  const picker = page.getByRole('dialog', { name: 'Insert table' })
  await expect(picker).toBeVisible()
  await picker.getByRole('spinbutton', { name: 'Columns' }).fill('3')
  await picker.getByRole('spinbutton', { name: 'Body rows' }).fill('2')
  await picker.getByRole('button', { name: 'Insert' }).click()

  await expect(page.getByTestId('markdown-output')).toHaveText(
    '| Name | Age |\n| --- | --- |\n| Ada | 42 |\n\n|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n\n',
  )
  await expect(page.locator('.me-table-input[data-row-index="0"][data-col-index="0"]')).toBeFocused()
})
