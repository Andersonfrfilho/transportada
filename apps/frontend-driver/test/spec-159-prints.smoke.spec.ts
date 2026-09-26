/* Cópia por valor, reduzida, de apps/frontend-transportada/test/spec-159-prints.smoke.spec.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ **Reduzida**: só os testes "PWA: …" do original — os de "Escritório: …" (seletor de
 * motoristas, ficha com nota, painel do comprovante) ficam no painel, T5.4. Spec 159 T12
 * (`web.md` §15): os prints da revisão de design das telas da foto obrigatória e da nota do
 * motorista. Fora do smoke da CI — roda com `PLAYWRIGHT_TEST_MATCH=spec-159-prints.smoke.spec.ts`
 * e grava os PNGs ao lado da spec 159, que é onde a evidência mora.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi, type DriverTripProofScenario } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/159-a-foto-obrigatoria-pesa-na-nota-do-motorista/prints',
)
const PHONE = { height: 844, width: 390 } as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]

/** PNG 1×1 sintético — o recorte usa o original, e nenhuma foto real entra em fixture. */
const PHOTO_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const PHOTO_REQUIRED = {
  photo: 'required',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'off',
} as const

function pendingProof(input: Readonly<{ documentId: string; number: string; recipient: string }>) {
  return {
    deliveredAt: '2026-09-18T13:10:00.000Z',
    deliveryProof: PHOTO_REQUIRED,
    documentId: input.documentId,
    documentNumber: input.number,
    documentSeries: '1',
    recipientName: input.recipient,
    tripId: '00000000-0000-4000-8000-000000000100',
    tripStatus: 'in_transit',
  }
}

const PENDING_BAKERY = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000201',
  number: '900201',
  recipient: 'Padaria Estrela',
})
const PENDING_BUTCHER = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000202',
  number: '900202',
  recipient: 'Açougue Boi Bravo',
})
const ON_TIME = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000203',
  number: '900203',
  recipient: 'Farmácia Vida',
})
const LATE = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000204',
  number: '900204',
  recipient: 'Loja Mãe Rainha',
})
const AWAY = pendingProof({
  documentId: '00000000-0000-4000-8000-000000000205',
  number: '900205',
  recipient: 'Bazar do Bairro',
})

function printPath(name: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${theme}.png`)
}

async function openDriverApp(
  input: Readonly<{ page: Page; scenario: DriverTripProofScenario; theme: Theme }>,
) {
  await input.page.setViewportSize(PHONE)
  await input.page.emulateMedia({ colorScheme: input.theme })
  await input.page.context().grantPermissions(['geolocation'])
  await input.page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  const api = await mockDriverTripApi({ page: input.page, scenario: input.scenario })
  await loginAsLocalUser(input.page)
  await expect(input.page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  return api
}

async function attachPhoto(item: Locator, page: Page): Promise<void> {
  // Duas portas para a foto do canhoto: a da câmera é a que tem `capture`.
  await item.locator('input[type=file][capture]').setInputFiles({
    buffer: PHOTO_BYTES,
    mimeType: 'image/png',
    name: 'canhoto.png',
  })
  await page.getByRole('button', { name: 'Usar sem recorte' }).click()
}

/** Toque: todo botão visível da tela com menos de 44 px de altura ou largura. */
async function listSmallTouchTargets(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button, a, input, [role=button]')]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height < 44 || rect.width < 44)
      .map(
        ({ element, rect }) =>
          `${element.tagName} "${(element.textContent ?? '').trim() || element.getAttribute('aria-label')}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
      ),
  )
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
}

for (const theme of THEMES) {
  test(`PWA: card da parada com o aviso de foto obrigatória (${theme})`, async ({ page }) => {
    await openDriverApp({ page, scenario: { stopDeliveryProof: PHOTO_REQUIRED }, theme })
    // Pedido do usuário (25/09): "Entreguei" só existe depois de "Cheguei".
    await page.getByRole('button', { name: 'Cheguei' }).click()
    const warning = page.getByText('Foto do canhoto obrigatória').first()
    await warning.scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { exact: true, name: 'Entreguei' })).toBeEnabled()
    await assertNoHorizontalOverflow(page)
    test.info().annotations.push({
      description: (await listSmallTouchTargets(page)).join(' | '),
      type: 'small-touch-targets',
    })
    await page
      .locator('li', { has: warning })
      .first()
      .screenshot({
        path: printPath('pwa-card-aviso-foto', theme),
      })
  })

  test(`PWA: fotos pendentes com uma pendente e uma na fila (${theme})`, async ({ page }) => {
    const api = await openDriverApp({
      page,
      scenario: { pendingProofs: [PENDING_BAKERY, PENDING_BUTCHER] },
      theme,
    })
    await page.getByRole('button', { name: /Fotos pendentes/u }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Fotos pendentes' })).toBeVisible()

    api.setOffline(true)
    const butcher = page.locator('li', { hasText: 'Açougue Boi Bravo' })
    await attachPhoto(butcher, page)
    await expect(butcher.getByText(/sobe sozinha quando o sinal voltar/u)).toBeVisible()
    await assertNoHorizontalOverflow(page)
    test.info().annotations.push({
      description: (await listSmallTouchTargets(page)).join(' | '),
      type: 'small-touch-targets',
    })
    await page.screenshot({ fullPage: true, path: printPath('pwa-fotos-pendentes', theme) })
  })

  test(`PWA: aviso de pontualidade em dia, tardia e longe (${theme})`, async ({ page }) => {
    await openDriverApp({
      page,
      scenario: {
        pendingProofs: [ON_TIME, LATE, AWAY],
        punctualityByDocumentId: {
          [AWAY.documentId]: 'away',
          [LATE.documentId]: 'late',
          [ON_TIME.documentId]: 'on_time',
        },
      },
      theme,
    })
    await page.getByRole('button', { name: /Fotos pendentes/u }).click()
    for (const recipient of ['Farmácia Vida', 'Loja Mãe Rainha', 'Bazar do Bairro']) {
      const item = page.locator('li', { hasText: recipient })
      await attachPhoto(item, page)
    }
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page.getByText(/Registrada em dia/u)).toBeVisible()
    await expect(page.getByText(/fora do prazo/u)).toBeVisible()
    await expect(page.getByText(/longe do local/u)).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.screenshot({ path: printPath('pwa-pontualidade', theme) })
  })

  for (const score of [85, null] as const) {
    const name = score === null ? 'pwa-perfil-sem-nota' : 'pwa-perfil-nota'
    test(`PWA: perfil com a nota ${String(score)} (${theme})`, async ({ page }) => {
      await openDriverApp({ page, scenario: { score }, theme })
      await page.getByRole('button', { name: 'Perfil' }).click()
      const scoreSection = page.locator('section', { hasText: 'Sua nota' })
      await scoreSection.scrollIntoViewIfNeeded()
      await assertNoHorizontalOverflow(page)
      await page.screenshot({ path: printPath(name, theme) })
    })
  }
}
