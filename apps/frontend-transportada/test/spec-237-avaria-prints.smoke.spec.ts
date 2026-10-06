/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (`web.md` §15): os prints da revisão de design da avaria na entrada e do "devolver ao
 * contratante" — o formulário no celular, a nota com avaria aberta, o painel de devolver, a nota "a devolver"
 * e a devolvida, o detalhe do escritório e a janela vencida —, em 375, 768 e 1280 px, nos dois temas. Fora do
 * smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-237-avaria-prints.smoke.spec.ts` e grava os PNGs em
 * `specs/237-.../prints`. Dado sintético, API inteira dublada: nada aqui lê um banco.
 *
 * A revisão de design é por estilo calculado: os botões novos contra o vizinho "Marcar como recebida", os
 * campos do formulário entre si, o contraste nos dois temas, o alvo de toque a 375 px e a geometria real (nada
 * cortado, nada de rolagem horizontal).
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { expectNoClipping } from './cargo-clipping-smoke.helper'
import {
  buildOccurrence,
  buildOccurrencesView,
  buildProduct,
  buildReturn,
  RECEIVING_TYPES,
  windowClosedDueAt,
  windowOpenDueAt,
} from './fixtures/cargoOccurrence.fixture'
import {
  ARRIVAL_ID,
  buildDetail,
  buildDocument,
  documentIdOf,
} from './fixtures/cargoReceiving.fixture'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/237-a-carga-chega-e-se-separa-antes-da-viagem/prints',
)
const REVIEW_OUTPUT = process.env.SPEC_237_REVIEW_OUTPUT
const PRINT_ONLY = process.env.SPEC_237_PRINT_ONLY
const WIDTHS = [375, 768, 1280] as const
const THEMES = ['dark', 'light'] as const
const MINIMUM_CONTRAST = 4.5
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}
const PHOTO_PATH = '/__avaria-photo.png'

const RECIPIENTS = [
  'Mercado São Jorge Fictício',
  'Padaria Boa Massa Fictícia',
  'Farmácia Central Fictícia',
  'Armazém Três Irmãos Fictício',
  'Casa de Carnes Planalto Fictícia',
] as const

const DOCUMENTS = [
  buildDocument({
    number: '40121',
    receivedAt: '2026-10-03T13:00:00.000Z',
    separationState: 'received',
    recipientName: RECIPIENTS[0],
  }),
  buildDocument({
    number: '40122',
    receivedAt: '2026-10-03T13:00:00.000Z',
    separationState: 'received',
    recipientName: RECIPIENTS[1],
  }),
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
    receivedAt: '2026-10-03T13:00:00.000Z',
    recipientName: RECIPIENTS[4],
    separationState: 'received',
  }),
]

const PRODUCTS = [
  buildProduct({
    code: 'BIS-200',
    commercialUnit: 'CX',
    description: 'Biscoito de leite 200 g',
    ordinal: 1,
  }),
  buildProduct({
    code: 'FAR-5KG',
    commercialUnit: 'KG',
    description: 'Farinha de trigo tipo 1',
    ordinal: 2,
  }),
  buildProduct({
    code: 'SAB-90',
    commercialUnit: '',
    description: 'Sabonete em barra 90 g',
    ordinal: 3,
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
const OCCURRENCE_A = buildOccurrence({
  attachments: [photoAttachment],
  case: { id: 'case-a', status: 'awaiting_contractor' },
  id: 'occ-a',
  items: [
    { code: 'BIS-200', description: 'Biscoito de leite 200 g', quantity: '2.000', unit: 'CX' },
    { code: 'SAB-90', description: 'Sabonete em barra 90 g', quantity: null, unit: null },
  ],
  nfeDocumentId: documentIdOf(40121),
  note: 'Duas caixas amassadas no palete',
})
const OCCURRENCE_B = buildOccurrence({
  attachments: [photoAttachment],
  case: { id: 'case-b', status: 'decided' },
  id: 'occ-b',
  items: [
    { code: 'FAR-5KG', description: 'Farinha de trigo tipo 1', quantity: '3.000', unit: 'KG' },
  ],
  nfeDocumentId: documentIdOf(40124),
  occurrenceTypeId: RECEIVING_TYPES[1]?.id ?? '',
  typeName: 'Item faltante na chegada',
})
const OCCURRENCE_C = buildOccurrence({
  case: { id: 'case-c', status: 'recorded' },
  id: 'occ-c',
  nfeDocumentId: documentIdOf(40122),
  note: 'Embalagem rasgada',
})

type Scenario = Readonly<{
  dueAt: string
  occurrences: readonly ReturnType<typeof buildOccurrence>[]
  returns: readonly ReturnType<typeof buildReturn>[]
}>

const SCENARIOS = {
  closedWindow: { dueAt: windowClosedDueAt(), occurrences: [OCCURRENCE_A], returns: [] },
  empty: { dueAt: windowOpenDueAt(), occurrences: [], returns: [] },
  mixed: {
    dueAt: windowOpenDueAt(),
    occurrences: [OCCURRENCE_A, OCCURRENCE_C, OCCURRENCE_B],
    returns: [
      buildReturn(documentIdOf(40122), 'marked', 'occ-c'),
      buildReturn(documentIdOf(40124), 'returned', 'occ-b'),
    ],
  },
  open: { dueAt: windowOpenDueAt(), occurrences: [OCCURRENCE_A], returns: [] },
} satisfies Record<string, Scenario>

/** Um PNG sintético (caixa de papelão amassada, desenhada em código) — nada de foto real. */
function buildSyntheticPhoto(): Buffer {
  const width = 640
  const height = 480
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1)
    raw[rowStart] = 0
    for (let x = 0; x < width; x += 1) {
      const inBox = x > 120 && x < 520 && y > 100 && y < 400
      const crease = inBox && Math.abs(x - 320 - (y - 250) * 0.35) < 6
      const offset = rowStart + 1 + x * 3
      const color = crease ? [120, 78, 40] : inBox ? [188, 140, 84] : [226, 226, 222]
      raw[offset] = color[0] ?? 0
      raw[offset + 1] = color[1] ?? 0
      raw[offset + 2] = color[2] ?? 0
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (data: Buffer): number => {
    let c = 0xffffffff
    for (const byte of data) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc(body))
    return Buffer.concat([length, body, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const PHOTO = buildSyntheticPhoto()

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
  const detail = buildDetail({ documents: DOCUMENTS, separationDueAt: scenario.dueAt })
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
    fulfillJson(route, { data: RECEIVING_TYPES }),
  )
  await page.route(/\/documents\/[0-9a-f-]{36}\/products$/, (route) =>
    fulfillJson(route, { data: PRODUCTS }),
  )
  await page.route(`**${PHOTO_PATH}`, (route) =>
    route.fulfill({ body: PHOTO, contentType: 'image/png', headers: CORS_HEADERS }),
  )
}

async function navigate(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
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
  await expect(page.locator('[data-note-actions]').first()).toBeVisible()
}

async function fillForm(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('[data-product-code]').first()).toBeVisible()
  await dialog.getByLabel('Tipo da ocorrência').click()
  await page.getByRole('option', { name: 'Item avariado na chegada' }).click()
  await dialog.getByLabel('Item BIS-200 — Biscoito de leite 200 g').check({ force: true })
  await dialog.getByLabel('Quantidade de BIS-200').fill('2')
  await dialog.getByLabel('Item SAB-90 — Sabonete em barra 90 g').check({ force: true })
  await dialog.locator('textarea').fill('Duas caixas amassadas no palete')
  await dialog
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ buffer: PHOTO, mimeType: 'image/png', name: 'avaria.png' })
  await expect(dialog.locator('img')).toBeVisible()
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
    clipTarget: 'dialog',
    height: 1500,
    name: 'avaria-formulario',
    open: async (page) => {
      await openSeparation(page)
      await page.getByLabel('Registrar avaria — NF 40122').click()
      await fillForm(page)
    },
    scenario: 'empty',
  },
  {
    clipTarget: 'main',
    height: 1100,
    name: 'avaria-nota-com-avaria',
    open: openSeparation,
    scenario: 'open',
  },
  {
    clipTarget: 'main',
    height: 1100,
    name: 'avaria-devolver',
    open: async (page) => {
      await openSeparation(page)
      await page.getByLabel('Devolver ao contratante — NF 40121').click()
      await expect(page.getByLabel('Avaria de origem')).toBeVisible()
    },
    scenario: 'open',
  },
  {
    clipTarget: 'main',
    height: 1100,
    name: 'avaria-a-devolver',
    open: openSeparation,
    scenario: 'mixed',
  },
  {
    clipTarget: 'main',
    height: 1400,
    name: 'avaria-detalhe-escritorio',
    open: openOffice,
    scenario: 'mixed',
  },
  {
    clipTarget: 'main',
    height: 1100,
    name: 'avaria-janela-vencida',
    open: openSeparation,
    scenario: 'closedWindow',
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

async function readOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

/** O diálogo é portal fora de `main`: ninguém dentro dele passa da borda direita dele, e ele não rola de lado. */
async function readDialogClipping(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog === null) return ['sem diálogo']
    const limit = dialog.getBoundingClientRect().right
    const problems: string[] = []
    for (const element of dialog.querySelectorAll('*')) {
      const box = element.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) continue
      if (box.right > limit + 1)
        problems.push(
          `<${element.tagName.toLowerCase()}> termina em ${Math.round(box.right)} (limite ${Math.round(limit)})`,
        )
    }
    if (dialog.scrollWidth > dialog.clientWidth) problems.push('o diálogo rola de lado')
    return problems
  })
}

/** Coluna que invade a vizinha (`table-layout: fixed` com larguras que somam mais que a tabela): células que se sobrepõem. */
async function readCellOverlaps(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const problems: string[] = []
    for (const row of document.querySelectorAll('main table tr')) {
      const cells = [...row.children].filter((cell) => cell.getBoundingClientRect().width > 0)
      const isStacked = getComputedStyle(row).display === 'grid'
      if (isStacked) continue
      cells.forEach((cell, index) => {
        const next = cells[index + 1]
        if (next === undefined) return
        if (cell.getBoundingClientRect().right > next.getBoundingClientRect().left + 1) {
          problems.push(
            `"${(cell.textContent ?? '').trim().slice(0, 20)}" invade "${(next.textContent ?? '').trim().slice(0, 20)}"`,
          )
        }
      })
    }
    return problems
  })
}

type Sample = Readonly<{ name: string; ratio: number }>

const CONTRAST_TARGETS: readonly Readonly<{ name: string; selector: string }>[] = [
  { name: 'selo "Avaria aberta"', selector: '[data-note-badge="occurrenceOpen"]' },
  { name: 'selo "A devolver"', selector: '[data-note-badge="toReturn"]' },
  { name: 'selo "Devolvida"', selector: '[data-note-badge="returned"]' },
  { name: 'aviso da nota', selector: '[data-note-actions] p' },
  { name: 'aviso da janela vencida', selector: '[data-window-closed]' },
  { name: 'botão "Avaria"', selector: '[aria-label^="Registrar avaria"]' },
  { name: 'botão "Devolver ao contratante"', selector: '[aria-label^="Devolver ao contratante"]' },
  { name: 'motivo do fechamento', selector: '[data-close-blockers]' },
  { name: 'situação da tratativa', selector: '[data-occurrence-id] span' },
  { name: 'rótulo do campo', selector: '[role="dialog"] [data-field] > span' },
  { name: 'erro do campo', selector: '[role="dialog"] [role="alert"]' },
]

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
      const elements = [...document.querySelectorAll(target.selector)]
      return elements.slice(0, 3).map((element, index) => {
        const background = effectiveBackground(element)
        const text = over(parse(getComputedStyle(element).color), background)
        const [lighter, darker] = [luminance(text), luminance(background)].sort(
          (a, b) => b - a,
        ) as [number, number]
        return {
          name: `${target.name} #${String(index + 1)}`,
          ratio: Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100,
        }
      })
    })
  }, CONTRAST_TARGETS)
}

