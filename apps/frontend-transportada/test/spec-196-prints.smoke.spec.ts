/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 T6.3 / T7.1 (`web.md` §15): os prints e as MEDIDAS da posição na linha do tempo da viagem.
 * Fora do smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-196-prints.smoke.spec.ts`, numa porta
 * própria (`PLAYWRIGHT_FRONTEND_PORT`), e grava os PNGs em `specs/196-.../prints/`.
 *
 * ⚠️ A API é DUBLÊ (`mockTripWorkspaceApi` + rota da linha do tempo): o login real do painel
 * redireciona para a origem fixa do `.env` (53000), que é de outra árvore. As coordenadas são
 * sintéticas. A leitura das rotas do motorista contra o banco está nas integrações da T3.5 e T4.2.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, type Locator, type Page, type Route, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

const SPEC_DIRECTORY = resolve(process.cwd(), '../../specs/196-todo-evento-carrega-onde-aconteceu')
const PRINTS_DIRECTORY = resolve(SPEC_DIRECTORY, 'prints')
mkdirSync(PRINTS_DIRECTORY, { recursive: true })
const MEASUREMENTS_PATH = process.env.SPEC_196_MEASUREMENTS_PATH

/** Sem WebGL por software o MapLibre não sobe e o print mostraria só "mapa indisponível". */
test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
})

const VIEWPORTS = [
  { height: 900, label: '1280', width: 1280 },
  { height: 844, label: '375', width: 375 },
] as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}
const DOCUMENT = { id: '00000000-0000-4000-8000-000000000701', number: '456', series: '1' }
const STOP = { id: '00000000-0000-4000-8000-000000000702', sequence: 1 }
/** Ponto de teste (praça da Sé, SP): não é posição de ninguém. */
const POINT = { latitude: -23.5505, longitude: -46.6333 }
/** Mesma origem da app: a `img-src` da CSP não aceita outro host. */
const PHOTO_URL = `http://localhost:${process.env.PLAYWRIGHT_FRONTEND_PORT ?? '53000'}/foto-de-teste.svg`
const PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#6b7280"/><text x="160" y="125" font-size="22" text-anchor="middle" fill="#fff">foto de teste</text></svg>'

function item(
  input: Readonly<{
    addressChange?: unknown
    id: string
    kind: string
    location?: unknown
    locationState?: null | string
    minute: number
    occurrence?: unknown
    returnReason?: null | string
  }>,
) {
  const hasDocument = input.kind.startsWith('document.')
  return {
    ...(input.addressChange === undefined ? {} : { addressChange: input.addressChange }),
    actorName: 'Marina Alves',
    channel: 'driver_app',
    closeReason: null,
    document: hasDocument ? DOCUMENT : null,
    fromStatus: null,
    id: input.id,
    kind: input.kind,
    location: input.location ?? null,
    locationState: input.locationState ?? null,
    occurrence: input.occurrence ?? null,
    occurredAt: new Date(Date.UTC(2026, 9, 2, 12, input.minute)).toISOString(),
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: input.returnReason ?? null,
    stop: STOP,
    toStatus: null,
  }
}

function captured(minute: number, accuracyMeters: null | number, distanceMeters: null | number) {
  return {
    location: {
      ...POINT,
      accuracyMeters,
      capturedAt: new Date(Date.UTC(2026, 9, 2, 12, minute)).toISOString(),
      distanceMeters,
    },
    locationState: 'captured',
  }
}

/** Do mais recente para o mais antigo, a ordem da API. */
const ITEMS = [
  item({
    id: 'evt-9',
    kind: 'stop.address_corrected',
    location: {
      ...POINT,
      accuracyMeters: null,
      capturedAt: new Date(Date.UTC(2026, 9, 2, 12, 59)).toISOString(),
      distanceMeters: null,
    },
    minute: 59,
    addressChange: { displacementMeters: 180, origin: 'operator' },
  }),
  item({ id: 'evt-8', kind: 'document.status_changed', minute: 50, locationState: 'captured' }),
  item({
    id: 'evt-7',
    kind: 'stop.occurrence',
    minute: 40,
    occurrence: {
      attachmentCount: 1,
      note: 'Doca fechada, aguardando liberação.',
      typeName: 'Doca fechada',
    },
    ...captured(40, 12, 35),
  }),
  item({
    id: 'evt-6',
    kind: 'document.returned',
    minute: 30,
    returnReason: 'recipient_refused',
    ...captured(30, 8, 4200),
  }),
  item({ id: 'evt-5', kind: 'document.delivered', minute: 25, ...captured(25, 5, 20) }),
  item({ id: 'evt-4', kind: 'stop.arrived', minute: 20, ...captured(20, 9, 14) }),
  item({ id: 'evt-3', kind: 'stop.departed', minute: 15, locationState: 'unavailable' }),
  item({ id: 'evt-2', kind: 'trip.status_changed', minute: 10, locationState: 'expired' }),
  item({ id: 'evt-1', kind: 'trip.dispatched', minute: 5 }),
]

