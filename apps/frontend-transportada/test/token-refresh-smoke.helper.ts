/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { BrowserContext, Page, Request } from '@playwright/test'

export function isRefreshTokenRequest(request: Request): boolean {
  return (
    request.url().includes('/protocol/openid-connect/token') &&
    new URLSearchParams(request.postData() ?? '').get('grant_type') === 'refresh_token'
  )
}

export async function rejectFirstRefresh(page: Page): Promise<void> {
  let hasRejectedRefresh = false
  await page.route('**/protocol/openid-connect/token', async (route) => {
    if (hasRejectedRefresh || !isRefreshTokenRequest(route.request())) {
      await route.continue()
      return
    }
    hasRejectedRefresh = true
    await route.fulfill({
      body: JSON.stringify({ error: 'invalid_grant' }),
      contentType: 'application/json',
      status: 400,
    })
  })
}

export async function triggerTokenRefresh(
  input: Readonly<{ context: BrowserContext; page: Page }>,
): Promise<void> {
  await input.page.clock.fastForward('01:00:00')
  const backgroundPage = await input.page.context().newPage()
  await backgroundPage.bringToFront()
  await input.page.bringToFront()
  await backgroundPage.close()
  await input.page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await input.context.setOffline(true)
  await input.context.setOffline(false)
}
