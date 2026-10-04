/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4 (`web.md` §15): os prints da revisão de design das prévias de carga — a lista, o envio da
 * planilha (preenchido e com os três erros: o do cliente, o 413 e o 422), o detalhe com roteiros e linhas em
 * todas as situações, o detalhe logo depois do envio (quase tudo "esperando o XML"), o vínculo à mão, a
 * proposta de chegada e a chegada pré-preenchida —, em 375, 768 e 1280 px, nos dois temas. Fora do smoke da
 * CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-237-previas-prints.smoke.spec.ts` e grava os PNGs em
 * `specs/237-.../prints`.
 *
 * Todo dado é sintético (contratantes, destinatários, endereços, CEPs inventados; só as cidades são reais) e
 * a API inteira é dublada: nada aqui lê um banco. A revisão compara os elementos novos com os vizinhos (a
 * lista de chegadas e a aba Contratantes) por estilo calculado, mede o contraste nos dois temas e o alvo de
 * toque de TODOS os controles a 375 px.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  buildPreviewItem,
  buildPreviewDetail,
  buildPreviewSummary,
  linkedDocument,
  PREVIEW_ID,
  PREVIEW_SECOND_ID,
  PREVIEW_THIRD_ID,
} from './fixtures/cargoPreview.fixture'
import {
  ALFA_ID,
  ARRIVAL_ID,
  BETA_ID,
  buildAvailable,
  buildSummary,
  documentIdOf,
} from './fixtures/cargoReceiving.fixture'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/237-a-carga-chega-e-se-separa-antes-da-viagem/prints',
)
const REVIEW_OUTPUT = process.env.SPEC_237_REVIEW_OUTPUT
const WIDTHS = [375, 768, 1280] as const
const THEMES = ['dark', 'light'] as const
const VIEWPORT_HEIGHT = 900
const MINIMUM_TOUCH_TARGET = 44
const GAMA_ID = '00000000-0000-4000-8000-000000237a03'
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

const CONTRACTORS = [
  { displayName: 'Alfa Indústria Fictícia', id: ALFA_ID, taxId: '11222333000181' },
  { displayName: 'Beta Comércio Fictício', id: BETA_ID, taxId: '22333444000162' },
  { displayName: 'Gama Distribuidora Fictícia', id: GAMA_ID, taxId: '33444555000143' },
].map((contractor) => ({
  ...contractor,
  closingPeriod: 'monthly',
  notes: '',
  reportEmail: '',
  status: 'active',
}))

/** Como a planilha real escreve: caixa alta, sem acento. Todos inventados. */
const RECIPIENTS = [
  'MERCADO SAO JORGE FICTICIO LTDA',
  'PADARIA BOA MASSA FICTICIA ME',
  'FARMACIA CENTRAL FICTICIA LTDA',
  'ARMAZEM TRES IRMAOS FICTICIO',
  'CASA DE CARNES PLANALTO FICTICIA',
  'DISTRIBUIDORA RIO CLARO FICTICIA',
  'EMPORIO DO VALE FICTICIO LTDA',
  'SUPERMERCADO NOVA ERA FICTICIO',
  'ATACADO BOM PRECO FICTICIO',
  'LOJA DE RACAO PET FELIZ FICTICIA',
  'MINI MERCADO DA PRACA FICTICIO',
  'HORTIFRUTI SOL NASCENTE FICTICIO',
] as const

function recipient(index: number): string {
  return RECIPIENTS[index % RECIPIENTS.length] ?? RECIPIENTS[0]
}

/** Uma linha da planilha com endereço e CEP inventados. */
function row(
  number: number,
  overrides: Parameters<typeof buildPreviewItem>[1] = {},
): ReturnType<typeof buildPreviewItem> {
  return buildPreviewItem(number, {
    address: `AV DOS EXEMPLOS FICTICIA ${String(number * 17)}`,
    neighborhood: 'CENTRO FICTICIO',
    postalCode: `1356${String(number).padStart(4, '0')}`,
    recipientName: recipient(number),
    value: `${String(1180 + number * 237)}.${String(10 + number)}`,
    weightKg: `${String(80 + number * 19)}.${String(number % 10)}0`,
    ...overrides,
  })
}

/** O detalhe completo: uma linha de cada situação, em quatro roteiros e uma sem roteiro. */
const MIXED_ITEMS = [
  row(1, {
    city: 'SAO CARLOS',
    document: linkedDocument(52_101, '1417.11'),
    evidence: ['value', 'weight', 'route_load'],
    matchGroupKey: 'g1',
    matchState: 'matched',
    matchedAt: '2026-10-03T22:31:00.000Z',
    matchedBy: 'system',
  }),
  row(2, {
    city: 'SAO CARLOS',
    document: linkedDocument(52_102, '1654.12'),
    matchGroupKey: 'g2',
    matchState: 'matched',
    matchedAt: '2026-10-03T22:40:00.000Z',
    matchedBy: 'user',
  }),
  row(3, {
    candidateDocumentIds: [documentIdOf(52_103)],
    city: 'SAO CARLOS',
    evidence: ['value'],
    matchState: 'suggested',
  }),
  row(4, { city: 'SAO CARLOS' }),
  row(5, { city: 'IBATE' }),
  row(6, {
    candidateDocumentIds: [documentIdOf(52_106), documentIdOf(52_107)],
    city: 'ARARAQUARA',
    matchState: 'ambiguous',
    routeName: 'FR.R.PRE',
  }),
  row(7, {
    city: 'ARARAQUARA',
    matchState: 'invalid',
    routeName: 'FR.R.PRE',
    rowErrors: [
      { column: 'VALOR', field: 'value', message: 'Must be a non-negative decimal number' },
      { column: 'PESO TOTAL', field: 'weightKg', message: 'A value is required' },
    ],
    value: null,
    weightKg: null,
  }),
  row(8, { city: 'MATAO', routeName: 'FR.R.PRE' }),
  row(9, { city: 'FRANCA', routeName: 'FR.FRANC' }),
  row(10, { city: 'FRANCA', routeName: 'FR.FRANC' }),
  row(11, { city: null, routeName: null }),
]

/** Logo depois do envio: o caso comum — todas as linhas esperam o XML, só uma já fechou. */
const AWAITING_ITEMS = [
  row(1, {
    city: 'SAO CARLOS',
    document: linkedDocument(52_101, '1417.11'),
    matchGroupKey: 'g1',
    matchState: 'matched',
    matchedAt: '2026-10-03T22:31:00.000Z',
    matchedBy: 'system',
  }),
  ...[2, 3, 4, 5].map((number) => row(number, { city: 'SAO CARLOS' })),
  ...[6, 7, 8].map((number) => row(number, { city: 'ARARAQUARA', routeName: 'FR.R.PRE' })),
  ...[9, 10, 11].map((number) => row(number, { city: 'FRANCA', routeName: 'FR.FRANC' })),
]

const PREVIEWS = [
  buildPreviewSummary({ id: PREVIEW_ID, rowCount: 107 }),
  buildPreviewSummary({
    contractorId: BETA_ID,
    contractorName: 'Beta Comércio Fictício',
    fileName: 'BETA-01-10.xlsx',
    id: PREVIEW_SECOND_ID,
    plannedDate: '2026-10-01',
    receivedAt: '2026-09-30T17:54:00.000Z',
    rowCount: 191,
  }),
  buildPreviewSummary({
    fileName: 'FR-06-10.xlsm',
    id: '00000000-0000-4000-8000-0000002374a4',
    plannedDate: null,
    receivedAt: '2026-10-04T08:05:00.000Z',
    rowCount: null,
    status: 'queued',
  }),
  buildPreviewSummary({
    errorCode: 'PREVIEW_COLUMN_NOT_FOUND',
    fileName: 'FR-28-09.xlsm',
    id: PREVIEW_THIRD_ID,
    plannedDate: '2026-09-28',
    receivedAt: '2026-09-25T19:33:00.000Z',
    rowCount: null,
    status: 'failed',
  }),
]

const AVAILABLE = [
  buildAvailable(52_106, {
    cityName: 'Araraquara',
    recipientName: recipient(6),
    totalValue: '2603.16',
  }),
  buildAvailable(52_107, {
    cityName: 'Araraquara',
    recipientName: recipient(6),
    totalValue: '2603.16',
  }),
  ...[52_108, 52_109, 52_110, 52_111, 52_112, 52_113, 52_114].map((number, index) =>
    buildAvailable(number, {
      cityName: index % 2 === 0 ? 'Matão' : 'Franca',
      recipientName: recipient(index + 1),
      totalValue: `${String(1300 + index * 311)}.${String(20 + index)}`,
    }),
  ),
]

type ApiState = {
  items: readonly ReturnType<typeof buildPreviewItem>[]
  proposal: Readonly<{ documentIds: string[]; refused: { documentId: string; reason: string }[] }>
  uploadMode: 'ok' | 'too-large' | 'not-enabled'
}

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

function detailFor(state: ApiState, url: URL) {
  const after = Number(url.searchParams.get('afterRow') ?? '0')
  const stateFilter = url.searchParams.get('state')
  const routeFilter = url.searchParams.get('routeName')
  const items = state.items.filter(
    (item) =>
      item.rowNumber > after &&
      (stateFilter === null || item.matchState === stateFilter) &&
      (routeFilter === null || item.routeName === routeFilter),
  )
  return {
    ...buildPreviewDetail({ items: state.items, rowCount: 107 }),
    items: { items, nextCursor: null },
  }
}

async function mockApi(page: Page, state: ApiState): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'trip.manage', 'invoices.read', 'settings.manage'],
  })
  await page.route(/\/contractors(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: CONTRACTORS, page: { nextCursor: null } }),
  )
  await page.route(/\/contractors\/[^/]+\/receiving-profile$/, (route) => {
    const id = route.request().url().split('/').at(-2) ?? ''
    return fulfillJson(route, {
      data: { contractorId: id, isEnabled: id !== GAMA_ID, previewEnabled: id === ALFA_ID },
    })
  })
  await page.route(/\/cargo-arrivals\/available-documents(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: AVAILABLE, nextCursor: null }),
  )
  await page.route(/\/cargo-arrivals(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      data: [
        buildSummary({
          counts: { expected: 9, received: 3, separated: 18, total: 30 },
          id: ARRIVAL_ID,
        }),
      ],
      nextCursor: null,
    }),
  )
  await page.route(/\/cargo-previews\/[0-9a-f-]{36}\/propose-arrival$/, (route) =>
    fulfillJson(route, {
      data: {
        contractorId: ALFA_ID,
        documentIds: state.proposal.documentIds,
        plannedDate: '2026-10-05',
        previewId: PREVIEW_ID,
        refused: state.proposal.refused,
      },
    }),
  )
  await page.route(/\/cargo-previews\/[0-9a-f-]{36}\/items\/[0-9a-f-]{36}\/[a-z]+$/, (route) =>
    fulfillJson(route, { data: { itemIds: [], outcome: 'changed' } }),
  )
  await page.route(/\/cargo-previews\/[0-9a-f-]{36}(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: detailFor(state, new URL(route.request().url())) }),
  )
  await page.route(/\/cargo-previews(?:\?.*)?$/, (route) => {
    if (route.request().method() !== 'POST') {
      return fulfillJson(route, { data: PREVIEWS, nextCursor: null })
    }
    if (state.uploadMode === 'too-large') {
      return fulfillJson(route, { error: { code: 'PREVIEW_FILE_TOO_LARGE', message: 'x' } }, 413)
    }
    if (state.uploadMode === 'not-enabled') {
      return fulfillJson(route, { error: { code: 'CARGO_PREVIEW_NOT_ENABLED', message: 'x' } }, 422)
    }
    return fulfillJson(route, { data: PREVIEWS[0] }, 201)
  })
}

function newState(overrides: Partial<ApiState> = {}): ApiState {
  return {
    items: MIXED_ITEMS,
    proposal: {
      documentIds: [documentIdOf(52_101), documentIdOf(52_102)],
      refused: [{ documentId: documentIdOf(52_102), reason: 'DOCUMENT_IN_LIVE_TRIP' }],
    },
    uploadMode: 'ok',
    ...overrides,
  }
}

async function navigate(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function openScreen(page: Page, path: string): Promise<void> {
  await loginAsLocalUser(page)
  await navigate(page, path)
  await expect(page.locator('main h1')).toBeVisible()
}

function printPath(name: string, width: number, theme: string): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${String(width)}-${theme}.png`)
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function shoot(page: Page, name: string, width: number, theme: string): Promise<void> {
  await expectNoHorizontalScroll(page)
  await page.locator('main').screenshot({ path: printPath(name, width, theme) })
}

