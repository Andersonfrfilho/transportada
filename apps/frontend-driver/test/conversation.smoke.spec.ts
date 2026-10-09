/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Smoke do chat do motorista (spec 260 T1b.5), 375x812, tema escuro. Cada afirmação de geometria lê
 * `getBoundingClientRect`: são o que protege dos defeitos vistos no navegador — composer abaixo da
 * janela e sob a barra fixa, faixa de filtros de 21 px com chips de 44 px. A API é a de
 * demonstração (`scripts/driver-preview-api.ts`), subida numa porta própria pelo próprio arquivo.
 */
import type { ChildProcess } from 'node:child_process'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  PREVIEW_DOCUMENT_ID,
  PREVIEW_OCCURRENCE_IDS,
} from '../scripts/driver-preview-conversations-seed'
import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  measure,
  postDebug,
  readDriverTexts,
  resetDemo,
  routeApiToDemo,
  startDemoApi,
} from './conversation-smoke.helper'

/** O rótulo "Protocolo" vem junto do código no mesmo elemento; o código em si segue o formato real. */
const PROTOCOL_FORMAT = /^(?:Protocolo\s*)?\d{6}-[2-9A-HJKMNP-Z]{4}$/u
const TOUCH_TARGET_MIN_PX = 44
const SCROLL_TOLERANCE_PX = 2
const ARRIVAL_TIMEOUT_MS = 20_000
const QUEUE_DRAIN_TIMEOUT_MS = 45_000
const NAV_SELECTOR = 'nav[aria-label]'

let demoProcess: ChildProcess | undefined

test.use({ colorScheme: 'dark', viewport: { height: 812, width: 375 } })

test.beforeAll(async () => {
  demoProcess = await startDemoApi()
})

test.afterAll(() => {
  demoProcess?.kill()
})

async function openConversationsTab(page: Page): Promise<void> {
  await resetDemo()
  await routeApiToDemo(page)
  await loginAsLocalUser(page)
  await page.locator(NAV_SELECTOR).getByRole('button', { name: 'Conversas' }).click()
  await expect(page.locator('.cv-p-filters')).toBeVisible()
  await expect(page.locator('.cv-p-row').first()).toBeVisible()
}

/** A lista é paginada: a busca isola a conversa antes do toque, e a URL prova que abriu a certa. */
async function openBySearch(
  page: Page,
  target: Readonly<{ subjectId: string; subjectType: string; term: string }>,
): Promise<void> {
  await page.locator('.cv-p-search__input').fill(target.term)
  await expect(page.locator('.cv-p-row')).toHaveCount(1)
  await page.locator('.cv-p-row').click()
  await expect(page).toHaveURL(
    new RegExp(`/conversas/${target.subjectType}/${target.subjectId}$`, 'u'),
  )
  await expect(page.locator('textarea.cv-p-composer__input')).toBeVisible()
}

async function openOccurrence(page: Page, occurrenceId: string, term: string): Promise<void> {
  await openBySearch(page, { subjectId: occurrenceId, subjectType: 'occurrence', term })
}

async function expectComposerAboveNav(page: Page): Promise<void> {
  const composer = await measure(page, 'textarea.cv-p-composer__input')
  const nav = await measure(page, NAV_SELECTOR)
  expect(composer.top).toBeGreaterThanOrEqual(0)
  expect(composer.bottom).toBeLessThanOrEqual(nav.top)
}

