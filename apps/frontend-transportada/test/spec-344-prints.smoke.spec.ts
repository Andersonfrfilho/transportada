/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5 (`web.md` §15): os prints do alerta "parece ser da NF X" no comprovante da nota e no
 * maço de conferência, claro/escuro, 1440 e 375. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-344-prints.smoke.spec.ts` e grava os PNGs em `specs/344-alerta-canhoto-de-outra-nota/prints/`.
 * Fotos sintéticas; nenhum dado de cliente.
 */
import { resolve } from 'node:path'

import { expect, type Page, type Route, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { getApiBaseUrl } from './smoke-api-url.helper'
import { NOTE_ACCORDION_DOCUMENT_IDS } from './trip-note-accordion.fixture'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/344-alerta-canhoto-de-outra-nota/prints',
)
const VIEWPORTS = [
  { height: 900, label: 'desktop', width: 1440 },
  { height: 844, label: 'mobile', width: 375 },
] as const
const THEMES = ['dark', 'light'] as const
const TRIP_PERMISSIONS = ['trip.read', 'trip.manage', 'trip.financials', 'fleet.read'] as const
const IMAGE_ORIGIN = `${getApiBaseUrl()}/spec-344-prints`
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#8b8379"/></svg>`

const MATCHED = {
  canhotoApproved: false,
  nfeDocumentId: '00000000-0000-4000-8000-0000000007aa',
  number: '000123',
  sameTrip: true,
  series: '1',
  status: 'authorized',
  tripDocumentId: NOTE_ACCORDION_DOCUMENT_IDS[0],
  tripId: '00000000-0000-4000-8000-000000000601',
}

function pendingProof(index: number, mismatch: unknown) {
  return {
    canhotoReadNumber: '000123',
    canhotoReadSeries: '1',
    canhotoReadSource: 'ocr',
    canhotoReview: 'pending',
    capturedAt: '2026-11-22T10:00:00.000Z',
    createdAt: '2026-11-22T10:00:10.000Z',
    downloadUrl: `${IMAGE_ORIGIN}/canhoto-${index}.svg`,
    expiresAt: '2030-01-01T00:00:00.000Z',
    id: `00000000-0000-4000-8000-00000000090${index}`,
    kind: 'photo',
    receiverName: 'Maria',
    thumbnailUrl: `${IMAGE_ORIGIN}/canhoto-${index}.svg`,
    ...(mismatch === undefined ? {} : { canhotoMismatch: mismatch }),
  }
}

/** Nota 2 sinalizada com nota achada; nota 3 sinalizada sem nota no sistema; as outras conferem. */
function proofFor(index: number) {
  if (index === 1)
    return pendingProof(index, {
      kind: 'other_document',
      matchedDocument: MATCHED,
      readNumber: '000123',
      readSeries: '1',
    })
  if (index === 2)
    return pendingProof(index, {
      kind: 'other_document',
      matchedDocument: null,
      readNumber: '172195',
      readSeries: null,
    })
  return {
    ...pendingProof(index, undefined),
    canhotoReadNumber: undefined,
    canhotoReadSeries: undefined,
    canhotoReadSource: undefined,
  }
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({
      headers: {
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
        'access-control-allow-origin': '*',
      },
      status: 204,
    })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    status: 200,
  })
}

async function open(
  page: Page,
  theme: (typeof THEMES)[number],
  viewport: (typeof VIEWPORTS)[number],
) {
  await page.setViewportSize({ height: viewport.height, width: viewport.width })
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({ mode: 'note-accordion', page, permissions: [...TRIP_PERMISSIONS] })
  await page.route(`${IMAGE_ORIGIN}/**`, (route) =>
    route.fulfill({ body: SVG, contentType: 'image/svg+xml', status: 200 }),
  )
  await page.route(/\/trips\/[^/]+\/delivery-proofs$/, (route) =>
    fulfillJson(route, {
      data: NOTE_ACCORDION_DOCUMENT_IDS.map((documentId, index) => ({
        ...proofFor(index),
        documentId,
      })),
    }),
  )
  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/proof$/, (route) => {
    const documentId = new URL(route.request().url()).pathname.split('/').at(-2) ?? ''
    const index = NOTE_ACCORDION_DOCUMENT_IDS.findIndex((id) => id === documentId)
    return fulfillJson(route, { data: [proofFor(Math.max(index, 0))] })
  })
  await loginAsLocalUser(page)
  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    const suffix = `${theme}-${viewport.label}`

    test(`print do maço com prova sinalizada — ${suffix}`, async ({ page }) => {
      await open(page, theme, viewport)
      await page
        .getByRole('checkbox', { name: /Selecionar todas/u })
        .first()
        .check()
      await page.getByRole('button', { name: /^Conferir \d+ canhotos?/u }).click()
      const dialog = page.getByRole('dialog', { name: 'Conferir canhotos' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByTestId('canhoto-mismatch').first()).toBeVisible()
      for (const image of await dialog.locator('img').all())
        await expect(image).toHaveJSProperty('complete', true)
      await dialog
        .getByRole('button', { name: /^Aprovar mesmo assim/u })
        .first()
        .evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await page.mouse.move(0, 0)
      await dialog.screenshot({
        animations: 'disabled',
        path: resolve(PRINTS_DIRECTORY, `maco-${suffix}.png`),
      })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0)
    })

    test(`print do comprovante com a faixa — ${suffix}`, async ({ page }) => {
      await open(page, theme, viewport)
      const toggle = page.getByRole('button', { name: /^000124\/1/u })
      await toggle.click()
      const row = page.locator('li[id^="trip-timeline-document-"]').filter({ has: toggle })
      await row.getByRole('button', { name: /^Comprovante da entrega/u }).click()
      const notice = row.getByTestId('canhoto-mismatch')
      await expect(notice).toBeVisible()
      await notice.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await page.mouse.move(0, 0)
      await row.screenshot({
        animations: 'disabled',
        path: resolve(PRINTS_DIRECTORY, `comprovante-${suffix}.png`),
      })
    })

    test(`print do diálogo Mover para a NF X — ${suffix}`, async ({ page }) => {
      await open(page, theme, viewport)
      const toggle = page.getByRole('button', { name: /^000124\/1/u })
      await toggle.click()
      const row = page.locator('li[id^="trip-timeline-document-"]').filter({ has: toggle })
      await row.getByRole('button', { name: /^Comprovante da entrega/u }).click()
      await row.getByRole('button', { name: 'Mover para a NF 000123' }).click()
      const dialog = page.getByRole('dialog', { name: 'Mover para a NF 000123' })
      await expect(dialog).toBeVisible()
      await page.mouse.move(0, 0)
      await dialog.screenshot({
        animations: 'disabled',
        path: resolve(PRINTS_DIRECTORY, `mover-${suffix}.png`),
      })
    })
  }
}