function spreadsheet(bytes: number): { buffer: Buffer; mimeType: string; name: string } {
  return {
    buffer: Buffer.alloc(bytes, 1),
    mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    name: 'FR-05-10.xlsm',
  }
}

async function fillUpload(page: Page, bytes: number): Promise<void> {
  await page.getByRole('button', { name: 'Contratante da planilha' }).click()
  await page.getByRole('option', { name: 'Alfa Indústria Fictícia' }).click()
  await page.locator('input[type="file"]').setInputFiles(spreadsheet(bytes))
}

async function openProposal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Propor chegada' }).click()
  await expect(page.locator('[data-proposal]')).toBeVisible()
}

async function openManualLink(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Vincular à mão a linha 10' }).click()
  await expect(page.locator('[data-manual-link] [data-document-option]').first()).toBeVisible()
}

type ContrastSample = Readonly<{ name: string; ratio: number }>

const CONTRAST_TARGETS: readonly Readonly<{ name: string; selector: string }>[] = [
  { name: 'ajuda do campo', selector: 'main [class*="_hint_"]' },
  { name: 'rótulo do campo', selector: 'main label' },
  { name: 'célula da tabela', selector: 'tbody td' },
  { name: 'indicador de ordenação', selector: '[class*="_sortIndicator_"]' },
  { name: 'aba ativa', selector: '[class*="_sectionTabActive_"]' },
  { name: 'aba inativa', selector: '[class*="_sectionTab_"]' },
  { name: 'título de seção', selector: '[class*="_sectionTitle_"]' },
  { name: 'selo neutro', selector: '[data-tone="neutral"]' },
  { name: 'selo pronta/vinculada', selector: '[data-tone="ready"]' },
  { name: 'selo sugerida/ambígua', selector: '[data-tone="warn"]' },
  { name: 'selo falhou/inválida', selector: '[data-tone="alert"]' },
  { name: 'motivo da falha', selector: '[class*="_failure_"]' },
  { name: 'aviso (notice)', selector: '[class*="_notice_"]' },
  { name: 'nota "esperando o XML"', selector: '[data-awaiting-note]' },
  { name: 'texto secundário da linha', selector: '[class*="_secondary_"]' },
  { name: 'resumo por situação', selector: '[class*="_summaryItem_"]' },
  { name: 'dados do roteiro', selector: '[class*="_routeFacts_"]' },
  { name: 'erro de linha da planilha', selector: '[class*="_rowErrors_"] li' },
  { name: 'erro do campo', selector: 'p[role="alert"]' },
  { name: 'aviso de recusa de campo', selector: '[data-refusal-summary]' },
  { name: 'dados do cabeçalho', selector: '[class*="_facts_"] li' },
]

