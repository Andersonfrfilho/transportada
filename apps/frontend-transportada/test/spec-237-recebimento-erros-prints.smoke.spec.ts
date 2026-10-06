/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M2, `web.md` §15): os prints do erro de "aplicar rota" e de "marcar em
 * lote" no detalhe do escritório — o aviso traduzido e as notas recusadas, cada uma com atalho —, em 375 e
 * 1280 px, nos dois temas. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-237-recebimento-erros-prints.smoke.spec.ts` e grava os PNGs em
 * `specs/237-.../prints`. Dado sintético, API inteira dublada: nada aqui lê um banco.
 *
 * A revisão de design é por estilo calculado: o aviso novo contra o aviso do fechamento (mesmo bloco da
 * mesma tela), contraste nos dois temas, alvo de toque dos atalhos a 375 px e rolagem horizontal.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { ARRIVAL_ID, buildDetail, buildDocument } from './fixtures/cargoReceiving.fixture'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/237-a-carga-chega-e-se-separa-antes-da-viagem/prints',
)
const REVIEW_OUTPUT = process.env.SPEC_237_REVIEW_OUTPUT
const WIDTHS = [375, 1280] as const
const THEMES = ['dark', 'light'] as const
const VIEWPORT_HEIGHT = 900
const MINIMUM_TOUCH_TARGET = 44
const MINIMUM_CONTRAST = 4.5
const NOT_IN_ARRIVAL = 'CARGO_ARRIVAL_DOCUMENTS_NOT_IN_ARRIVAL'
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

const RECIPIENTS = [
  'Mercado São Jorge Fictício',
  'Padaria Boa Massa Fictícia',
  'Farmácia Central Fictícia',
  'Armazém Três Irmãos Fictício',
  'Casa de Carnes Planalto Fictícia',
  'Distribuidora Rio Claro Fictícia',
] as const

const DOCUMENTS = RECIPIENTS.map((name, index) =>
  buildDocument({
    cityIbgeCode: index < 3 ? '3538709' : '3526902',
    cityName: index < 3 ? 'Piracicaba' : 'Limeira',
    number: String(40121 + index),
    recipientName: name,
  }),
)

type FailureMode = 'batch' | 'route'

/** As duas notas recusadas pelo servidor, pela posição na seleção enviada (a ordem de marcação). */
const REFUSED_POSITIONS = [0, 2] as const

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

const notInArrival = {
  error: {
    code: NOT_IN_ARRIVAL,
    details: REFUSED_POSITIONS.map((position) => ({
      field: `documentIds.${String(position)}`,
      message: 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND',
    })),
    message: 'Some documents are not part of this cargo arrival',
  },
}

async function mockApi(page: Page): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'trip.manage', 'invoices.read', 'settings.manage'],
  })
  const detail = buildDetail({ documents: DOCUMENTS, reference: 'Lacre 4471' })
  await page.route(/\/cargo-arrivals\/[^/]+\/route-assignment$/, (route) =>
    fulfillJson(route, notInArrival, 422),
  )
  await page.route(/\/cargo-arrivals\/[^/]+\/documents\/batch-status$/, (route) =>
    fulfillJson(route, notInArrival, 422),
  )
  await page.route(/\/cargo-arrivals\/[^/]+\/close$/, (route) =>
    fulfillJson(route, { error: { code: 'CARGO_ARRIVAL_CLOSED', message: 'closed' } }, 409),
  )
  await page.route(/\/cargo-arrivals\/[0-9a-f-]{36}(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: detail }),
  )
  await page.route(/\/contractors(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: [], page: { nextCursor: null } }),
  )
}

async function navigate(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function openDetail(page: Page): Promise<void> {
  await loginAsLocalUser(page)
  await navigate(page, `/recebimento/${ARRIVAL_ID}/detalhe`)
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.getByText('Piracicaba').first()).toBeVisible()
}

/** Marca as notas na ordem pedida: a posição `documentIds.<n>` do servidor é a desta ordem. */
async function pickDocuments(page: Page, numbers: readonly number[]): Promise<void> {
  for (const number of numbers) {
    await page.getByLabel(`Selecionar a nota ${String(number)}`).check({ force: true })
  }
}

async function provokeFailure(page: Page, mode: FailureMode): Promise<void> {
  await pickDocuments(page, [40124, 40121, 40126])
  if (mode === 'route') {
    await page.getByLabel(/^Rota \(até 40 caracteres\)/u).fill('FR.S.NOVA')
    await page.getByRole('button', { name: 'Aplicar rota' }).click()
  } else {
    await page.getByRole('button', { name: 'Marcar como recebidas' }).click()
  }
  await expect(page.locator('[data-action-failure] [role="alert"]')).toBeVisible()
  await expect(page.locator('[data-action-failure] [data-refusal-documents] button')).toHaveCount(2)
}

function printPath(name: string, width: number, theme: string): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${String(width)}-${theme}.png`)
}

