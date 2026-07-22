/* Copyright (c) 2026 Ada Technology. MIT License. */
import { expect, test } from '@playwright/test'

import {
  auditAuthenticationStorage,
  expectKeycloakLoginRedirect,
  loginAsLocalUser,
} from './authenticated-smoke.helper'
import { ensureServiceWorkerControl } from './company-settings-smoke.helper'
import { expectNoSensitiveResidue } from './certificate-residue-audit.helper'
import {
  mockNfeWorkspaceApi,
  SYNTHETIC_NFE_FILE_NAME,
  SYNTHETIC_NFE_XML,
} from './nfe-workspace-smoke.helper'
import {
  isRefreshTokenRequest,
  rejectFirstRefresh,
  triggerTokenRefresh,
} from './token-refresh-smoke.helper'

const VIEWPORTS = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 1024, name: 'tablet', width: 768 },
  { height: 900, name: 'desktop', width: 1280 },
] as const

for (const viewport of VIEWPORTS) {
  test(`renders NF-e workspace without horizontal overflow for operator at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const api = await mockNfeWorkspaceApi({
      page,
      permissions: ['invoices.import', 'invoices.read'],
    })
    await loginAsLocalUser(page)

    await expect(page.getByRole('heading', { name: 'Workspace NF-e' })).toBeVisible()
    await expect(page.getByLabel('Arquivos XML ou ZIP')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enviar lote' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Distribuir DF-e' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reprocessar' })).toBeVisible()
    await expect(page.getByText('Documentos importados')).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
      .toBe(true)
    expect(api.failures()).toEqual([])
    await auditAuthenticationStorage(page)
  })
}

test('viewer can read NF-e workspace without mutation controls', async ({ page }) => {
  const api = await mockNfeWorkspaceApi({ page, permissions: ['invoices.read'] })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace NF-e' })).toBeVisible()
  await expect(page.getByText('Documentos importados')).toBeVisible()
  await expect(page.getByLabel('Arquivos XML ou ZIP')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enviar lote' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Distribuir DF-e' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reprocessar' })).toHaveCount(0)
  expect(api.importRequests()).toBe(0)
  expect(api.distributionRequests()).toBe(0)
  expect(api.reprocessRequests()).toBe(0)
  await auditAuthenticationStorage(page)
})

test('user without invoice permissions sees a closed workspace boundary', async ({ page }) => {
  const api = await mockNfeWorkspaceApi({ page, permissions: [] })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { name: 'Workspace NF-e' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'Seu acesso atual não permite consultar este workspace.',
  )
  await expect(page.getByLabel('Arquivos XML ou ZIP')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enviar lote' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Distribuir DF-e' })).toHaveCount(0)
  expect(api.importRequests()).toBe(0)
  expect(api.distributionRequests()).toBe(0)
  await auditAuthenticationStorage(page)
})

test('uploads XML and leaves no fiscal payload in browser storage or caches', async ({ page }) => {
  const api = await mockNfeWorkspaceApi({
    page,
    permissions: ['invoices.import', 'invoices.read'],
  })
  await loginAsLocalUser(page)
  await ensureServiceWorkerControl(page)

  await page.getByLabel('Arquivos XML ou ZIP').setInputFiles({
    buffer: Buffer.from(SYNTHETIC_NFE_XML),
    mimeType: 'application/xml',
    name: SYNTHETIC_NFE_FILE_NAME,
  })
  await page.getByRole('button', { name: 'Enviar lote' }).click()
  await expect.poll(api.importRequests).toBe(1)

  await expectNoSensitiveResidue({
    page,
    sensitiveValues: [SYNTHETIC_NFE_XML, SYNTHETIC_NFE_FILE_NAME],
  })
  await expect(page.locator('input[type="file"]')).toHaveJSProperty('value', '')
})

test('downloaded XML is not cached by the SPA service worker', async ({ page }) => {
  const api = await mockNfeWorkspaceApi({
    page,
    permissions: ['invoices.import', 'invoices.read'],
  })
  await loginAsLocalUser(page)
  await ensureServiceWorkerControl(page)

  await page.getByRole('button', { name: 'Baixar XML' }).click()
  await expect.poll(api.xmlDownloads).toBe(1)
  await expectNoSensitiveResidue({
    page,
    sensitiveValues: [SYNTHETIC_NFE_XML],
  })
})

test('registers the service worker without caching protected identity data', async ({ page }) => {
  await mockNfeWorkspaceApi({ page, permissions: ['invoices.read'] })
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
  await mockNfeWorkspaceApi({ page, permissions: ['invoices.read'] })
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
  await mockNfeWorkspaceApi({ page, permissions: ['invoices.read'] })
  await loginAsLocalUser(page)
  await rejectFirstRefresh(page)
  await auditAuthenticationStorage(page)
  const refreshRequest = page.waitForRequest(isRefreshTokenRequest)
  const loginRedirect = expectKeycloakLoginRedirect(page)
  const authenticatedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === 'http://localhost:53001' &&
      new URL(response.url()).pathname === '/auth/me' &&
      response.status() === 200,
  )
  await triggerTokenRefresh({ context, page })
  await refreshRequest
  await loginRedirect
  await authenticatedResponse
  await expect(page).toHaveURL('http://localhost:53000/auth/callback')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await auditAuthenticationStorage(page)
})
