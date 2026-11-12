/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 283 T6: os prints da conversa do cliente na ocorrência, em 375 px e em desktop. Dados sintéticos, rotas
 * dubladas em memória, sem API nem banco. O bypass de login é o `VITE_SMOKE_AUTH_BYPASS` que o build já aceita;
 * nada disso entra no código do app.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  DOCUMENT_OCCURRENCE_ID,
  mockOccurrenceDetailPrintsApi,
} from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.env.SPEC_283_PRINTS_DIRECTORY ?? '/mnt/project-files/previews/conversa-cliente-t6',
)
const PHONE = { height: 812, width: 375 } as const
const DESKTOP = { height: 900, width: 1440 } as const
const PERMISSIONS = ['fleet.read', 'occurrences.resolve', 'settings.manage'] as const
const CLIENT_NAME = 'Mercado Sintético Ltda'

// Formato que a API manda: cada canal traz `channel`, `addressMasked` e `state`, como em `toClientChannel`.
const CLIENT_CONVERSATION = {
  client: {
    channels: [
      {
        addressMasked: '+55 16 ****-1234',
        channel: 'whatsapp',
        replyTarget: { confirmed: true, id: 'reply-whatsapp-1' },
        state: 'replied',
      },
      {
        addressMasked: 'fin****@mercado.example.test',
        channel: 'email',
        replyTarget: null,
        state: 'delivered',
      },
    ],
    name: CLIENT_NAME,
  },
  id: 'conversation-client',
  messages: [],
  participant: 'client',
  status: 'open',
  unreadCount: 0,
} as const

async function openDetail(page: Page): Promise<void> {
  await mockOccurrenceDetailPrintsApi({ page, permissions: PERMISSIONS })
  // Registrada depois do mock base: o Playwright dá prioridade à última rota. Acrescenta só a conversa do cliente.
  await page.route(/\/trip-occurrences\/[^/]+\/conversations$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        headers: {
          'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
          'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'access-control-allow-origin': '*',
        },
        status: 204,
      })
    }
    const id = new URL(route.request().url()).pathname.split('/').at(-2)
    if (id !== DOCUMENT_OCCURRENCE_ID) return route.fallback()
    return route.fulfill({
      body: JSON.stringify({
        data: { contractorPortal: { available: false }, conversations: [CLIENT_CONVERSATION] },
      }),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      status: 200,
    })
  })
  await loginAsLocalUser(page)
  await page.evaluate((path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `/ocorrencias/${DOCUMENT_OCCURRENCE_ID}`)
}

/** No celular a parte vira aba; no desktop ela é uma coluna. A região que contém os canais é a mesma nos dois. */
async function openClientPanel(page: Page, viewport: 'desktop' | 'phone') {
  if (viewport === 'phone') await page.getByRole('tab', { name: 'Cliente' }).click()
  return page
    .getByRole('region', { exact: true, name: 'Conversas' })
    .filter({ has: page.getByRole('list', { name: 'Canais abertos com o cliente' }) })
}

test('print: a conversa do cliente, em desktop', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await openDetail(page)
  const panel = await openClientPanel(page, 'desktop')
  await expect(panel).toBeVisible()
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'conversa-cliente-desktop-1440.png') })
})

test('print: a conversa do cliente, em 375 px', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await openDetail(page)
  const panel = await openClientPanel(page, 'phone')
  await expect(panel).toBeVisible()
  await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, 'conversa-cliente-375.png') })
})
