import { expect, test, type Page } from '@playwright/test'

type Surface = 'editor' | 'page-editor' | 'parent-editor' | 'renderer' | 'page-renderer'

async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 3; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
  })
}

async function markReadingPosition(page: Page, surface: Surface) {
  await page.evaluate((surface) => {
    const scroller = surface === 'editor' ? document.querySelector('.cm-scroller')!
      : surface === 'parent-editor' ? document.querySelector('[data-testid="parent-scroll"]')!
      : surface === 'renderer' ? document.querySelector('[data-testid="renderer-scroll"]')!
      : document.scrollingElement!
    scroller.scrollTop = 750
  }, surface)
  await settleLayout(page)
  return page.evaluate((surface) => {
    const scroller = surface === 'editor' ? document.querySelector('.cm-scroller')!
      : surface === 'parent-editor' ? document.querySelector('[data-testid="parent-scroll"]')!
      : surface === 'renderer' ? document.querySelector('[data-testid="renderer-scroll"]')!
      : document.scrollingElement!
    const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top
    const anchor = [...document.querySelectorAll<HTMLElement>('.me-mermaid-block')]
      .find((block) => block.getBoundingClientRect().bottom > top + 30)!
    anchor.dataset.testid = 'reading-anchor'
    return anchor.getBoundingClientRect().top
  }, surface)
}

async function finishNextDiagram(page: Page) {
  const renders = await page.getByTestId('diagram-renders').textContent()
  await page.evaluate(() => window.dispatchEvent(new Event('render-next-mermaid')))
  await expect(page.getByTestId('diagram-renders')).not.toHaveText(renders!)
  await settleLayout(page)
}

for (const surface of ['editor', 'page-editor', 'parent-editor', 'renderer', 'page-renderer'] as const) {
  test(`${surface}: diagrams finishing above the viewport preserve the reading position`, async ({ page }) => {
    await page.goto(`/?fixture=mermaid-scroll&surface=${surface}`)
    await expect(page.getByTestId('pending-diagrams')).toHaveText('1')
    const before = await markReadingPosition(page, surface)
    for (let diagram = 0; diagram < 2; diagram++) {
      await finishNextDiagram(page)
      const after = await page.getByTestId('reading-anchor').evaluate((element) => element.getBoundingClientRect().top)
      expect(Math.abs(after - before)).toBeLessThanOrEqual(2)
    }
    await expect(page.locator('.cm-focused')).toHaveCount(0)
  })
}

for (const surface of ['editor', 'page-editor', 'parent-editor'] as const) {
  test(`${surface}: failed diagrams preserve the reading position too`, async ({ page }) => {
    await page.goto(`/?fixture=mermaid-scroll&surface=${surface}&fail`)
    await expect(page.getByTestId('pending-diagrams')).toHaveText('1')
    const before = await markReadingPosition(page, surface)
    await finishNextDiagram(page)
    await expect(page.locator('.me-mermaid-block--error')).toHaveCount(1)
    const after = await page.getByTestId('reading-anchor').evaluate((element) => element.getBoundingClientRect().top)
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2)
  })
}

test('real Mermaid rendering preserves the page-scrolled reading position', async ({ page }) => {
  await page.goto('/?fixture=mermaid-scroll&surface=page-editor&real')
  await expect(page.getByTestId('pending-diagrams')).toHaveText('1')
  const before = await markReadingPosition(page, 'page-editor')
  await finishNextDiagram(page)
  const after = await page.getByTestId('reading-anchor').evaluate((element) => element.getBoundingClientRect().top)
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2)
  await expect(page.locator('.me-mermaid-block--error')).toHaveCount(0)
})

test('focused editors do not double-adjust the scroll or follow the cursor during loading', async ({ page }) => {
  await page.goto('/?fixture=mermaid-scroll&surface=page-editor')
  await expect(page.getByTestId('pending-diagrams')).toHaveText('1')
  await page.locator('.cm-content').evaluate((element: HTMLElement) => element.focus({ preventScroll: true }))
  const before = await markReadingPosition(page, 'page-editor')
  await finishNextDiagram(page)
  const after = await page.getByTestId('reading-anchor').evaluate((element) => element.getBoundingClientRect().top)
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2)
  await expect(page.locator('.cm-content')).toBeFocused()
})

test('temporary measurement DOM cannot change the page height or scroll position', async ({ page }) => {
  await page.goto('/?fixture=mermaid-scroll&surface=page-renderer')
  await expect(page.getByTestId('pending-diagrams')).toHaveText('1')
  await markReadingPosition(page, 'page-renderer')
  const before = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, top: window.scrollY }))
  await page.getByTestId('mermaid-measurement').evaluate((element) => { element.style.height = '100000px' })
  await settleLayout(page)
  expect(await page.evaluate(() => ({ height: document.documentElement.scrollHeight, top: window.scrollY }))).toEqual(before)
})

test('revisiting an offscreen diagram reuses its SVG and measured height', async ({ page }) => {
  await page.goto('/?fixture=mermaid-scroll')
  await expect(page.getByTestId('pending-diagrams')).toHaveText('1')
  await finishNextDiagram(page)
  const first = page.locator('.me-mermaid-block').filter({ hasText: 'Diagram 1' })
  await expect(first).toBeVisible()
  const height = await first.evaluate((element) => element.getBoundingClientRect().height)

  await page.locator('.cm-scroller').evaluate((element) => { element.scrollTop = 3500 })
  await expect(first).toHaveCount(0)
  await settleLayout(page)
  const renders = await page.getByTestId('diagram-renders').textContent()
  await page.locator('.cm-scroller').evaluate((element) => { element.scrollTop = 0 })
  // No release of the next pending render: the returning block must be cached.
  await expect(first).toBeVisible()
  await settleLayout(page)
  expect(await first.evaluate((element) => element.getBoundingClientRect().height)).toBe(height)
  await expect(page.getByTestId('diagram-renders')).toHaveText(renders!)

  await page.setViewportSize({ width: 420, height: 720 })
  await settleLayout(page)
  expect(await first.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(height)
})

test('loading diagrams below the viewport does not scroll the page', async ({ page }) => {
  await page.goto('/?fixture=mermaid-scroll&surface=page-editor')
  await expect(page.getByTestId('pending-diagrams')).toHaveText('1')
  const before = await page.evaluate(() => window.scrollY)
  await finishNextDiagram(page)
  expect(await page.evaluate(() => window.scrollY)).toBe(before)
})
