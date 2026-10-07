/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T2.2/T2.4 (`web.md` §15): o selo do prazo de entrega na nota da viagem e o filtro "vencidas / vencem
 * hoje" — as notas nos cinco estados e uma sem selo, o detalhe da nota e o filtro aberto —, em 375, 768 e
 * 1280 px, nos dois temas. Fora do smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-236-prazo-prints.smoke.spec.ts`
 * e grava os PNGs em `specs/236-.../prints`. Dado sintético, API inteira dublada: nada aqui lê um banco.
 *
 * A revisão de design é por estilo calculado: o selo contra o vizinho `separationStatusBadge`, o contraste de
 * cada estado nos dois temas, o alvo de toque a 375 px, o foco visível e a geometria real (nada cortado, nada de
 * rolagem horizontal).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  measureContrast,
  MINIMUM_CONTRAST,
  navigate,
  readMetrics,
  readOverflow,
} from './spec-237-prints-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/236-o-contratante-tem-prazo-de-entrega/prints',
)
const REVIEW_OUTPUT = process.env.SPEC_236_REVIEW_OUTPUT
const WIDTHS = [375, 768, 1280] as const
const THEMES = ['dark', 'light'] as const
/** Alta o bastante para a página inteira caber: rolar fecharia o painel flutuante, e o recorte parte do filtro. */
const FILTER_PAGE_HEIGHT = 3400
const FILTER_CLIP_HEIGHT_BY_WIDTH = { 1280: 760, 375: 1100, 768: 900 } as const
const PERMISSIONS = ['trip.read', 'trip.manage', 'fleet.read'] as const
const BADGE = '[data-part="delivery-deadline"]'
const NOTE_ROW = 'li[id^="trip-timeline-document-"]'
const TOUCH_TARGET_PIXELS = 43.5

type Theme = (typeof THEMES)[number]

const STATE_NOTES = [
  { label: 'Vencida há 1 dia útil', number: '000201', state: 'overdue' },
  { label: 'Vence hoje', number: '000202', state: 'due_today' },
  { label: 'Vence em 2 dias úteis', number: '000203', state: 'on_time' },
  { label: 'Entregue no prazo', number: '000204', state: 'delivered_on_time' },
  { label: 'Entregue com 2 dias úteis de atraso', number: '000205', state: 'delivered_late' },
  { label: 'Vencida', number: '000206', state: 'overdue' },
] as const

function printPath(name: string, width: number, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${String(width)}-${theme}.png`)
}

function writeReview(suffix: string, value: unknown): void {
  if (REVIEW_OUTPUT === undefined) return
  mkdirSync(dirname(REVIEW_OUTPUT), { recursive: true })
  writeFileSync(`${REVIEW_OUTPUT}.${suffix}.json`, JSON.stringify(value, null, 2))
}

type OpenInput = Readonly<{ height?: number; page: Page; theme: Theme; width: number }>

async function openTrip(input: OpenInput): Promise<Locator> {
  const { page, theme, width } = input
  await page.setViewportSize({ height: input.height ?? 900, width })
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({ mode: 'delivery-deadline', page, permissions: [...PERMISSIONS] })
  await loginAsLocalUser(page)
  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()
  const stops = page.locator('#trip-stops-title').locator('xpath=ancestor::section[1]')
  await expect(stops.locator(NOTE_ROW)).toHaveCount(7)
  return stops
}

async function filterClip(
  filter: Locator,
  width: (typeof WIDTHS)[number],
): Promise<{ height: number; width: number; x: number; y: number }> {
  const top = Math.max(0, ((await filter.boundingBox())?.y ?? 0) - 24)
  return { height: FILTER_CLIP_HEIGHT_BY_WIDTH[width], width, x: 0, y: top }
}

function noteRow(stops: Locator, number: string): Locator {
  return stops.locator(NOTE_ROW).filter({ hasText: number })
}

async function expectNothingEscapes(section: Locator): Promise<void> {
  const escapees = await section.evaluate((element) => {
    const limit = element.getBoundingClientRect().right
    return Array.from(element.querySelectorAll('*'))
      .map((child) => ({ box: child.getBoundingClientRect(), child }))
      .filter(({ box }) => box.width > 0 && box.right > limit + 1)
      .map(
        ({ box, child }) =>
          `${child.tagName}.${child.className} escapa ${String(Math.round(box.right - limit))}px — "${(child.textContent ?? '').slice(0, 40)}"`,
      )
  })

  expect(escapees, 'elementos ultrapassando a borda do recorte').toEqual([])
}

const CONTRAST_TARGETS = [
  { name: 'selo vencida', selector: `${BADGE}[data-state="overdue"]` },
  { name: 'selo vence hoje', selector: `${BADGE}[data-state="due_today"]` },
  { name: 'selo no prazo', selector: `${BADGE}[data-state="on_time"]` },
  { name: 'selo entregue no prazo', selector: `${BADGE}[data-state="delivered_on_time"]` },
  { name: 'selo entregue com atraso', selector: `${BADGE}[data-state="delivered_late"]` },
] as const