/** Razão de contraste WCAG entre a cor do texto e o fundo opaco efetivo (compõe os fundos translúcidos). */
async function measureContrast(page: Page): Promise<readonly ContrastSample[]> {
  return page.evaluate((targets) => {
    type Rgba = [number, number, number, number]
    const parse = (css: string): Rgba => {
      const numbers = css.match(/-?\d*\.?\d+/gu)?.map(Number) ?? [0, 0, 0]
      if (css.startsWith('color(srgb')) {
        return [numbers[0]! * 255, numbers[1]! * 255, numbers[2]! * 255, numbers[3] ?? 1]
      }
      return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0, numbers[3] ?? 1]
    }
    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const alpha = top[3] + bottom[3] * (1 - top[3])
      const mix = (index: 0 | 1 | 2) =>
        (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / (alpha === 0 ? 1 : alpha)
      return [mix(0), mix(1), mix(2), alpha]
    }
    const luminance = (color: Rgba): number => {
      const channel = (value: number) => {
        const unit = value / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2])
    }
    const effectiveBackground = (element: Element): Rgba => {
      let color: Rgba = [0, 0, 0, 0]
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        color = over(color, parse(getComputedStyle(node).backgroundColor))
        if (color[3] >= 0.999) break
      }
      return over(color, [255, 255, 255, 1])
    }
    return targets.flatMap((target) => {
      const element = document.querySelector(target.selector)
      if (element === null) return []
      const foreground = parse(getComputedStyle(element).color)
      const background = effectiveBackground(element)
      const text = over(foreground, background)
      const [lighter, darker] = [luminance(text), luminance(background)].sort((a, b) => b - a) as [
        number,
        number,
      ]
      return [
        { name: target.name, ratio: Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100 },
      ]
    })
  }, CONTRAST_TARGETS)
}

