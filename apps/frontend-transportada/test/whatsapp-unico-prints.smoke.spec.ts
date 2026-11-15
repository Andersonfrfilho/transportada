/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Prints da revisão de design do bloco "E-mails, telefones e WhatsApp" do editar acesso (um único lugar de WhatsApp).
 * Fora do smoke da CI: roda com `PLAYWRIGHT_TEST_MATCH=whatsapp-unico-prints.smoke.spec.ts` e grava em
 * `WHATSAPP_UNICO_PRINTS_DIRECTORY`. Dado sintético, API inteira dublada.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'

const DIRECTORY =
  process.env.WHATSAPP_UNICO_PRINTS_DIRECTORY ?? resolve(process.cwd(), 'whatsapp-unico-prints')
const VIEWPORTS = [
  ['desktop', { height: 2600, width: 1440 }],
  ['mobile', { height: 2600, width: 375 }],
] as const
const THEMES = ['dark', 'light'] as const
const CORS = {
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-allow-origin': '*',
}
const USER_ID = '00000000-0000-4000-8000-0000000000aa'

async function json(route: Route, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ headers: CORS, status: 204 })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS,
  })
}

for (const theme of THEMES) {
  for (const [label, viewport] of VIEWPORTS) {
    test(`print: editar acesso (${label} ${theme})`, async ({ page }) => {
      mkdirSync(DIRECTORY, { recursive: true })
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript(() => {
        window.sessionStorage.setItem(
          'transportada.smoke-auth-me',
          JSON.stringify({
            data: {
              company: { id: '00000000-0000-4000-8000-000000000001' },
              identity: { userId: '00000000-0000-4000-8000-000000000002' },
              permissions: ['users.manage'],
              roles: ['company-admin'],
            },
          }),
        )
      })
      await page.route(/\/company-users\/[^/]+\/picture/, (route) =>
        route.fulfill({ headers: CORS, status: 404 }),
      )
      await page.route(/\/company-users\/[^/]+\/whatsapp-phone/, (route) =>
        json(route, {
          data: { expiresAt: '2027-02-13T00:00:00Z', phone: '****9852', status: 'verified' },
        }),
      )
      await page.route(/\/company-users\/[^/]+\/identifiers/, (route) =>
        json(route, {
          data: [
            { id: 'i1', isWhatsapp: true, kind: 'phone', source: 'profile', value: '16991709852' },
            { id: 'i2', isWhatsapp: false, kind: 'phone', source: 'manual', value: '16988887777' },
            { id: 'i3', isWhatsapp: false, kind: 'email', source: 'profile', value: 'a@b.com' },
          ],
        }),
      )
      await page.route(/\/company-users(\?.*)?$/, (route) =>
        json(route, {
          data: [
            {
              contact: { channel: 'email', masked: 'a***@b.com' },
              email: 'a***@b.com',
              emails: ['a***@b.com'],
              hasPicture: false,
              id: USER_ID,
              membershipId: '00000000-0000-4000-8000-0000000000bb',
              name: 'Maria Souza',
              phone: '****9852',
              roles: ['operation'],
              status: 'active',
              taxId: '***.***.***-00',
              username: 'maria',
            },
          ],
          page: { nextCursor: null },
        }),
      )
      await loginAsLocalUser(page)
      await page.goto('/usuarios')
      await page
        .getByRole('row', { name: /Maria Souza/ })
        .getByRole('button', { name: 'Editar', exact: true })
        .click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('E-mails, telefones e WhatsApp')).toBeVisible()
      await expect(dialog.getByText('Vinculado:')).toBeVisible()
      await dialog.getByText('E-mails, telefones e WhatsApp').scrollIntoViewIfNeeded()
      await dialog.screenshot({ path: `${DIRECTORY}/editar-acesso-${label}-${theme}.png` })
    })
  }
}
