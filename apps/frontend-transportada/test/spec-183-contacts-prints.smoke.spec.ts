/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T303: os prints da revisão de design do painel de contatos da contratante (`web.md` §15)
 * — os cartões com nome, setor, telefone, aceite, canal e tipos; a edição aberta pelo clique; os
 * erros no campo; e o celular sem rolagem horizontal. Fora do smoke da CI, como os prints da 183.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/183-a-ocorrencia-tem-duas-conversas/prints',
)
const PHONE = { height: 844, width: 390 } as const
const DESKTOP = { height: 900, width: 1440 } as const
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000183100'
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

const CONTACTS = [
  {
    canDecide: true,
    contractorId: CONTRACTOR_ID,
    email: 'compras@alfa.example.test',
    id: '00000000-0000-4000-8000-000000183101',
    name: 'Compradora Sintética Souza',
    occurrenceStages: ['delivery', 'stop'],
    phone: '5511999990001',
    preferredChannel: 'whatsapp',
    receivesOccurrences: true,
    roleLabel: 'Compras',
    status: 'active',
    types: ['occurrences', 'approves_charges'],
    whatsappOptInAt: '2026-09-24T18:00:00.000Z',
    whatsappOptInByUserId: 'user-1',
  },
  {
    canDecide: false,
    contractorId: CONTRACTOR_ID,
    email: 'fiscal@alfa.example.test',
    id: '00000000-0000-4000-8000-000000183102',
    name: '',
    occurrenceStages: ['separation', 'delivery', 'stop'],
    phone: null,
    preferredChannel: 'email',
    receivesOccurrences: false,
    roleLabel: '',
    status: 'active',
    types: ['invoices', 'cte_xml'],
    whatsappOptInAt: null,
    whatsappOptInByUserId: null,
  },
] as const

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

async function open(page: Page): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['settings.manage', 'invoices.read'],
  })
  await page.route(/\/contractors(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      data: [
        {
          closingPeriod: 'monthly',
          displayName: 'Contratante Alfa Indústria',
          id: CONTRACTOR_ID,
          notes: '',
          reportEmail: '',
          status: 'active',
          taxId: '11222333000181',
        },
      ],
    }),
  )
  await page.route(/\/contractors\/[^/]+\/contacts$/, (route) =>
    fulfillJson(route, { data: CONTACTS }),
  )
  await page.route(/\/contractors\/[^/]+\/contacts\/[^/]+$/, (route) =>
    fulfillJson(route, { data: CONTACTS[0] }),
  )
  await loginAsLocalUser(page)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/clientes?tab=mail')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.getByRole('button', { exact: true, name: 'Contratante' }).click()
  const option = page.getByRole('option', { name: /Contratante Alfa Indústria/u })
  await option.waitFor({ state: 'visible' })
  await option.click()
}

function contactsPanel(page: Page) {
  return page.locator('section', {
    has: page.getByRole('heading', { level: 2, name: 'Contatos da contratante' }),
  })
}

test('print: os contatos em cartões e o formulário de novo contato', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page)
  const panel = contactsPanel(page)
  await expect(panel.getByText('Compradora Sintética Souza')).toBeVisible()
  await expect(panel.getByText('(11) 99999-0001')).toBeVisible()
  await expect(panel.getByText(/WhatsApp aceito em/u)).toBeVisible()
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'contatos-desktop.png') })
})

test('print: editar abre o formulário no lugar do cartão, com o aceite marcado', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await open(page)
  const panel = contactsPanel(page)
  await panel.getByRole('button', { name: 'Editar' }).first().click()
  const form = panel.getByRole('form', { name: 'Editar contato' })
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Nome')).toHaveValue('Compradora Sintética Souza')
  await expect(
    form.getByRole('checkbox', { name: 'O contato aceitou receber mensagens pelo WhatsApp' }),
  ).toBeChecked()
  await expect(form.getByText(/Aceite registrado em 24\/09\/2026/u)).toBeVisible()
  await form.getByLabel('Telefone').fill('(11) 98888-7777')
  await expect(form.getByText(/registrado com a data de agora/u)).toBeVisible()
  await form.getByLabel('Telefone').fill('(11) 99999-0001')
  await form.screenshot({ path: resolve(PRINTS_DIRECTORY, 'contatos-editar.png') })
})

test('print: os erros aparecem no campo antes do envio', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page)
  const form = contactsPanel(page).getByRole('form', { name: 'Novo contato' })
  await form.getByLabel('Telefone').fill('1234')
  await form.getByRole('checkbox', { name: 'Separação' }).click()
  await form.getByRole('checkbox', { name: 'Entrega' }).click()
  await form.getByRole('checkbox', { name: 'Parada' }).click()
  await form.getByRole('button', { name: 'Adicionar contato' }).click()
  await expect(form.getByText('Informe o e-mail.')).toBeVisible()
  await expect(form.getByText(/Informe o telefone com DDD/u)).toBeVisible()
  await expect(form.getByText('Escolha ao menos um grupo de ocorrência.')).toBeVisible()
  await form.screenshot({ path: resolve(PRINTS_DIRECTORY, 'contatos-erros.png') })
})

test('print: os contatos no celular, sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page)
  const panel = contactsPanel(page)
  await expect(panel.getByText('Compradora Sintética Souza')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'contatos-celular.png') })
})