type Screen = Readonly<{
  name: string
  open: (page: Page) => Promise<void>
  state?: () => ApiState
}>

const SCREENS: readonly Screen[] = [
  {
    name: 'previa-lista',
    open: async (page) => {
      await openScreen(page, '/recebimento/previas')
      await expect(page.getByText('Beta Comércio Fictício').first()).toBeVisible()
      await expect(page.getByText('Na fila')).toBeVisible()
    },
  },
  {
    name: 'previa-enviar',
    open: async (page) => {
      await openScreen(page, '/recebimento/previas')
      await fillUpload(page, 820_000)
      await expect(page.getByText('FR-05-10.xlsm').first()).toBeVisible()
    },
  },
  {
    name: 'previa-enviar-erro',
    open: async (page) => {
      await openScreen(page, '/recebimento/previas')
      await fillUpload(page, 1_100_000)
      await page.getByRole('button', { name: 'Enviar planilha' }).click()
      await expect(page.getByText('A planilha tem mais de 960 KB')).toBeVisible()
    },
  },
  {
    name: 'previa-enviar-erro-413',
    open: async (page) => {
      await openScreen(page, '/recebimento/previas')
      await fillUpload(page, 820_000)
      await page.getByRole('button', { name: 'Enviar planilha' }).click()
      await expect(page.getByText('passa do limite de 960 KB')).toBeVisible()
    },
    state: () => newState({ uploadMode: 'too-large' }),
  },
  {
    name: 'previa-enviar-erro-422',
    open: async (page) => {
      await openScreen(page, '/recebimento/previas')
      await fillUpload(page, 820_000)
      await page.getByRole('button', { name: 'Enviar planilha' }).click()
      await expect(page.getByText('A prévia não está ligada para este contratante')).toBeVisible()
    },
    state: () => newState({ uploadMode: 'not-enabled' }),
  },
  {
    name: 'previa-detalhe',
    open: async (page) => {
      await openScreen(page, `/recebimento/previas/${PREVIEW_ID}`)
      await expect(page.locator('[data-route-section="FR.R.PRE"]')).toBeVisible()
    },
  },
  {
    name: 'previa-detalhe-aguardando',
    open: async (page) => {
      await openScreen(page, `/recebimento/previas/${PREVIEW_ID}`)
      await expect(page.locator('[data-awaiting-note]')).toBeVisible()
    },
    state: () => newState({ items: AWAITING_ITEMS }),
  },
  {
    name: 'previa-vincular-manual',
    open: async (page) => {
      await openScreen(page, `/recebimento/previas/${PREVIEW_ID}`)
      await openManualLink(page)
    },
  },
  {
    name: 'previa-propor-chegada',
    open: async (page) => {
      await openScreen(page, `/recebimento/previas/${PREVIEW_ID}`)
      await openProposal(page)
    },
  },
  {
    name: 'previa-chegada-preenchida',
    open: async (page) => {
      await openScreen(page, `/recebimento/previas/${PREVIEW_ID}`)
      await openProposal(page)
      await page.getByRole('button', { name: 'Registrar chegada com estas notas' }).click()
      await expect(page.locator('[data-prefill-notice]')).toBeVisible()
    },
  },
]

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const screen of SCREENS) {
      test(`prints ${screen.name} — ${String(width)} px ${theme}`, async ({ page }) => {
        mkdirSync(PRINTS_DIRECTORY, { recursive: true })
        await page.setViewportSize({ height: VIEWPORT_HEIGHT, width })
        await page.emulateMedia({ colorScheme: theme })
        await mockApi(page, screen.state?.() ?? newState())

        await screen.open(page)
        await shoot(page, screen.name, width, theme)

        if (width === 1280 && REVIEW_OUTPUT !== undefined) {
          const contrast = await measureContrast(page)
          mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
          writeFileSync(
            `${REVIEW_OUTPUT}.contrast-${screen.name}-${theme}.json`,
            JSON.stringify(contrast, null, 2),
          )
        }
      })
    }
  }
}

