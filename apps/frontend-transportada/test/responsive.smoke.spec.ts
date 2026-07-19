import { expect, test } from '@playwright/test'

const VIEWPORTS = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 1024, name: 'tablet', width: 768 },
  { height: 900, name: 'desktop', width: 1280 },
] as const

for (const viewport of VIEWPORTS) {
  test(`renders the foundation status at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Operação fiscal desabilitada')).toBeVisible()
    const hasNoHorizontalOverflow = await page.evaluate(
      () => document.body.scrollWidth <= document.body.clientWidth,
    )

    expect(hasNoHorizontalOverflow).toBe(true)
  })
}

test('registers and controls the application with the generated service worker', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()

  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)
})

test('serves the application shell while the browser is offline', async ({ context, page }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Operação fiscal desabilitada')).toBeVisible()
})
