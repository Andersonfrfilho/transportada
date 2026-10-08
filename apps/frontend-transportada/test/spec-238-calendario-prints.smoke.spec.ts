/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 Fase 2 (`web.md` §15): os prints da revisão de design da aba Calendário de Configurações — os três blocos,
 * o formulário da regra com erro de campo e com a recusa do servidor (e o atalho), a lista de regras com "gerado até"
 * e o aviso de horizonte baixo, os feriados estaduais, a adoção e as datas digitadas mantidas e a confirmação de
 * excluir —, em 375, 768 e 1280 px, nos dois temas. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-238-calendario-prints.smoke.spec.ts` e grava os PNGs em `specs/238-.../prints`. Dado
 * sintético, API inteira dublada: nada aqui lê um banco.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { expectNoClipping } from './cargo-clipping-smoke.helper'
import { mockCalendarApi, mockSettingsShell } from './spec-238-prints-smoke.helper'
import {
  fulfillJson,
  measureContrast,
  MINIMUM_CONTRAST,
  navigate,
  readCellOverlaps,
  readMetrics,
  readOverflow,
  readTouchTargets,
} from './spec-237-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/238-os-dias-uteis-contam-feriado-e-aniversario-da-cidade/prints',
)
const REVIEW_OUTPUT = process.env.SPEC_238_REVIEW_OUTPUT
const PRINT_ONLY = process.env.SPEC_238_PRINT_ONLY
const WIDTHS = [375, 768, 1280] as const
const THEMES = ['dark', 'light'] as const
const MUNICIPAL = 'section[aria-labelledby="municipal-holidays-title"]'
const STATE = 'section[aria-labelledby="state-holidays-title"]'
const RULE_PATH = /\/municipal-holiday-rules$/

async function openCalendar(page: Page, hasShortHorizon: boolean): Promise<void> {
  await mockSettingsShell(page)
  await mockCalendarApi({ page, scenario: { hasShortHorizon } })
  await loginAsLocalUser(page)
  await navigate(page, '/company-settings?tab=businessCalendar')
  await expect(page.getByRole('heading', { name: 'Feriados estaduais' })).toBeVisible()
  await expect(page.locator(`${MUNICIPAL} tbody tr`).first()).toBeVisible()
  await expect(page.locator(`${STATE} tbody tr`).first()).toBeVisible()
}

async function choose(
  input: Readonly<{ option: string; page: Page; scope: string; trigger: string }>,
): Promise<void> {
  await input.page.locator(`${input.scope} button[aria-label="${input.trigger}"]`).click()
  await input.page.getByRole('option', { name: input.option }).click()
}

async function fillRuleForm(
  page: Page,
  input: Readonly<{ day: string; name: string }>,
): Promise<void> {
  await choose({ option: 'SP —', page, scope: MUNICIPAL, trigger: 'UF do município' })
  await expect(page.locator(`${MUNICIPAL} button[aria-label="Município"]`)).toBeEnabled()
  await choose({ option: 'Ribeirão Preto', page, scope: MUNICIPAL, trigger: 'Município' })
  await choose({ option: 'Aniversário da cidade', page, scope: MUNICIPAL, trigger: 'Tipo' })
  await choose({ option: 'Todo ano', page, scope: MUNICIPAL, trigger: 'Recorrência' })
  await choose({ option: 'Abril', page, scope: MUNICIPAL, trigger: 'Mês' })
  await page.locator(`${MUNICIPAL} input[aria-label="Dia"]`).fill(input.day)
  await page.locator(`${MUNICIPAL} input[aria-label="Nome"]`).fill(input.name)
}

type Screen = Readonly<{
  hasShortHorizon: boolean
  height: number
  name: string
  open: (page: Page) => Promise<void>
  target: string
}>

const SCREENS: readonly Screen[] = [
  {
    hasShortHorizon: false,
    height: 2600,
    name: 'calendario-aba',
    open: (page) => openCalendar(page, false),
    target: '[aria-labelledby="business-calendar-title"]',
  },
  {
    hasShortHorizon: false,
    height: 1500,
    name: 'calendario-regra-form',
    open: async (page) => {
      await openCalendar(page, false)
      await fillRuleForm(page, { day: '31', name: 'Aniversário de Ribeirão Preto' })
      await page.locator(`${MUNICIPAL} button[type="submit"]`).click()
      await expect(page.locator(`${MUNICIPAL} [data-field-error]`)).toBeVisible()
    },
    target: MUNICIPAL,
  },
  {
    hasShortHorizon: false,
    height: 1500,
    name: 'calendario-regra-atalho',
    open: async (page) => {
      await openCalendar(page, false)
      await page.route(RULE_PATH, (route) =>
        route.request().method() === 'POST'
          ? fulfillJson(
              route,
              {
                error: {
                  code: 'INVALID_REQUEST',
                  details: [
                    { field: 'day', message: 'The day does not exist in the month' },
                    { field: 'name', message: 'Too small' },
                  ],
                  message: 'Invalid request',
                },
              },
              400,
            )
          : route.fallback(),
      )
      await fillRuleForm(page, { day: '14', name: 'Aniversário de Ribeirão Preto' })
      await page.locator(`${MUNICIPAL} button[type="submit"]`).click()
      await page.locator(`${MUNICIPAL} [data-refusal-summary] button`).first().click()
      await expect(page.locator(`${MUNICIPAL} input[aria-label="Dia"]`)).toBeFocused()
    },
    target: MUNICIPAL,
  },
  {
    hasShortHorizon: true,
    height: 2000,
    name: 'calendario-regra-lista',
    open: (page) => openCalendar(page, true),
    target: MUNICIPAL,
  },
  {
    hasShortHorizon: false,
    height: 1500,
    name: 'calendario-estadual',
    open: (page) => openCalendar(page, false),
    target: STATE,
  },
  {
    hasShortHorizon: false,
    height: 1500,
    name: 'calendario-adocao',
    open: async (page) => {
      await openCalendar(page, false)
      await choose({ option: 'SP —', page, scope: MUNICIPAL, trigger: 'UF do município' })
      await expect(page.locator(`${MUNICIPAL} button[aria-label="Município"]`)).toBeEnabled()
      await choose({ option: 'Campinas', page, scope: MUNICIPAL, trigger: 'Município' })
      await choose({ option: 'Feriado', page, scope: MUNICIPAL, trigger: 'Tipo' })
      await choose({ option: 'Só esta data', page, scope: MUNICIPAL, trigger: 'Recorrência' })
      await page.locator(`${MUNICIPAL} input[aria-label="Data"]`).fill('14/07/2026')
      await page
        .locator(`${MUNICIPAL} input[aria-label="Nome"]`)
        .fill('Aniversário (ponto facultativo)')
      await page.locator(`${MUNICIPAL} button[type="submit"]`).click()
      await expect(page.getByText('Esta data agora é sua')).toBeVisible()
    },
    target: MUNICIPAL,
  },
  {
    hasShortHorizon: false,
    height: 1500,
    name: 'calendario-datas-mantidas',
    open: async (page) => {
      await openCalendar(page, false)
      await page.route(/\/municipal-holiday-rules\/[0-9a-f-]{36}$/, (route) =>
        route.request().method() === 'PATCH'
          ? fulfillJson(route, {
              data: {
                cityIbgeCode: '3509502',
                createdAt: '2026-10-01T12:00:00.000Z',
                day: 15,
                id: '0b9c1f5e-5a62-4d0a-8b45-5d7c3f0e1a01',
                kind: 'city_anniversary',
                materializedThroughYear: 2036,
                month: 7,
                name: 'Aniversário de Campinas',
                typedHolidaysKept: 1,
                updatedAt: '2026-10-07T12:00:00.000Z',
              },
            })
          : route.fallback(),
      )
      await page.locator(`${MUNICIPAL} button[aria-label="Editar Aniversário de Campinas"]`).click()
      await page.locator(`${MUNICIPAL} input[aria-label="Dia"]`).fill('15')
      await page.locator(`${MUNICIPAL} button[type="submit"]`).click()
      await expect(page.getByText('continua valendo')).toBeVisible()
    },
    target: MUNICIPAL,
  },
  {
    hasShortHorizon: false,
    height: 1100,
    name: 'calendario-excluir',
    open: async (page) => {
      await openCalendar(page, false)
      await page
        .locator(`${MUNICIPAL} button[aria-label="Excluir Aniversário de Campinas"]`)
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
    target: '[role="dialog"]',
  },
]

function printPath(name: string, width: number, theme: string): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${String(width)}-${theme}.png`)
}

