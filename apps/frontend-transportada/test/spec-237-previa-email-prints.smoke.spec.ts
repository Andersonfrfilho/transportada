/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (`web.md` §15): os prints da revisão de design da seção "Prévia por e-mail" da ficha do
 * contratante — sem endereço, as listas com erro por entrada, o endereço recém-gerado (mostrado uma vez), a
 * confirmação de rotação e as recusas recentes — em 375, 768 e 1280 px, nos dois temas. Fora do smoke da CI:
 * roda com `PLAYWRIGHT_TEST_MATCH=spec-237-previa-email-prints.smoke.spec.ts` e grava os PNGs em
 * `specs/237-.../prints`. Dado sintético (endereços `@exemplo.test`), API inteira dublada: nada aqui lê banco.
 *
 * A revisão de design é por estilo calculado: o botão e os campos novos contra os vizinhos da ficha, o
 * contraste nos dois temas, o alvo de toque a 375 px e a geometria real (nada cortado, nada de rolagem lateral).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { expectNoClipping } from './cargo-clipping-smoke.helper'
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
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/237-a-carga-chega-e-se-separa-antes-da-viagem/prints',
)
const REVIEW_OUTPUT = process.env.SPEC_237_REVIEW_OUTPUT
const PRINT_ONLY = process.env.SPEC_237_PRINT_ONLY
const WIDTHS = [375, 768, 1280] as const
const THEMES = ['dark', 'light'] as const

const ALFA_ID = '00000000-0000-4000-8000-0000002376a1'
const PREVIEW_ID = '00000000-0000-4000-8000-0000002376b1'
const GENERATED_TOKEN = 'k3m7q2xw5fh4tzr6vb2n7jdy3c'
const ENTRY_DOMAIN = 'entrada.exemplo.test'

const CONTRACTOR = {
  closingPeriod: 'monthly',
  displayName: 'Alfa Indústria Fictícia',
  id: ALFA_ID,
  notes: '',
  reportEmail: 'relatorio@alfa.exemplo.test',
  status: 'active',
  taxId: '11222333000181',
}

const PROFILE = {
  arrivalReferenceLabel: null,
  contractorId: ALFA_ID,
  deliveryDeadlineBusinessDays: 3,
  isEnabled: true,
  matchWindowDays: 15,
  previewColumnMap: { routeName: 'RouteName', value: 'VALOR', weightKg: 'PESO TOTAL' },
  previewEnabled: true,
  previewSheetName: 'IMPORTAÇÃO',
  requiresDamageCheck: false,
  separationWindowHours: 24,
  updatedAt: '2026-10-07T12:00:00.000Z',
  weightTolerancePercent: 0,
}

type Settings = {
  forwarderAllowlist: string[]
  hasInboundToken: boolean
  inboundTokenSetAt: string | null
  senderAllowlist: string[]
}
type Intake = {
  outcome: 'accepted' | 'rejected'
  previewId: string | null
  reasonCode: string | null
  receivedAt: string
}
type Scenario = Readonly<{ intakes: readonly Intake[]; settings: Settings }>

const FILLED_LISTS = {
  forwarderAllowlist: [
    'equipe@transportadora.exemplo.test',
    'logistica@transportadora.exemplo.test',
  ],
  senderAllowlist: ['pedidos@alfa.exemplo.test', 'alfa-industria.exemplo.test'],
}

