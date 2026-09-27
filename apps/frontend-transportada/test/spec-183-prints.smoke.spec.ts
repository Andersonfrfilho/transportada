/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T204: os prints da revisão de design da página nova (`web.md` §15) — a lista com a linha
 * que abre o detalhe, o detalhe de uma ocorrência de nota (nota, motorista, tratativa) e o de uma
 * ocorrência de parada sem nota e sem motorista, no desktop e no celular. Fora do smoke da CI, como
 * os prints da 159 e da 164: o `playwright.config.ts` só roda a lista explícita dele.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  DOCUMENT_OCCURRENCE_ID,
  mockOccurrenceDetailPrintsApi,
  STOP_OCCURRENCE_ID,
} from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/183-a-ocorrencia-tem-duas-conversas/prints',
)
const PHONE = { height: 844, width: 390 } as const
const DESKTOP = { height: 900, width: 1440 } as const
const PERMISSIONS = ['fleet.read', 'occurrences.resolve'] as const

async function navigateTo(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function open(page: Page, path: string): Promise<void> {
  await mockOccurrenceDetailPrintsApi({ page, permissions: PERMISSIONS })
  await loginAsLocalUser(page)
  await navigateTo(page, path)
}

test('print: a lista, com o tipo como link para o detalhe', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page, '/ocorrencias')
  await expect(page.getByRole('link', { name: 'Cobrança inesperada no local' })).toBeVisible()
  await page.screenshot({ fullPage: true, path: resolve(PRINTS_DIRECTORY, 'lista-desktop.png') })
})

test('print: a lista rolada até o valor da nota (T205)', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page, '/ocorrencias')
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader', { name: 'Valor NF-e' })).toBeAttached()
  const value = table.getByText('R$ 48.320,00')
  await value.scrollIntoViewIfNeeded()
  await expect(value).toBeInViewport()
  await page
    .locator('section', { has: page.getByRole('heading', { name: 'Ocorrências registradas' }) })
    .screenshot({ path: resolve(PRINTS_DIRECTORY, 'lista-colunas-da-nota.png') })
})

test('print: a coluna Conversa, com o estado e as mensagens do motorista (T404)', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await open(page, '/ocorrencias')
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader', { name: 'Conversa' })).toBeAttached()
  const state = table.getByText('Contratante respondeu')
  await state.scrollIntoViewIfNeeded()
  await expect(state).toBeInViewport()
  await expect(table.getByText('2 mensagens do motorista')).toBeVisible()
  await page
    .locator('section', { has: page.getByRole('heading', { name: 'Ocorrências registradas' }) })
    .screenshot({ path: resolve(PRINTS_DIRECTORY, 'lista-coluna-conversa.png') })
})

test('print: a coluna Conversa no celular (T404)', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, '/ocorrencias')
  const state = page.getByRole('table').getByText('Contratante respondeu')
  await state.scrollIntoViewIfNeeded()
  await expect(state).toBeInViewport()
  await page.screenshot({ path: resolve(PRINTS_DIRECTORY, 'lista-coluna-conversa-celular.png') })
})

test('a linha abre o detalhe sem recarregar o app', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page, '/ocorrencias')
  await page.getByRole('link', { name: 'Cobrança inesperada no local' }).click()
  await expect(page).toHaveURL(new RegExp(`/ocorrencias/${DOCUMENT_OCCURRENCE_ID}$`))
  await expect(
    page.getByRole('heading', { level: 1, name: 'Cobrança inesperada no local' }),
  ).toBeVisible()
})

test('print: detalhe de ocorrência de nota (desktop)', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page, `/ocorrencias/${DOCUMENT_OCCURRENCE_ID}`)
  await expect(page.getByRole('heading', { name: 'Contato do motorista' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
    'href',
    'https://wa.me/5511999990001',
  )
  await expect(page.getByText('R$ 48.320,00')).toBeVisible()
  await expect(page.getByText('3,5 CX')).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: resolve(PRINTS_DIRECTORY, 'detalhe-nota-desktop.png'),
  })
})

test('print: detalhe de ocorrência de nota (celular)', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, `/ocorrencias/${DOCUMENT_OCCURRENCE_ID}`)
  await expect(page.getByRole('heading', { name: 'Contato do motorista' })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({
    fullPage: true,
    path: resolve(PRINTS_DIRECTORY, 'detalhe-nota-celular.png'),
  })
})

test('print: ocorrência de parada sem nota e sem motorista', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page, `/ocorrencias/${STOP_OCCURRENCE_ID}`)
  await expect(page.getByText(/Sem nota nesta ocorrência/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Contato do motorista' })).toHaveCount(0)
  await page.screenshot({
    fullPage: true,
    path: resolve(PRINTS_DIRECTORY, 'detalhe-parada-desktop.png'),
  })
})

test('print: a linha do tempo da ocorrência, com os tempos e o filtro (T206)', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page, `/ocorrencias/${DOCUMENT_OCCURRENCE_ID}`)
  const panel = page.locator('section', {
    has: page.getByRole('heading', { name: 'Linha do tempo' }),
  })
  await expect(panel.getByText('Tratativa: Decidida')).toBeVisible()
  await expect(panel.getByText('Resposta da contratante')).toBeVisible()
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'linha-do-tempo-desktop.png') })

  await panel.getByRole('tab', { name: /Contratante/ }).click()
  await expect(panel.getByText('Registrou a ocorrência')).toHaveCount(0)
  await expect(panel.getByText('A contratante respondeu por e-mail')).toBeVisible()
})

test('print: a linha do tempo no celular', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page, `/ocorrencias/${DOCUMENT_OCCURRENCE_ID}`)
  const panel = page.locator('section', {
    has: page.getByRole('heading', { name: 'Linha do tempo' }),
  })
  await expect(panel.getByText('Tratativa: Decidida')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'linha-do-tempo-celular.png') })
})
