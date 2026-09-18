/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi, type DriverTripProofScenario } from './driver-trip-smoke.helper'
import { mockFleetWorkspaceApi } from './fleet-smoke.helper'
import { DRIVER_DETAIL } from './fleet/fleet.fixture'
import { mockMultiVehicleApi, registerSuggestionValuationMock } from './multi-vehicle-smoke.helper'
import { mockNfeWorkspaceApi } from './nfe-workspace-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

/**
 * Spec 157 T12 (`web.md` §15): os prints da revisão de design das telas da foto obrigatória e da
 * nota do motorista. Fora do smoke da CI — roda com `PLAYWRIGHT_TEST_MATCH=spec-157-prints.smoke.spec.ts`
 * e grava os PNGs ao lado da spec, que é onde a evidência mora.
 */
const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/157-a-foto-obrigatoria-pesa-na-nota-do-motorista/prints',
)
const PHONE = { height: 844, width: 390 } as const
const DESKTOP = { height: 900, width: 1440 } as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

/** PNG 1×1 sintético — o recorte usa o original, e nenhuma foto real entra em fixture. */
const PHOTO_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const PHOTO_REQUIRED = {
  photo: 'required',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'off',
} as const

function pendingProof(input: Readonly<{ documentId: string; number: string; recipient: string }>) {
  return {
    deliveredAt: '2026-09-18T13:10:00.000Z',
    deliveryProof: PHOTO_REQUIRED,
    documentId: input.documentId,
    documentNumber: input.number,
    documentSeries: '1',
    recipientName: input.recipient,
    tripId: '00000000-0000-4000-8000-000000000100',
    tripStatus: 'in_transit',
  }
}

const PENDING_BAKERY = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000201',
  number: '900201',
  recipient: 'Padaria Estrela',
})
const PENDING_BUTCHER = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000202',
  number: '900202',
  recipient: 'Açougue Boi Bravo',
})
const ON_TIME = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000203',
  number: '900203',
  recipient: 'Farmácia Vida',
})
const LATE = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000204',
  number: '900204',
  recipient: 'Loja Mãe Rainha',
})
const AWAY = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000205',
  number: '900205',
  recipient: 'Bazar do Bairro',
})

function printPath(name: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${theme}.png`)
}

async function openDriverApp(
  input: Readonly<{ page: Page; scenario: DriverTripProofScenario; theme: Theme }>,
) {
  await input.page.setViewportSize(PHONE)
  await input.page.emulateMedia({ colorScheme: input.theme })
  await input.page.context().grantPermissions(['geolocation'])
  await input.page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  const api = await mockDriverTripApi({ page: input.page, scenario: input.scenario })
  await loginAsLocalUser(input.page)
  await expect(input.page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  return api
}

async function attachPhoto(item: Locator, page: Page): Promise<void> {
  await item.locator('input[type=file]').setInputFiles({
    buffer: PHOTO_BYTES,
    mimeType: 'image/png',
    name: 'canhoto.png',
  })
  await page.getByRole('button', { name: 'Usar sem recorte' }).click()
}

/** Toque: todo botão visível da tela com menos de 44 px de altura ou largura. */
async function listSmallTouchTargets(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button, a, input, [role=button]')]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height < 44 || rect.width < 44)
      .map(
        ({ element, rect }) =>
          `${element.tagName} "${(element.textContent ?? '').trim() || element.getAttribute('aria-label')}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
      ),
  )
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
}

