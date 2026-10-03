/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (`web.md` §15): os prints da revisão de design do recebimento — a lista de chegadas, o
 * registro (com notas marcadas e com a recusa do servidor), o detalhe do escritório e as duas telas do
 * celular do separador (a separação e o resultado de um lote com nota recusada) —, em 375, 768 e 1280 px,
 * nos dois temas. Fora do smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-237-recebimento-prints.smoke.spec.ts`
 * e grava os PNGs em `specs/237-.../prints`.
 *
 * Todo dado é sintético (contratantes, destinatários e CNPJs inventados; cidades reais) e a API inteira é
 * dublada: nada aqui lê um banco. A revisão compara os elementos novos com os vizinhos (a aba Contratantes)
 * por estilo calculado, mede o contraste nos dois temas e o alvo de toque de TODOS os botões a 375 px.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  ALFA_ID,
  ARRIVAL_ID,
  BETA_ID,
  buildAvailable,
  buildDetail,
  buildDocument,
  buildSummary,
  documentIdOf,
  withDocumentState,
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

const RECIPIENTS = [
  'Mercado São Jorge Fictício',
  'Padaria Boa Massa Fictícia',
  'Farmácia Central Fictícia',
  'Armazém Três Irmãos Fictício',
  'Casa de Carnes Planalto Fictícia',
  'Distribuidora Rio Claro Fictícia',
  'Empório do Vale Fictício',
  'Supermercado Nova Era Fictício',
  'Atacado Bom Preço Fictício',
  'Loja de Ração Pet Feliz Fictícia',
  'Mini Mercado da Praça Fictício',
  'Hortifruti Sol Nascente Fictício',
] as const

function recipient(index: number): string {
  return RECIPIENTS[index % RECIPIENTS.length] ?? RECIPIENTS[0]
}

const RECEIVED_AT = '2026-10-03T13:00:00.000Z'
const SEPARATED_AT = '2026-10-03T13:40:00.000Z'

const DOCUMENTS = [
  buildDocument({ number: '40121', recipientName: recipient(0), separationState: 'expected' }),
  buildDocument({
    number: '40122',
    receivedAt: RECEIVED_AT,
    recipientName: recipient(1),
    separationState: 'received',
  }),
  buildDocument({
    number: '40123',
    receivedAt: RECEIVED_AT,
    recipientName: recipient(2),
    separatedAt: SEPARATED_AT,
    separationState: 'separated',
  }),
  buildDocument({ number: '40124', recipientName: recipient(3), separationState: 'expected' }),
  buildDocument({
    number: '40125',
    receivedAt: RECEIVED_AT,
    recipientName: recipient(4),
    separatedAt: SEPARATED_AT,
    separationState: 'separated',
  }),
  buildDocument({
    cityIbgeCode: '3526902',
    cityName: 'Limeira',
    number: '40126',
    recipientName: recipient(5),
  }),
  buildDocument({
    cityIbgeCode: '3526902',
    cityName: 'Limeira',
    number: '40127',
    receivedAt: RECEIVED_AT,
    recipientName: recipient(6),
    separationState: 'received',
  }),
  buildDocument({
    cityIbgeCode: '3552205',
    cityName: 'Sorocaba',
    isInLiveTrip: true,
    number: '40128',
    recipientName: recipient(7),
    routeName: 'FR.N.SOR',
  }),
  buildDocument({
    cityIbgeCode: null,
    cityName: null,
    number: '40129',
    recipientName: recipient(8),
    routeName: null,
  }),
]

const ARRIVALS = [
  buildSummary({
    arrivedAt: '2026-10-03T08:30:00.000Z',
    counts: { expected: 9, received: 3, separated: 18, total: 30 },
    id: ARRIVAL_ID,
    isSeparationOverdue: true,
    separationDueAt: '2026-10-02T08:30:00.000Z',
  }),
  buildSummary({
    arrivedAt: '2026-10-03T07:10:00.000Z',
    contractorId: BETA_ID,
    contractorName: 'Beta Comércio Fictício',
    counts: { expected: 4, received: 2, separated: 6, total: 12 },
    id: '00000000-0000-4000-8000-0000002372b2',
    palletCount: null,
    reference: null,
    separationDueAt: '2026-10-04T07:10:00.000Z',
    separationWindowHours: 24,
  }),
  buildSummary({
    arrivedAt: '2026-10-02T14:00:00.000Z',
    contractorId: BETA_ID,
    contractorName: 'Beta Comércio Fictício',
    counts: { expected: 0, received: 0, separated: 18, total: 18 },
    id: '00000000-0000-4000-8000-0000002372b3',
    separationDueAt: '2026-10-03T14:00:00.000Z',
    status: 'closed',
  }),
  buildSummary({
    arrivedAt: '2026-10-01T09:45:00.000Z',
    counts: { expected: 9, received: 0, separated: 0, total: 9 },
    id: '00000000-0000-4000-8000-0000002372b4',
    separationDueAt: null,
    separationWindowHours: null,
  }),
]

const AVAILABLE = Array.from({ length: 9 }, (_, index) =>
  buildAvailable(50101 + index, {
    cityName: index % 3 === 0 ? 'Limeira' : 'Piracicaba',
    recipientName: recipient(index),
    totalValue: `${String(1200 + index * 317)}.${String(10 + index)}`,
  }),
)

const REFUSAL = {
  error: {
    code: 'CARGO_ARRIVAL_DOCUMENTS_REFUSED',
    details: [
      { field: 'documentIds.0', message: 'DOCUMENT_IN_LIVE_TRIP' },
      { field: 'documentIds.2', message: 'DOCUMENT_ALREADY_IN_ARRIVAL' },
      { field: 'documentIds.3', message: 'DOCUMENT_FROM_ANOTHER_ISSUER' },
      { field: 'reference', message: 'Too big' },
    ],
    message: 'Some documents cannot enter this cargo arrival',
  },
}

type ApiState = {
  detail: ReturnType<typeof buildDetail>
  refuseRegistration: boolean
  /** O recebimento desta nota é recusado: é o que o print do lote com uma recusada precisa. */
  refusedAtReceive: string | undefined
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

type BatchBody = { documentIds: string[]; to: 'received' | 'separated' }

function applyBatch(state: ApiState, body: BatchBody) {
  const documents = state.detail.groups.flatMap((group) => group.documents)
  const changes: Record<string, 'received' | 'separated'> = {}
  const results = body.documentIds.map((documentId) => {
    const document = documents.find((item) => item.nfeDocumentId === documentId)
    if (document === undefined) {
      return { documentId, outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND' }
    }
    if (body.to === 'received' && documentId === state.refusedAtReceive) {
      return { documentId, outcome: 'refused', reason: 'CARGO_ARRIVAL_TRANSITION_NOT_ALLOWED' }
    }
    if (document.separationState === body.to) return { documentId, outcome: 'unchanged' }
    const isForward =
      (document.separationState === 'expected' && body.to === 'received') ||
      (document.separationState === 'received' && body.to === 'separated')
    if (!isForward) {
      return { documentId, outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED' }
    }
    changes[documentId] = body.to
    return { documentId, outcome: 'changed' }
  })
  state.detail = withDocumentState(state.detail, changes)
  return results
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
      data: { contractorId: id, isEnabled: id !== GAMA_ID, separationWindowHours: 24 },
    })
  })
  await page.route(/\/cargo-arrivals\/available-documents(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: AVAILABLE, nextCursor: null }),
  )
  await page.route(/\/cargo-arrivals\/[^/]+\/documents\/batch-status$/, async (route) => {
    const body = route.request().postDataJSON() as BatchBody
    await fulfillJson(route, { data: { results: applyBatch(state, body) } })
  })
  await page.route(/\/cargo-arrivals\/[0-9a-f-]{36}(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: state.detail }),
  )
  await page.route(/\/cargo-arrivals(?:\?.*)?$/, (route) => {
    if (route.request().method() === 'POST') {
      return state.refuseRegistration
        ? fulfillJson(route, REFUSAL, 422)
        : fulfillJson(route, { data: state.detail }, 201)
    }
    return fulfillJson(route, { data: ARRIVALS, nextCursor: null })
  })
}

function newState(): ApiState {
  return {
    detail: buildDetail({
      documents: DOCUMENTS,
      isSeparationOverdue: true,
      reference: 'Lacre 4471',
    }),
    refuseRegistration: true,
    refusedAtReceive: undefined,
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

async function chooseContractorAndMarkDocuments(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Contratante' }).click()
  await page.getByRole('option', { name: 'Alfa Indústria Fictícia' }).click()
  await expect(page.getByLabel('Selecionar a nota 50101')).toBeVisible()
  for (const number of [50101, 50102, 50103, 50104, 50105]) {
    await page.getByLabel(`Selecionar a nota ${String(number)}`).check({ force: true })
  }
  await expect(page.getByText('5 de 300 notas selecionadas')).toBeVisible()
}

async function openCelularLote(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Separar tudo deste grupo' }).first().click()
  await expect(page.locator('[data-batch-outcome]')).toBeVisible()
}

type ContrastSample = Readonly<{ name: string; ratio: number }>

const CONTRAST_TARGETS: readonly Readonly<{ name: string; selector: string }>[] = [
  { name: 'ajuda do campo', selector: 'main [class*="_hint_"]' },
  { name: 'rótulo do campo', selector: 'main label' },
  { name: 'célula da tabela', selector: 'tbody td' },
  { name: 'indicador de ordenação', selector: '[class*="_sortIndicator_"]' },
  { name: 'selo aberta', selector: '[class*="_badgeOn_"]' },
  { name: 'selo vencida', selector: '[class*="_badgeAlert_"]' },
  { name: 'selo já em viagem', selector: '[class*="_badgeOff_"]' },
  { name: 'contador', selector: '[class*="_counter_"]' },
  { name: 'aviso de recusa de campo', selector: '[data-refusal-summary]' },
  { name: 'aviso de recusa de nota', selector: '[data-refusal-documents] li' },
  { name: 'erro do campo', selector: 'p[role="alert"]' },
  { name: 'valor da barra de progresso', selector: '[class*="_value_"]' },
  { name: 'contagem do grupo (celular)', selector: '[class*="_groupCounts_"]' },
  { name: 'destinatário (celular)', selector: '[class*="_recipient_"]' },
  { name: 'dados do cabeçalho (celular)', selector: '[class*="_facts_"] li' },
  { name: 'botão do passo (celular)', selector: '[class*="_stepButton_"]' },
  { name: 'nota separada (celular)', selector: '[class*="_stepDone_"]' },
  { name: 'aviso de sem conexão (celular)', selector: '[class*="_offline_"]' },
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

type Screen = Readonly<{ name: string; open: (page: Page) => Promise<void> }>

const SCREENS: readonly Screen[] = [
  {
    name: 'recebimento-lista',
    open: async (page) => {
      await openScreen(page, '/recebimento')
      await expect(page.getByText('Beta Comércio Fictício').first()).toBeVisible()
      await expect(page.getByText('Vencida')).toBeVisible()
    },
  },
  {
    name: 'recebimento-registrar-chegada',
    open: async (page) => {
      await openScreen(page, '/recebimento/nova')
      await chooseContractorAndMarkDocuments(page)
    },
  },
  {
    name: 'recebimento-registrar-recusa',
    open: async (page) => {
      await openScreen(page, '/recebimento/nova')
      await chooseContractorAndMarkDocuments(page)
      await page.getByRole('button', { name: 'Registrar chegada' }).click()
      await expect(page.locator('[data-refusal-documents] button')).toHaveCount(3)
    },
  },
  {
    name: 'recebimento-detalhe',
    open: async (page) => {
      await openScreen(page, `/recebimento/${ARRIVAL_ID}/detalhe`)
      await expect(page.getByText('FR.S.CAR · Piracicaba').first()).toBeVisible()
      await page.getByLabel('Selecionar a nota 40121').check({ force: true })
      await page.getByLabel('Selecionar a nota 40126').check({ force: true })
    },
  },
  {
    name: 'recebimento-celular-separacao',
    open: async (page) => {
      await openScreen(page, `/recebimento/${ARRIVAL_ID}`)
      await expect(page.getByRole('button', { name: 'Separar tudo deste grupo' })).toBeVisible()
    },
  },
  {
    name: 'recebimento-celular-lote',
    open: async (page) => {
      await openScreen(page, `/recebimento/${ARRIVAL_ID}`)
      await openCelularLote(page)
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
        const state = newState()
        if (screen.name === 'recebimento-celular-lote') state.refusedAtReceive = documentIdOf(40121)
        await mockApi(page, state)

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

test('revisão de design — os elementos novos contra a aba Contratantes (1280, escuro)', async ({
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
  const neighbor = {
    badge: await readMetrics(page.locator('[class*="_badge_"]')),
    button: await readMetrics(page.getByRole('button', { name: /^Abrir a ficha/u })),
    cell: await readMetrics(page.locator('tbody td')),
    header: await readMetrics(page.locator('thead th')),
    searchInput: await readMetrics(page.getByLabel('Buscar')),
  }

  await navigate(page, '/recebimento')
  await expect(page.getByRole('region', { name: 'Lista de chegadas' })).toBeVisible()
  const lista = {
    badge: await readMetrics(page.locator('[class*="_badge_"]')),
    botaoAbrir: await readMetrics(page.getByRole('button', { name: /^Abrir a chegada/u })),
    botaoRegistrar: await readMetrics(page.getByRole('button', { name: 'Registrar chegada' })),
    celula: await readMetrics(page.locator('tbody td')),
    cabecalho: await readMetrics(page.locator('thead th')),
  }

  await navigate(page, '/recebimento/nova')
  await expect(
    page.getByLabel('Buscar nota').or(page.getByLabel('Hora da chegada')).first(),
  ).toBeVisible()
  const registro = {
    campoHora: await readMetrics(page.getByLabel('Hora da chegada')),
    campoReferencia: await readMetrics(page.getByLabel('Referência (opcional)')),
  }

  const result = { lista, neighbor, registro }
  if (REVIEW_OUTPUT !== undefined) {
    mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
    writeFileSync(REVIEW_OUTPUT, JSON.stringify(result, null, 2))
  }
  expect(Object.keys(result.lista).length).toBeGreaterThan(0)
})

test('revisão de design — alvo de toque de TODOS os botões do celular (375)', async ({ page }) => {
  await page.setViewportSize({ height: VIEWPORT_HEIGHT, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  const state = newState()
  state.refusedAtReceive = documentIdOf(40121)
  await mockApi(page, state)
  await openScreen(page, `/recebimento/${ARRIVAL_ID}`)
  await expect(page.getByRole('button', { name: 'Separar tudo deste grupo' })).toBeVisible()
  // Abre o segundo grupo e provoca o lote com recusa: mede também os botões que só nascem depois.
  await page
    .getByRole('button', { name: /Mostrar ou esconder o grupo FR.S.CAR · Limeira/u })
    .click()
  await openCelularLote(page)

  const targets = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main button, main input, main a')]
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
  if (REVIEW_OUTPUT !== undefined) {
    mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
    writeFileSync(`${REVIEW_OUTPUT}.touch-targets.json`, JSON.stringify(targets, null, 2))
  }
  expect(targets.length).toBeGreaterThan(10)
  const tooSmall = targets.filter(
    (target) => target.height < MINIMUM_TOUCH_TARGET || target.width < MINIMUM_TOUCH_TARGET,
  )
  expect(tooSmall).toEqual([])
})
