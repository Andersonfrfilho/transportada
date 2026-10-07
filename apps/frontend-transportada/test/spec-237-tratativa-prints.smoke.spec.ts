/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b (`web.md` §15): os prints da revisão de design da tratativa da avaria de recebimento no detalhe do
 * escritório (análise, decisão, acerto, concluir a devolução) e das correções de tela (origem cancelada, tipos
 * vazios, progresso com nota devolvida), em 375, 768 e 1280 px, nos dois temas. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-237-tratativa-prints.smoke.spec.ts` e grava os PNGs em `specs/237-.../prints`. Dado
 * sintético, API inteira dublada: nada aqui lê um banco.
 *
 * A revisão de design é por estilo calculado: os botões novos contra os vizinhos da mesma nota, os campos do
 * acerto entre si, o contraste nos dois temas, o alvo de toque a 375 px e a geometria real.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { expectNoClipping } from './cargo-clipping-smoke.helper'
import {
  buildOccurrence,
  buildOccurrencesView,
  buildProduct,
  buildReturn,
  RECEIVING_TYPES,
  windowOpenDueAt,
} from './fixtures/cargoOccurrence.fixture'
import {
  ARRIVAL_ID,
  buildDetail,
  buildDocument,
  documentIdOf,
} from './fixtures/cargoReceiving.fixture'
import {
  CORS_HEADERS,
  fulfillJson,
  measureContrast,
  MINIMUM_CONTRAST,
  navigate,
  PHOTO,
  readCellOverlaps,
  readDialogClipping,
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
const PHOTO_PATH = '/__tratativa-photo.png'

const RECIPIENTS = [
  'Mercado São Jorge Fictício',
  'Padaria Boa Massa Fictícia',
  'Farmácia Central Fictícia',
  'Armazém Três Irmãos Fictício',
  'Casa de Carnes Planalto Fictícia',
] as const

const RECEIVED = { receivedAt: '2026-10-03T13:00:00.000Z', separationState: 'received' } as const
const DOCUMENTS = [
  buildDocument({ number: '40121', recipientName: RECIPIENTS[0], ...RECEIVED }),
  buildDocument({ number: '40122', recipientName: RECIPIENTS[1], ...RECEIVED }),
  buildDocument({ number: '40123', recipientName: RECIPIENTS[2] }),
  buildDocument({
    number: '40124',
    receivedAt: '2026-10-03T13:00:00.000Z',
    recipientName: RECIPIENTS[3],
    separatedAt: '2026-10-03T13:30:00.000Z',
    separationState: 'separated',
  }),
  buildDocument({
    cityIbgeCode: '3526902',
    cityName: 'Limeira',
    number: '40125',
    recipientName: RECIPIENTS[4],
    ...RECEIVED,
  }),
]

const PROGRESS_DOCUMENTS = [
  ...Array.from({ length: 9 }, (_, index) =>
    buildDocument({
      number: String(40130 + index),
      receivedAt: '2026-10-03T13:00:00.000Z',
      recipientName: RECIPIENTS[index % RECIPIENTS.length] ?? 'Destinatário Fictício',
      separatedAt: '2026-10-03T13:30:00.000Z',
      separationState: 'separated',
    }),
  ),
  buildDocument({ number: '40139', recipientName: RECIPIENTS[0], ...RECEIVED }),
]

const PRODUCTS = [
  buildProduct({
    code: 'BIS-200',
    commercialUnit: 'CX',
    description: 'Biscoito de leite 200 g',
    ordinal: 1,
  }),
  buildProduct({
    code: 'SAB-90',
    commercialUnit: '',
    description: 'Sabonete em barra 90 g',
    ordinal: 2,
  }),
]

const photoAttachment = {
  downloadUrl: PHOTO_PATH,
  expired: false,
  id: 'att-a',
  mimeType: 'image/png',
  position: 1,
  thumbnailUrl: PHOTO_PATH,
}
const ITEMS_A = [
  { code: 'BIS-200', description: 'Biscoito de leite 200 g', quantity: '2.000', unit: 'CX' },
  { code: 'SAB-90', description: 'Sabonete em barra 90 g', quantity: null, unit: null },
]
const occurrenceA = (status: 'awaiting_contractor' | 'cancelled' | 'decided' | 'under_review') =>
  buildOccurrence({
    attachments: [photoAttachment],
    case: { id: 'case-a', status },
    id: 'occ-a',
    items: ITEMS_A,
    nfeDocumentId: documentIdOf(40121),
    note: 'Duas caixas amassadas no palete',
  })
const OCCURRENCE_B_CLOSED = buildOccurrence({
  attachments: [photoAttachment],
  case: { id: 'case-b', status: 'closed' },
  id: 'occ-b',
  items: [
    { code: 'BIS-200', description: 'Biscoito de leite 200 g', quantity: '3.000', unit: 'CX' },
  ],
  nfeDocumentId: documentIdOf(40124),
  occurrenceTypeId: RECEIVING_TYPES[1]?.id ?? '',
  typeName: 'Item faltante na chegada',
})
const OCCURRENCE_C_RECORDED = buildOccurrence({
  attachments: [photoAttachment],
  case: { id: 'case-c', status: 'recorded' },
  id: 'occ-c',
  nfeDocumentId: documentIdOf(40122),
  note: 'Embalagem rasgada',
})
const OCCURRENCE_C_REVIEW = buildOccurrence({
  attachments: [photoAttachment],
  case: { id: 'case-c', status: 'under_review' },
  id: 'occ-c',
  nfeDocumentId: documentIdOf(40122),
  note: 'Embalagem rasgada',
})
const OCCURRENCE_PROGRESS = buildOccurrence({
  case: { id: 'case-p', status: 'closed' },
  id: 'occ-p',
  nfeDocumentId: documentIdOf(40139),
  note: 'Pallet inteiro molhado',
})

type Scenario = Readonly<{
  documents: typeof DOCUMENTS
  occurrences: readonly ReturnType<typeof buildOccurrence>[]
  returns: readonly ReturnType<typeof buildReturn>[]
  types: typeof RECEIVING_TYPES
}>

const SCENARIOS = {
  analysis: {
    documents: DOCUMENTS,
    occurrences: [occurrenceA('under_review'), OCCURRENCE_C_RECORDED],
    returns: [],
    types: RECEIVING_TYPES,
  },
  cancelledOrigin: {
    documents: DOCUMENTS,
    occurrences: [occurrenceA('cancelled'), OCCURRENCE_C_REVIEW],
    returns: [buildReturn(documentIdOf(40121), 'marked', 'occ-a')],
    types: RECEIVING_TYPES,
  },
  complete: {
    documents: DOCUMENTS,
    occurrences: [occurrenceA('decided'), OCCURRENCE_B_CLOSED],
    returns: [
      buildReturn(documentIdOf(40121), 'marked', 'occ-a'),
      buildReturn(documentIdOf(40124), 'returned', 'occ-b'),
    ],
    types: RECEIVING_TYPES,
  },
  decision: {
    documents: DOCUMENTS,
    occurrences: [occurrenceA('awaiting_contractor'), OCCURRENCE_C_REVIEW],
    returns: [],
    types: RECEIVING_TYPES,
  },
  noTypes: { documents: DOCUMENTS, occurrences: [], returns: [], types: [] },
  progress: {
    documents: PROGRESS_DOCUMENTS,
    occurrences: [OCCURRENCE_PROGRESS],
    returns: [buildReturn(documentIdOf(40139), 'returned', 'occ-p')],
    types: RECEIVING_TYPES,
  },
  settlement: {
    documents: DOCUMENTS,
    occurrences: [occurrenceA('decided')],
    returns: [],
    types: RECEIVING_TYPES,
  },
} satisfies Record<string, Scenario>

const CASE_ACTION_PATH =
  /\/trip-occurrences\/[^/]+\/case\/(review|contractor-submission|decision|warehouse-return|cancel)$/
const CLOSURE_PATH = /\/trip-occurrences\/[^/]+\/case\/closure$/
const SETTLEMENT_PATH = /\/trip-occurrences\/[^/]+\/case\/settlement$/

async function mockApi(page: Page, scenario: Scenario): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: [
      'fleet.read',
      'trip.manage',
      'occurrences.resolve',
      'invoices.read',
      'settings.manage',
    ],
  })
  const detail = buildDetail({ documents: scenario.documents, separationDueAt: windowOpenDueAt() })
  const view = buildOccurrencesView({
    occurrences: scenario.occurrences,
    returns: scenario.returns,
  })
  await page.route(/\/contractors(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: [], page: { nextCursor: null } }),
  )
  await page.route(/\/cargo-arrivals\/[0-9a-f-]{36}(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: detail }),
  )
  await page.route(/\/cargo-arrivals\/[0-9a-f-]{36}\/occurrences$/, (route) =>
    fulfillJson(route, { data: view }),
  )
  await page.route(/\/cargo-arrivals\/occurrence-types$/, (route) =>
    fulfillJson(route, { data: scenario.types }),
  )
  await page.route(/\/documents\/[0-9a-f-]{36}\/products$/, (route) =>
    fulfillJson(route, { data: PRODUCTS }),
  )
  await page.route(CASE_ACTION_PATH, (route) =>
    fulfillJson(route, { data: { kind: 'changed', status: 'under_review' } }),
  )
  await page.route(CLOSURE_PATH, (route) =>
    fulfillJson(
      route,
      { error: { code: 'OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS', message: 'Settlement needed' } },
      422,
    ),
  )
  await page.route(SETTLEMENT_PATH, (route) =>
    fulfillJson(route, { data: { items: [], total: '0.0000' } }),
  )
  await page.route(`**${PHOTO_PATH}`, (route) =>
    route.fulfill({ body: PHOTO, contentType: 'image/png', headers: CORS_HEADERS }),
  )
}

async function openSeparation(page: Page): Promise<void> {
  await loginAsLocalUser(page)
  await navigate(page, `/recebimento/${ARRIVAL_ID}`)
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.locator('[data-note-actions]').first()).toBeVisible()
}

async function openOffice(page: Page): Promise<void> {
  await loginAsLocalUser(page)
  await navigate(page, `/recebimento/${ARRIVAL_ID}/detalhe`)
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.locator('[data-case-actions]').first()).toBeVisible()
}

async function chooseOption(input: {
  option: RegExp | string
  page: Page
  trigger: ReturnType<Page['locator']>
}): Promise<void> {
  await input.trigger.click()
  await input.page.getByRole('option', { name: input.option }).click()
}

async function openDecisionPanel(page: Page): Promise<void> {
  await openOffice(page)
  await page.locator('[data-occurrence-id="occ-a"] [data-case-action="decide"]').click()
  const panel = page.locator('[data-case-panel="decide"]')
  await chooseOption({
    option: 'Mercadoria paga pela transportadora',
    page,
    trigger: panel.getByRole('button', { exact: true, name: 'Decisão' }),
  })
  await panel.locator('textarea').fill('A transportadora paga as duas caixas amassadas.')
}

async function openSettlementForm(page: Page): Promise<void> {
  await openOffice(page)
  await page.locator('[data-occurrence-id="occ-a"] [data-case-action="close"]').click()
  await page.locator('[data-case-panel="close"] [data-case-confirm]').click()
  const form = page.locator('[data-case-settlement]')
  await expect(form).toBeVisible()
  await chooseOption({
    option: /BIS-200/,
    page,
    trigger: form.getByRole('button', { exact: true, name: 'Item do acerto' }).first(),
  })
  await form.locator('[data-settlement-field="amount"]').first().fill('120,50')
  await form.locator('[data-settlement-add]').click()
  await chooseOption({
    option: /SAB-90/,
    page,
    trigger: form.getByRole('button', { exact: true, name: 'Item do acerto' }).nth(1),
  })
  await form.locator('[data-settlement-field="amount"]').nth(1).fill('35,00')
  await chooseOption({
    option: 'Seguradora',
    page,
    trigger: form.getByRole('button', { exact: true, name: 'Quem paga o item do acerto' }).nth(1),
  })
}

type Screen = Readonly<{
  clipTarget: 'dialog' | 'main'
  height: number
  name: string
  open: (page: Page) => Promise<void>
  scenario: keyof typeof SCENARIOS
}>

const SCREENS: readonly Screen[] = [
  {
    clipTarget: 'main',
    height: 1700,
    name: 'tratativa-recebimento-analise',
    open: openOffice,
    scenario: 'analysis',
  },
  {
    clipTarget: 'main',
    height: 1700,
    name: 'tratativa-recebimento-decisao',
    open: openDecisionPanel,
    scenario: 'decision',
  },
  {
    clipTarget: 'main',
    height: 2000,
    name: 'tratativa-recebimento-acerto',
    open: openSettlementForm,
    scenario: 'settlement',
  },
  {
    clipTarget: 'main',
    height: 1700,
    name: 'tratativa-recebimento-concluir',
    open: openOffice,
    scenario: 'complete',
  },
  {
    clipTarget: 'main',
    height: 1100,
    name: 'tratativa-recebimento-cancelada',
    open: openSeparation,
    scenario: 'cancelledOrigin',
  },
  {
    clipTarget: 'dialog',
    height: 1300,
    name: 'avaria-tipos-vazio',
    open: async (page) => {
      await openSeparation(page)
      await page.getByLabel('Registrar avaria — NF 40122').click()
      await expect(page.getByRole('dialog').locator('[data-types-empty]')).toBeVisible()
    },
    scenario: 'noTypes',
  },
  {
    clipTarget: 'main',
    height: 1100,
    name: 'avaria-progresso-completo',
    open: openSeparation,
    scenario: 'progress',
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

const CONTRAST_TARGETS = [
  { name: 'situação da tratativa', selector: '[data-case-status]' },
  { name: 'botão da tratativa', selector: '[data-case-action]:not(:disabled)' },
  { name: 'texto do painel', selector: '[data-case-panel] p' },
  { name: 'rótulo do painel', selector: '[data-case-panel] label' },
  { name: 'título do acerto', selector: '[data-case-settlement] h3' },
  { name: 'ajuda do acerto', selector: '[data-case-settlement] > p' },
  { name: 'campo do valor', selector: '[data-settlement-field="amount"]' },
  { name: 'total do acerto', selector: '[data-settlement-total]' },
  { name: 'aviso da nota', selector: '[data-note-actions] p' },
  { name: 'aviso de tipos vazio', selector: '[data-types-empty]' },
  { name: 'progresso da separação', selector: '[role="progressbar"] + p' },
  { name: 'contagem do grupo', selector: '[aria-expanded] span' },
  { name: 'fato do cabeçalho', selector: 'header ul li' },
] as const

const TOUCH_SELECTORS = [
  '[data-case-actions] button',
  '[data-note-actions] button',
  '[role="dialog"] button',
] as const

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
        await screen.open(page)

        expect(await readOverflow(page)).toBeLessThanOrEqual(0)
        if (screen.clipTarget === 'dialog') {
          expect(await readDialogClipping(page)).toEqual([])
          await page.screenshot({ path: printPath(screen.name, width, theme) })
        } else {
          await expectNoClipping(page)
          expect(await readCellOverlaps(page)).toEqual([])
          await page.locator('main').screenshot({ path: printPath(screen.name, width, theme) })
        }

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

test('revisão de design — os botões da tratativa contra os vizinhos da nota (375, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: 1700, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, SCENARIOS.complete)
  await openOffice(page)
  const close = await readMetrics(page.locator('[data-case-action="close"]'))
  const complete = await readMetrics(page.locator('[aria-label^="Concluir devolução"]'))
  const status = await readMetrics(page.locator('[data-case-status]'))
  writeReview('neighbor-buttons', { close, complete, status })
  expect(close.height).toBe(complete.height)
  expect(close.fontSize).toBe(complete.fontSize)
  expect(close.fontFamily).toBe(complete.fontFamily)
  expect(close.borderWidth).toBe(complete.borderWidth)
})

test('revisão de design — o acerto: campos com a mesma altura e o mesmo estilo (375, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: 2000, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, SCENARIOS.settlement)
  await openSettlementForm(page)
  const form = page.locator('[data-case-settlement]')
  const item = await readMetrics(
    form.getByRole('button', { exact: true, name: 'Item do acerto' }).first(),
  )
  const amount = await readMetrics(form.locator('[data-settlement-field="amount"]').first())
  const payer = await readMetrics(
    form.getByRole('button', { exact: true, name: 'Quem paga o item do acerto' }).first(),
  )
  writeReview('neighbor-fields', { amount, item, payer })
  expect(amount.height).toBe(item.height)
  expect(payer.height).toBe(item.height)
  expect(amount.fontSize).toBe(item.fontSize)
  expect(amount.fontFamily).toBe(item.fontFamily)
})
