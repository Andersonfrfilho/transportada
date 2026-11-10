/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 322: o interruptor do e-mail do aviso da ocorrência do motorista, em Configurações → Responsáveis por
 * ocorrências. Toda rota da API está dublada e o teste afirma `failures()` vazio. Os prints (claro/escuro, desktop e
 * celular) só saem com `PLAYWRIGHT_SAVE_PRINTS=true`; fora do smoke da CI, rode com `PLAYWRIGHT_TEST_MATCH`.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { trackApiFailures } from './audio-transcription-smoke.helper'
import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockSettingsShell } from './spec-238-prints-smoke.helper'
import { navigate } from './spec-237-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/322-o-email-do-aviso-da-ocorrencia-do-motorista-e-da-empresa/prints',
)
const SETTINGS_URL = '/company-settings?tab=occurrenceWatchers'
const TOGGLE_LABEL = 'Enviar esse aviso também por e-mail'
const CORS_HEADERS = {
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-allow-origin': '*',
}
const VIEWPORTS = {
  desktop: { height: 900, width: 1440 },
  mobile: { height: 844, width: 390 },
} as const

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ headers: CORS_HEADERS, status: 204 })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
}

type State = { enabled: boolean; puts: unknown[] }

async function openSettings(page: Page, state: State): Promise<() => readonly string[]> {
  const failures = trackApiFailures(page)
  await mockSettingsShell(page, { permissions: ['settings.manage'] })
  await page.route(/\/company-settings\/logo(?:\?.*)?$/, (route) => fulfillJson(route, {}, 404))
  await page.route(/\/company-settings\/occurrence-watchers\/candidates$/, (route) =>
    fulfillJson(route, {
      data: [{ maskedEmail: 'b***@exemplo.com.br', name: 'Beto Souza', userId: 'user-beto' }],
    }),
  )
  await page.route(/\/company-settings\/occurrence-watchers$/, (route) =>
    fulfillJson(route, {
      data: {
        effectiveSource: null,
        watchers: [
          {
            eligible: true,
            maskedEmail: 'a***@exemplo.com.br',
            name: 'Ana Lima',
            status: 'active',
            userId: 'user-ana',
          },
        ],
      },
    }),
  )
  await page.route(/\/company-settings\/driver-occurrence-email$/, async (route) => {
    if (route.request().method() === 'PUT') {
      state.puts.push(route.request().postDataJSON())
      state.enabled = (route.request().postDataJSON() as { enabled: boolean }).enabled
    }
    await fulfillJson(route, {
      data: { enabled: state.enabled, updatedAt: '2026-11-10T21:00:00.000Z' },
    })
  })
  await loginAsLocalUser(page)
  await navigate(page, SETTINGS_URL)
  return failures
}

test('spec 322: desligar o e-mail do aviso grava { enabled: false } e a tela mostra o efeito', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  const state: State = { enabled: true, puts: [] }
  const failures = await openSettings(page, state)

  const toggle = page.getByRole('checkbox', { name: TOGGLE_LABEL })
  await expect(toggle).toBeChecked()
  await expect(
    page.getByText('Ao desligar: ninguém da empresa recebe esse aviso por e-mail.'),
  ).toBeVisible()

  await toggle.uncheck()
  await expect.poll(() => state.puts).toEqual([{ enabled: false }])
  await expect(toggle).not.toBeChecked()
  expect(failures()).toEqual([])
})

for (const viewport of ['desktop', 'mobile'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`spec 322: print — ${viewport} ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize(VIEWPORTS[viewport])
      const failures = await openSettings(page, { enabled: false, puts: [] })
      const section = page.getByRole('region', {
        name: 'E-mail do aviso de ocorrência do motorista',
      })
      await expect(section.getByRole('checkbox', { name: TOGGLE_LABEL })).not.toBeChecked()
      await section.scrollIntoViewIfNeeded()
      if (process.env.PLAYWRIGHT_SAVE_PRINTS === 'true') {
        mkdirSync(PRINTS_DIRECTORY, { recursive: true })
        await page.screenshot({
          fullPage: true,
          path: resolve(PRINTS_DIRECTORY, `aviso-${viewport}-${theme}.png`),
        })
      }
      expect(failures()).toEqual([])
    })
  }
}