test('lista: filtros inteiros, busca visível, último item acima da barra, protocolo e selos', async ({
  page,
}) => {
  await openConversationsTab(page)

  const filters = await measure(page, '.cv-p-filters')
  expect(filters.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
  const chipCount = await page.locator('button.cv-p-chip').count()
  expect(chipCount).toBeGreaterThan(0)
  for (let index = 0; index < chipCount; index += 1) {
    const chip = await measure(page, 'button.cv-p-chip', index)
    expect(chip.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
    expect(chip.bottom).toBeLessThanOrEqual(filters.bottom)
  }
  await expect(page.locator('.cv-p-search__input')).toBeVisible()
  await expect(page.getByText('Espera sua resposta')).toBeVisible()

  const rows = page.locator('.cv-p-row')
  for (const row of await rows.all()) {
    await expect(row.locator('.cv-p-protocol')).toHaveText(PROTOCOL_FORMAT)
    expect(await row.locator('.cv-p-channel').count()).toBeGreaterThanOrEqual(1)
    expect(await row.locator('.cv-p-row__icon svg').count()).toBeGreaterThanOrEqual(1)
  }

  await rows.last().scrollIntoViewIfNeeded()
  const last = await measure(page, '.cv-p-row', (await rows.count()) - 1)
  const nav = await measure(page, NAV_SELECTOR)
  expect(last.bottom).toBeLessThanOrEqual(nav.top)
})

const BADGE_EDGE_GAP_PX = 4

test('barra inferior: o selo de não lidas fica dentro da aba, com folga da borda superior', async ({
  page,
}) => {
  await openConversationsTab(page)

  const geometry = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label]')
    const badge = nav?.querySelector('[class*="unreadBadge"]')
    const item = badge?.closest('button')
    if (!nav || !badge || !item) return undefined
    const navBox = nav.getBoundingClientRect()
    const badgeBox = badge.getBoundingClientRect()
    const itemBox = item.getBoundingClientRect()
    return {
      badgeRight: badgeBox.right,
      badgeTopGap: badgeBox.top - navBox.top,
      itemHeight: itemBox.height,
      itemLeft: itemBox.left,
      itemRight: itemBox.right,
      badgeLeft: badgeBox.left,
    }
  })
  expect(geometry).toBeDefined()
  expect(geometry?.badgeTopGap).toBeGreaterThanOrEqual(BADGE_EDGE_GAP_PX)
  expect(geometry?.badgeRight).toBeLessThanOrEqual((geometry?.itemRight ?? 0) - BADGE_EDGE_GAP_PX)
  expect(geometry?.badgeLeft).toBeGreaterThanOrEqual(geometry?.itemLeft ?? 0)
  expect(geometry?.itemHeight).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
})

test('busca: protocolo em minúsculas e sem traço isola a nota; limpar volta a lista', async ({
  page,
}) => {
  await openConversationsTab(page)
  const total = await page.locator('.cv-p-row').count()

  await page.locator('.cv-p-search__input').fill('f8g3')
  await expect(page.locator('.cv-p-row')).toHaveCount(1)
  await expect(page.locator('.cv-p-row')).toContainText('Mercearia do Centro')

  await page.locator('.cv-p-search__input').fill('')
  await expect(page.locator('.cv-p-row')).toHaveCount(total)
})