const FILTER_CONTRAST_TARGETS = [
  { name: 'contador do filtro', selector: '[data-part="delivery-deadline-filter"] p' },
  { name: 'parada sem nota no filtro', selector: 'li[id^="trip-timeline-stop-"] p' },
] as const

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const suffix = `${String(width)} px ${theme}`

    test(`o selo nos cinco estados, e a nota sem prazo sem selo — ${suffix}`, async ({ page }) => {
      const stops = await openTrip({ page, theme, width })

      for (const note of STATE_NOTES) {
        const badge = noteRow(stops, note.number).locator(BADGE)
        await expect(badge, note.number).toHaveCount(1)
        await expect(badge.locator('[data-part="delivery-deadline-label"]')).toHaveText(note.label)
        await expect(badge).toHaveAttribute('data-state', note.state)
        await expect(badge.locator('[data-part="delivery-deadline-date"]')).toHaveText(
          ', Prazo de entrega até 15/10/2026',
        )
      }
      await expect(noteRow(stops, '000207').locator(BADGE)).toHaveCount(0)
      await expect(noteRow(stops, '000207')).toBeVisible()

      expect(await readOverflow(page)).toBeLessThanOrEqual(0)
      await expectNothingEscapes(stops)
      const contrast = await measureContrast(page, CONTRAST_TARGETS)
      writeReview(`contrast-estados-${String(width)}-${theme}`, contrast)
      for (const sample of contrast) {
        expect(sample.ratio, sample.name).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)
      }

      mkdirSync(PRINTS_DIRECTORY, { recursive: true })
      await stops.screenshot({ path: printPath('prazo-selo-estados', width, theme) })
    })

    test(`o selo no detalhe da nota aberta — ${suffix}`, async ({ page }) => {
      const stops = await openTrip({ page, theme, width })
      const toggle = noteRow(stops, '000201').getByRole('button', { name: /^000201/u })

      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const row = noteRow(stops, '000201')
      const field = row.locator('[data-part="delivery-deadline-field"]')
      await expect(field).toContainText('Prazo de entrega')
      await expect(field).toContainText('15/10/2026')
      await expect(row.locator(BADGE)).toHaveCount(1)

      expect(await readOverflow(page)).toBeLessThanOrEqual(0)
      await expectNothingEscapes(row)
      await row.evaluate((element) => element.scrollIntoView({ block: 'start' }))
      await page.mouse.move(0, 0)
      mkdirSync(PRINTS_DIRECTORY, { recursive: true })
      await row.screenshot({ path: printPath('prazo-selo-detalhe', width, theme) })
    })

    test(`o filtro aberto, com as opções marcadas e a lista filtrada — ${suffix}`, async ({
      page,
    }) => {
      const stops = await openTrip({ height: FILTER_PAGE_HEIGHT, page, theme, width })
      const filter = stops.locator('[data-part="delivery-deadline-filter"]')
      const trigger = filter.getByRole('button', { name: 'Prazo de entrega' })

      await expect(filter.getByRole('button', { name: 'Limpar filtros' })).toHaveCount(0)
      await trigger.click()
      await page.getByRole('option', { name: /^Vencidas/u }).click()
      await page.getByRole('option', { name: /^Vencem hoje/u }).click()

      await expect(stops.locator(NOTE_ROW)).toHaveCount(3)
      for (const number of ['000201', '000202', '000206']) {
        await expect(noteRow(stops, number)).toBeVisible()
      }
      await expect(stops.locator('li[id^="trip-timeline-stop-"]')).toHaveCount(3)
      await expect(filter).toContainText('3 de 7 notas')
      await expect(filter.getByRole('button', { name: 'Limpar filtros' })).toBeVisible()
      expect(new URL(page.url()).searchParams.get('deadline')).toBe('overdue,due_today')
      const contrast = await measureContrast(page, FILTER_CONTRAST_TARGETS)
      writeReview(`contrast-filtro-${String(width)}-${theme}`, contrast)
      for (const sample of contrast) {
        expect(sample.ratio, sample.name).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)
      }

      expect(await readOverflow(page)).toBeLessThanOrEqual(0)
      mkdirSync(PRINTS_DIRECTORY, { recursive: true })
      await expect(page.getByRole('listbox')).toBeVisible()
      await page.screenshot({
        clip: await filterClip(filter, width),
        path: printPath('prazo-filtro', width, theme),
      })

      await trigger.click()
      await expect(page.getByRole('listbox')).toHaveCount(0)
      await page.mouse.move(0, 0)
      await page.screenshot({
        clip: await filterClip(filter, width),
        path: printPath('prazo-filtro-lista', width, theme),
      })
    })
  }
}