async function readMetrics(locator: Locator): Promise<Record<string, string>> {
  return locator.first().evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      borderWidth: style.borderTopWidth,
      fontFamily: style.fontFamily.split(',')[0] ?? '',
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      height: `${Math.round(element.getBoundingClientRect().height)}px`,
      textTransform: style.textTransform,
    }
  })
}

const TOUCH_SELECTORS = [
  '[data-note-actions] button',
  '[role="dialog"] button',
  '[role="dialog"] label:has(input[type="checkbox"])',
]

async function readTouchTargets(page: Page): Promise<readonly string[]> {
  return page.evaluate((selectors) => {
    const problems: string[] = []
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const box = element.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        if (box.height < 43.5) {
          problems.push(
            `${selector} "${(element.textContent ?? '').trim().slice(0, 30)}" mede ${String(Math.round(box.height * 10) / 10)}px`,
          )
        }
      }
    }
    return problems
  }, TOUCH_SELECTORS)
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

        const contrast = await measureContrast(page)
        writeReview(`contrast-${screen.name}-${String(width)}-${theme}`, contrast)
        for (const sample of contrast)
          expect(sample.ratio, sample.name).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)

        if (width === 375) {
          const touch = await readTouchTargets(page)
          writeReview(`touch-${screen.name}-${theme}`, touch)
          expect(touch).toEqual([])
        }
      })
    }
  }
}

