/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 196 (T5.0/T5.4, `web.md` §15): a app contra a **API de demonstração** de verdade
 * (`scripts/driver-preview-api.ts`, sem dublê de rota), com o GPS permitido e negado. A API guarda o
 * `location` de cada toque em memória e o expõe em `GET /__debug/locations`. Fora do smoke da CI:
 * `PLAYWRIGHT_TEST_MATCH=spec-196-prints.smoke.spec.ts VITE_API_URL=http://localhost:53901`, com a
 * demonstração subida com `DRIVER_PREVIEW_ORIGIN=http://localhost:53112`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'

const DEMO_API = 'http://localhost:53901'
const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/196-todo-evento-carrega-onde-aconteceu/prints',
)
const MOBILE = { height: 812, width: 375 } as const

type RecordedLocation = Readonly<{ location: unknown; path: string }>

async function readRecordedLocations(page: Page): Promise<readonly RecordedLocation[]> {
  const response = await page.request.get(`${DEMO_API}/__debug/locations`)
  return ((await response.json()) as { data: RecordedLocation[] }).data
}

async function registerCustomerAbsent(page: Page): Promise<void> {
  await page.getByRole('button', { exact: true, name: 'Ocorrência' }).first().click()
  await page
    .getByRole('radiogroup', { name: 'Qual ocorrência?' })
    .getByRole('radio', { name: /Cliente ausente/u })
    .click()
  await page
    .getByRole('group', { name: 'Registrar ocorrência' })
    .getByRole('button', { exact: true, name: 'Registrar' })
    .click()
}

for (const scenario of [
  { isGranted: true, label: 'gps-permitido' },
  { isGranted: false, label: 'gps-negado' },
] as const) {
  test(`print: ocorrência contra a API de demonstração (${scenario.label}, 375)`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.request.delete(`${DEMO_API}/__debug/locations`)
    if (scenario.isGranted) {
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
    }
    await loginAsLocalUser(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `viagem-demonstracao-${scenario.label}-375.png`),
    })

    await registerCustomerAbsent(page)

    await expect
      .poll(async () => (await readRecordedLocations(page)).length, { timeout: 20_000 })
      .toBeGreaterThan(0)
    const [recorded] = await readRecordedLocations(page)
    expect(recorded?.path).toMatch(/\/documents\/[^/]+\/occurrences$/u)
    if (scenario.isGranted) {
      expect(recorded?.location).toMatchObject({ latitude: -23.5505, longitude: -46.6333 })
    } else {
      expect(recorded?.location).toBeNull()
    }
  })
}
