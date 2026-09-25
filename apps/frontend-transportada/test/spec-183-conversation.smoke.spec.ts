/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T407: o smoke do envio à contratante e os prints da revisão de design da aba Contratante
 * (`web.md` §15) — a conversa com o contato do cadastro e o remetente fora dos contatos, o diálogo
 * com a prévia, o envio que vira mensagem "na fila" e o "Adicionar aos contatos" preenchido. Fora do
 * smoke da CI, como os outros prints da 183.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  DOCUMENT_OCCURRENCE_ID,
  mockOccurrenceDetailPrintsApi,
  SENT_CONTRACTOR_MAILS,
} from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/183-a-ocorrencia-tem-duas-conversas/prints',
)
const PHONE = { height: 844, width: 390 } as const
const DESKTOP = { height: 900, width: 1440 } as const
const PERMISSIONS = ['fleet.read', 'occurrences.resolve', 'settings.manage'] as const

async function openDetail(page: Page): Promise<void> {
  await mockOccurrenceDetailPrintsApi({ page, permissions: PERMISSIONS })
  await loginAsLocalUser(page)
  await page.evaluate((path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `/ocorrencias/${DOCUMENT_OCCURRENCE_ID}`)
}

function conversationsPanel(page: Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Conversas' }) })
}

test('print: a aba Contratante, com o contato do cadastro e o de fora', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await openDetail(page)
  const panel = conversationsPanel(page)
  await expect(panel.getByText('Autorizado. Pode pagar')).toBeVisible()
  await expect(panel.getByText('Aprova cobranças')).toBeVisible()
  await expect(panel.getByText('Fora dos contatos')).toBeVisible()
  await panel.getByRole('button', { name: 'Ver o cartão de Maria Souza' }).click()
  await expect(panel.getByText('Compras@Alfa.example.test', { exact: true })).toBeVisible()
  await panel.scrollIntoViewIfNeeded()
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'conversa-contratante-desktop.png') })
})

test('smoke: o diálogo abre preenchido, mostra a prévia e o envio entra na conversa', async ({
  page,
}) => {
  SENT_CONTRACTOR_MAILS.length = 0
  await page.setViewportSize(DESKTOP)
  await openDetail(page)
  await conversationsPanel(page).getByRole('button', { name: 'Enviar por e-mail' }).click()

  const dialog = page.getByRole('dialog', { name: 'Enviar à contratante' })
  await expect(dialog.getByLabel('Assunto')).toHaveValue('Ocorrência — NF 4512/1')
  await expect(dialog.getByLabel('Mensagem')).toHaveValue(/taxa de descarga/u)
  await expect(dialog.getByRole('checkbox', { name: /Maria Souza/u })).toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: /expedicao@/u })).not.toBeChecked()

  await dialog.getByLabel('Mensagem').fill('Recebedor cobrando R$ 180,00 de descarga. Autorizam?')
  await dialog.getByRole('button', { name: 'Ver prévia' }).click()
  await expect(dialog.getByText('Transportadora Sintética')).toBeVisible()
  await dialog.screenshot({ path: resolve(PRINTS_DIRECTORY, 'enviar-contratante-desktop.png') })

  await dialog.getByRole('button', { name: 'Enviar e-mail' }).click()
  await expect(dialog).toBeHidden()
  expect(SENT_CONTRACTOR_MAILS).toHaveLength(1)
  expect(SENT_CONTRACTOR_MAILS[0]?.body).toEqual({
    body: 'Recebedor cobrando R$ 180,00 de descarga. Autorizam?',
    channel: 'email',
    contactIds: ['00000000-0000-4000-8000-000000183030'],
    subject: 'Ocorrência — NF 4512/1',
  })
  expect(SENT_CONTRACTOR_MAILS[0]?.idempotencyKey).toMatch(/^occurrence-mail:/u)
  await expect(conversationsPanel(page).getByText('Na fila')).toBeVisible()
})

test('smoke: sem destinatário o diálogo diz o que falta e não envia', async ({ page }) => {
  SENT_CONTRACTOR_MAILS.length = 0
  await page.setViewportSize(DESKTOP)
  await openDetail(page)
  await conversationsPanel(page).getByRole('button', { name: 'Enviar por e-mail' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar à contratante' })
  await dialog.getByRole('checkbox', { name: /Maria Souza/u }).uncheck()
  await dialog.getByRole('button', { name: 'Enviar e-mail' }).click()
  await expect(dialog.getByText('Escolha ao menos um destinatário.')).toBeVisible()
  expect(SENT_CONTRACTOR_MAILS).toHaveLength(0)
})

test('print: "Adicionar aos contatos" abre o cadastro preenchido', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await openDetail(page)
  await conversationsPanel(page).getByRole('button', { name: 'Adicionar aos contatos' }).click()
  const dialog = page.getByRole('dialog', { name: 'Adicionar aos contatos' })
  await expect(dialog.getByRole('textbox').first()).toHaveValue('João Lima')
  await expect(dialog.getByRole('textbox', { name: /e-mail/iu })).toHaveValue(
    'joao.lima@alfa.example.test',
  )
  await dialog.screenshot({ path: resolve(PRINTS_DIRECTORY, 'adicionar-contato-desktop.png') })
})

test('print: a aba e o diálogo no celular', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openDetail(page)
  const panel = conversationsPanel(page)
  await expect(panel.getByText('Autorizado. Pode pagar')).toBeVisible()
  await panel.scrollIntoViewIfNeeded()
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'conversa-contratante-celular.png') })
  await panel.getByRole('button', { name: 'Enviar por e-mail' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar à contratante' })
  await expect(dialog.getByLabel('Assunto')).toHaveValue('Ocorrência — NF 4512/1')
  await page.screenshot({ path: resolve(PRINTS_DIRECTORY, 'enviar-contratante-celular.png') })
})
