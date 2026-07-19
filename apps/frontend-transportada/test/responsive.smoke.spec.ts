/* Copyright (c) 2026 Ada Technology. MIT License. */
import { expect, test } from '@playwright/test'

import {
  auditAuthenticationStorage,
  expectKeycloakLoginRedirect,
  loginAsLocalUser,
} from './authenticated-smoke.helper'

const VIEWPORTS = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 1024, name: 'tablet', width: 768 },
  { height: 900, name: 'desktop', width: 1280 },
] as const

for (const viewport of VIEWPORTS) {
  test(`renders authenticated foundation status at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await loginAsLocalUser(page)

    await expect(page.getByText('Operação fiscal desabilitada')).toBeVisible()
    await expect(
      page.getByText(
        'A consulta de saúde está disponível quando uma URL da API local for configurada.',
      ),
    ).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
      .toBe(true)
    await auditAuthenticationStorage(page)
  })
}

test('registers the service worker without caching protected identity data', async ({ page }) => {
  await loginAsLocalUser(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(page).toHaveURL('http://localhost:53000/auth/callback')
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)

  await auditAuthenticationStorage(page)
})

test('does not reveal protected content after an offline reload', async ({ context, page }) => {
  await loginAsLocalUser(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(page).toHaveURL('http://localhost:53000/auth/callback')
  await auditAuthenticationStorage(page)
  await context.setOffline(true)
  const offlineReloadError = await page
    .reload({ waitUntil: 'domcontentloaded' })
    .then(() => undefined)
    .catch((error: unknown) => error)

  if (offlineReloadError !== undefined) {
    expect(offlineReloadError).toBeInstanceOf(Error)
    expect((offlineReloadError as Error).message).toContain('ERR_INTERNET_DISCONNECTED')
  }

  await expect(page.getByRole('heading', { level: 1 })).not.toBeVisible()
})

test('fails closed when an expired access token cannot refresh', async ({ context, page }) => {
  await page.clock.install({ time: new Date() })
  await loginAsLocalUser(page)
  let hasRejectedRefresh = false
  await page.route('**/protocol/openid-connect/token', async (route) => {
    const grantType = new URLSearchParams(route.request().postData() ?? '').get('grant_type')
    if (hasRejectedRefresh || grantType !== 'refresh_token') {
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
  await auditAuthenticationStorage(page)
  const refreshRequest = page.waitForRequest(
    (request) =>
      request.url().includes('/protocol/openid-connect/token') &&
      new URLSearchParams(request.postData() ?? '').get('grant_type') === 'refresh_token',
  )
  const loginRedirect = expectKeycloakLoginRedirect(page)
  const authenticatedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === 'http://localhost:53001' &&
      new URL(response.url()).pathname === '/auth/me' &&
      response.status() === 200,
  )
  await page.clock.fastForward('01:00:00')
  const backgroundPage = await page.context().newPage()
  await backgroundPage.bringToFront()
  await page.bringToFront()
  await backgroundPage.close()
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await context.setOffline(true)
  await context.setOffline(false)

  await refreshRequest
  await loginRedirect
  await authenticatedResponse
  await expect(page).toHaveURL('http://localhost:53000/auth/callback')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await auditAuthenticationStorage(page)
})