test('revisão de design — os botões novos contra o vizinho "Marcar como recebida" (375, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: 1100, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, SCENARIOS.open)
  await openSeparation(page)
  const step = await readMetrics(page.locator('[aria-label^="Marcar como separada"]').first())
  const avaria = await readMetrics(page.locator('[aria-label^="Registrar avaria"]').first())
  const devolver = await readMetrics(
    page.locator('[aria-label^="Devolver ao contratante"]').first(),
  )
  const stepBadge = await readMetrics(
    page.locator('[data-document-id] .badge, [data-note-badge]').first(),
  )
  writeReview('neighbor-buttons', { avaria, devolver, step, stepBadge })
  expect(avaria.height).toBe(step.height)
  expect(devolver.height).toBe(step.height)
  expect(avaria.fontSize).toBe(step.fontSize)
  expect(avaria.fontFamily).toBe(step.fontFamily)
})

test('revisão de design — o formulário: campos com a mesma altura e o mesmo estilo (375, escuro)', async ({
  page,
}) => {
  await page.setViewportSize({ height: 1500, width: 375 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockApi(page, SCENARIOS.empty)
  await openSeparation(page)
  await page.getByLabel('Registrar avaria — NF 40122').click()
  await fillForm(page)
  const dialog = page.getByRole('dialog')
  const select = await readMetrics(dialog.getByLabel('Tipo da ocorrência'))
  const quantity = await readMetrics(dialog.getByLabel('Quantidade de BIS-200'))
  const unit = await readMetrics(dialog.getByLabel('Unidade de BIS-200'))
  const textarea = await readMetrics(dialog.locator('textarea'))
  writeReview('neighbor-fields', { quantity, select, textarea, unit })
  expect(quantity.height).toBe(select.height)
  expect(unit.height).toBe(select.height)
  expect(quantity.fontSize).toBe(select.fontSize)
  expect(Number.parseFloat(textarea.height ?? '0')).toBeGreaterThanOrEqual(
    Number.parseFloat(select.height ?? '0'),
  )
})
