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
  await insertedCell.fill('Compiler')
  await expect(markdown).toHaveText('| Name |  | Age |\n| --- | --- | --- |\n| Grace | Compiler | 42 |')
})
