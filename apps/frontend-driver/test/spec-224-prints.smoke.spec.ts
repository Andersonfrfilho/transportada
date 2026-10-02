/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Prints da revisão de design (`web.md` §15) da spec 224: o motorista concluiu a viagem e a tela
 * **não** acusa reatribuição. O que o usuário fotografou em 02/10 era o aviso "Esta viagem não está
 * mais com você" depois de uma conclusão normal.
 *
 * Fora do smoke da CI — roda com `PLAYWRIGHT_TEST_MATCH=spec-224-prints.smoke.spec.ts` e o bypass de
 * fumaça, e grava os PNGs em `PRINTS_DIR` (por padrão `prints/` dentro da app).
 *
 * ⚠️ O que este print prova é o **visual** do estado final: sem viagem na tela e sem o aviso. A
 * sequência de duas leituras (a viagem aparece `completed`, depois sai da janela) é provada pelo
 * contrato `trip-reassignment.contract.ts` e pela mutação da T1.8 — ela depende de um `useRef` que
 * um recarregamento de página zeraria, então o navegador não é o lugar de afirmá-la.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = process.env.PRINTS_DIR ?? resolve(process.cwd(), 'prints')
const VIEWPORTS = [
  { height: 812, label: '375', width: 375 },
  { height: 1024, label: '768', width: 768 },
  { height: 900, label: '1280', width: 1280 },
] as const

/** O texto do aviso que não deve aparecer (`driverTrip.locale.json`, `reassignedTrip.notice`). */
const REASSIGNED_NOTICE = /Esta viagem não está mais com você/u

/**
 * A resposta que a API passou a dar com a janela da 224: a viagem que o motorista acabou de concluir,
 * com o status real e a parada fechada. O app elege nenhuma (RF2) e cai no estado de sem viagem.
 */
const CONCLUDED_SNAPSHOT = {
  data: {
    isRegisteredDriver: true,
    pendingProofs: [],
    score: null,
    trips: [
      {
        id: '00000000-0000-4000-8000-000000000100',
        status: 'completed',
        stops: [
          {
            arrivedAt: '2026-10-02T13:00:00.000Z',
            completedAt: '2026-10-02T13:20:00.000Z',
            deliveryProof: null,
            deliveryWindowEnd: null,
            deliveryWindowStart: null,
            documents: [],
            id: '00000000-0000-4000-8000-000000000200',
            label: 'Praca da Se, 100',
            latitude: null,
            longitude: null,
            sequence: 1,
          },
        ],
        vehiclePlate: 'GCQ8E47',
      },
    ],
  },
} as const

async function openConcludedTrip(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await mockDriverTripApi({ page, scenario: undefined })

  // Registrada depois do mock, então tem precedência sobre a rota da viagem dele.
  await page.route('**/me/trips/current', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      body: JSON.stringify(CONCLUDED_SNAPSHOT),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      status: 200,
    })
  })

  await loginAsLocalUser(page)
}

for (const viewport of VIEWPORTS) {
  test(`print: viagem concluída não acusa reatribuição (${viewport.label} dark)`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: viewport.height, width: viewport.width })
    await openConcludedTrip(page, 'dark')

    await expect(page.getByText(/Nada para hoje/u)).toBeVisible()
    await expect(page.getByText(REASSIGNED_NOTICE)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Entendi' })).toHaveCount(0)

    await page.screenshot({
      fullPage: true,
      path: `${PRINTS_DIRECTORY}/spec-224-concluida-sem-aviso-${viewport.label}-dark.png`,
    })
  })
}

test('print: viagem concluída não acusa reatribuição (375 light)', async ({ page }) => {
  await page.setViewportSize({ height: 812, width: 375 })
  await openConcludedTrip(page, 'light')

  await expect(page.getByText(/Nada para hoje/u)).toBeVisible()
  await expect(page.getByText(REASSIGNED_NOTICE)).toHaveCount(0)

  await page.screenshot({
    fullPage: true,
    path: `${PRINTS_DIRECTORY}/spec-224-concluida-sem-aviso-375-light.png`,
  })
})
