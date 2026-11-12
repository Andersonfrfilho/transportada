/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318 T8 (`web.md` §15): os prints da revisão de design do bloco "Aviso de ocorrência" na ficha da contratante,
 * ao lado do bloco vizinho (Perfil de recebimento). Tema claro e escuro, desktop (1440) e celular (375). Fora do
 * smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=spec-318-prints.smoke.spec.ts` e grava em `PRINTS_DIRECTORY`. O grupo e o
 * número são sintéticos.
 */
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockTripWorkspaceApi } from './trip-smoke.helper'

const PRINTS_DIRECTORY =
  process.env.PRINTS_DIRECTORY ??
  resolve(
    process.cwd(),
    '../../specs/318-ocorrencia-da-contratante-vai-no-grupo-do-whatsapp/prints',
  )
const PHONE = { height: 844, width: 375 } as const
const DESKTOP = { height: 900, width: 1440 } as const
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000318100'
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}
const GROUP_JID = '120363000000000318@g.us'
const SAVED_CHANNEL = {
  channel: 'whatsapp_group',
  emailFallback: true,
  groupJid: GROUP_JID,
  groupName: 'Avisos de teste (sintético)',
  mentionPhone: '5511999990318',
  updatedAt: '2026-11-10T12:00:00.000Z',
}
const EMAIL_CHANNEL = {
  channel: 'email',
  emailFallback: true,
  groupJid: null,
  groupName: '',
  mentionPhone: null,
  updatedAt: null,
}
const GROUPS = [
  {
    groupJid: GROUP_JID,
    name: 'Avisos de teste (sintético)',
    owner: { id: CONTRACTOR_ID, kind: 'contractor', name: 'Contratante Sintética' },
  },
  { groupJid: '120363000000000319@g.us', name: 'Grupo livre sintético', owner: null },
  {
    groupJid: '120363000000000320@g.us',
    name: 'Grupo de um motorista',
    owner: { id: 'd1', kind: 'driver', name: 'Motorista' },
  },
]

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

async function openFicha(page: Page, channel: unknown): Promise<Locator> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['settings.manage', 'fleet.read', 'fleet.manage', 'invoices.read'],
  })
  await page.route(/\/delivery-clients(?:\?.*)?$/, (route) =>
    fulfillJson(route, { data: [], page: { nextCursor: null } }),
  )
  await page.route(/\/contractors(?:\?.*)?$/, (route) =>
    fulfillJson(route, {
      data: [
        {
          closingPeriod: 'monthly',
          displayName: 'Contratante Sintética',
          id: CONTRACTOR_ID,
          notes: '',
          reportEmail: '',
          status: 'active',
          taxId: '11222333000181',
        },
      ],
      page: { nextCursor: null },
    }),
  )
  await page.route(/\/contractors\/[^/?]+$/, (route) =>
    fulfillJson(route, {
      data: {
        closingPeriod: 'monthly',
        displayName: 'Contratante Sintética',
        id: CONTRACTOR_ID,
        notes: '',
        reportEmail: '',
        status: 'active',
        taxId: '11222333000181',
      },
    }),
  )
  await page.route(/\/contractors\/[^/]+\/receiving-profile$/, (route) =>
    fulfillJson(route, { data: null }),
  )
  await page.route(/\/contractors\/[^/]+\/occurrence-channel$/, (route) => {
    if (route.request().method() === 'PUT') return fulfillJson(route, { data: SAVED_CHANNEL })
    return fulfillJson(route, { data: channel })
  })
  await page.route(/\/contractors\/[^/]+\/occurrence-channel\/test$/, (route) =>
    fulfillJson(route, { data: { sent: true } }),
  )
  await page.route(/\/contractor-occurrence-channels\/whatsapp-groups$/, (route) =>
    fulfillJson(route, { data: GROUPS }),
  )
  await loginAsLocalUser(page)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/clientes?tab=contractors')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.getByRole('button', { name: 'Abrir a ficha de Contratante Sintética' }).click()
  const ficha = page.locator('section', {
    has: page.getByRole('heading', { level: 3, name: 'Contratante Sintética' }),
  })
  const block = ficha.locator('section', {
    has: page.getByRole('heading', { level: 4, name: /Aviso de ocorrência/u }),
  })
  await expect(block).toBeVisible()
  return block
}

for (const theme of ['light', 'dark'] as const) {
  for (const [name, viewport] of [
    ['desktop', DESKTOP],
    ['celular', PHONE],
  ] as const) {
    test(`print ${name} ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript((value) => {
        try {
          window.localStorage.setItem('transportada:color-theme', value)
        } catch {
          /* sem storage */
        }
      }, theme)
      await page.setViewportSize(viewport)
      const block = await openFicha(page, SAVED_CHANNEL)
      await expect(block.getByRole('button', { name: 'Enviar mensagem de teste' })).toBeEnabled()
      await block.scrollIntoViewIfNeeded()
      await page.screenshot({ path: resolve(PRINTS_DIRECTORY, `canal-grupo-${name}-${theme}.png`) })
      await block.screenshot({
        path: resolve(PRINTS_DIRECTORY, `canal-grupo-bloco-${name}-${theme}.png`),
      })
      const profile = page.locator('form', {
        has: page.getByRole('heading', { level: 4, name: 'Perfil de recebimento' }),
      })
      await profile.screenshot({
        path: resolve(PRINTS_DIRECTORY, `vizinho-perfil-${name}-${theme}.png`),
      })
    })
  }
}

test('print: canal e-mail, grupo aberto e teste enviado', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  const block = await openFicha(page, EMAIL_CHANNEL)
  await block.screenshot({ path: resolve(PRINTS_DIRECTORY, 'canal-email-desktop.png') })
  await block.getByRole('button', { name: 'Avisar a ocorrência por' }).click()
  await page.getByRole('option', { name: 'WhatsApp (grupo)' }).click()
  await block.getByRole('button', { name: 'Grupo do WhatsApp' }).click()
  await page.screenshot({ path: resolve(PRINTS_DIRECTORY, 'canal-grupo-seletor-aberto.png') })
  await page.getByRole('option', { name: 'Grupo livre sintético' }).click()
  await block.getByLabel('Número a marcar no grupo').fill('123')
  await block.getByLabel('Número a marcar no grupo').blur()
  await block.screenshot({ path: resolve(PRINTS_DIRECTORY, 'canal-grupo-telefone-invalido.png') })
})
