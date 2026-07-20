/* Copyright (c) 2026 Ada Technology. MIT License. */
import { expect, test, type Page, type Response } from '@playwright/test'

import {
  auditAuthenticationStorage,
  expectKeycloakLoginRedirect,
  loginAsLocalUser,
} from './authenticated-smoke.helper'
import { expectNoCertificateResidue } from './certificate-residue-audit.helper'
import {
  deleteBinaryCertificateResidue,
  seedBinaryCertificateResidue,
} from './certificate-residue-fixture.helper'
import { ensureServiceWorkerControl, mockCompanySettingsApi } from './company-settings-smoke.helper'
import {
  isRefreshTokenRequest,
  rejectFirstRefresh,
  triggerTokenRefresh,
} from './token-refresh-smoke.helper'

const SYNTHETIC_CERTIFICATE_BYTES = 'synthetic-pfx-bytes'
const SYNTHETIC_CERTIFICATE_PASSWORD = 'synthetic-certificate-password'

const VIEWPORTS = [
  { height: 812, name: 'mobile', width: 375 },
  { height: 1024, name: 'tablet', width: 768 },
  { height: 900, name: 'desktop', width: 1280 },
] as const

for (const viewport of VIEWPORTS) {
  test(`renders fiscal settings without horizontal overflow at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const api = await mockCompanySettingsApi({ certificateStatus: 201, page })
    const settingsResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/company-settings',
    )
    const certificatesResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/digital-certificates',
    )
    await loginAsLocalUser(page)
    expect((await settingsResponse).status()).toBe(200)
    expect((await certificatesResponse).status()).toBe(200)
    expect(api.failures()).toEqual([])

    await expect(page.getByRole('heading', { name: 'Configurações fiscais' })).toBeVisible()
    await expect(page.getByLabel('Arquivo PFX')).toBeVisible()
    await expect(page.getByText('Produção é apenas uma configuração nesta etapa.')).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
      .toBe(true)
    await auditAuthenticationStorage(page)
  })
}

async function uploadSyntheticCertificate(page: Page): Promise<void> {
  await page.getByLabel('Arquivo PFX').setInputFiles({
    buffer: Buffer.from(SYNTHETIC_CERTIFICATE_BYTES),
    mimeType: 'application/x-pkcs12',
    name: 'synthetic-upload.pfx',
  })
  await page.getByLabel('Senha do certificado').fill(SYNTHETIC_CERTIFICATE_PASSWORD)
  await page.getByRole('button', { name: 'Validar e substituir' }).click()
}

test('clears synthetic certificate material after a successful replacement', async ({ page }) => {
  await mockCompanySettingsApi({ certificateStatus: 201, page })
  await loginAsLocalUser(page)
  await ensureServiceWorkerControl(page)
  await uploadSyntheticCertificate(page)

  await expect(page.getByText('Certificado substituído com segurança.')).toBeVisible()
  await expectNoCertificateResidue({
    page,
    sensitiveValues: [
      SYNTHETIC_CERTIFICATE_BYTES,
      SYNTHETIC_CERTIFICATE_PASSWORD,
      'synthetic-upload.pfx',
    ],
  })
})

test('certificate residue audit rejects binary IndexedDB representations', async ({ page }) => {
  await mockCompanySettingsApi({ certificateStatus: 201, page })
  await loginAsLocalUser(page)
  await ensureServiceWorkerControl(page)
  await seedBinaryCertificateResidue({ bytes: SYNTHETIC_CERTIFICATE_BYTES, page })
  let auditError: unknown
  try {
    auditError = await expectNoCertificateResidue({
      page,
      sensitiveValues: [SYNTHETIC_CERTIFICATE_BYTES],
    }).catch((error: unknown) => error)
  } finally {
    await deleteBinaryCertificateResidue(page)
  }
  expect(auditError).toBeInstanceOf(Error)
})

function isLocalForbiddenCertificateResponse(response: Response): boolean {
  const url = new URL(response.url())
  return (
    url.origin === 'http://localhost:53001' &&
    url.pathname === '/digital-certificates' &&
    response.status() === 403
  )
}

test('a tampered certificate action reaches the local 403 boundary without local residue', async ({
  page,
}) => {
  const api = await mockCompanySettingsApi({ certificateStatus: undefined, page })
  await loginAsLocalUser(page)
  await ensureServiceWorkerControl(page)
  const forbiddenResponse = page.waitForResponse(isLocalForbiddenCertificateResponse)
  await uploadSyntheticCertificate(page)
  const response = await forbiddenResponse

  expect(new URL(response.url()).origin).toBe('http://localhost:53001')
  expect(api.boundary()).toMatchObject({
    body: { error: { code: 'FORBIDDEN' } },
    origin: 'http://localhost:53001',
    status: 403,
  })
  await expect(
    page.getByText('Não foi possível carregar as configurações. Tente novamente.'),
  ).toBeVisible()
  expect(api.mutations()).toBe(0)
  await expectNoCertificateResidue({
    page,
    sensitiveValues: [
      SYNTHETIC_CERTIFICATE_BYTES,
      SYNTHETIC_CERTIFICATE_PASSWORD,
      'synthetic-upload.pfx',
    ],
  })
})

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
