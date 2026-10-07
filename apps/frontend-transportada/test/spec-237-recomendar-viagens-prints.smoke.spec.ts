/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.3 (`web.md` §15): os prints da revisão de design de "Recomendar viagens" — as duas visões
 * (roteiros do contratante e proposta do roteirizador) com roteiros em situações variadas, logo depois do
 * envio (quase tudo "esperando o XML", o caso comum), sem nenhuma nota vinculada e com notas de fora —, em
 * 375, 768 e 1280 px, nos dois temas. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-237-recomendar-viagens-prints.smoke.spec.ts` e grava os PNGs em
 * `specs/237-.../prints`.
 *
 * Todo dado é sintético (contratante, destinatários, números inventados; só as cidades são reais) e a API
 * inteira é dublada: nada aqui lê um banco. A revisão compara os elementos novos com os vizinhos (o cartão do
 * roteiro, o botão "Propor chegada", o selo da linha) por estilo calculado, mede o contraste nos dois temas e o
 * alvo de toque de TODOS os controles da recomendação a 375 px.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  buildPreviewDetail,
  buildPreviewItem,
  linkedDocument,
  PREVIEW_ID,
} from './fixtures/cargoPreview.fixture'
import {
  buildCounts,
  buildDraftDocument,
  buildDraftRoute,
  buildTripDrafts,
  DEFAULT_TRIP_DRAFTS,
} from './fixtures/cargoPreviewTripDraft.fixture'
import { ALFA_ID, BETA_ID } from './fixtures/cargoReceiving.fixture'
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
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

type Drafts = ReturnType<typeof buildTripDrafts>

/** Os quatro roteiros do print principal: o que fecha, o que espera, o que já está em viagem e o que sobra. */
const VARIED_DRAFTS: Drafts = buildTripDrafts(
  DEFAULT_TRIP_DRAFTS.routes.filter((route) => route.routeName !== null),
)

const AWAITING_DRAFTS: Drafts = buildTripDrafts([
  buildDraftRoute('FR.FRANC', {
    cities: [
      { cityIbgeCode: null, cityName: 'FRANCA', documentCount: 0, pendingLineCount: 9 },
      { cityIbgeCode: null, cityName: 'RIFAINA', documentCount: 0, pendingLineCount: 3 },
    ],
    counts: buildCounts({ awaiting_xml: 12 }),
    loadReference: null,
    missingCount: 12,
    totals: { value: '21480.35', volumeM3: '3.1000', weightKg: '1934.500' },
  }),
  buildDraftRoute('FR.R.PRE', {
    cities: [
      { cityIbgeCode: '3538709', cityName: 'Piracicaba', documentCount: 1, pendingLineCount: 7 },
    ],
    counts: buildCounts({ awaiting_xml: 7, matched: 1 }),
    documents: [buildDraftDocument(53_020, { cityIbgeCode: '3538709', cityName: 'Piracicaba' })],
    linkedTotals: { value: '1500.0000', weightKg: '120.000' },
    missingCount: 7,
    totals: { value: '14210.80', volumeM3: '2.2000', weightKg: '1388.000' },
  }),
  buildDraftRoute('FR.S.CAR', {
    cities: [
      { cityIbgeCode: null, cityName: 'SAO CARLOS', documentCount: 0, pendingLineCount: 22 },
      { cityIbgeCode: null, cityName: 'IBATE', documentCount: 0, pendingLineCount: 10 },
    ],
    counts: buildCounts({ awaiting_xml: 32 }),
    missingCount: 32,
    totals: { value: '52310.10', volumeM3: null, weightKg: '4120.250' },
  }),
])

const EMPTY_DRAFTS: Drafts = buildTripDrafts(
  AWAITING_DRAFTS.routes.map((route) =>
    buildDraftRoute(route.routeName, {
      cities: route.cities,
      counts: buildCounts({ awaiting_xml: route.counts.awaiting_xml + route.counts.matched }),
      missingCount: route.counts.awaiting_xml + route.counts.matched,
      totals: route.totals,
    }),
  ),
)

const OUTSIDE_DRAFTS: Drafts = buildTripDrafts([
  buildDraftRoute('FR.R.PRE', {
    cities: [
      { cityIbgeCode: '3538709', cityName: 'Piracicaba', documentCount: 2, pendingLineCount: 1 },
    ],
    counts: buildCounts({ ambiguous: 1, matched: 2 }),
    documents: [
      buildDraftDocument(53_020, { cityIbgeCode: '3538709', cityName: 'Piracicaba' }),
      buildDraftDocument(53_021, {
        cityIbgeCode: '3538709',
        cityName: 'Piracicaba',
        isInLiveTrip: true,
        isRoutable: false,
      }),
    ],
    linkedTotals: { value: '3000.0000', weightKg: '240.000' },
    totals: { value: '4900.00', volumeM3: '0.7800', weightKg: '361.000' },
  }),
  buildDraftRoute('FR.S.CAR', {
    cities: [
      { cityIbgeCode: '3548906', cityName: 'São Carlos', documentCount: 3, pendingLineCount: 1 },
    ],
    counts: buildCounts({ matched: 3, suggested: 1 }),
    documents: [
      buildDraftDocument(53_001, { isInLiveTrip: true, isRoutable: false }),
      buildDraftDocument(53_002, { isInLiveTrip: true, isRoutable: false }),
      buildDraftDocument(53_003, { isInLiveTrip: true, isRoutable: false }),
    ],
    linkedTotals: { value: '4500.0000', weightKg: '360.000' },
    totals: { value: '5400.00', volumeM3: null, weightKg: '431.000' },
  }),
  buildDraftRoute(null, { counts: buildCounts({ invalid: 2 }) }),
])

const DETAIL_ITEMS = [
  buildPreviewItem(1, {
    document: linkedDocument(53_001, '1500.00'),
    matchGroupKey: 'g1',
    matchState: 'matched',
    matchedAt: '2026-10-03T22:31:00.000Z',
    matchedBy: 'system',
  }),
  ...[2, 3, 4].map((number) => buildPreviewItem(number)),
]

type ApiState = { drafts: Drafts }

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

async function mockApi(page: Page, state: ApiState): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'trip.manage', 'invoices.read', 'settings.manage'],
  })
  await page.route(/\/contractors(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      data: [
        { displayName: 'Alfa Indústria Fictícia', id: ALFA_ID, taxId: '11222333000181' },
        { displayName: 'Beta Comércio Fictício', id: BETA_ID, taxId: '22333444000162' },
      ].map((contractor) => ({
        ...contractor,
        closingPeriod: 'monthly',
        notes: '',
        reportEmail: '',
        status: 'active',
      })),
      page: { nextCursor: null },
    }),
  )
  await page.route(/\/cargo-previews\/[0-9a-f-]{36}\/trip-drafts$/, (route) =>
    fulfillJson(route, { data: state.drafts }),
  )
  await page.route(/\/cargo-previews\/[0-9a-f-]{36}(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: buildPreviewDetail({ items: DETAIL_ITEMS, rowCount: 107 }) }),
  )
}

async function navigate(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function openRecommendation(page: Page): Promise<void> {
  await loginAsLocalUser(page)
  await navigate(page, `/recebimento/previas/${PREVIEW_ID}`)
  await expect(page.locator('main h1')).toBeVisible()
  await page.getByRole('button', { name: 'Recomendar viagens' }).click()
  await expect(page.locator('[data-trip-draft-route]').first()).toBeVisible()
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
  await page.locator('[data-trip-drafts]').screenshot({ path: printPath(name, width, theme) })
}

type ContrastSample = Readonly<{ name: string; ratio: number }>

const CONTRAST_TARGETS: readonly Readonly<{ name: string; selector: string }>[] = [
  { name: 'subtítulo da recomendação', selector: '[data-trip-drafts] header p' },
  { name: 'dica das colunas', selector: '[data-trip-drafts] [class*="_notice_"]' },
  { name: 'dados do roteiro', selector: '[data-trip-draft-route] [class*="_facts_"]' },
  { name: 'rótulo dos totais', selector: '[data-trip-draft-route] dt' },
  { name: 'valor dos totais', selector: '[data-trip-draft-route] dd' },
  { name: 'cidade', selector: '[data-trip-draft-route] [class*="_city_"]' },
  { name: 'contagem da cidade', selector: '[data-trip-draft-route] [class*="_cityCount_"]' },
  { name: '"faltam N notas"', selector: '[data-trip-draft-missing]' },
  { name: 'motivo da ação desligada', selector: '[data-trip-draft-reason]' },
  { name: 'contagem por situação', selector: '[data-trip-draft-route] [class*="_stateItem_"]' },
  { name: 'selo neutro', selector: '[data-trip-draft-route] [data-tone="neutral"]' },
  { name: 'selo vinculada', selector: '[data-trip-draft-route] [data-tone="ready"]' },
  { name: 'selo sugerida/ambígua', selector: '[data-trip-draft-route] [data-tone="warn"]' },
  { name: 'selo inválida', selector: '[data-trip-draft-route] [data-tone="alert"]' },
  { name: 'escopo da proposta', selector: '[data-trip-draft-scope]' },
  { name: 'aviso "de fora"', selector: '[data-trip-draft-outside] li span' },
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

type Screen = Readonly<{ drafts: Drafts; name: string }>

const SCREENS: readonly Screen[] = [
  { drafts: VARIED_DRAFTS, name: 'recomendar-viagens' },
  { drafts: AWAITING_DRAFTS, name: 'recomendar-viagens-aguardando' },
  { drafts: EMPTY_DRAFTS, name: 'recomendar-viagens-sem-notas' },
  { drafts: OUTSIDE_DRAFTS, name: 'recomendar-viagens-fora' },
]

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const screen of SCREENS) {
      test(`prints ${screen.name} — ${String(width)} px ${theme}`, async ({ page }) => {
        mkdirSync(PRINTS_DIRECTORY, { recursive: true })
        await page.setViewportSize({ height: VIEWPORT_HEIGHT, width })
        await page.emulateMedia({ colorScheme: theme })
        await mockApi(page, { drafts: screen.drafts })

        await openRecommendation(page)
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
      borderStyle: style.borderTopStyle,
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

test('revisão de design — os elementos novos contra os vizinhos do detalhe (1280, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: VIEWPORT_HEIGHT, width: 1280 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, { drafts: VARIED_DRAFTS })
  await loginAsLocalUser(page)
  await navigate(page, `/recebimento/previas/${PREVIEW_ID}`)
  await expect(page.locator('[data-route-section]').first()).toBeVisible()

  const vizinhos = {
    botaoPropor: await readMetrics(page.getByRole('button', { name: 'Propor chegada' })),
    painelProposta: await readMetrics(page.locator('[data-route-section]')),
    selo: await readMetrics(page.locator('[data-route-section] [data-state-badge]')),
  }
  await page.getByRole('button', { name: 'Recomendar viagens' }).click()
  await expect(page.locator('[data-trip-draft-route]').first()).toBeVisible()
  const novos = {
    botaoCriar: await readMetrics(
      page.getByRole('button', { name: 'Montar viagem com estas notas' }),
    ),
    botaoEscolher: await readMetrics(
      page.getByRole('button', { name: 'Usar só este roteiro na proposta' }),
    ),
    botaoGerar: await readMetrics(page.getByRole('button', { name: 'Gerar proposta' })),
    botaoFechar: await readMetrics(page.getByRole('button', { name: 'Fechar a recomendação' })),
    cartao: await readMetrics(page.locator('[data-trip-draft-route]')),
    faltam: await readMetrics(page.locator('[data-trip-draft-missing]')),
    secao: await readMetrics(page.locator('[data-trip-drafts]')),
    selo: await readMetrics(page.locator('[data-trip-draft-route] [data-state-badge]')),
    solver: await readMetrics(page.locator('[data-trip-draft-solver]')),
  }

  const result = { novos, vizinhos }
  if (REVIEW_OUTPUT !== undefined) {
    mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
    writeFileSync(REVIEW_OUTPUT, JSON.stringify(result, null, 2))
  }
  expect(Object.keys(result.novos).length).toBeGreaterThan(0)
})

async function collectTouchTargets(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-trip-drafts] button, [data-trip-drafts] input, [data-trip-drafts] a',
      ),
    ]
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

test('revisão de design — alvo de toque de TODOS os controles da recomendação (375)', async ({
  page,
}) => {
  await page.setViewportSize({ height: VIEWPORT_HEIGHT, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, { drafts: VARIED_DRAFTS })
  await openRecommendation(page)
  const targets = await collectTouchTargets(page)

  if (REVIEW_OUTPUT !== undefined) {
    mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
    writeFileSync(`${REVIEW_OUTPUT}.touch-targets.json`, JSON.stringify(targets, null, 2))
  }
  expect(targets.length).toBeGreaterThan(8)
  const tooSmall = targets.filter(
    (target) => target.height < MINIMUM_TOUCH_TARGET || target.width < MINIMUM_TOUCH_TARGET,
  )
  expect(tooSmall).toEqual([])
})
