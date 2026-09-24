/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 182 (CA07, T5.1): a foto da carga no assistente de baixa, com a câmera simulada do
 * `field-delivery.smoke.spec.ts`. Uma nota fotografada, duas fotos da carga na revisão, envio — e
 * os prints da revisão de design em 1280 e 375, claro e escuro.
 */
import { mkdirSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { writeFieldDeliveryBarcodeVideo } from './fixtures/fieldDeliveryBarcodeVideo.helper'
import { FIELD_DELIVERY_DOCUMENT_IDS, mockFieldDeliverySmokeApi } from './field-delivery-smoke.helper'
import { TRIP_ID } from './trip-smoke.helper'

const SAMPLE_ACCESS_KEY = '35260700000000000000550010000000019000000010'
const BARCODE_VIDEO_PATH = writeFieldDeliveryBarcodeVideo(SAMPLE_ACCESS_KEY)
const PRINTS_DIRECTORY = new URL(
  '../../../specs/182-fotos-da-carga-na-baixa/prints/',
  import.meta.url,
)
mkdirSync(PRINTS_DIRECTORY, { recursive: true })

/** A terceira nota do lote: fora da que o mock derruba na primeira tentativa. */
const PHOTOGRAPHED_STEP = 2

const VIEWPORTS = {
  desktop: { height: 900, width: 1280 },
  mobile: { height: 812, width: 375 },
} as const

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${BARCODE_VIDEO_PATH}`,
    ],
  },
  permissions: ['camera'],
})

type CargoProofCall = Readonly<{ idempotencyKey: string | undefined; kind: string | undefined }>

async function mockCargoProofRoute(page: Page): Promise<() => readonly CargoProofCall[]> {
  const calls: CargoProofCall[] = []
  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/field-proof$/, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204 })
      return
    }
    const body = request.postDataBuffer()?.toString('latin1') ?? ''
    const kind = /name="kind"\r\n\r\n([^\r]+)/u.exec(body)?.[1]
    calls.push({ idempotencyKey: (await request.headerValue('idempotency-key')) ?? undefined, kind })
    await route.fulfill({
      body: JSON.stringify({ data: { id: crypto.randomUUID() } }),
      contentType: 'application/json',
      status: 201,
    })
  })
  return () => calls
}

async function waitForCameraFrame(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const video = document.querySelector('video')
    return video !== null && video.videoWidth > 0 && video.videoHeight > 0
  })
}

async function openReviewWithCargoPhotos(page: Page): Promise<ReturnType<Page['getByRole']>> {
  await loginAsLocalUser(page)
  await page.evaluate((tripId) => {
    window.history.pushState({}, '', `/trips/${tripId}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, TRIP_ID)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.getByRole('checkbox', { name: /Selecionar todas as notas da parada/u }).check()
  await page
    .getByRole('button', { name: `Dar baixa em ${FIELD_DELIVERY_DOCUMENT_IDS.length} notas` })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Baixa com canhoto' })
  await expect(dialog).toBeVisible()

  for (let step = 0; step < PHOTOGRAPHED_STEP; step += 1) {
    await dialog.getByRole('button', { name: 'Pular nota' }).click()
  }
  await waitForCameraFrame(page)
  await dialog.getByRole('button', { name: 'Capturar' }).click()
  await expect(dialog.getByRole('button', { name: 'Confirmar' })).toBeEnabled()

  // Uma imagem real, tirada da própria tela: o redutor do canhoto precisa decodificá-la
  const sample = await page.screenshot({ clip: { height: 300, width: 400, x: 0, y: 0 }, type: 'jpeg' })
  await dialog.locator('input[type="file"]').setInputFiles([
    { buffer: sample, mimeType: 'image/jpeg', name: 'carga-1.jpg' },
    { buffer: sample, mimeType: 'image/jpeg', name: 'carga-2.jpg' },
  ])
  await expect(dialog.getByRole('img', { name: /Foto \d da carga/u })).toHaveCount(2)
  await expect(dialog.getByText('2 de 5')).toBeVisible()
  return dialog
}

for (const [viewport, size] of Object.entries(VIEWPORTS)) {
  for (const theme of ['light', 'dark'] as const) {
    test(`spec 182: revisão com duas fotos da carga — ${viewport} ${theme}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.emulateMedia({ colorScheme: theme })
      await mockFieldDeliverySmokeApi(page)
      await mockCargoProofRoute(page)

      const dialog = await openReviewWithCargoPhotos(page)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
      expect(overflow).toBe(false)
      await dialog.screenshot({
        path: new URL(`review-${viewport}-${theme}.png`, PRINTS_DIRECTORY).pathname,
      })
      // O diálogo rola por dentro: o bloco das fotos ganha print próprio, que o traz à vista
      await dialog.locator('[class*="cargoPhotosSection"]').screenshot({
        path: new URL(`cargo-${viewport}-${theme}.png`, PRINTS_DIRECTORY).pathname,
      })
    })
  }
}

test('spec 182: a baixa sobe e depois envia as duas fotos da carga, uma por vez', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await mockFieldDeliverySmokeApi(page)
  const cargoCalls = await mockCargoProofRoute(page)

  const dialog = await openReviewWithCargoPhotos(page)
  await dialog.getByRole('button', { name: 'Confirmar' }).click()
  for (let step = PHOTOGRAPHED_STEP + 1; step < FIELD_DELIVERY_DOCUMENT_IDS.length; step += 1) {
    await dialog.getByRole('button', { name: 'Pular nota' }).click()
  }
  await dialog.getByRole('button', { name: 'Enviar 1 nota' }).click()
  await expect(dialog.getByText('1 nota entregue')).toBeVisible()
  await expect.poll(() => cargoCalls().length).toBe(2)

  expect(cargoCalls().map((call) => call.kind)).toEqual(['cargo', 'cargo'])
  const keys = cargoCalls().map((call) => call.idempotencyKey)
  expect(keys.every((key) => key !== undefined)).toBe(true)
  expect(new Set(keys).size).toBe(2)

  await dialog.screenshot({
    path: new URL('send-desktop.png', PRINTS_DIRECTORY).pathname,
  })
})