async function readMetrics(locator: Locator): Promise<Record<string, string>> {
  return locator.first().evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderRadius: style.borderTopLeftRadius,
      borderWidth: style.borderTopWidth,
      color: style.color,
      fontFamily: style.fontFamily.split(',')[0] ?? '',
      fontSize: style.fontSize,
      height: `${String(Math.round(box.height))}px`,
      paddingBlock: `${style.paddingTop} ${style.paddingBottom}`,
      paddingInline: `${style.paddingLeft} ${style.paddingRight}`,
    }
  })
}

test('revisão de design — os elementos novos contra a lista de chegadas e a ficha de Contratantes (1280, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: VIEWPORT_HEIGHT, width: 1280 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, newState())
  await page.route(/\/delivery-clients(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: [], page: { nextCursor: null } }),
  )

  await openScreen(page, '/clientes?tab=contractors')
  await expect(page.getByRole('region', { name: 'Lista de contratantes' })).toBeVisible()
  const contratantes = {
    botao: await readMetrics(page.getByRole('button', { name: /^Abrir a ficha/u })),
    buscar: await readMetrics(page.getByLabel('Buscar')),
    celula: await readMetrics(page.locator('tbody td')),
    cabecalho: await readMetrics(page.locator('thead th')),
  }

  await navigate(page, '/recebimento')
  await expect(page.getByRole('region', { name: 'Lista de chegadas' })).toBeVisible()
  const chegadas = {
    abas: await readMetrics(page.getByRole('button', { name: 'Chegadas' })),
    botaoAbrir: await readMetrics(page.getByRole('button', { name: /^Abrir a chegada/u })),
    botaoRegistrar: await readMetrics(page.getByRole('button', { name: 'Registrar chegada' })),
    cabecalho: await readMetrics(page.locator('thead th')),
    celula: await readMetrics(page.locator('tbody td')),
    selo: await readMetrics(page.locator('[class*="_badge_"]')),
    selecaoStatus: await readMetrics(page.getByRole('button', { name: 'Situação' })),
  }

  await navigate(page, '/recebimento/previas')
  await expect(page.getByRole('region', { name: 'Lista de prévias' })).toBeVisible()
  await fillUpload(page, 820_000)
  const previas = {
    abas: await readMetrics(page.getByRole('button', { name: 'Prévias' })),
    arquivo: await readMetrics(page.locator('[class*="_control_"]')),
    botaoAbrir: await readMetrics(page.getByRole('button', { name: /^Abrir a prévia/u })),
    botaoEnviar: await readMetrics(page.getByRole('button', { name: 'Enviar planilha' })),
    cabecalho: await readMetrics(page.locator('thead th')),
    celula: await readMetrics(page.locator('tbody td')),
    contratanteDaPlanilha: await readMetrics(
      page.getByRole('button', { name: 'Contratante da planilha' }),
    ),
    selo: await readMetrics(page.locator('tbody [class*="_badge_"]')),
    selecaoStatus: await readMetrics(page.getByRole('button', { name: 'Situação' })),
  }

  await navigate(page, `/recebimento/previas/${PREVIEW_ID}`)
  await expect(page.locator('[data-route-section="FR.R.PRE"]')).toBeVisible()
  const detalhe = {
    botaoConfirmar: await readMetrics(page.getByRole('button', { name: 'Confirmar a linha 7' })),
    botaoPropor: await readMetrics(page.getByRole('button', { name: 'Propor chegada' })),
    celula: await readMetrics(page.locator('[data-item-id] td').nth(1)),
    cabecalho: await readMetrics(page.locator('[data-route-section] thead th').first()),
    seloLinha: await readMetrics(page.locator('[data-state-badge]')),
  }

  const result = { chegadas, contratantes, detalhe, previas }
  if (REVIEW_OUTPUT !== undefined) {
    mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
    writeFileSync(REVIEW_OUTPUT, JSON.stringify(result, null, 2))
  }
  expect(Object.keys(result.previas).length).toBeGreaterThan(0)
})

