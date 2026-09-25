/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T701 (RF12): as respostas rápidas — o cadastro em Configurações (prints desktop e 390 px)
 * e o compositor da aba Motorista inserindo a resposta no rascunho. Fora do smoke da CI, como os
 * outros prints da 183.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { COMPANY_SETTINGS_RESPONSE } from './company-settings/company-settings.fixture'
import {
  DOCUMENT_OCCURRENCE_ID,
  mockOccurrenceDetailPrintsApi,
  QUICK_REPLIES,
} from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/183-a-ocorrencia-tem-duas-conversas/prints',
)

/**
 * A tela de Configurações sobre os mocks da viagem (sessão, permissões), com o cadastro da empresa
 * do fixture dos contratos e as respostas rápidas em memória.
 */
async function openSettings(page: Page): Promise<void> {
  await mockOccurrenceDetailPrintsApi({
    page,
    permissions: ['fleet.read', 'occurrences.resolve', 'settings.manage'],
  })
  await page.route(/\/company-settings$/, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 204 })
      : route.fulfill({
          body: JSON.stringify(COMPANY_SETTINGS_RESPONSE),
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
        }),
  )
  /** Sem logo gravado e sem certificado: a aba de respostas rápidas não depende de nenhum dos dois. */
  await page.route(/\/company-settings\/logo$/, (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 404 }),
  )
  await page.route(/\/digital-certificates(\?.*)?$/, (route) =>
    route.fulfill({
      body: JSON.stringify({ data: [], page: { nextCursor: null } }),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
  await loginAsLocalUser(page)
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, '/company-settings')
  await page.getByRole('tab', { name: 'Respostas rápidas' }).click()
}

async function open(page: Page, path: string): Promise<void> {
  await mockOccurrenceDetailPrintsApi({
    page,
    permissions: ['fleet.read', 'occurrences.resolve', 'settings.manage'],
  })
  await loginAsLocalUser(page)
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

for (const [name, viewport] of [
  ['desktop', { height: 1000, width: 1440 }],
  ['celular', { height: 844, width: 390 }],
] as const) {
  test(`cadastro (${name}): adiciona no fim, desativa e reordena`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openSettings(page)
    const contractor = page.getByRole('region', { name: 'Para a contratante' })
    await expect(contractor.getByText('Podem confirmar a autorização da descarga?')).toBeVisible()

    await contractor.getByRole('button', { name: 'Adicionar' }).click()
    await expect(contractor.getByText('Escreva o texto.')).toBeVisible()
    await contractor
      .getByLabel('Nova resposta para a contratante')
      .fill('  Recebemos a nota de devolução.  ')
    await contractor.getByRole('button', { name: 'Adicionar' }).click()
    await expect(contractor.getByText('Recebemos a nota de devolução.')).toBeVisible()
    expect(QUICK_REPLIES.at(-1)).toMatchObject({
      audience: 'contractor',
      position: 2,
      text: 'Recebemos a nota de devolução.',
    })

    await contractor.getByRole('button', { name: 'Descer' }).first().click()
    await expect
      .poll(() => QUICK_REPLIES.find((reply) => reply.text.startsWith('Podem'))?.position)
      .toBe(1)

    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(viewport.width)
    await page.screenshot({
      fullPage: true,
      path: resolve(PRINTS_DIRECTORY, `respostas-rapidas-${name}.png`),
    })
  })
}

test('o compositor da aba Motorista insere a resposta no rascunho', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await open(page, `/ocorrencias/${DOCUMENT_OCCURRENCE_ID}`)
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Conversas' }) })
  await panel.getByRole('tab', { name: 'Motorista' }).click()

  await panel.getByLabel('Mensagem ao motorista').fill('Bom dia.')
  await panel.getByRole('button', { name: 'Resposta rápida' }).click()
  await page.getByRole('option', { name: 'Pode descarregar, a contratante autorizou.' }).click()

  await expect(panel.getByLabel('Mensagem ao motorista')).toHaveValue(
    'Bom dia.\nPode descarregar, a contratante autorizou.',
  )
  await panel.scrollIntoViewIfNeeded()
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'respostas-rapidas-compositor.png') })
})
