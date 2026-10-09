/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.2/T5.3 (`web.md` §15): os prints da revisão de design — a aba Calendário (origem de cada feriado, estado da
 * importação em seis situações, removidos pelo fornecedor, desligados, desligar e restaurar), a montagem com o aviso por
 * parada (e a queda da rota) e o detalhe da viagem com o selo —, em 375, 768 e 1280 px, nos dois temas. Fora do smoke da
 * CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-252-painel-prints.smoke.spec.ts` e grava os PNGs em `SPEC_252_PRINTS_DIRECTORY`.
 * Dado sintético, API inteira dublada: nada aqui lê um banco.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { expectNoClipping } from './cargo-clipping-smoke.helper'
import { mockSettingsShell } from './spec-238-prints-smoke.helper'
import {
  DAY_CHECK_WARNINGS,
  mockImportCalendarApi,
  type ImportMock,
  type ImportScenario,
} from './spec-252-prints-smoke.helper'
import {
  fulfillJson,
  measureContrast,
  MINIMUM_CONTRAST,
  navigate,
  readOverflow,
  readTouchTargets,
} from './spec-237-prints-smoke.helper'
import {
  mockTripWorkspaceApi,
  registerTripQuickCreateTollApi,
  TOLL_ACCESS_KEY_ONE,
  TOLL_ACCESS_KEY_TWO,
  TOLL_SINGLE_ROUTE_GEOMETRY,
} from './trip-smoke.helper'

const PRINTS_DIRECTORY =
  process.env.SPEC_252_PRINTS_DIRECTORY ??
  resolve(
    process.cwd(),
    '../../specs/252-os-feriados-vem-da-feriadosapi-e-avisam-na-montagem/prints',
  )
const PRINT_ONLY = process.env.SPEC_252_PRINT_ONLY
const WIDTHS = [375, 768, 1280] as const
const THEMES = ['dark', 'light'] as const
const MUNICIPAL = 'section[aria-labelledby="municipal-holidays-title"]'
const STATE = 'section[aria-labelledby="state-holidays-title"]'
const IMPORT_STATUS = 'section[aria-labelledby="holiday-import-title"]'
const REMOVED = 'section[aria-labelledby="holiday-removed-title"]'
const SUPPRESSIONS = 'section[aria-labelledby="holiday-suppressions-title"]'
const STOPS_SECTION = 'section:has(#trip-stops-title)'
const SUGGESTION_ID = '00000000-0000-4000-8000-000000000990'
const TRIP_PERMISSIONS = [
  'fleet.read',
  'fleet.manage',
  'mdfe.read',
  'mdfe.manage',
  'trip.financials',
  'trip.manage',
] as const

type Screen = Readonly<{
  height: number
  name: string
  open: (page: Page) => Promise<void>
  target: string
}>

async function openCalendar(page: Page, scenario: ImportScenario): Promise<ImportMock> {
  await mockSettingsShell(page)
  const mock = await mockImportCalendarApi({ page, scenario })
  await loginAsLocalUser(page)
  await navigate(page, '/company-settings?tab=businessCalendar')
  await expect(page.getByRole('heading', { name: 'Feriados desligados' })).toBeVisible()
  await expect(page.locator(`${MUNICIPAL} tbody tr`).first()).toBeVisible()
  await expect(
    page.locator(`${IMPORT_STATUS} [role="group"], ${IMPORT_STATUS} [role="alert"]`).first(),
  ).toBeVisible()
  return mock
}

function calendarScreen(
  input: Readonly<{ height: number; name: string; scenario: ImportScenario; target: string }>,
): Screen {
  return {
    height: input.height,
    name: input.name,
    open: async (page) => {
      await openCalendar(page, input.scenario)
    },
    target: input.target,
  }
}

const CALENDAR_SCREENS: readonly Screen[] = [
  calendarScreen({
    height: 2200,
    name: 'calendario-origem-municipal',
    scenario: 'healthy',
    target: MUNICIPAL,
  }),
  calendarScreen({
    height: 1800,
    name: 'calendario-origem-estadual',
    scenario: 'healthy',
    target: STATE,
  }),
  calendarScreen({
    height: 2200,
    name: 'importacao-em-dia',
    scenario: 'healthy',
    target: IMPORT_STATUS,
  }),
  calendarScreen({
    height: 2200,
    name: 'importacao-rotina-pausada',
    scenario: 'waiting',
    target: IMPORT_STATUS,
  }),
  calendarScreen({
    height: 2200,
    name: 'importacao-sem-cota',
    scenario: 'quota',
    target: IMPORT_STATUS,
  }),
  calendarScreen({
    height: 2200,
    name: 'importacao-com-falhas',
    scenario: 'failing',
    target: IMPORT_STATUS,
  }),
  calendarScreen({
    height: 2200,
    name: 'importacao-desligada',
    scenario: 'disabled',
    target: IMPORT_STATUS,
  }),
  calendarScreen({
    height: 2200,
    name: 'importacao-erro',
    scenario: 'error',
    target: IMPORT_STATUS,
  }),
  calendarScreen({
    height: 2200,
    name: 'removidos-pelo-fornecedor',
    scenario: 'healthy',
    target: REMOVED,
  }),
  calendarScreen({
    height: 2200,
    name: 'feriados-desligados',
    scenario: 'healthy',
    target: SUPPRESSIONS,
  }),
  {
    height: 2200,
    name: 'editar-importada',
    open: async (page) => {
      await openCalendar(page, 'healthy')
      await page.locator(`${MUNICIPAL} button[aria-label="Editar Consciência Negra"]`).click()
      await expect(page.getByText('Esta data veio da FeriadosAPI')).toBeVisible()
    },
    target: MUNICIPAL,
  },
  {
    height: 1300,
    name: 'desligar-confirmar',
    open: async (page) => {
      await openCalendar(page, 'healthy')
      await page.locator(`${MUNICIPAL} button[aria-label="Desligar Consciência Negra"]`).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
    target: '[role="dialog"]',
  },
  {
    height: 1300,
    name: 'desligar-data-passada',
    open: async (page) => {
      const mock = await openCalendar(page, 'healthy')
      mock.disableFailsWith = 'HOLIDAY_IMPORT_PAST_DATE'
      await page.locator(`${MUNICIPAL} button[aria-label="Desligar Consciência Negra"]`).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Desligar feriado' }).click()
      await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
    },
    target: '[role="dialog"]',
  },
  {
    height: 1300,
    name: 'excluir-digitada-ressalva',
    open: async (page) => {
      await openCalendar(page, 'healthy')
      await page.locator(`${MUNICIPAL} button[aria-label="Excluir Nossa Senhora da Luz"]`).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    },
    target: '[role="dialog"]',
  },
  {
    height: 2200,
    name: 'restaurar-aviso',
    open: async (page) => {
      await openCalendar(page, 'healthy')
      await page
        .getByRole('button', { name: /^Restaurar o feriado de .* em 24\/12\/2026$/u })
        .click()
      await expect(page.locator(`${SUPPRESSIONS} [role="status"]`)).toBeVisible()
    },
    target: SUPPRESSIONS,
  },
]

async function mockSolver(page: Page, dayChecks: 'down' | 'up'): Promise<{ calls: () => number }> {
  let dayCheckCalls = 0
  const stop = (sequence: number, addressKey: string, arrival: string) => ({
    addressKey,
    distanceFromPreviousMeters: 2_400,
    durationFromPreviousSeconds: 420,
    estimatedArrivalAt: arrival,
    excludedFromOptimization: false,
    geocodingPrecision: 'rooftop',
    label: addressKey,
    latitude: '-21.1767000',
    longitude: '-47.8208000',
    nfeDocumentIds: [],
    sequence,
    serviceTimeSampleSize: null,
    serviceTimeSeconds: 600,
    serviceTimeSource: 'default',
    stopId: null,
    vehicleId: null,
    violations: [],
    weightEstimated: false,
  })
  const ready = {
    assumptions: {
      dutyEnabled: false,
      endPolicy: 'depot',
      fallbackWeightKilograms: '0.00',
      originAddressKey: 'depot',
      serviceTimeSeconds: 600,
      serviceTimeSource: 'default',
      solverTimeBudgetSeconds: 30,
    },
    createdAt: '2026-10-09T12:00:00.000Z',
    decidedAt: null,
    errorCode: '',
    estimatedCostAmount: null,
    estimatedDistanceMeters: 88_600,
    estimatedDurationSeconds: 5_400,
    id: SUGGESTION_ID,
    seed: 7,
    status: 'ready',
    stops: [
      stop(1, '3543402|14010000|100', '2026-11-02T13:00:00.000Z'),
      stop(2, '3526902|13480000|100', '2026-11-02T17:00:00.000Z'),
    ],
    tripId: null,
    truncated: false,
    updatedAt: '2026-10-09T12:00:00.000Z',
    vehicleId: null,
  }
  await page.route(/\/route-suggestions\/multi-vehicle$/, (route) =>
    fulfillJson(route, { data: ready }, 202),
  )
  await page.route(/\/route-suggestions\/[0-9a-f-]{36}$/, (route) =>
    fulfillJson(route, { data: ready }),
  )
  await page.route(/\/business-calendar\/day-checks$/, async (route) => {
    if (route.request().method() === 'POST') dayCheckCalls += 1
    if (dayChecks === 'down') {
      await fulfillJson(route, { error: { code: 'DATABASE_UNAVAILABLE', message: 'x' } }, 503)
      return
    }
    await fulfillJson(route, { data: DAY_CHECK_WARNINGS })
  })
  return { calls: () => dayCheckCalls }
}

async function openAssembly(page: Page, dayChecks: 'down' | 'up'): Promise<void> {
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({ mode: 'all-authorized', page, permissions: [...TRIP_PERMISSIONS] })
  await registerTripQuickCreateTollApi({ page, routeGeometry: TOLL_SINGLE_ROUTE_GEOMETRY })
  const solver = await mockSolver(page, dayChecks)
  await loginAsLocalUser(page)
  await page.getByRole('button', { name: 'Nova viagem' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nova viagem' })
  const accessKeyField = dialog.getByLabel('Chave de acesso')
  await accessKeyField.fill(TOLL_ACCESS_KEY_ONE)
  await accessKeyField.press('Enter')
  await accessKeyField.fill(TOLL_ACCESS_KEY_TWO)
  await accessKeyField.press('Enter')
  await expect(dialog.getByText('2 notas entram na viagem.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Veículo' }).click()
  await page.getByRole('option', { name: /PED1A23/u }).click()
  await dialog.getByRole('button', { name: 'Melhor rota' }).click()
  await expect(dialog.getByText(/Término previsto/u)).toBeVisible({ timeout: 20_000 })
  expect(solver.calls()).toBe(1)
  if (dayChecks === 'up') {
    await expect(dialog.locator('[data-part="holiday-warning-notice"]')).toHaveCount(2)
    await expect(dialog.getByText(/Cai em Finados/u)).toHaveCount(0)
  } else {
    await expect(dialog.locator('[data-part="holiday-warning-notice"]')).toHaveCount(0)
    await expect(dialog.getByText(/Cai em Finados/u)).toBeVisible()
  }
}

const TRIP_SCREENS: readonly Screen[] = [
  {
    height: 1900,
    name: 'montagem-aviso-por-parada',
    open: (page) => openAssembly(page, 'up'),
    target: '[role="dialog"]',
  },
  {
    height: 1900,
    name: 'montagem-rota-caida-aviso-nacional',
    open: (page) => openAssembly(page, 'down'),
    target: '[role="dialog"]',
  },
  {
    height: 1700,
    name: 'detalhe-selo-de-feriado',
    open: async (page) => {
      await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
      await mockTripWorkspaceApi({
        mode: 'holiday-warning',
        page,
        permissions: ['trip.read', 'trip.manage', 'fleet.read'],
      })
      await loginAsLocalUser(page)
      await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()
      await expect(page.locator('[data-part="holiday-warning"]')).toHaveCount(2)
    },
    target: STOPS_SECTION,
  },
]

const SCREENS: readonly Screen[] = [...CALENDAR_SCREENS, ...TRIP_SCREENS]

const CONTRAST_TARGETS = [
  { name: 'selo de origem', selector: '[data-origin]' },
  { name: 'manchete da importação', selector: '[data-headline]' },
  { name: 'dica do bloco', selector: 'section[aria-labelledby$="-title"] > p' },
  { name: 'texto do estado', selector: '[role="group"] p' },
  { name: 'lista de fatos', selector: '[role="group"] li' },
  { name: 'célula da tabela', selector: 'tbody td' },
  { name: 'texto do diálogo', selector: '[role="dialog"] p' },
  { name: 'selo de feriado', selector: '[data-part="holiday-warning"]' },
  { name: 'aviso da montagem', selector: '[data-part="holiday-warning-notice"]' },
] as const

const TOUCH_SELECTORS = ['main button', '[role="dialog"] button'] as const

function target(page: Page, screen: Screen): Locator {
  return page.locator(screen.target).first()
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
        if (!screen.target.includes('dialog')) {
          await expectNoClipping(page)
        }
        await target(page, screen).screenshot({
          path: resolve(PRINTS_DIRECTORY, `${screen.name}-${String(width)}-${theme}.png`),
        })

        const contrast = await measureContrast(page, CONTRAST_TARGETS)
        for (const sample of contrast)
          expect(sample.ratio, sample.name).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)
        if (width === 375 && !screen.name.startsWith('montagem')) {
          expect(await readTouchTargets(page, TOUCH_SELECTORS)).toEqual([])
        }
      })
    }
  }
}
