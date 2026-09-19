/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockFleetWorkspaceApi } from './fleet-smoke.helper'
import { DRIVER_DETAIL } from './fleet/fleet.fixture'

/**
 * Pendências de UI registradas na spec 159 (T12, "pendências fora do escopo"): alvo de toque do
 * cabeçalho no celular e a coluna "Nota" escondida na rolagem horizontal da lista de motoristas.
 * Fora do smoke da CI — roda com `PLAYWRIGHT_TEST_MATCH=spec-159-ui-pendencias.smoke.spec.ts` e
 * grava os PNGs ao lado da spec, que é onde a evidência mora. `PENDENCIA_STAGE` (env var, `antes` |
 * `depois`) decide o sufixo do print — a mesma suíte gera os dois lados da correção.
 */
const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/159-a-foto-obrigatoria-pesa-na-nota-do-motorista/prints',
)
const PHONE = { height: 844, width: 390 } as const
const DESKTOP = { height: 900, width: 1440 } as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]
const STAGE = process.env.PENDENCIA_STAGE ?? 'depois'
const MINIMUM_TOUCH_TARGET_PX = 44

function printPath(name: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${STAGE}-${theme}.png`)
}

/** Registrado depois de `mockFleetWorkspaceApi`: a rota mais nova vence, e a lista deixa de ser vazia. */
async function registerOneScoredDriver(page: Page): Promise<void> {
  await page.route(/\/fleet\/drivers(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 204 })
      return
    }
    await route.fulfill({
      body: JSON.stringify({
        /**
         * Nome longo e CNPJ vinculado preenchido: com valor curto a tabela cabe no painel de
         * ~695px (3fr de 1440px com a ficha aberta) e a rolagem nunca aparece — o defeito só se
         * reproduz com dado do tamanho real que a tela recebe em produção.
         */
        data: [
          {
            ...DRIVER_DETAIL,
            linkedTaxId: '12.345.678/0001-90',
            name: 'Alexandre Ferreira dos Santos Junior',
            score: 40,
          },
        ],
        page: { nextCursor: null },
      }),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
    })
  })
}

for (const theme of THEMES) {
  test(`Cabeçalho do shell: menu, tema e sair têm alvo de toque de 44px no celular (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(PHONE)
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'fleet'))
    await mockFleetWorkspaceApi({ page, permissions: ['fleet.read', 'fleet.manage'] })
    await loginAsLocalUser(page)

    const header = page.locator('header.application-header')
    await expect(header).toBeVisible()
    await header.screenshot({ path: printPath('pendencia-cabecalho', theme) })

    const menuButton = page.getByRole('button', { name: 'Abrir navegação' })
    const themeButton = page.getByRole('button', { name: /Usar tema (claro|escuro)/u })
    const logoutButton = page.getByRole('button', { name: 'Sair', exact: true })
    for (const button of [menuButton, themeButton, logoutButton]) {
      const box = await button.boundingBox()
      expect(box).not.toBeNull()
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET_PX)
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET_PX)
    }
  })

  test(`Lista de motoristas com ficha aberta: coluna Nota visível sem rolagem (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'fleet'))
    await mockFleetWorkspaceApi({ page, permissions: ['fleet.read', 'fleet.manage'] })
    await registerOneScoredDriver(page)
    await loginAsLocalUser(page)

    await page.getByRole('tab', { name: 'Motoristas' }).click()
    const row = page.locator('tbody tr').first()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Editar motorista' })).toBeVisible()
    /* Print antes das asserções: a evidência de "antes" precisa sair mesmo quando a asserção
       reprova o defeito — senão o print de "antes" nunca é gravado. */
    await page.screenshot({ path: printPath('pendencia-lista-nota', theme) })

    const measurement = await page.evaluate(() => {
      const table = document.querySelector('table')
      const header = [...(table?.querySelectorAll('th') ?? [])].find(
        (candidate) => candidate.textContent?.trim() === 'Nota',
      )
      const scrollContainer = header?.closest('table')?.parentElement ?? null
      if (header === undefined || scrollContainer === null) {
        return null
      }
      const headerRect = header.getBoundingClientRect()
      const containerRect = scrollContainer.getBoundingClientRect()
      return {
        containerRight: containerRect.right,
        headerRight: headerRect.right,
        scrollLeft: scrollContainer.scrollLeft,
      }
    })

    expect(measurement).not.toBeNull()
    expect(measurement?.scrollLeft).toBe(0)
    expect(measurement?.headerRight ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      measurement?.containerRight ?? 0,
    )
  })
}
