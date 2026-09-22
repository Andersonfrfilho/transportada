/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T12 (aceite 5, 7): a entrega em massa pelo escritório, com câmera simulada
 * (`--use-fake-device-for-media-stream` + `--use-file-for-fake-video-capture`, ver
 * `fieldDeliveryBarcodeVideo.helper.ts`) — 5 notas, pula 1, 4 fotografadas e enviadas, cada uma
 * com a própria `Idempotency-Key` e `deliveredAt`; uma delas falha de rede na primeira tentativa e
 * só ela é reenviada no "tentar de novo" (a chave não muda entre as duas chamadas).
 */
import { expect, test, type Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { writeFieldDeliveryBarcodeVideo } from './fixtures/fieldDeliveryBarcodeVideo.helper'
import {
  DELIVERED_DOCUMENT_IDS,
  mockFieldDeliverySmokeApi,
  NETWORK_FAILURE_DOCUMENT_ID,
} from './field-delivery-smoke.helper'
import { TRIP_ID } from './trip-smoke.helper'

const SAMPLE_ACCESS_KEY = '35260700000000000000550010000000019000000010'
const BARCODE_VIDEO_PATH = writeFieldDeliveryBarcodeVideo(SAMPLE_ACCESS_KEY)

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      /**
       * ⚠️ **Sem isto, `getUserMedia` recusa com `NotSupportedError`, mesmo com
       * `permissions: ['camera']` concedido via CDP.** Medido isoladamente (script fora do runner
       * do Playwright, mesmo `chromium.launch`): só `--use-fake-device-for-media-stream` +
       * `permissions` via `browserContext.grantPermissions` falha; acrescentar
       * `--use-fake-ui-for-media-stream` (que pula o próprio diálogo de permissão do Chrome, uma
       * camada abaixo do que o CDP concede) resolve. `permissions: ['camera']` fica como reforço,
       * não como suficiente sozinho.
       */
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${BARCODE_VIDEO_PATH}`,
    ],
  },
  permissions: ['camera'],
})

async function waitForCameraFrame(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const video = document.querySelector('video')
    return video !== null && video.videoWidth > 0 && video.videoHeight > 0
  })
}

test('a baixa em massa envia nota por nota, pula 1 e repete só a que falhou', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 })
  const api = await mockFieldDeliverySmokeApi(page)
  await loginAsLocalUser(page)
  /**
   * ⚠️ **Nunca `page.goto('/trips/:id')`.** O regex do mock (`/\/trips\/[^/]+$/`) não distingue
   * origem — um `goto` bateria na mesma URL do **frontend**, e o Playwright serviria o JSON do
   * mock como se fosse a página (reproduzido: a tela virou o `{"data":...}` cru). A SPA não tem
   * router de servidor (CLAUDE.md do app): navegação é sempre `pushState` + `popstate`, como
   * `navigateTo` faz em `main.tsx`.
   */
  await page.evaluate((tripId) => {
    window.history.pushState({}, '', `/trips/${tripId}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, TRIP_ID)

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const selectAllCheckbox = page.getByRole('checkbox', {
    name: /Selecionar todas as notas da parada/u,
  })
  await selectAllCheckbox.check()

  await page.getByRole('button', { name: 'Dar baixa em 5 notas' }).click()

  const dialog = page.getByRole('dialog', { name: 'Baixa com canhoto' })
  await expect(dialog).toBeVisible()

  // Passo 1 (pulada): a primeira nota do lote não é fotografada nem enviada.
  await dialog.getByRole('button', { name: 'Pular nota' }).click()

  // Passos 2 a 5: câmera simulada, captura e confirmação.
  for (let step = 0; step < DELIVERED_DOCUMENT_IDS.length; step += 1) {
    await waitForCameraFrame(page)
    await dialog.getByRole('button', { name: 'Capturar' }).click()
    await expect(dialog.getByRole('button', { name: 'Confirmar' })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Confirmar' }).click()
  }

  // Tela final do assistente (D5 aceite 5): 4 fotografadas, 1 pulada.
  await expect(dialog.getByText('Enviar 4 notas')).toBeVisible()
  await dialog.getByRole('button', { name: 'Enviar 4 notas' }).click()

  // Uma falhou de rede na primeira tentativa; as outras três já terminaram.
  await expect(dialog.getByText('3 notas entregues')).toBeVisible()
  await expect(dialog.getByText('1 nota falhou')).toBeVisible()
  const retryButton = dialog.getByRole('button', { name: /Tentar de novo/u })
  await expect(retryButton).toBeVisible()

  await retryButton.click()
  await expect(dialog.getByText('4 notas entregues')).toBeVisible()
  await expect(dialog.getByText(/nota falhou|notas falharam/u)).toHaveCount(0)

  // Dois botões "Fechar" na tela: o ícone do cabeçalho (T11) e o da tela de resultado (T12).
  await dialog.getByRole('button', { name: 'Fechar' }).last().click()
  await expect(dialog).toBeHidden()

  const calls = api.calls()
  expect(calls).toHaveLength(5)
  expect(new Set(calls.map((call) => call.documentId)).size).toBe(4)
  expect(calls.every((call) => call.deliveredAt !== undefined && call.deliveredAt !== '')).toBe(
    true,
  )
  expect(calls.every((call) => call.idempotencyKey !== undefined)).toBe(true)

  const failedDocumentCalls = calls.filter(
    (call) => call.documentId === NETWORK_FAILURE_DOCUMENT_ID,
  )
  expect(failedDocumentCalls).toHaveLength(2)
  expect(failedDocumentCalls[0]?.idempotencyKey).toBe(failedDocumentCalls[1]?.idempotencyKey)
})
