/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Prints da revisão de design (`web.md` §15) do comprovante que o servidor já tem: o estado que o
 * usuário fotografou em 01/10, com a frase vazando de um quadrado de 4rem. Fora do smoke da CI —
 * roda com `PLAYWRIGHT_TEST_MATCH=proof-confirmed-prints.smoke.spec.ts` e o bypass de fumaça, e
 * grava os PNGs em `PRINTS_DIR` (por padrão `prints/` dentro da app).
 *
 * ⚠️ O caso da foto vinda do servidor exige **`VITE_OBJECT_STORAGE_URL` no ambiente** — ela é que põe
 * a origem do bucket no `img-src` do build (ADR-0075 §4). Sem ela o navegador recusa a imagem e o
 * print sai com o quadro quebrado, que foi como esta suíte falhou da primeira vez.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = process.env.PRINTS_DIR ?? resolve(process.cwd(), 'prints')
const MOBILE = { height: 812, width: 375 } as const
const THEMES = ['light', 'dark'] as const

/** PNG 1×1 sintético — nenhuma foto real entra em fixture. */
const PHOTO = {
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
  mimeType: 'image/png',
  name: 'canhoto.png',
} as const

const REQUIRED_PHOTO_PROOF = {
  settlesDeliveries: true,
  stopDeliveryProof: {
    photo: 'required',
    receiverDocument: 'off',
    receiverName: 'off',
    signature: 'optional',
  },
} as const

async function openTrip(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.setViewportSize(MOBILE)
  await page.emulateMedia({ colorScheme: theme })
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  await mockDriverTripApi({ page, scenario: REQUIRED_PHOTO_PROOF })
  await loginAsLocalUser(page)
}

for (const theme of THEMES) {
  test(`print: o comprovante que o servidor já tem (375 ${theme})`, async ({ page }) => {
    await openTrip(page, theme)
    await page.getByRole('button', { name: 'Cheguei' }).click()

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: /^Tirar foto/u }).click()
    await (await chooser).setFiles(PHOTO)
    await page.getByRole('button', { name: 'Usar sem recorte' }).click()
    const confirm = page.getByRole('button', { exact: true, name: 'Confirmar entrega' })
    await expect(confirm).toBeEnabled()
    await confirm.click()

    /** A foto sai do aparelho com a drenagem; a recarga é o que devolve a tela sem cópia local. */
    await expect(page.getByText('Entregue às')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(5_000)
    await page.reload()

    const item = page.locator('li', { hasText: 'Mercearia do Centro' }).last()
    const frame = item.getByText('Comprovante já enviado')
    await expect(frame).toBeVisible({ timeout: 20_000 })
    await item.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await page.mouse.move(0, 0)
    await item.screenshot({
      animations: 'disabled',
      path: resolve(PRINTS_DIRECTORY, `comprovante-enviado-375-${theme}.png`),
    })

    /** A moldura acompanha a largura dos botões: nada de quadrado de 4rem com a frase por fora. */
    const [frameBox, attachBox] = await Promise.all([
      item.locator('p:has-text("Canhoto") ~ div').first().boundingBox(),
      item.getByRole('button', { exact: true, name: 'Anexar' }).boundingBox(),
    ])
    expect(Math.abs((frameBox?.width ?? 0) - (attachBox?.width ?? 0))).toBeLessThanOrEqual(1)
    await expect
      .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
      .toBe(true)
  })
}

/**
 * O outro caminho: o aparelho **não** tem a miniatura (foto do escritório, celular trocado, 24 h
 * vencidas) e a foto vem do servidor pela URL assinada. O IndexedDB é esvaziado antes da recarga —
 * é o que torna o cenário honesto, em vez de fotografar a cópia local de novo.
 */
test('print: a foto vem do servidor quando o aparelho não a tem (375 dark)', async ({ page }) => {
  /**
   * ⚠️ A URL tem de ser do **storage**: `img-src` não aceita `data:`, e uma URL `data:` aqui
   * fotografaria um quadro quebrado passando por teste verde. Foi o que aconteceu na primeira
   * tentativa — e é exatamente o defeito que a emenda do ADR-0075 §4 evita em produção.
   */
  const storageOrigin = new URL(process.env.VITE_OBJECT_STORAGE_URL ?? 'https://bucket.invalid')
    .origin
  const signedUrl = `${storageOrigin}/canhoto-assinado.png`

  await openTrip(page, 'dark')
  await page.route(signedUrl, async (route) => {
    await route.fulfill({ body: PHOTO.buffer, contentType: 'image/png' })
  })
  await page.route(/\/documents\/[0-9a-f-]+\/proof$/u, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }
    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            createdAt: '2026-10-01T12:00:00.000Z',
            downloadUrl: signedUrl,
            expiresAt: '2026-10-01T12:05:00.000Z',
            id: '00000000-0000-4000-8000-000000000050',
            kind: 'photo',
            thumbnailUrl: signedUrl,
          },
        ],
      }),
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.getByRole('button', { name: 'Cheguei' }).click()

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Tirar foto/u }).click()
  await (await chooser).setFiles(PHOTO)
  await page.getByRole('button', { name: 'Usar sem recorte' }).click()
  await page.getByRole('button', { exact: true, name: 'Confirmar entrega' }).click()
  await expect(page.getByText('Entregue às')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(5_000)

  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('transportada.driver-trip', 4)
        request.onsuccess = () => {
          const transaction = request.result.transaction('proof-thumbnails', 'readwrite')
          transaction.objectStore('proof-thumbnails').clear()
          transaction.oncomplete = () => {
            request.result.close()
            resolve()
          }
          transaction.onerror = () => reject(new Error('PROOF_THUMBNAIL_CLEAR_FAILED'))
        }
        request.onerror = () => reject(new Error('DRIVER_DATABASE_OPEN_FAILED'))
      }),
  )
  await page.reload()

  const item = page.locator('li', { hasText: 'Mercearia do Centro' }).last()
  await expect(item.getByText('Comprovante já enviado')).toBeVisible({ timeout: 20_000 })
  const image = item.getByRole('img', { name: 'Miniatura da foto do canhoto' })
  await expect(image).toBeVisible({ timeout: 20_000 })
  /** Visível não é carregada: `naturalWidth` zero é o quadro quebrado que a CSP produz. */
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  await item.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await page.mouse.move(0, 0)
  await item.screenshot({
    animations: 'disabled',
    path: resolve(PRINTS_DIRECTORY, 'comprovante-do-servidor-375-dark.png'),
  })
})
