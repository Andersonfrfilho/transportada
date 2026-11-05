/* Copyright (c) 2026 Ada Technology. MIT License. */
import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockFleetWorkspaceApi } from './fleet-smoke.helper'
import { DRIVER_DETAIL } from './fleet/fleet.fixture'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}
const SIGNED_URL = 'http://localhost:53999/signed-document'
const ATTACHMENT_ID_PREFIX = '00000000-0000-4000-8000-0000000009'
const PDF_BYTES = Buffer.from('%PDF-1.4 smoke')

type MockAttachment = {
  createdAt: string
  hasSuggestion: boolean
  id: string
  type: string
  uploadedBy: { id: string; name: string | null }
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
}

/** Guarda estado: anexar, substituir e remover precisam mudar a lista, não só sair como requisição. */
async function registerAttachmentApi(page: Page) {
  const attachments: MockAttachment[] = []
  const calls: string[] = []
  let sequence = 0
  const base = new RegExp(
    `/fleet/drivers/${DRIVER_DETAIL.id}/attachments(?:/([^/?]+))?(/content)?$`,
  )

  await page.route(base, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    const match = base.exec(request.url())
    const attachmentId = match?.[1]
    calls.push(`${request.method()}${match?.[2] ?? ''}`)

    if (request.method() === 'GET' && match?.[2] === '/content') {
      await fulfillJson(route, { data: { url: SIGNED_URL } })
      return
    }
    if (request.method() === 'GET') {
      await fulfillJson(route, { data: attachments })
      return
    }
    if (request.method() === 'DELETE') {
      const index = attachments.findIndex((attachment) => attachment.id === attachmentId)
      if (index >= 0) attachments.splice(index, 1)
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    const type = /name="type"\r\n\r\n([^\r]+)/u.exec(request.postData() ?? '')?.[1] ?? 'cnh'
    for (let index = attachments.length - 1; index >= 0; index -= 1) {
      if (attachments[index]?.type === type) attachments.splice(index, 1)
    }
    sequence += 1
    const created: MockAttachment = {
      createdAt: '2026-11-05T12:00:00.000Z',
      hasSuggestion: false,
      id: `${ATTACHMENT_ID_PREFIX}${String(sequence).padStart(2, '0')}`,
      type,
      uploadedBy: { id: '00000000-0000-4000-8000-000000000002', name: 'Operador do Smoke' },
    }
    attachments.push(created)
    await fulfillJson(route, { data: created }, 201)
  })

  return { attachments: () => attachments, calls: () => calls }
}

test('Documentos do motorista: anexar, listar, abrir, substituir e remover pela ficha', async ({
  context,
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'fleet'))
  await mockFleetWorkspaceApi({
    page,
    permissions: ['fleet.read', 'fleet.manage', 'fleet.reveal'],
  })
  await page.route(/\/fleet\/drivers(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await fulfillJson(route, {
      data: [{ ...DRIVER_DETAIL, score: 85 }],
      page: { nextCursor: null },
    })
  })
  await context.route(SIGNED_URL, (route) =>
    route.fulfill({ body: 'pdf', contentType: 'text/plain', status: 200 }),
  )
  const api = await registerAttachmentApi(page)
  await loginAsLocalUser(page)

  await page.getByRole('tab', { name: 'Motoristas' }).click()
  await page.locator('tbody tr').first().getByRole('button', { name: 'Editar' }).click()
  await expect(page.getByText('Nenhum documento anexado.')).toBeVisible()

  const upload = (name: string) =>
    page
      .getByLabel('Arquivo do documento')
      .setInputFiles({ buffer: PDF_BYTES, mimeType: 'application/pdf', name })

  await upload('cnh.pdf')
  await expect(page.getByText('Documento anexado.')).toBeVisible()
  const row = page.getByRole('listitem').filter({ hasText: 'CNH' })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Operador do Smoke')

  const popup = context.waitForEvent('page')
  await row.getByRole('button', { name: 'Abrir' }).click()
  const opened = await popup
  await opened.waitForLoadState()
  expect(opened.url()).toBe(SIGNED_URL)

  await upload('cnh-nova.pdf')
  await expect(page.getByText('Documento substituído.')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'CNH' })).toHaveCount(1)
  expect(api.attachments()).toHaveLength(1)
  expect(api.attachments()[0]?.id.endsWith('02')).toBe(true)

  await page
    .getByRole('listitem')
    .filter({ hasText: 'CNH' })
    .getByRole('button', { name: 'Remover' })
    .click()
  await expect(page.getByText('Documento removido.')).toBeVisible()
  await expect(page.getByText('Nenhum documento anexado.')).toBeVisible()
  expect(api.calls()).toEqual(expect.arrayContaining(['POST', 'GET/content', 'DELETE']))
})