function writeReview(suffix: string, value: unknown): void {
  if (REVIEW_OUTPUT === undefined) return
  mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
  writeFileSync(`${REVIEW_OUTPUT}.${suffix}.json`, JSON.stringify(value, null, 2))
}

const CONTRAST_TARGETS: readonly Readonly<{ name: string; selector: string }>[] = [
  { name: 'aviso fixo do roteiro', selector: '[aria-labelledby="business-calendar-title"] > p' },
  { name: 'dica do bloco', selector: 'section[aria-labelledby$="-title"] > p' },
  { name: 'rótulo do campo', selector: '[data-field] > span' },
  { name: 'erro do campo', selector: '[data-field-error]' },
  { name: 'recusa do servidor', selector: '[data-refusal-summary]' },
  { name: 'atalho da recusa', selector: '[data-refusal-summary] button' },
  { name: 'aviso do horizonte', selector: '[data-horizon-notice] p' },
  { name: 'aviso de adoção e de datas mantidas', selector: 'section [role="status"]' },
  { name: 'cabeçalho da tabela', selector: 'th button' },
  { name: 'célula da tabela', selector: 'tbody td' },
  { name: 'texto do diálogo', selector: '[role="dialog"] p' },
]

const TOUCH_SELECTORS = [
  'main button',
  'main label:has(input[type="checkbox"])',
  '[role="dialog"] button',
]