async function collectTouchTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main button, main input, main a, main label[for]')]
      .filter((element) => !(element instanceof HTMLInputElement && element.type === 'file'))
      // O rótulo de texto do campo de arquivo não é o controle: o controle é o quadro clicável (`_control_`).
      .filter(
        (element) => element.tagName !== 'LABEL' || String(element.className).includes('_control_'),
      )
      .filter((element) => element.getBoundingClientRect().height > 0)
      .map((element) => {
        const box = element.getBoundingClientRect()
        return {
          height: Math.round(box.height * 10) / 10,
          text: (element.getAttribute('aria-label') ?? element.textContent ?? '')
            .trim()
            .slice(0, 48),
          width: Math.round(box.width * 10) / 10,
        }
      }),
  )
}

test('revisão de design — alvo de toque de TODOS os controles das prévias (375)', async ({
  page,
}) => {
  await page.setViewportSize({ height: VIEWPORT_HEIGHT, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, newState())
  await openScreen(page, '/recebimento/previas')
  await fillUpload(page, 820_000)
  await page.getByRole('button', { name: 'Enviar planilha' }).click()
  const lista = await collectTouchTargets(page)

  await navigate(page, `/recebimento/previas/${PREVIEW_ID}`)
  await expect(page.locator('[data-route-section="FR.R.PRE"]')).toBeVisible()
  await openProposal(page)
  await openManualLink(page)
  await page.getByRole('button', { name: 'Desvincular a linha 5' }).click()
  await expect(page.locator('[data-unlink-warning]')).toBeVisible()
  const detalhe = await collectTouchTargets(page)

  const targets = [
    ...lista.map((item) => ({ ...item, tela: 'lista' })),
    ...detalhe.map((item) => ({ ...item, tela: 'detalhe' })),
  ]
  if (REVIEW_OUTPUT !== undefined) {
    mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
    writeFileSync(`${REVIEW_OUTPUT}.touch-targets.json`, JSON.stringify(targets, null, 2))
  }
  expect(targets.length).toBeGreaterThan(20)
  const tooSmall = targets.filter(
    (target) => target.height < MINIMUM_TOUCH_TARGET || target.width < MINIMUM_TOUCH_TARGET,
  )
  expect(tooSmall).toEqual([])
})
