import { expect, test, type Locator } from '@playwright/test'

async function layout(root: Locator) {
  return root.evaluate(element => {
    const table = element.querySelector('table')!
    const scroller = element.querySelector('.me-table-scroller, .me-renderer-table-scroller')!
    const cell = table.querySelectorAll('td')[1]!
    const style = getComputedStyle(cell)
    return {
      table: table.getBoundingClientRect().width,
      viewport: scroller.clientWidth,
      scroll: scroller.scrollWidth,
      cellHeight: cell.getBoundingClientRect().height,
      lineHeight: parseFloat(style.lineHeight),
      padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
    }
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?fixture=table-wrapping')
})

for (const area of ['editor', 'renderer'] as const) {
  test(`${area}: prose wraps within the available width and reflows on resize`, async ({ page }) => {
    const root = page.getByTestId(`table-wrap-${area}`)
    const before = await page.getByTestId('table-wrap-markdown').textContent()
    await page.getByRole('button', { name: 'Narrow width' }).click()
    await expect.poll(async () => {
      const result = await layout(root)
      return result.scroll - result.viewport
    }).toBeLessThanOrEqual(2)
    const narrow = await layout(root)
    expect(narrow.cellHeight - narrow.padding).toBeGreaterThan(narrow.lineHeight * 2)
    await page.getByRole('button', { name: 'Wide width' }).click()
    await expect.poll(async () => (await layout(root)).cellHeight).toBeLessThan(narrow.cellHeight)
    expect(await page.getByTestId('table-wrap-markdown').textContent()).toBe(before)
  })

  test(`${area}: long identifiers and inline code wrap without changing text or spacing`, async ({ page }) => {
    await page.getByRole('button', { name: 'Long tokens example' }).click()
    const root = page.getByTestId(`table-wrap-${area}`)
    const before = await page.getByTestId('table-wrap-markdown').textContent()
    const code = root.locator('td code')
    const text = await code.textContent()
    await page.getByRole('button', { name: 'Narrow width' }).click()
    await expect.poll(async () => {
      const result = await layout(root)
      return result.scroll - result.viewport
    }).toBeLessThanOrEqual(2)
    expect(await code.evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size
    })).toBeGreaterThan(1)
    expect(await code.textContent()).toBe(text)
    expect(text).toContain('  tail')
    expect(await page.getByTestId('table-wrap-markdown').textContent()).toBe(before)
  })

  test(`${area}: compact tables stay content-sized instead of filling the editor`, async ({ page }) => {
    await page.getByRole('button', { name: 'Compact example' }).click()
    const result = await layout(page.getByTestId(`table-wrap-${area}`))
    expect(result.table).toBeLessThan(result.viewport * 0.75)
    expect(result.scroll).toBeLessThanOrEqual(result.viewport + 2)
  })

  test(`${area}: many-column tables scroll locally without spilling onto the page`, async ({ page }) => {
    await page.getByRole('button', { name: 'Wide example' }).click()
    await page.getByRole('button', { name: 'Narrow width' }).click()
    const root = page.getByTestId(`table-wrap-${area}`)
    await expect.poll(async () => {
      const result = await layout(root)
      return result.scroll - result.viewport
    }).toBeGreaterThan(50)
    const scroller = root.locator('.me-table-scroller, .me-renderer-table-scroller')
    await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth })
    expect(await scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2)
  })
}

test('editing retains single-line raw inputs and horizontal scrolling, then restores wrapped previews', async ({ page }) => {
  await page.getByRole('button', { name: 'Long tokens example' }).click()
  await page.getByRole('button', { name: 'Narrow width' }).click()
  const root = page.getByTestId('table-wrap-editor')
  const before = await page.getByTestId('table-wrap-markdown').textContent()
  await root.locator('td code').click()
  const first = root.locator('.me-table-input').first()
  await expect(first).toBeFocused()
  await expect(root.locator('textarea')).toHaveCount(0)
  const code = root.locator('.me-table-input').nth(5)
  expect(await code.inputValue()).toMatch(/^`minueditor_resource_.*  tail`$/)
  expect(await code.evaluate(element => (element as HTMLInputElement).type)).toBe('text')
  expect(await root.locator('.me-table-scroller').evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(50)
  await first.press('Escape')
  await expect(root.locator('.me-table-input')).toHaveCount(0)
  await expect.poll(async () => {
    const result = await layout(root)
    return result.scroll - result.viewport
  }).toBeLessThanOrEqual(2)
  expect(await page.getByTestId('table-wrap-markdown').textContent()).toBe(before)
})

test('read-only previews still wrap and source mode stays literal', async ({ page }) => {
  await page.getByRole('button', { name: 'Narrow width' }).click()
  await page.getByRole('button', { name: 'Read-only: off' }).click()
  const root = page.getByTestId('table-wrap-editor')
  await root.locator('td').first().click()
  await expect(root.locator('.me-table-input')).toHaveCount(0)
  expect((await layout(root)).scroll - (await layout(root)).viewport).toBeLessThanOrEqual(2)
  await page.getByRole('button', { name: 'Mode: live' }).click()
  await expect(root.locator('.me-table-widget')).toHaveCount(0)
  await expect(root.locator('.cm-content')).toContainText('| Key | **Description** | State |')
})

test('wide static tables remain contained inside flex and grid hosts', async ({ page }) => {
  await page.getByRole('button', { name: 'Wide example' }).click()
  await page.getByRole('button', { name: 'Narrow width' }).click()
  const root = page.getByTestId('table-wrap-renderer')
  for (const display of ['flex', 'grid']) {
    await root.evaluate((element, display) => {
      const host = element as HTMLElement
      const renderer = element.firstElementChild as HTMLElement
      host.style.display = display
      host.style.gridTemplateColumns = '1fr'
      renderer.style.flex = '1'
    }, display)
    expect(await root.evaluate(element => {
      return element.firstElementChild!.getBoundingClientRect().width - element.getBoundingClientRect().width
    })).toBeLessThanOrEqual(2)
    const result = await layout(root)
    expect(result.scroll - result.viewport).toBeGreaterThan(50)
  }
})

test('the shared preview column minimum can be customized without changing Markdown', async ({ page }) => {
  await page.getByRole('button', { name: 'Narrow width' }).click()
  const before = await page.getByTestId('table-wrap-markdown').textContent()
  await page.getByTestId('table-wrap-width').evaluate(element => {
    element.querySelectorAll<HTMLElement>('.minueditor, .minueditor-wrap, .me-renderer').forEach(root => {
      root.style.setProperty('--me-table-cell-min-width', '16ch')
    })
  })
  for (const area of ['editor', 'renderer']) {
    await expect.poll(async () => {
      const result = await layout(page.getByTestId(`table-wrap-${area}`))
      return result.scroll - result.viewport
    }).toBeGreaterThan(100)
  }
  expect(await page.getByTestId('table-wrap-markdown').textContent()).toBe(before)
})

test('mobile-width previews do not create page-wide overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Narrow width' }).click()
  for (const area of ['editor', 'renderer']) {
    const root = page.getByTestId(`table-wrap-${area}`)
    const result = await layout(root)
    // If column minima cannot fit, overflow belongs to the local scroller.
    expect(result.table).toBeLessThanOrEqual(result.scroll + 2)
    expect(result.viewport).toBeLessThan(390)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2)
})
