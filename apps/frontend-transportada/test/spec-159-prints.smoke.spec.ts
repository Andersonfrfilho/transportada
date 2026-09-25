/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockFleetWorkspaceApi } from './fleet-smoke.helper'
import { DRIVER_DETAIL } from './fleet/fleet.fixture'
import { mockMultiVehicleApi, registerSuggestionValuationMock } from './multi-vehicle-smoke.helper'
import { mockNfeWorkspaceApi } from './nfe-workspace-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

/**
 * Spec 159 T12 (`web.md` §15): os prints da revisão de design das telas da foto obrigatória e da
 * nota do motorista, do lado do escritório. Os do motorista foram para `apps/frontend-driver`
 * (ADR-0075, spec 189 T4.1): a tela dele não é mais do painel. Fora do smoke da CI — roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-159-prints.smoke.spec.ts` e grava os PNGs ao lado da spec, que é onde
 * a evidência mora.
 */
const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/159-a-foto-obrigatoria-pesa-na-nota-do-motorista/prints',
)
const DESKTOP = { height: 900, width: 1440 } as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

const PHOTO_REQUIRED = {
  photo: 'required',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'off',
} as const

function printPath(name: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${theme}.png`)
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
                canhotoOcrEnabled: false,
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
