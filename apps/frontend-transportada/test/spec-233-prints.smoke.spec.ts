/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 233 (`web.md` §15): os prints intermediários do acordeão da nota — as notas fechadas com os
 * selos do cabeçalho, uma nota entregue aberta e uma não entregue aberta. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-233-prints.smoke.spec.ts` e grava os PNGs em `specs/233-.../prints/`.
 *
 * ⚠️ O print sai daqui, e não do navegador apontado para o `make dev` (ver `spec-181-prints`): o app
 * redireciona para a URL do `.env`, então preview em porta alternativa devolve a árvore de outra sessão.
 */
import { resolve } from 'node:path'

import { expect, type Locator, type Page, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(process.cwd(), '../../specs/233-a-nota-se-abre-inteira/prints')
const VIEWPORTS = [
  { height: 900, label: '1280', width: 1280 },
  { height: 844, label: '375', width: 375 },
] as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

const TRIP_PERMISSIONS = ['trip.read', 'trip.manage', 'trip.financials', 'fleet.read'] as const
const DELIVERED_WITH_OCCURRENCE = /^000124\/1/u
const DELIVERED_AWAY = /^000125\/1/u
const NOT_DELIVERED = /^000126\/1/u
const DELIVERED_WITHOUT_ITEMS = DELIVERED_AWAY
const PROOF_TOGGLE = /^Comprovante da entrega/u

function printPath(name: string, width: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `spec-233-${name}-${width}-${theme}.png`)
}

async function openTripDetail(
  input: Readonly<{ page: Page; theme: Theme; viewport: (typeof VIEWPORTS)[number] }>,
): Promise<Locator> {
  const { page, theme, viewport } = input
  await page.setViewportSize({ height: viewport.height, width: viewport.width })
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
  await mockTripWorkspaceApi({ mode: 'note-accordion', page, permissions: [...TRIP_PERMISSIONS] })
  await loginAsLocalUser(page)

  await page.getByRole('button', { name: /^Abrir a viagem/u }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()
  const stops = page.locator('#trip-stops-title').locator('xpath=ancestor::section[1]')
  await expect(stops.getByRole('button', { name: DELIVERED_WITH_OCCURRENCE })).toBeVisible()
  return stops
}

function noteRow(stops: Locator, name: RegExp): Locator {
  return stops.locator('li[id^="trip-timeline-document-"]').filter({
    has: stops.page().getByRole('button', { name }),
  })
}

async function expectNothingEscapes(section: Locator): Promise<void> {
  const escapees = await section.evaluate((element) => {
    const limit = element.getBoundingClientRect().right
    return Array.from(element.querySelectorAll('*'))
      .map((child) => ({ box: child.getBoundingClientRect(), child }))
      .filter(
        ({ box, child }) =>
          box.width > 0 && box.right > limit + 1 && child.closest('[class*=tableScroll]') === null,
      )
      .map(
        ({ box, child }) =>
          `${child.tagName}.${child.className} escapa ${Math.round(box.right - limit)}px — "${(child.textContent ?? '').slice(0, 40)}"`,
      )
  })

  expect(escapees, 'elementos ultrapassando a borda do recorte').toEqual([])
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { innerWidth, scrollWidth } = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(scrollWidth, 'a página não pode ser mais larga que a janela').toBeLessThanOrEqual(
    innerWidth,
  )
}

async function openNote(stops: Locator, name: RegExp): Promise<Locator> {
  const toggle = stops.page().getByRole('button', { name })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const row = noteRow(stops, name)
  /** As miniaturas resolvem antes do print: esqueleto no PNG não é revisão de design. */
  await expect(row.getByLabel('Carregando a imagem do comprovante')).toHaveCount(0)
  await row.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await stops.page().mouse.move(0, 0)
  return row
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    const suffix = `${viewport.label} ${theme}`

    test(`print das notas fechadas com os selos — ${suffix}`, async ({ page }) => {
      const stops = await openTripDetail({ page, theme, viewport })

      for (const toggle of await stops.locator('button[aria-expanded]').all()) {
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      }
      await expectNothingEscapes(stops)
      await expectNoHorizontalOverflow(page)
      await stops.screenshot({ path: printPath('notas-fechadas', viewport.label, theme) })
    })

    test(`print da nota entregue aberta — ${suffix}`, async ({ page }) => {
      const stops = await openTripDetail({ page, theme, viewport })

      const row = await openNote(stops, DELIVERED_WITH_OCCURRENCE)
      await expect(row.getByText('Caixa 3 chegou com amassado').first()).toBeVisible()
      await expect(row.getByRole('heading', { name: 'Eventos desta entrega' })).toBeVisible()
      await expect(row.getByText('Saída para esta parada')).toBeVisible()
      await expect(row.getByText('Raio tolerado da parada: 300 m')).toBeVisible()
      /** Spec 228: a foto do canhoto e o endereço corrigido entram na própria lista da nota. */
      await expect(row.getByText('Foto do canhoto', { exact: true })).toBeVisible()
      await expect(row.getByText('Endereço da parada corrigido')).toBeVisible()
      await expect(row.getByText('Corrigido pelo contratante · deslocado 45 m')).toBeVisible()
      await expectNothingEscapes(row)
      await expectNoHorizontalOverflow(page)
      await row.screenshot({ path: printPath('nota-aberta-entregue', viewport.label, theme) })
    })

    test(`print da nota entregue com o comprovante aberto — ${suffix}`, async ({ page }) => {
      const stops = await openTripDetail({ page, theme, viewport })

      const row = await openNote(stops, DELIVERED_WITH_OCCURRENCE)
      const toggle = row.getByRole('button', { name: PROOF_TOGGLE })
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(row.getByLabel('Carregando a imagem do comprovante')).toHaveCount(0)
      await expectNothingEscapes(row)
      await expectNoHorizontalOverflow(page)
      await row.screenshot({
        path: printPath('nota-aberta-comprovante-aberto', viewport.label, theme),
      })
    })

    test(`print da nota pendente aberta — ${suffix}`, async ({ page }) => {
      const stops = await openTripDetail({ page, theme, viewport })

      const row = await openNote(stops, NOT_DELIVERED)
      await expect(row.getByText('Portaria fechada').first()).toBeVisible()
      await expectNothingEscapes(row)
      await expectNoHorizontalOverflow(page)
      await row.screenshot({ path: printPath('nota-aberta-pendente', viewport.label, theme) })
    })
  }
}

test('abrir uma nota fecha a anterior — só uma fica aberta', async ({ page }) => {
  const stops = await openTripDetail({ page, theme: 'dark', viewport: VIEWPORTS[1] })
  const first = stops.getByRole('button', { name: DELIVERED_WITH_OCCURRENCE })
  const second = stops.getByRole('button', { name: DELIVERED_AWAY })

  await first.click()
  await expect(first).toHaveAttribute('aria-expanded', 'true')
  await second.click()
  await expect(second).toHaveAttribute('aria-expanded', 'true')
  await expect(first).toHaveAttribute('aria-expanded', 'false')
  await expect(stops.locator('button[aria-expanded="true"]')).toHaveCount(1)
})

/**
 * Revisão de design da 233 (T4.4): o que o usuário reprovou, medido no navegador — `getBoundingClientRect`
 * e estilo computado, nunca o texto do `.css`. Cada asserção abaixo foi provada por mutação (evidence.md).
 */
async function tokenPixels(row: Locator, token: string): Promise<number> {
  return row.evaluate((element, name) => {
    const probe = document.createElement('div')
    probe.style.cssText = `position:absolute;visibility:hidden;height:var(${name});width:0`
    element.append(probe)
    const { height } = probe.getBoundingClientRect()
    probe.remove()
    return Math.round(height * 100) / 100
  }, token)
}

async function heightsOf(locator: Locator): Promise<number[]> {
  return locator.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().height * 100) / 100),
  )
}

const CHIPS =
  '.ui-badge, [class*=separationStatusBadge], [class*=proofPendingBadge], [class*=fiscalStatusBadge], [class*=destinationOriginBadge], button[class*=occurrenceCaseBadge]'

for (const viewport of VIEWPORTS) {
  test.describe(`alturas e repetição da nota aberta — ${viewport.label}`, () => {
    test('selos, copiar e ações de texto usam as alturas do design system', async ({ page }) => {
      const stops = await openTripDetail({ page, theme: 'dark', viewport })
      const row = await openNote(stops, DELIVERED_WITH_OCCURRENCE)
      const dense = await tokenPixels(row, '--control-height-dense')
      const compact = await tokenPixels(row, '--control-height-compact')

      const chipHeights = await heightsOf(row.locator(CHIPS))
      expect(chipHeights.length, 'a nota entregue tem selos').toBeGreaterThanOrEqual(3)
      expect(new Set(chipHeights), 'todo selo tem a mesma altura').toEqual(new Set([dense]))

      const copyButtons = row.getByRole('button', { name: /^Copiar / })
      expect(await copyButtons.count()).toBeGreaterThanOrEqual(6)
      const copyBoxes = await copyButtons.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect()
          const icon = element.querySelector('svg')?.getBoundingClientRect()
          return {
            borderWidth: Number.parseFloat(getComputedStyle(element).borderTopWidth),
            height: Math.round(box.height * 100) / 100,
            iconWidth: Math.round((icon?.width ?? 0) * 100) / 100,
            width: Math.round(box.width * 100) / 100,
          }
        }),
      )
      for (const box of copyBoxes) {
        expect(box.width, 'copiar é quadrado').toBe(box.height)
        expect(box.height, 'copiar tem a medida compacta').toBe(compact)
        expect(box.borderWidth, 'copiar não tem borda').toBe(0)
        expect(box.iconWidth, 'o ícone de copiar é pequeno').toBeLessThanOrEqual(16)
      }

      const textActions = row
        .locator('a', { hasText: 'Ver cliente' })
        .or(row.getByRole('button', { name: /^Ver no mapa|produtos? na nota/u }))
      expect(await textActions.count()).toBeGreaterThanOrEqual(3)
      expect(new Set(await heightsOf(textActions)), 'ação de texto tem a altura compacta').toEqual(
        new Set([compact]),
      )
    })

    test('o comprovante nasce compacto e abre sob demanda', async ({ page }) => {
      const stops = await openTripDetail({ page, theme: 'dark', viewport })
      const row = await openNote(stops, DELIVERED_WITH_OCCURRENCE)
      const toggle = row.getByRole('button', { name: PROOF_TOGGLE })
      const card = row
        .locator('section')
        .filter({ has: page.getByRole('button', { name: PROOF_TOGGLE }) })
      const touch = await tokenPixels(row, '--touch-target')

      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(row.getByText('Distância', { exact: true })).toHaveCount(0)
      const summaryRow = toggle.locator('xpath=ancestor::div[1]')
      const closedHeight = (await summaryRow.boundingBox())?.height ?? Number.POSITIVE_INFINITY
      expect(closedHeight, 'fechado, o comprovante é uma linha-resumo').toBeLessThanOrEqual(
        touch * 2.5,
      )
      for (const size of await card
        .locator('img')
        .evaluateAll((images) =>
          images.map((image) =>
            Math.max(image.getBoundingClientRect().width, image.getBoundingClientRect().height),
          ),
        )) {
        expect(size, 'a miniatura é do tamanho do alvo de toque').toBeLessThanOrEqual(touch + 1)
      }

      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const detailsId = await toggle.getAttribute('aria-controls')
      await expect(page.locator(`[id="${detailsId}"]`)).toBeVisible()
      await expect(row.getByText('Distância', { exact: true })).toBeVisible()
      await expect(row.getByLabel('Carregando a imagem do comprovante')).toHaveCount(0)

      const maxHeight = await tokenPixels(row, '--proof-image-max-height')
      const photo = page.locator(`[id="${detailsId}"] img`).first()
      const photoBox = await photo.boundingBox()
      const cardBox = await card.boundingBox()
      expect(
        photoBox?.height ?? Number.POSITIVE_INFINITY,
        'a foto tem teto de altura',
      ).toBeLessThanOrEqual(maxHeight + 1)
      if (viewport.width >= 1280) {
        expect(
          photoBox?.width ?? Number.POSITIVE_INFINITY,
          'a foto não toma a coluna',
        ).toBeLessThan((cardBox?.width ?? 0) * 0.6)
      }

      await toggle.focus()
      await page.keyboard.press('Space')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await page.keyboard.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    })

    test('nada se repete na nota aberta', async ({ page }) => {
      const stops = await openTripDetail({ page, theme: 'dark', viewport })
      const closedRow = noteRow(stops, DELIVERED_WITH_OCCURRENCE)
      await expect(closedRow.getByText('Mercadoria: R$ 4.200,00')).toBeVisible()

      const row = await openNote(stops, DELIVERED_WITH_OCCURRENCE)
      await expect(row.getByText('Mercadoria: R$ 4.200,00')).toHaveCount(0)
      await expect(row.getByText('Recebe: Distribuidora Sul')).toHaveCount(0)
      await expect(row.getByText('R$ 4.200,00', { exact: true })).toHaveCount(1)
      await expect(row.getByText('Distribuidora Sul', { exact: true })).toHaveCount(1)
      await expect(row.getByText('10/08/2026', { exact: true })).toHaveCount(1)

      const proof = row
        .locator('section')
        .filter({ has: page.getByRole('button', { name: PROOF_TOGGLE }) })
      await expect(proof.getByText('No horário')).toHaveCount(0)
      await expect(proof.getByText('Aprovado', { exact: true })).toHaveCount(0)
      await expect(
        row.locator('[class*=stopDocumentBadgeRow]').getByText('No horário'),
      ).toHaveCount(1)

      await row.getByRole('button', { name: PROOF_TOGGLE }).click()
      const approvedBy = row.getByText(/Aprovado por Helena Prado em/u)
      await expect(approvedBy).toHaveCount(1)
      expect(await approvedBy.evaluate((element) => element.closest('.ui-badge') === null)).toBe(
        true,
      )
      await expect(proof.getByText('Captura', { exact: true })).toHaveCount(0)

      const events = row.locator('section').filter({
        has: page.getByRole('heading', { name: 'Eventos desta entrega' }),
      })
      await expect(events.getByText('Saída para esta parada')).toBeVisible()
      await expect(events.getByText(/^Parada \d/u)).toHaveCount(0)
      await expect(row.getByText('Esta nota não tem itens registrados')).toHaveCount(0)
    })

    test('só a nota sem itens diz que não tem itens', async ({ page }) => {
      const stops = await openTripDetail({ page, theme: 'dark', viewport })
      const row = await openNote(stops, DELIVERED_WITHOUT_ITEMS)

      await expect(row.getByText('Esta nota não tem itens registrados')).toHaveCount(1)
      await row.getByRole('button', { name: PROOF_TOGGLE }).click()
      await expect(row.getByText('Captura', { exact: true })).toBeVisible()
    })
  })
}