for (const theme of THEMES) {
  test(`PWA: card da parada com o aviso de foto obrigatória (${theme})`, async ({ page }) => {
    await openDriverApp({ page, scenario: { stopDeliveryProof: PHOTO_REQUIRED }, theme })
    const warning = page.getByText('Foto do canhoto obrigatória').first()
    await warning.scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { exact: true, name: 'Entreguei' })).toBeEnabled()
    await assertNoHorizontalOverflow(page)
    test.info().annotations.push({
      description: (await listSmallTouchTargets(page)).join(' | '),
      type: 'small-touch-targets',
    })
    await page
      .locator('li', { has: warning })
      .first()
      .screenshot({
        path: printPath('pwa-card-aviso-foto', theme),
      })
  })

  test(`PWA: fotos pendentes com uma pendente e uma na fila (${theme})`, async ({ page }) => {
    const api = await openDriverApp({
      page,
      scenario: { pendingProofs: [PENDING_BAKERY, PENDING_BUTCHER] },
      theme,
    })
    await page.getByRole('button', { name: /Fotos pendentes/u }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Fotos pendentes' })).toBeVisible()

    api.setOffline(true)
    const butcher = page.locator('li', { hasText: 'Açougue Boi Bravo' })
    await attachPhoto(butcher, page)
    await expect(butcher.getByText(/sobe sozinha quando o sinal voltar/u)).toBeVisible()
    await assertNoHorizontalOverflow(page)
    test.info().annotations.push({
      description: (await listSmallTouchTargets(page)).join(' | '),
      type: 'small-touch-targets',
    })
    await page.screenshot({ fullPage: true, path: printPath('pwa-fotos-pendentes', theme) })
  })

  test(`PWA: aviso de pontualidade em dia, tardia e longe (${theme})`, async ({ page }) => {
    await openDriverApp({
      page,
      scenario: {
        pendingProofs: [ON_TIME, LATE, AWAY],
        punctualityByDocumentId: {
          [AWAY.documentId]: 'away',
          [LATE.documentId]: 'late',
          [ON_TIME.documentId]: 'on_time',
        },
      },
      theme,
    })
    await page.getByRole('button', { name: /Fotos pendentes/u }).click()
    for (const recipient of ['Farmácia Vida', 'Loja Mãe Rainha', 'Bazar do Bairro']) {
      const item = page.locator('li', { hasText: recipient })
      await attachPhoto(item, page)
    }
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page.getByText(/Registrada em dia/u)).toBeVisible()
    await expect(page.getByText(/fora do prazo/u)).toBeVisible()
    await expect(page.getByText(/longe do local/u)).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: printPath('pwa-pontualidade', theme) })
  })

  for (const score of [85, null] as const) {
    const name = score === null ? 'pwa-perfil-sem-nota' : 'pwa-perfil-nota'
    test(`PWA: perfil com a nota ${String(score)} (${theme})`, async ({ page }) => {
      await openDriverApp({ page, scenario: { score }, theme })
      await page.getByRole('button', { name: 'Perfil' }).click()
      const scoreSection = page.locator('section', { hasText: 'Sua nota' })
      await scoreSection.scrollIntoViewIfNeeded()
      await assertNoHorizontalOverflow(page)
      await page.screenshot({ path: printPath(name, theme) })
    })
  }
}

const SCORED_DRIVERS = [
  { id: '00000000-0000-4000-8000-000000000941', name: 'Bruno Sem Histórico', score: null },
  { id: '00000000-0000-4000-8000-000000000942', name: 'Ana Pontual', score: 95 },
  { id: '00000000-0000-4000-8000-000000000943', name: 'Carlos Atrasado', score: 40 },
  { id: '00000000-0000-4000-8000-000000000944', name: 'Diana Regular', score: 65 },
] as const

/** Registrado depois dos mocks de tela: a rota mais nova vence, e a frota passa a ter nota. */
async function registerScoredDrivers(page: Page): Promise<void> {
  await page.route(/\/fleet\/drivers(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 204 })
      return
    }
    await route.fulfill({
      body: JSON.stringify({
        data: SCORED_DRIVERS.map((driver) => ({ ...DRIVER_DETAIL, ...driver })),
        page: { nextCursor: null },
      }),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.route(/\/fleet\/drivers\/[^/]+\/score$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 204 })
      return
    }
    const driverId = /\/fleet\/drivers\/([^/]+)\/score$/u.exec(route.request().url())?.[1]
    const driver = SCORED_DRIVERS.find((candidate) => candidate.id === driverId)
    const penalties =
      driver?.score === 40
        ? [
            {
              deliveredAt: '2026-09-02T14:00:00.000Z',
              documentNumber: '900150',
              expiresAt: '2026-12-01T14:00:00.000Z',
              points: 10,
              reason: 'missing_proof',
              tripDocumentId: '00000000-0000-4000-8000-000000000951',
            },
            {
              deliveredAt: '2026-09-10T16:30:00.000Z',
              documentNumber: '900177',
              expiresAt: '2026-12-09T16:30:00.000Z',
              points: 5,
              reason: 'late_proof',
              tripDocumentId: '00000000-0000-4000-8000-000000000952',
            },
          ]
        : []
    await route.fulfill({
      body: JSON.stringify({ data: { penalties, score: driver?.score ?? null } }),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
    })
  })
}

const TRIP_PERMISSIONS = ['fleet.read', 'trip.manage', 'trip.financials', 'invoices.read'] as const

