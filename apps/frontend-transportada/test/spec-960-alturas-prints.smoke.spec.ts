/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Prints do modal de permissões avulsas e da barra do usuário, claro/escuro, 1440 e 375. Fora da CI:
 * `PLAYWRIGHT_TEST_MATCH=spec-960-alturas-prints.smoke.spec.ts` com `PRINTS_DIRECTORY`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockFleetWorkspaceApi } from './fleet-smoke.helper'

const PRINTS_DIRECTORY = resolve(process.env.PRINTS_DIRECTORY ?? 'tmp-prints')
const USER_ID = '00000000-0000-4000-8000-000000000010'
const USER = {
  contact: { channel: 'email', masked: 'D**@G**.COM' },
  email: 'D**@G**.COM',
  emails: ['D**@G**.COM'],
  hasPicture: false,
  id: USER_ID,
  membershipId: '00000000-0000-4000-8000-000000000011',
  name: 'Deisy Diniz Campos',
  phone: '***65',
  roles: ['operator', 'finance'],
  status: 'active',
  taxId: '***',
  username: 'deisy',
}
const GRANTED = ['finance.read', 'trip.read']
const VIEWPORTS = [
  { height: 900, label: 'desktop', width: 1440 },
  { height: 844, label: 'mobile', width: 375 },
] as const

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

for (const theme of ['dark', 'light'] as const) {
  for (const viewport of VIEWPORTS) {
    test(`modal de permissões e barra do usuário — ${theme}-${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'users'))
      await mockFleetWorkspaceApi({
        page,
        permissions: ['users.manage', 'users.reveal', 'groups.manage'],
      })
      const json = (body: unknown) => ({
        body: JSON.stringify(body),
        contentType: 'application/json',
        headers: CORS,
      })
      await page.route(/\/company-users(?:\?.*)?$/, async (route) =>
        route.request().method() === 'OPTIONS'
          ? route.fulfill({ headers: CORS, status: 204 })
          : route.fulfill(json({ data: [USER], page: { nextCursor: null } })),
      )
      await page.route(/\/company-users\/role-permissions$/, (route) =>
        route.fulfill(
          json({
            data: {
              permissions: [
                'finance.read',
                'finance.write',
                'trip.read',
                'trip.manage',
                'fleet.read',
              ],
              roles: [{ permissions: ['trip.read'], role: 'operator' }],
            },
          }),
        ),
      )
      await page.route(/\/company-users\/[^/]+\/permissions$/, (route) =>
        route.request().method() === 'OPTIONS'
          ? route.fulfill({ headers: CORS, status: 204 })
          : route.fulfill(json({ data: { permissions: GRANTED } })),
      )
      await page.route(/\/company-(?:groups|users\/reconciliation)(?:\/.*)?(?:\?.*)?$/, (route) =>
        route.fulfill(json({ data: [] })),
      )
      await loginAsLocalUser(page)
      await page.goto('/usuarios')
      await page.getByText('Deisy Diniz Campos').first().waitFor()
      await page.screenshot({
        clip: undefined,
        path: resolve(PRINTS_DIRECTORY, `barra-usuario-${theme}-${viewport.label}.png`),
      })
      await page
        .getByRole('button', { name: /Permissões e vínculos/u })
        .first()
        .click()
      await expect(page.getByText(/permissão\(ões\) avulsa/u)).toBeVisible()
      await page.screenshot({
        path: resolve(PRINTS_DIRECTORY, `modal-conceder-${theme}-${viewport.label}.png`),
      })
    })
  }
}