test('o filtro: marcar todas só alcança as notas à mostra, e limpar devolve a lista inteira', async ({
  page,
}) => {
  const stops = await openTrip({ page, theme: 'dark', width: 1280 })
  const filter = stops.locator('[data-part="delivery-deadline-filter"]')

  await filter.getByRole('button', { name: 'Prazo de entrega' }).click()
  await page.getByRole('option', { name: /^Entregues/u }).click()
  await page.keyboard.press('Escape')
  await expect(stops.locator(NOTE_ROW)).toHaveCount(2)

  await stops.getByLabel('Selecionar todas as notas da viagem').check()
  await expect(stops.locator(`${NOTE_ROW} input[type="checkbox"]:checked`)).toHaveCount(2)

  await filter.getByRole('button', { name: 'Limpar filtros' }).click()
  await expect(stops.locator(NOTE_ROW)).toHaveCount(7)
  await expect(stops.locator(`${NOTE_ROW} input[type="checkbox"]:checked`)).toHaveCount(2)
  expect(new URL(page.url()).searchParams.has('deadline')).toBe(false)
})

test('o filtro na URL: voltar e avançar relê o filtro, e ele não muda a ordem nem as paradas', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 })
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({ mode: 'delivery-deadline', page, permissions: [...PERMISSIONS] })
  await loginAsLocalUser(page)
  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  const stops = page.locator('#trip-stops-title').locator('xpath=ancestor::section[1]')
  await expect(stops.locator(NOTE_ROW)).toHaveCount(7)
  const allNumbers = await stops
    .locator(NOTE_ROW)
    .evaluateAll((rows) => rows.map((row) => /\d{6}/u.exec(row.textContent ?? '')?.[0] ?? ''))

  /** A API dublada responde na mesma origem do preview: abrir o endereço de verdade devolveria o JSON, então a URL muda pelo caminho do app. */
  await navigate(page, `/trips/${TRIP_ID}?deadline=none`)
  await expect(stops.locator(NOTE_ROW)).toHaveCount(1)
  await expect(noteRow(stops, '000207')).toBeVisible()
  await expect(stops.locator('li[id^="trip-timeline-stop-"]')).toHaveCount(3)

  await navigate(page, `/trips/${TRIP_ID}?deadline=overdue,due_today,on_time,delivered,none`)
  await expect(stops.locator(NOTE_ROW)).toHaveCount(7)
  const numbers = await stops
    .locator(NOTE_ROW)
    .evaluateAll((rows) => rows.map((row) => /\d{6}/u.exec(row.textContent ?? '')?.[0] ?? ''))
  expect(numbers).toEqual(allNumbers)
})

test('revisão de design — o selo contra o vizinho "separationStatusBadge" (375, escuro)', async ({
  page,
}) => {
  const stops = await openTrip({ page, theme: 'dark', width: 375 })
  const row = noteRow(stops, '000201')
  const neighbor = await readMetrics(row.locator('[class*=separationStatusBadge]'))
  const badge = await readMetrics(row.locator(BADGE))
  writeReview('neighbor-badge', { badge, neighbor })

  expect(badge.height).toBe(neighbor.height)
  expect(badge.fontSize).toBe(neighbor.fontSize)
  expect(badge.fontFamily).toBe(neighbor.fontFamily)
  expect(badge.borderWidth).toBe(neighbor.borderWidth)
  expect(badge.textTransform).toBe(neighbor.textTransform)
})

test('revisão de design — alvo de toque e foco visível do filtro (375, escuro)', async ({
  page,
}) => {
  const stops = await openTrip({ page, theme: 'dark', width: 375 })
  const filter = stops.locator('[data-part="delivery-deadline-filter"]')
  const trigger = filter.getByRole('button', { name: 'Prazo de entrega' })

  await trigger.click()
  await page.getByRole('option', { name: /^Vencidas/u }).click()
  await page.keyboard.press('Escape')
  const clear = filter.getByRole('button', { name: 'Limpar filtros' })

  const heights = {
    clear: (await clear.boundingBox())?.height ?? 0,
    trigger: (await trigger.boundingBox())?.height ?? 0,
  }
  await page.keyboard.press('Tab')
  await trigger.focus()
  const focus = await trigger.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      boxShadow: style.boxShadow,
      isFocusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    }
  })
  writeReview('touch-and-focus', { focus, heights })

  expect(heights.trigger, 'o gatilho do filtro').toBeGreaterThanOrEqual(TOUCH_TARGET_PIXELS)
  expect(heights.clear, 'limpar filtros').toBeGreaterThanOrEqual(TOUCH_TARGET_PIXELS)
  expect(focus.isFocusVisible).toBe(true)
  expect(focus.outlineStyle !== 'none' || focus.boxShadow !== 'none').toBe(true)
})
