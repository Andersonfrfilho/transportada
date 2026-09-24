/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

/**
 * Spec 181 T502 (`web.md` §15): os prints da revisão de design do card da parada, no celular e no
 * desktop. Fora do smoke da CI — roda com `PLAYWRIGHT_TEST_MATCH=spec-181-prints.smoke.spec.ts` e
 * grava os PNGs ao lado da spec, que é onde a evidência mora.
 *
 * ⚠️ O print sai daqui, e não do navegador apontado para o `make dev`: o app redireciona para a URL
 * do `.env` (53000), então preview em porta alternativa devolve a árvore de outra sessão. Foi o que
 * aconteceu três vezes em 23/09 antes de alguém olhar `window.location.href`.
 */
const PRINTS_DIRECTORY = resolve(process.cwd(), '../../specs/181-o-card-da-parada-se-le/prints')
const PHONE = { height: 844, width: 375 } as const
const DESKTOP = { height: 900, width: 1440 } as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

const TRIP_PERMISSIONS = ['trip.read', 'trip.manage', 'fleet.read'] as const

function printPath(name: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${theme}.png`)
}

for (const theme of THEMES) {
  for (const [label, viewport] of [
    ['mobile', PHONE],
    ['desktop', DESKTOP],
  ] as const) {
    test(`print do card da parada — ${label} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
      await mockTripWorkspaceApi({
        mode: 'all-authorized',
        page,
        permissions: [...TRIP_PERMISSIONS],
      })
      await loginAsLocalUser(page)

      await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()

      const stops = page.locator('section', { hasText: 'Paradas' }).last()
      await stops.screenshot({ path: printPath(`card-parada-${label}`, theme) })
    })
  }
}
