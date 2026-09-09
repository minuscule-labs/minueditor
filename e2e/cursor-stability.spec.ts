import { expect, test } from '@playwright/test'

test('preserves source, selection ownership, and focus through list → code → prose', async ({ page }) => {
  await page.goto('/?fixture=cursor-stability')

  const editor = page.locator('.cm-content')
  const markdown = page.getByTestId('markdown-output')
  await expect(editor).toBeFocused()

  await page.keyboard.type('- parent')
  await page.keyboard.press('Enter')
  await page.keyboard.type('child')
  await expect(markdown).toHaveText('- parent\n- child')

  await page.keyboard.press('Tab')
  await expect(markdown).toHaveText('- parent\n    - child')
  await page.keyboard.press('Shift+Tab')
  await expect(markdown).toHaveText('- parent\n- child')

  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('```js')
  await page.keyboard.press('Enter')

  const nestedCode = page.locator('.me-codeblock-editor-host .cm-content')
  await expect(nestedCode).toBeFocused()
  await page.keyboard.type('const value = true')
  await expect(markdown).toHaveText('- parent\n- child\n```js\nconst value = true\n```')

  await page.keyboard.press('Escape')
  await expect(editor).toBeFocused()
  await page.keyboard.type('After the block')

  const finalSource = '- parent\n- child\n```js\nconst value = true\n```\nAfter the block'
  await expect(markdown).toHaveText(finalSource)

  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${mod}+z`)
  await expect(markdown).not.toHaveText(finalSource)
  await page.keyboard.press(`${mod}+Shift+z`)
  await expect(markdown).toHaveText(finalSource)
})
