/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T654: o canal Portal na aba Contratante do detalhe — prints da revisão de design (desktop
 * e 390 px) e o smoke do envio. Fora do smoke da CI, como os outros prints da 183.
 */
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  CONTRACTOR_PORTAL,
  DOCUMENT_OCCURRENCE_ID,
  mockOccurrenceDetailPrintsApi,
  SENT_PORTAL_MESSAGES,
} from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/183-a-ocorrencia-tem-duas-conversas/prints',
)

async function openDetail(page: Page): Promise<void> {
  await mockOccurrenceDetailPrintsApi({ page, permissions: ['fleet.read', 'occurrences.resolve'] })
  await loginAsLocalUser(page)
  await page.evaluate((path) => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `/ocorrencias/${DOCUMENT_OCCURRENCE_ID}`)
}

function conversationsPanel(page: Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Conversas' }) })
}

test.afterEach(() => {
  CONTRACTOR_PORTAL.available = false
})

test('sem o portal aberto, a aba Contratante segue só com o e-mail', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 })
  await openDetail(page)
  const panel = conversationsPanel(page)

  await expect(panel.getByRole('button', { name: 'Enviar por e-mail' })).toBeVisible()
  await expect(panel.getByLabel('Mensagem pelo portal')).toHaveCount(0)
})

for (const [name, viewport] of [
  ['desktop', { height: 900, width: 1440 }],
  ['celular', { height: 844, width: 390 }],
] as const) {
  test(`smoke e print (${name}): enviar pelo portal entra entregue; em branco diz o que falta`, async ({
    page,
  }) => {
    CONTRACTOR_PORTAL.available = true
    SENT_PORTAL_MESSAGES.length = 0
    await page.setViewportSize(viewport)
    await openDetail(page)
    const panel = conversationsPanel(page)

    await panel.getByRole('button', { name: 'Enviar pelo portal' }).click()
    await expect(panel.getByText('Escreva a mensagem.')).toBeVisible()
    expect(SENT_PORTAL_MESSAGES).toHaveLength(0)

    await panel.getByLabel('Mensagem pelo portal').fill('  Recebemos a nota de devolução.  ')
    await panel.getByRole('button', { name: 'Enviar pelo portal' }).click()
    await expect(panel.getByText('Recebemos a nota de devolução.')).toBeVisible()
    await expect(panel.getByLabel('Mensagem pelo portal')).toHaveValue('')
    expect(SENT_PORTAL_MESSAGES).toHaveLength(1)
    expect(SENT_PORTAL_MESSAGES[0]?.body).toEqual({
      body: 'Recebemos a nota de devolução.',
      channel: 'portal',
    })
    expect(SENT_PORTAL_MESSAGES[0]?.idempotencyKey).toMatch(/^portal-message:/u)

    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(viewport.width)
    await panel.scrollIntoViewIfNeeded()
    await panel.screenshot({ path: resolve(PRINTS_DIRECTORY, `conversa-portal-${name}.png`) })
  })
}