async function fulfill(route: Route, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ headers: CORS_HEADERS, status: 204 })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status: 200,
  })
}

async function openTimeline(
  input: Readonly<{ page: Page; theme: Theme; viewport: (typeof VIEWPORTS)[number] }>,
): Promise<Locator> {
  const { page, theme, viewport } = input
  await page.setViewportSize({ height: viewport.height, width: viewport.width })
  await page.emulateMedia({ colorScheme: theme })
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['fleet.read', 'trip.manage', 'trip.event-location'],
  })
  await page.route(/\/trips\/[^/]+\/timeline(?:\?.*)?$/, (route) =>
    fulfill(route, { data: { items: ITEMS, nextCursor: null } }),
  )
  await page.route(/\/trip-occurrences\/[^/]+\/attachments$/, (route) =>
    fulfill(route, {
      data: [
        {
          downloadUrl: PHOTO_URL,
          expired: false,
          id: 'att-1',
          mimeType: 'image/png',
          position: 0,
          thumbnailUrl: PHOTO_URL,
        },
      ],
    }),
  )
  await page.route(PHOTO_URL, (route) =>
    route.fulfill({ body: PHOTO_SVG, contentType: 'image/svg+xml', headers: CORS_HEADERS }),
  )
  await loginAsLocalUser(page)
  await page.evaluate((tripId) => {
    window.history.pushState({}, '', `/trips/${tripId}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, TRIP_ID)
  const section = page.getByRole('region', { name: 'Linha do tempo' })
  await expect(section).toBeVisible()
  await expect(section.getByText('Viagem despachada')).toBeVisible()
  return section
}

function row(section: Locator, title: RegExp): Locator {
  return section
    .locator('li')
    .filter({ has: section.page().getByText(title) })
    .last()
}

async function measure(section: Locator) {
  return section.evaluate((root) => {
    const box = (element: Element | null) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        color: style.color,
        fontFamily: style.fontFamily.split(',')[0],
        fontSize: style.fontSize,
        gap: style.gap,
        height: Math.round(rect.height * 10) / 10,
        lineHeight: style.lineHeight,
        width: Math.round(rect.width * 10) / 10,
      }
    }
    const locationButtons = Array.from(root.querySelectorAll('button[data-tone]'))
    const firstButton = locationButtons[0] ?? null
    const authorship = root.querySelector('[class*=itemAuthorship]')
    const meta = root.querySelector('[class*=itemMeta]')
    const toggles = Array.from(root.querySelectorAll('button[aria-expanded]')).map((toggle) => ({
      ...box(toggle),
      text: (toggle.textContent ?? '').trim(),
    }))
    const afterOf = (element: Element | null) => {
      if (element === null) return null
      const style = getComputedStyle(element, '::after')
      return { height: style.height, width: style.width }
    }
    /** `color-mix()` volta em `color(srgb …)`: o canvas normaliza qualquer sintaxe para RGBA 0–255. */
    const canvasContext = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    })
    const parse = (value: string): number[] => {
      if (canvasContext === null) return [0, 0, 0, 1]
      canvasContext.clearRect(0, 0, 1, 1)
      canvasContext.fillStyle = value
      canvasContext.fillRect(0, 0, 1, 1)
      const [red = 0, green = 0, blue = 0, alpha = 255] = canvasContext.getImageData(
        0,
        0,
        1,
        1,
      ).data
      return [red, green, blue, alpha / 255]
    }
    const luminance = ([red, green, blue]: number[]) => {
      const channel = (value: number) => {
        const unit = (value ?? 0) / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(red ?? 0) + 0.7152 * channel(green ?? 0) + 0.0722 * channel(blue ?? 0)
    }
    const effectiveBackground = (element: Element | null): number[] => {
      const layers: number[][] = []
      for (let node = element; node !== null; node = node.parentElement) {
        const layer = parse(getComputedStyle(node).backgroundColor)
        if ((layer[3] ?? 1) > 0) layers.push(layer)
        if ((layer[3] ?? 1) === 1) break
      }
      return layers.reverse().reduce<number[]>(
        (below, layer) => {
          const alpha = layer[3] ?? 1
          return [0, 1, 2].map(
            (index) => (layer[index] ?? 0) * alpha + (below[index] ?? 0) * (1 - alpha),
          )
        },
        [0, 0, 0],
      )
    }
    const contrast = (element: Element | null) => {
      if (element === null) return null
      const foreground = luminance(parse(getComputedStyle(element).color))
      const background = luminance(effectiveBackground(element))
      const [light, dark] =
        foreground > background ? [foreground, background] : [background, foreground]
      return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100
    }
    const contrasts = {
      authorship: contrast(authorship),
      detailText: contrast(root.querySelector('[class*=itemDetail]:not([class*=Group])')),
      detailToggle: contrast(root.querySelector('[class*=detailMapToggle]')),
      locationNeutral: contrast(firstButton),
      locationProblem: contrast(root.querySelector('button[data-tone=problem]')),
      time: contrast(root.querySelector('time')),
      title: contrast(root.querySelector('[class*=itemTitle]')),
    }
    const limit = root.getBoundingClientRect().right
    const escapees = Array.from(root.querySelectorAll('*'))
      .filter((child) => {
        const rect = child.getBoundingClientRect()
        return rect.width > 0 && rect.right > limit + 1
      })
      .map((child) => `${child.tagName}.${String(child.className).slice(0, 40)}`)
    return {
      authorship: box(authorship),
      contrasts,
      escapees,
      locationAfter: afterOf(firstButton),
      locationButton: box(firstButton),
      locationButtons: locationButtons.map((button) => ({
        ...box(button),
        tone: button.getAttribute('data-tone'),
      })),
      meta: box(meta),
      page: {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      toggles,
    }
  })
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`spec 196 — posição na linha do tempo — ${viewport.label} ${theme}`, async ({ page }) => {
      const section = await openTimeline({ page, theme, viewport })
      const name = (state: string) =>
        resolve(PRINTS_DIRECTORY, `196-linha-do-tempo-${state}-${viewport.label}-${theme}.png`)

      await section.scrollIntoViewIfNeeded()
      const closedMeasures = await measure(section)
      await section.screenshot({ path: name('fechada') })

      const returned = row(section, /devolvida/u)
      await returned.getByRole('button', { expanded: false }).first().click()
      await returned.getByRole('button', { name: 'Ver no mapa', expanded: false }).click()
      await expect(returned.getByRole('button', { name: 'Ocultar mapa' })).toBeVisible()
      await page.waitForTimeout(2500)
      const returnedMeasures = await measure(section)
      await returned.scrollIntoViewIfNeeded()
      await returned.screenshot({ path: name('devolucao-mapa-aberto') })

      const occurrence = row(section, /Doca fechada/u)
      await occurrence.getByRole('button', { expanded: false }).first().click()
      await expect(occurrence.locator('img').first()).toBeVisible()
      await occurrence.getByRole('button', { name: 'Ver no mapa', expanded: false }).click()
      await page.waitForTimeout(2500)
      const occurrenceMeasures = await measure(section)
      await occurrence.scrollIntoViewIfNeeded()
      await occurrence.screenshot({ path: name('ocorrencia-foto-e-mapa') })

      const delivered = row(section, /entregue/u)
      await delivered.getByRole('button', { name: 'Ver no mapa', expanded: false }).click()
      await page.waitForTimeout(2500)
      await delivered.scrollIntoViewIfNeeded()
      await delivered.screenshot({ path: name('entrega-so-mapa') })

      const address = row(section, /Endereço da parada corrigido/u)
      await address.getByRole('button', { name: 'Ver no mapa', expanded: false }).click()
      await expect(address.getByText(/novo ponto do endereço/iu).first()).toBeVisible()
      await page.waitForTimeout(2500)
      await address.scrollIntoViewIfNeeded()
      await address.screenshot({ path: name('endereco-pino-proprio') })

      if (MEASUREMENTS_PATH !== undefined) {
        writeFileSync(
          `${MEASUREMENTS_PATH}.${viewport.label}.${theme}.json`,
          JSON.stringify(
            { closed: closedMeasures, occurrence: occurrenceMeasures, returned: returnedMeasures },
            null,
            2,
          ),
        )
      }
      expect(closedMeasures.escapees).toEqual([])
      expect(occurrenceMeasures.escapees).toEqual([])
    })
  }
}