for (const theme of THEMES) {
  test(`Escritório: seletor de motoristas da Nova viagem (${theme})`, async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
    await mockTripWorkspaceApi({ mode: 'all-authorized', page, permissions: TRIP_PERMISSIONS })
    await mockMultiVehicleApi(page)
    await registerScoredDrivers(page)
    await loginAsLocalUser(page)

    await page.getByRole('button', { name: 'Nova viagem' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nova viagem' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Motoristas', exact: true }).click()
    await expect(page.getByRole('option', { name: /Ana Pontual/u })).toBeVisible()
    await page.screenshot({ path: printPath('escritorio-seletor-nova-viagem', theme) })
  })

  test(`Escritório: seletor de motoristas do Montar roteiro (${theme})`, async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
    await mockTripWorkspaceApi({ mode: 'all-authorized', page, permissions: TRIP_PERMISSIONS })
    await mockNfeWorkspaceApi({
      documentCount: 2,
      freeDocuments: true,
      page,
      permissions: TRIP_PERMISSIONS,
    })
    await mockMultiVehicleApi(page)
    await registerSuggestionValuationMock(page)
    await registerScoredDrivers(page)
    await loginAsLocalUser(page)

    await page.getByRole('button', { name: 'Montar roteiro' }).click()
    const dialog = page.getByRole('dialog', { name: 'Montar roteiro' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Motoristas', exact: true }).click()
    await expect(page.getByRole('option', { name: /Ana Pontual/u })).toBeVisible()
    await page.screenshot({ path: printPath('escritorio-seletor-montar-roteiro', theme) })
  })

  test(`Escritório: lista e ficha do motorista com nota e penalidades (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'fleet'))
    await mockFleetWorkspaceApi({ page, permissions: ['fleet.read', 'fleet.manage'] })
    await registerScoredDrivers(page)
    await loginAsLocalUser(page)

    await page.getByRole('tab', { name: 'Motoristas' }).click()
    const carlos = page.getByRole('row', { name: /Carlos Atrasado/u })
    await expect(carlos).toBeVisible()
    await page.screenshot({ path: printPath('escritorio-lista-motoristas', theme) })

    await carlos.getByRole('button', { name: 'Editar' }).click()
    const scoreSection = page.locator('fieldset', { hasText: 'Penalidades vigentes' })
    await expect(scoreSection.getByText('900150')).toBeVisible()
    await scoreSection.scrollIntoViewIfNeeded()
    await page.screenshot({ path: printPath('escritorio-ficha-com-penalidades', theme) })

    await page
      .getByRole('row', { name: /Bruno Sem Histórico/u })
      .getByRole('button', { name: 'Editar' })
      .click()
    await expect(scoreSection.getByText('Nenhuma penalidade vigente.')).toBeVisible()
    await scoreSection.scrollIntoViewIfNeeded()
    await page.screenshot({ path: printPath('escritorio-ficha-sem-nota', theme) })
  })

  test(`Escritório: painel do comprovante com os cinco campos e o erro de vazio (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
    await mockTripWorkspaceApi({
      mode: 'all-authorized',
      page,
      permissions: [...TRIP_PERMISSIONS, 'settings.manage'],
    })
    await page.route(/\/company-settings\/delivery-proof(\/overrides)?$/, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 204 })
        return
      }
      const isOverrides = route.request().url().endsWith('/overrides')
      await route.fulfill({
        body: JSON.stringify({
          data: isOverrides
            ? { overrides: [] }
            : {
                ...PHOTO_REQUIRED,
                latePenaltyPoints: 5,
                missingAfterHours: 24,
                missingPenaltyPoints: 10,
                proofRadiusMeters: 300,
                proofWindowMinutes: 60,
              },
        }),
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
      })
    })
    await loginAsLocalUser(page)

    await page.getByRole('tab', { name: 'Comprovante' }).click()
    const panel = page.locator('section', { hasText: 'Comprovante de entrega' }).last()
    await expect(panel.getByRole('spinbutton')).toHaveCount(5)
    await expect(panel.getByRole('spinbutton').first()).toHaveValue('60')
    await panel.screenshot({ path: printPath('escritorio-painel-comprovante', theme) })

    await panel.getByRole('spinbutton').nth(1).fill('')
    await expect(panel.getByRole('alert')).toBeVisible()
    await panel.screenshot({ path: printPath('escritorio-painel-comprovante-erro', theme) })
  })
}
