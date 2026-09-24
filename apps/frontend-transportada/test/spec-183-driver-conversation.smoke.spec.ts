/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T603: a aba Motorista do detalhe — prints da revisão de design (desktop e 390 px) e o
 * smoke do envio pelo app. Fora do smoke da CI, como os outros prints da 183.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  DOCUMENT_OCCURRENCE_ID,
  mockOccurrenceDetailPrintsApi,
  SENT_DRIVER_MESSAGES,
  STOP_OCCURRENCE_ID,
} from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/183-a-ocorrencia-tem-duas-conversas/prints',
)

async function openDetail(page: Page, occurrenceId: string): Promise<void> {
  await mockOccurrenceDetailPrintsApi({ page, permissions: ['fleet.read', 'occurrences.resolve'] })
  await loginAsLocalUser(page)
  await page.evaluate((path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `/ocorrencias/${occurrenceId}`)
}

function conversationsPanel(page: Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Conversas' }) })
}

test('print: a aba Motorista, com o lido e a resposta dele', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await openDetail(page, DOCUMENT_OCCURRENCE_ID)
  const panel = conversationsPanel(page)
  await panel.getByRole('tab', { name: 'Motorista' }).click()
  await expect(panel.getByText('Certo, estou aguardando aqui.')).toBeVisible()
  await expect(panel.getByText('Lido')).toBeVisible()
  await panel.scrollIntoViewIfNeeded()
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'conversa-motorista-desktop.png') })
})

test('print: a aba Motorista no celular', async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await openDetail(page, DOCUMENT_OCCURRENCE_ID)
  const panel = conversationsPanel(page)
  await panel.getByRole('tab', { name: 'Motorista' }).click()
  await expect(panel.getByText('Certo, estou aguardando aqui.')).toBeVisible()
  await panel.scrollIntoViewIfNeeded()
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'conversa-motorista-celular.png') })
})

test('smoke: enviar pelo app entra na conversa "na fila"; em branco diz o que falta', async ({
  page,
}) => {
  SENT_DRIVER_MESSAGES.length = 0
  await page.setViewportSize({ height: 900, width: 1440 })
  await openDetail(page, DOCUMENT_OCCURRENCE_ID)
  const panel = conversationsPanel(page)
  await panel.getByRole('tab', { name: 'Motorista' }).click()

  await panel.getByRole('button', { name: 'Enviar pelo app' }).click()
  await expect(panel.getByText('Escreva a mensagem.')).toBeVisible()
  expect(SENT_DRIVER_MESSAGES).toHaveLength(0)

  await panel
    .getByLabel('Mensagem ao motorista')
    .fill('  Pode descarregar, a contratante autorizou.  ')
  await panel.getByRole('button', { name: 'Enviar pelo app' }).click()
  await expect(panel.getByText('Pode descarregar, a contratante autorizou.')).toBeVisible()
  await expect(panel.getByLabel('Mensagem ao motorista')).toHaveValue('')
  expect(SENT_DRIVER_MESSAGES).toHaveLength(1)
  expect(SENT_DRIVER_MESSAGES[0]?.body).toEqual({
    body: 'Pode descarregar, a contratante autorizou.',
    channel: 'app',
  })
  expect(SENT_DRIVER_MESSAGES[0]?.idempotencyKey).toMatch(/^driver-message:/u)
})

test('sem motorista na viagem, a aba Motorista não aparece', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await openDetail(page, STOP_OCCURRENCE_ID)
  const panel = conversationsPanel(page)
  await expect(panel.getByRole('tab', { name: 'Contratante' })).toBeVisible()
  await expect(panel.getByRole('tab', { name: 'Motorista' })).toHaveCount(0)
})