const RECENT_INTAKES: readonly Intake[] = [
  {
    outcome: 'accepted',
    previewId: PREVIEW_ID,
    reasonCode: null,
    receivedAt: '2026-10-07T16:42:00.000Z',
  },
  {
    outcome: 'rejected',
    previewId: null,
    reasonCode: 'ORIGINAL_SENDER_NOT_ALLOWED',
    receivedAt: '2026-10-07T15:10:00.000Z',
  },
  {
    outcome: 'rejected',
    previewId: null,
    reasonCode: 'FORWARDER_DKIM_UNVERIFIABLE',
    receivedAt: '2026-10-07T14:55:00.000Z',
  },
  {
    outcome: 'rejected',
    previewId: null,
    reasonCode: 'ATTACHMENT_NOT_A_WORKBOOK',
    receivedAt: '2026-10-07T13:20:00.000Z',
  },
  {
    outcome: 'rejected',
    previewId: null,
    reasonCode: 'FORWARDER_FROM_MISMATCH',
    receivedAt: '2026-10-07T12:31:00.000Z',
  },
  {
    outcome: 'rejected',
    previewId: null,
    reasonCode: 'RATE_LIMITED',
    receivedAt: '2026-10-07T12:05:00.000Z',
  },
  {
    outcome: 'rejected',
    previewId: null,
    reasonCode: 'ATTACHMENT_MISSING',
    receivedAt: '2026-10-06T19:48:00.000Z',
  },
  {
    outcome: 'rejected',
    previewId: null,
    reasonCode: 'TOO_MANY_OPEN_PREVIEWS',
    receivedAt: '2026-10-06T18:02:00.000Z',
  },
]

const SCENARIOS = {
  fresh: {
    intakes: [],
    settings: {
      forwarderAllowlist: [],
      hasInboundToken: false,
      inboundTokenSetAt: null,
      senderAllowlist: [],
    },
  },
  filled: {
    intakes: [],
    settings: { ...FILLED_LISTS, hasInboundToken: false, inboundTokenSetAt: null },
  },
  active: {
    intakes: RECENT_INTAKES,
    settings: {
      ...FILLED_LISTS,
      hasInboundToken: true,
      inboundTokenSetAt: '2026-10-07T15:30:00.000Z',
    },
  },
} satisfies Record<string, Scenario>

async function mockApi(page: Page, scenario: Scenario): Promise<void> {
  const settings: Settings = structuredClone(scenario.settings)
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'trip.manage', 'invoices.read', 'settings.manage'],
  })
  await page.route(/\/contractors(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: [CONTRACTOR], page: { nextCursor: null } }),
  )
  await page.route(/\/contractor-receiving-profiles(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      data: [{ contractorId: ALFA_ID, isEnabled: true, previewEnabled: true }],
      nextCursor: null,
    }),
  )
  await page.route(/\/contractors\/[^/]+\/receiving-profile$/, (route) =>
    fulfillJson(route, { data: PROFILE }),
  )
  await page.route(/\/receiving-profile\/preview-email$/, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Pick<
        Settings,
        'forwarderAllowlist' | 'senderAllowlist'
      >
      settings.forwarderAllowlist = body.forwarderAllowlist
      settings.senderAllowlist = body.senderAllowlist
    }
    await fulfillJson(route, { data: { contractorId: ALFA_ID, ...settings } })
  })
  await page.route(/\/receiving-profile\/inbound-token$/, async (route) => {
    settings.hasInboundToken = true
    settings.inboundTokenSetAt = '2026-10-07T18:00:00.000Z'
    await fulfillJson(route, {
      data: { address: `${GENERATED_TOKEN}@${ENTRY_DOMAIN}`, token: GENERATED_TOKEN },
    })
  })
  await page.route(/\/receiving-profile\/email-intakes(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: scenario.intakes }),
  )
}

function emailSection(page: Page): Locator {
  return page
    .getByRole('heading', { exact: true, level: 4, name: 'Prévia por e-mail' })
    .locator('xpath=ancestor::section[1]')
}

async function openFicha(page: Page): Promise<Locator> {
  if (process.env.SPEC_237_DEBUG !== undefined) {
    page.on('console', (message) => console.log(`[console] ${message.text()}`))
    page.on('requestfailed', (request) =>
      console.log(`[falhou] ${request.url()} ${request.failure()?.errorText ?? ''}`),
    )
  }
  await loginAsLocalUser(page)
  await navigate(page, '/clientes?tab=contractors')
  await page.getByRole('button', { name: 'Abrir a ficha de Alfa Indústria Fictícia' }).click()
  const section = emailSection(page)
  await expect(section.getByLabel('Quem encaminha')).toBeVisible()
  await expect(section.locator('[aria-busy="true"]')).toHaveCount(0)
  await section.scrollIntoViewIfNeeded()
  return section
}

