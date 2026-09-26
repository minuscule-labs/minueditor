import { expect, test } from '@playwright/test'

test('editing a styled bullet does not remount or reset a rendered Mermaid diagram', async ({ page }) => {
  await page.goto('/?fixture=mermaid-stability')

  const diagram = page.locator('.me-mermaid-block--ready')
  await expect(diagram.locator('svg')).toBeVisible()
  await diagram.getByRole('button', { name: 'Zoom in' }).click()
  await expect(diagram.locator('svg')).toHaveCSS('transform', /matrix\(1\.25/)
  await page.evaluate(() => {
    (window as typeof window & { __mermaidBlock?: Element }).__mermaidBlock = document.querySelector('.me-mermaid-block') ?? undefined
  })

  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.type('more ')
  await expect(page.getByTestId('markdown-output')).toContainText('more - **Bold** item')
  expect(await page.evaluate(() => document.querySelector('.me-mermaid-block') ===
    (window as typeof window & { __mermaidBlock?: Element }).__mermaidBlock)).toBe(true)
  await expect(diagram.locator('svg')).toHaveCSS('transform', /matrix\(1\.25/)

  await diagram.getByRole('button', { name: 'Edit source' }).click()
  await expect(page.locator('.me-mermaid-block')).toHaveCount(0)
  await expect(editor).toContainText('A --> B')
})