async function readOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

type Sample = Readonly<{ name: string; ratio: number }>

const CONTRAST_TARGETS: readonly Readonly<{ name: string; selector: string }>[] = [
  { name: 'aviso da ação (rota/lote)', selector: '[data-action-failure] [role="alert"]' },
  {
    name: 'rótulo "Notas recusadas"',
    selector: '[data-action-failure] [data-refusal-documents] p',
  },
  { name: 'atalho da nota', selector: '[data-action-failure] [data-refusal-documents] button' },
  { name: 'motivo da nota', selector: '[data-action-failure] [data-refusal-documents] li' },
]

/** Razão de contraste WCAG entre o texto e o fundo opaco efetivo (compõe os fundos translúcidos). */
async function measureContrast(page: Page): Promise<readonly Sample[]> {
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
      const background = effectiveBackground(element)
      const text = over(parse(getComputedStyle(element).color), background)
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

async function readMetrics(locator: Locator): Promise<Record<string, string>> {
  return locator.first().evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      color: style.color,
      fontFamily: style.fontFamily.split(',')[0] ?? '',
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      margin: `${style.marginTop} ${style.marginBottom}`,
      padding: `${style.paddingTop} ${style.paddingBottom}`,
    }
  })
}

function writeReview(suffix: string, value: unknown): void {
  if (REVIEW_OUTPUT === undefined) return
  mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
  writeFileSync(`${REVIEW_OUTPUT}.${suffix}.json`, JSON.stringify(value, null, 2))
}

const SCREENS: readonly Readonly<{ mode: FailureMode; name: string }>[] = [
  { mode: 'route', name: 'recebimento-erro-rota' },
  { mode: 'batch', name: 'recebimento-erro-lote' },
]

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const screen of SCREENS) {
      test(`prints ${screen.name} — ${String(width)} px ${theme}`, async ({ page }) => {
        mkdirSync(PRINTS_DIRECTORY, { recursive: true })
        await page.setViewportSize({ height: VIEWPORT_HEIGHT, width })
        await page.emulateMedia({ colorScheme: theme })
        await mockApi(page)
        await openDetail(page)
        await provokeFailure(page, screen.mode)

        expect(await readOverflow(page)).toBeLessThanOrEqual(0)
        await page.locator('main').screenshot({ path: printPath(screen.name, width, theme) })

        const contrast = await measureContrast(page)
        writeReview(`contrast-${screen.name}-${String(width)}-${theme}`, contrast)
        for (const sample of contrast) expect(sample.ratio).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)

        if (width === 375) {
          const buttons = page.locator('[data-action-failure] [data-refusal-documents] button')
          const heights = await buttons.evaluateAll((items) =>
            items.map((item) => Math.round(item.getBoundingClientRect().height * 10) / 10),
          )
          writeReview(`touch-${screen.name}-${theme}`, heights)
          for (const height of heights) expect(height).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET)
        }
      })
    }
  }
}

test('revisão de design — o aviso novo contra o aviso do fechamento, na mesma tela (1280, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: VIEWPORT_HEIGHT, width: 1280 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page)
  await openDetail(page)
  await page.getByRole('button', { name: 'Fechar chegada' }).click()
  await expect(page.locator('main p[role="alert"]')).toBeVisible()
  const closing = await readMetrics(page.locator('main p[role="alert"]'))

  await provokeFailure(page, 'route')
  const action = await readMetrics(page.locator('[data-action-failure] p[role="alert"]'))
  const refusal = await readMetrics(
    page.locator('[data-action-failure] [data-refusal-documents] p'),
  )

  writeReview('neighbor', { action, closing, refusal })
  expect(action).toEqual(closing)
})