type Screen = Readonly<{
  height: number
  name: string
  open: (page: Page) => Promise<Locator>
  scenario: keyof typeof SCENARIOS
}>

const SCREENS: readonly Screen[] = [
  { height: 1500, name: 'previa-email-ficha', open: openFicha, scenario: 'fresh' },
  {
    height: 1800,
    name: 'previa-email-listas',
    open: async (page) => {
      const section = await openFicha(page)
      await section
        .getByLabel('Quem encaminha')
        .fill('equipe@transportadora.exemplo.test\nsem-arroba\ncom espaço@x.exemplo.test')
      await section
        .getByLabel('Remetente original do contratante')
        .fill('*.alfa.exemplo.test\n\u0430lfa.exemplo.test')
      await section.getByRole('button', { name: 'Salvar listas' }).click()
      await expect(section.locator('[aria-invalid="true"]').first()).toBeVisible()
      return section
    },
    scenario: 'filled',
  },
  {
    height: 1800,
    name: 'previa-email-token',
    open: async (page) => {
      const section = await openFicha(page)
      await section.getByRole('button', { name: 'Gerar endereço' }).click()
      await expect(section.getByText('Mostrado só agora')).toBeVisible()
      return section
    },
    scenario: 'filled',
  },
  {
    height: 1800,
    name: 'previa-email-rotacao',
    open: async (page) => {
      const section = await openFicha(page)
      await section.getByRole('button', { name: 'Gerar novo endereço' }).click()
      await expect(section.getByText('O endereço anterior deixa de valer')).toBeVisible()
      return section
    },
    scenario: 'active',
  },
  { height: 2200, name: 'previa-email-recusas', open: openFicha, scenario: 'active' },
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
  { name: 'texto da seção', selector: 'section[aria-labelledby] > header p' },
  { name: 'selo do estado', selector: 'section[aria-labelledby] [class*="badge"]' },
  { name: 'rótulo do campo', selector: 'label[class*="field"]' },
  { name: 'ajuda do campo', selector: 'p[id$="-hint"]' },
  { name: 'erro do campo', selector: 'ul[role="alert"] li' },
  { name: 'aviso "mostrado só agora"', selector: 'section[aria-labelledby] p[class*="warning"]' },
  { name: 'endereço gerado', selector: 'code' },
  { name: 'motivo da recusa', selector: 'tbody td[data-label="Motivo"]' },
  { name: 'link da prévia', selector: 'tbody a' },
  { name: 'cabeçalho da tabela', selector: 'thead th' },
]

/** O atalho do aviso de recusa é o componente de sempre da ficha: seu alvo cresce só em `pointer: coarse`. */
const TOUCH_SELECTORS = [
  'section[aria-labelledby] button:not([data-refusal-summary] *)',
  'section[aria-labelledby] a[href^="/recebimento"]',
]

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
        await mockApi(page, SCENARIOS[screen.scenario])
        const section = await screen.open(page)

        expect(await readOverflow(page)).toBeLessThanOrEqual(0)
        await expectNoClipping(page)
        expect(await readCellOverlaps(page)).toEqual([])
        await section.screenshot({ path: printPath(screen.name, width, theme) })

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

test('revisão de design — o botão e os campos novos contra os vizinhos da ficha (375, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: 1800, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, SCENARIOS.filled)
  const section = await openFicha(page)
  const save = await readMetrics(section.getByRole('button', { name: 'Salvar listas' }))
  const neighborSave = await readMetrics(page.getByRole('button', { name: 'Salvar perfil' }))
  const list = await readMetrics(section.getByLabel('Quem encaminha'))
  const neighborField = await readMetrics(page.getByLabel('Observações'))
  const badge = await readMetrics(section.locator('[class*="badge"]').first())
  writeReview('neighbor-ficha', { badge, list, neighborField, neighborSave, save })
  expect(save.height).toBe(neighborSave.height)
  expect(save.fontSize).toBe(neighborSave.fontSize)
  expect(save.fontFamily).toBe(neighborSave.fontFamily)
  expect(list.fontSize).toBe(neighborField.fontSize)
  expect(list.borderWidth).toBe(neighborField.borderWidth)
})