function measureTarget(page: Page, screen: Screen): Locator {
  return page.locator(screen.target)
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const screen of SCREENS) {
      test(`prints ${screen.name} — ${String(width)} px ${theme}`, async ({ page }) => {
        if (
          PRINT_ONLY !== undefined &&
          PRINT_ONLY !== '' &&
          !PRINT_ONLY.split(',').includes(screen.name)
        )
          return
        mkdirSync(PRINTS_DIRECTORY, { recursive: true })
        await page.setViewportSize({ height: screen.height, width })
        await page.emulateMedia({ colorScheme: theme })
        await screen.open(page)

        expect(await readOverflow(page)).toBeLessThanOrEqual(0)
        if (screen.target !== '[role="dialog"]') {
          await expectNoClipping(page)
          expect(await readCellOverlaps(page)).toEqual([])
        }
        await measureTarget(page, screen)
          .first()
          .screenshot({ path: printPath(screen.name, width, theme) })

        const contrast = await measureContrast(page, CONTRAST_TARGETS)
        writeReview(`contrast-${screen.name}-${String(width)}-${theme}`, contrast)
        for (const sample of contrast)
          expect(sample.ratio, sample.name).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)

        if (width === 375) {
          const touch = await readTouchTargets(page, TOUCH_SELECTORS)
          writeReview(`touch-${screen.name}-${theme}`, touch)
          expect(touch).toEqual([])
        }
      })
    }
  }
}

test('revisão de design — campos e botões contra os vizinhos da aba Empresa (375, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: 2600, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await openCalendar(page, false)
  const name = await readMetrics(page.locator(`${MUNICIPAL} input[aria-label="Nome"]`))
  const select = await readMetrics(page.locator(`${MUNICIPAL} button[aria-label="Tipo"]`))
  const submit = await readMetrics(page.locator(`${MUNICIPAL} button[type="submit"]`))
  await page.getByRole('tab', { name: 'Diária do motorista' }).click()
  const driverAllowanceInput = await readMetrics(page.locator('#driver-allowance-amount'))
  await page.getByRole('tab', { name: 'Empresa' }).click()
  const neighborInput = await readMetrics(page.locator('main form input').first())
  const neighborButton = await readMetrics(page.locator('main form button[type="submit"]').first())
  writeReview('neighbors', {
    driverAllowanceInput,
    name,
    neighborButton,
    neighborInput,
    select,
    submit,
  })
  expect(name.height).toBe(select.height)
  expect(name.height).toBe(neighborInput.height)
  expect(name.fontSize).toBe(neighborInput.fontSize)
  expect(name.borderWidth).toBe(neighborInput.borderWidth)
  expect(submit.fontFamily).toBe(neighborButton.fontFamily)
  expect(submit.fontSize).toBe(neighborButton.fontSize)
  expect(submit.fontWeight).toBe(neighborButton.fontWeight)
  expect(submit.height).toBe(neighborButton.height)
})
