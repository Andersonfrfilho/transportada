/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.2/T5.3 (`web.md` §15): os prints da revisão de design do bloco "Chave da FeriadosAPI" (sem chave, configurada,
 * orçamento próprio com o uso do mês, salvando, erro de formato, 400, 409 e 429 do servidor, remover com confirmação, só
 * leitura, importação desligada) e das manchetes novas do cartão de status (sem chave, chave ilegível, orçamento atingido,
 * aguardando com chave, chave nova aguardando o próximo ciclo) e do diálogo de remover a chave, em 375, 768 e 1280 px, nos dois temas. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-262-painel-prints.smoke.spec.ts` e grava os PNGs em `SPEC_262_PRINTS_DIRECTORY` (nunca no
 * repositório). Dado sintético, chave SENTINELA e API inteira dublada: nada aqui lê um banco.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { expectNoClipping } from './cargo-clipping-smoke.helper'
import {
  CONFIGURE_PERMISSIONS,
  FAKE_KEY,
  mockProviderApi,
  READ_ONLY_PERMISSIONS,
  type ProviderScenario,
} from './spec-262-prints-smoke.helper'
import {
  measureContrast,
  MINIMUM_CONTRAST,
  navigate,
  readOverflow,
  readTouchTargets,
} from './spec-237-prints-smoke.helper'

const PRINTS_DIRECTORY =
  process.env.SPEC_262_PRINTS_DIRECTORY ?? resolve(process.cwd(), 'spec-262-prints')
const PRINT_ONLY = process.env.SPEC_262_PRINT_ONLY
const WIDTHS = [375, 768, 1280] as const
const THEMES = ['dark', 'light'] as const
const PROVIDER = 'section[aria-labelledby="holiday-provider-title"]'
const IMPORT_STATUS = 'section[aria-labelledby="holiday-import-title"]'
const DIALOG = '[role="dialog"]'

const WITH_KEY: ProviderScenario = {
  hasToken: true,
  monthlyRequests: 42,
  permissions: CONFIGURE_PERMISSIONS,
}
const WITHOUT_KEY: ProviderScenario = { ...WITH_KEY, hasToken: false }

type Screen = Readonly<{
  height: number
  name: string
  open: (page: Page) => Promise<void>
  scenario: ProviderScenario
  target: string
}>

async function openCalendar(page: Page, scenario: ProviderScenario): Promise<void> {
  await mockProviderApi({ page, scenario })
  await loginAsLocalUser(page)
  await navigate(page, '/company-settings?tab=businessCalendar')
  await expect(page.getByRole('heading', { name: 'Chave da FeriadosAPI' })).toBeVisible()
  await expect(page.locator(`${PROVIDER} [data-fact="token"]`)).toBeVisible()
  await expect(page.locator(`${PROVIDER} input[type="checkbox"]`)).toBeVisible()
  await expect(page.locator(`${IMPORT_STATUS} [data-headline]`)).toBeVisible()
}

function screen(
  input: Readonly<{
    height?: number
    name: string
    open?: (page: Page) => Promise<void>
    scenario: ProviderScenario
    target?: string
  }>,
): Screen {
  return {
    height: input.height ?? 2200,
    name: input.name,
    open: async (page) => {
      await openCalendar(page, input.scenario)
      await input.open?.(page)
    },
    scenario: input.scenario,
    target: input.target ?? PROVIDER,
  }
}

async function fillKey(page: Page, value: string): Promise<void> {
  await page.locator(`${PROVIDER} input[type="password"]`).fill(value)
}

async function submit(page: Page): Promise<void> {
  await page.locator(`${PROVIDER}`).getByRole('button', { name: 'Salvar', exact: true }).click()
}

const SCREENS: readonly Screen[] = [
  screen({ name: 'chave-sem-chave', scenario: WITHOUT_KEY }),
  screen({ name: 'chave-configurada-padrao', scenario: WITH_KEY }),
  screen({
    name: 'chave-orcamento-proprio-uso',
    scenario: { ...WITH_KEY, budget: 2500, monthlyRequests: 1873 },
  }),
  screen({
    name: 'chave-salvando',
    open: async (page) => {
      await fillKey(page, FAKE_KEY)
      await submit(page)
      await expect(page.locator(PROVIDER).getByRole('button', { name: 'Salvando…' })).toBeVisible()
    },
    scenario: { ...WITH_KEY, putFailure: 'hold' },
  }),
  screen({
    name: 'chave-erro-formato',
    open: async (page) => {
      await fillKey(page, 'curta com espaço')
      await submit(page)
      await expect(page.locator(`${PROVIDER} [data-field-error]`)).toBeVisible()
    },
    scenario: WITHOUT_KEY,
  }),
  screen({
    name: 'chave-erro-400-servidor',
    open: async (page) => {
      await fillKey(page, FAKE_KEY)
      await submit(page)
      await expect(page.locator(`${PROVIDER} [role="alert"]`)).toBeVisible()
    },
    scenario: {
      ...WITH_KEY,
      putFailure: {
        code: 'INVALID_REQUEST',
        details: [{ field: 'token', message: 'x' }],
        status: 400,
      },
    },
  }),
  screen({
    name: 'chave-conflito-409',
    open: async (page) => {
      await fillKey(page, FAKE_KEY)
      await submit(page)
      await expect(page.locator(`${PROVIDER} [role="alert"]`)).toBeVisible()
    },
    scenario: {
      ...WITH_KEY,
      putFailure: { code: 'HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT', status: 409 },
    },
  }),
  screen({
    name: 'chave-limite-429',
    open: async (page) => {
      await fillKey(page, FAKE_KEY)
      await submit(page)
      await expect(page.locator(`${PROVIDER} [role="alert"]`)).toBeVisible()
    },
    scenario: {
      ...WITH_KEY,
      putFailure: {
        code: 'TOO_MANY_REQUESTS',
        headers: { 'retry-after': '1500' },
        status: 429,
      },
    },
  }),
  screen({
    name: 'chave-remover-confirmacao',
    open: async (page) => {
      await page.locator(PROVIDER).getByRole('button', { name: 'Remover chave' }).click()
      await expect(
        page.getByRole('dialog', { name: 'Remover a chave da FeriadosAPI?' }),
      ).toBeVisible()
    },
    scenario: WITH_KEY,
    target: DIALOG,
  }),
  screen({
    name: 'chave-sem-permissao',
    scenario: { ...WITH_KEY, permissions: READ_ONLY_PERMISSIONS },
  }),
  screen({
    name: 'chave-interruptor-desligado',
    scenario: { ...WITH_KEY, enablement: { isEnabled: false, origin: 'company' } },
  }),
  screen({ name: 'status-sem-chave', scenario: WITHOUT_KEY, target: IMPORT_STATUS }),
  screen({
    name: 'status-chave-ilegivel',
    scenario: { ...WITH_KEY, lastRunOutcome: 'credential_unreadable' },
    target: IMPORT_STATUS,
  }),
  screen({
    name: 'status-orcamento-atingido',
    scenario: { ...WITH_KEY, budget: 1800, monthlyRequests: 1800 },
    target: IMPORT_STATUS,
  }),
  screen({
    name: 'status-chave-nova-aguardando',
    scenario: {
      ...WITH_KEY,
      lastRunOutcome: 'credential_unreadable',
      tokenSavedAt: '2026-10-10T14:00:00.000Z',
    },
    target: IMPORT_STATUS,
  }),
  screen({
    name: 'status-aguardando-com-chave',
    scenario: { ...WITH_KEY, lastRunOutcome: 'waiting', monthlyRequests: 0 },
    target: IMPORT_STATUS,
  }),
  screen({
    name: 'status-chave-recusada',
    scenario: { ...WITH_KEY, lastRunOutcome: 'provider_unauthorized' },
    target: IMPORT_STATUS,
  }),
]

const CONTRAST_TARGETS = [
  { name: 'resumo da chave', selector: `${PROVIDER} [data-fact]` },
  { name: 'aviso fixo', selector: `${PROVIDER} [data-notice]` },
  { name: 'rótulo do campo', selector: `${PROVIDER} [data-field] label` },
  { name: 'dica do campo', selector: `${PROVIDER} [data-field] p` },
  { name: 'erro do campo', selector: `${PROVIDER} [data-field-error]` },
  { name: 'recusa', selector: `${PROVIDER} [role="alert"] p` },
  { name: 'manchete da importação', selector: '[data-headline]' },
  { name: 'texto do estado', selector: '[role="group"] p' },
  { name: 'texto do diálogo', selector: `${DIALOG} p` },
  { name: 'lista de fatos', selector: '[role="group"] li' },
] as const

const TOUCH_SELECTORS = [
  'main button',
  `${DIALOG} button`,
  `${PROVIDER} input:not([type="checkbox"])`,
] as const

function target(page: Page, current: Screen): Locator {
  return page.locator(current.target).first()
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const current of SCREENS) {
      test(`prints ${current.name} — ${String(width)} px ${theme}`, async ({ page }) => {
        if (
          PRINT_ONLY !== undefined &&
          PRINT_ONLY !== '' &&
          !PRINT_ONLY.split(',').includes(current.name)
        )
          return
        mkdirSync(PRINTS_DIRECTORY, { recursive: true })
        await page.setViewportSize({ height: current.height, width })
        await page.emulateMedia({ colorScheme: theme })
        await current.open(page)

        expect(await readOverflow(page)).toBeLessThanOrEqual(0)
        await expectNoClipping(page)
        await target(page, current).screenshot({
          path: resolve(PRINTS_DIRECTORY, `${current.name}-${String(width)}-${theme}.png`),
        })

        const contrast = await measureContrast(page, CONTRAST_TARGETS)
        for (const sample of contrast)
          expect(sample.ratio, sample.name).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)
        if (width === 375) {
          expect(await readTouchTargets(page, TOUCH_SELECTORS)).toEqual([])
        }
        await expect(page.locator('body')).not.toContainText(FAKE_KEY)
      })
    }
  }
}