test('conversa: composer acima da barra, também após rolar a de 35 mensagens; protocolo copiável', async ({
  page,
}) => {
  await openConversationsTab(page)
  await openOccurrence(page, PREVIEW_OCCURRENCE_IDS.damage, 'Avaria')
  await expectComposerAboveNav(page)
  await expect(page.locator('.cv-p-protocol--header .cv-p-protocol__code')).toHaveText(
    PROTOCOL_FORMAT,
  )
  const copy = await measure(page, '.cv-p-protocol__copy')
  expect(copy.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
  await expect(page.getByRole('button', { name: 'Copiar protocolo' })).toBeVisible()

  await page.getByRole('button', { name: 'Voltar' }).click()
  await openOccurrence(page, PREVIEW_OCCURRENCE_IDS.history, 'Reentrega')
  await expect(page.locator('.cv-p-bubble')).toHaveCount(35)
  const scroller = page.locator('.cv-p-thread__scroll')
  await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await expectComposerAboveNav(page)
  const distance = await scroller.evaluate(
    (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
  )
  expect(Math.abs(distance)).toBeLessThanOrEqual(SCROLL_TOLERANCE_PX)
})

test('envio: o campo limpa na hora, a bolha vira "Enviada" e o servidor guarda uma só', async ({
  page,
}) => {
  const text = 'Caixas afetadas: 4, lacre 99812'
  await openConversationsTab(page)
  await openOccurrence(page, PREVIEW_OCCURRENCE_IDS.damage, 'Avaria')

  const input = page.locator('textarea.cv-p-composer__input')
  await input.fill(text)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(input).toHaveValue('')
  const bubble = page.locator('.cv-p-bubble--mine').filter({ hasText: text })
  await expect(bubble).toBeVisible()
  await expect(bubble).toContainText(/Enviada|Entregue/u)
  expect(await readDriverTexts(PREVIEW_OCCURRENCE_IDS.damage, text)).toBe(1)
})

test('chegada: a resposta do escritório aparece sem recarregar', async ({ page }) => {
  test.slow()
  const text = 'Resposta de teste do escritório'
  await openConversationsTab(page)
  await openOccurrence(page, PREVIEW_OCCURRENCE_IDS.damage, 'Avaria')
  await page.evaluate(() => Object.assign(window, { smokeSurvivesArrival: true }))

  await postDebug('office-reply', { subjectId: PREVIEW_OCCURRENCE_IDS.damage, text })
  await expect(page.locator('.cv-p-bubble').filter({ hasText: text })).toBeVisible({
    timeout: ARRIVAL_TIMEOUT_MS,
  })
  expect(await page.evaluate(() => 'smokeSurvivesArrival' in window)).toBe(true)
})

test('fila offline: "Na fila" com o servidor vazio, depois exatamente uma entrega', async ({
  page,
}) => {
  test.slow()
  const text = 'Mensagem que o servidor recusa na primeira'
  await openConversationsTab(page)
  await openOccurrence(page, PREVIEW_OCCURRENCE_IDS.damage, 'Avaria')
  await postDebug('fail-next', { count: 1, status: 503 })

  await page.locator('textarea.cv-p-composer__input').fill(text)
  await page.getByRole('button', { name: 'Enviar' }).click()
  const bubble = page.locator('.cv-p-bubble--mine').filter({ hasText: text })
  await expect(bubble).toContainText('Na fila')
  expect(await readDriverTexts(PREVIEW_OCCURRENCE_IDS.damage, text)).toBe(0)

  await expect(bubble).toContainText(/Enviada|Entregue/u, {
    timeout: QUEUE_DRAIN_TIMEOUT_MS,
  })
  expect(await readDriverTexts(PREVIEW_OCCURRENCE_IDS.damage, text)).toBe(1)
})

test('ticks: ✓✓ cinza ao ser registrada, ✓✓ azul quando o escritório lê', async ({ page }) => {
  test.slow()
  const text = 'Cheguei na doca 4'
  await openConversationsTab(page)
  await openOccurrence(page, PREVIEW_OCCURRENCE_IDS.damage, 'Avaria')

  await page.locator('textarea.cv-p-composer__input').fill(text)
  await page.getByRole('button', { name: 'Enviar' }).click()
  const bubble = page.locator('.cv-p-bubble--mine').filter({ hasText: text })
  await expect(bubble.locator('.cv-status-ticks--delivered')).toBeVisible({
    timeout: ARRIVAL_TIMEOUT_MS,
  })
  await expect(bubble.locator('.cv-status-ticks--read')).toHaveCount(0)

  await postDebug('office-read', { subjectId: PREVIEW_OCCURRENCE_IDS.damage })
  await expect(bubble.locator('.cv-status-ticks--read')).toBeVisible({
    timeout: ARRIVAL_TIMEOUT_MS,
  })
  await expect(bubble.locator('.cv-status-ticks--delivered')).toHaveCount(0)
})

test('falha: recusa do servidor mostra "reenviar" e o toque entrega uma só', async ({ page }) => {
  test.slow()
  const text = 'Mensagem que o servidor recusa de vez'
  await openConversationsTab(page)
  await openOccurrence(page, PREVIEW_OCCURRENCE_IDS.damage, 'Avaria')
  await postDebug('fail-next', { count: 1, status: 422 })

  await page.locator('textarea.cv-p-composer__input').fill(text)
  await page.getByRole('button', { name: 'Enviar' }).click()
  const bubble = page.locator('.cv-p-bubble--mine').filter({ hasText: text })
  const retry = bubble.locator('.cv-p-bubble__retry')
  await expect(retry).toBeVisible({ timeout: ARRIVAL_TIMEOUT_MS })
  await expect(retry).toContainText('reenviar')
  expect(await readDriverTexts(PREVIEW_OCCURRENCE_IDS.damage, text)).toBe(0)

  await retry.click()
  await expect(bubble.locator('.cv-status-ticks--delivered')).toBeVisible({
    timeout: QUEUE_DRAIN_TIMEOUT_MS,
  })
  expect(await readDriverTexts(PREVIEW_OCCURRENCE_IDS.damage, text)).toBe(1)
})

test('nota: a conversa abre com protocolo e selo; a viagem leva ao escritório', async ({
  page,
}) => {
  await openConversationsTab(page)
  await openBySearch(page, {
    subjectId: PREVIEW_DOCUMENT_ID,
    subjectType: 'document',
    term: 'Mercearia',
  })
  await expect(page.locator('.cv-p-protocol--header .cv-p-protocol__code')).toHaveText(
    PROTOCOL_FORMAT,
  )
  await expect(page.locator('.cv-p-channel').first()).toBeVisible()

  await page.locator(NAV_SELECTOR).getByRole('button', { name: 'Viagem' }).click()
  await page.getByRole('button', { name: 'Falar com o escritório' }).first().click()
  await expect(page).toHaveURL(/\/conversas\/(document|trip)\//u)
  await expect(page.locator('.cv-p-protocol--header .cv-p-protocol__code')).toHaveText(
    PROTOCOL_FORMAT,
  )
})
