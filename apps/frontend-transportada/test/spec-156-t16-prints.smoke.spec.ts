/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { writeFieldDeliveryBarcodeVideo } from './fixtures/fieldDeliveryBarcodeVideo.helper'
import { buildAccessKeyBarcodeFrame } from './fixtures/canhotoBarcodeFrame.fixture'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'
import { mockTripTimelineApi } from './trip-timeline-smoke.helper'

/**
 * Spec 156 T16 (`web.md` §15): os prints da revisão de design e usabilidade do escritório da
 * baixa — painel "Ações de campo", chegada, ocorrência de parada e de nota, o assistente de baixa
 * inteiro, a autoria na linha do tempo e o interruptor do OCR. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-156-t16-prints.smoke.spec.ts`, e `T16_PRINT_PREFIX` troca o prefixo
 * dos arquivos (o "antes" das correções saiu com `t16-antes`).
 */
const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/156-o-escritorio-da-baixa-pelo-motorista/prints',
)
const PRINT_PREFIX = process.env.T16_PRINT_PREFIX ?? 't16'

const VIEWPORTS = {
  celular: { height: 812, width: 375 },
  desktop: { height: 800, width: 1280 },
} as const
type Viewport = keyof typeof VIEWPORTS
const THEMES = { claro: 'light', escuro: 'dark' } as const
type Theme = keyof typeof THEMES
const COMBINATIONS = (Object.keys(VIEWPORTS) as Viewport[]).flatMap((viewport) =>
  (Object.keys(THEMES) as Theme[]).map((theme) => ({ theme, viewport })),
)

const STOP_ID = '00000000-0000-4000-8000-000000000810'
const DRIVER_ID = '00000000-0000-4000-8000-000000000801'
const OTHER_DRIVER_ID = '00000000-0000-4000-8000-000000000803'
const RECIPIENTS = [
  'Mercado Bom Preço',
  'Mercado Bom Preço',
  'Farmácia Vida',
  'Padaria Estrela',
  'Açougue Boi Bravo',
  'Loja Mãe Rainha',
  'Bazar do Bairro',
  'Papelaria Central',
  'Casa das Tintas',
  'Distribuidora Sol',
] as const
const DOCUMENT_IDS = RECIPIENTS.map(
  (_, index) => `00000000-0000-4000-8000-0000000009${String(10 + index)}`,
)
const NUMBERS = RECIPIENTS.map((_, index) => String(9000 + index))

/** Chave de 44 dígitos com o DV em módulo 11 — o parser da identificação recusa DV errado. */
function buildAccessKey(nfeNumber: string): string {
  const base = `352607112223330001815500${'1'}${nfeNumber.padStart(9, '0')}112345678`
  const weights = [...base].reverse().map((digit, index) => Number(digit) * ((index % 8) + 2))
  const remainder = weights.reduce((sum, value) => sum + value, 0) % 11
  const checkDigit = remainder < 2 ? 0 : 11 - remainder
  return `${base}${checkDigit}`
}

const ACCESS_KEYS = NUMBERS.map(buildAccessKey)

function accessKeyAt(index: number): string {
  return ACCESS_KEYS[index] ?? ''
}
const OFF_TRIP_ACCESS_KEY = buildAccessKey('777777')
const BARCODE_VIDEO_PATH = writeFieldDeliveryBarcodeVideo(accessKeyAt(0), {
  height: 720,
  width: 1280,
})

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

const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ headers: CORS, status: 204 })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS,
    status,
  })
}

function tripDocument(index: number) {
  return {
    contact: {
      contractorName: null,
      name: RECIPIENTS[index] ?? '',
      phone: null,
      taxId: '11222333000181',
    },
    createdAt: '2026-09-18T08:00:00.000Z',
    cteAuthorized: true,
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: 'authorized',
    freightCalculationId: null,
    id: DOCUMENT_IDS[index] ?? '',
    loadedAt: '2026-09-18T08:30:00.000Z',
    nfeDocumentId: `${DOCUMENT_IDS[index] ?? ''}-nfe`,
    nfeNumber: NUMBERS[index] ?? '',
    nfeSeries: '1',
    releasedAt: null,
    returnedAt: null,
    returnReason: null,
    separatedAt: '2026-09-18T08:10:00.000Z',
    separationStatus: 'separated',
    stopId: STOP_ID,
    tripId: TRIP_ID,
    updatedAt: '2026-09-18T08:30:00.000Z',
  }
}

const DOCUMENTS = RECIPIENTS.map((_, index) => tripDocument(index))

const TRIP_DETAIL = {
  amounts: null,
  cargoLayout: null,
  cargoWeight: null,
  companyId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-09-18T07:00:00.000Z',
  documents: DOCUMENTS,
  driverNames: ['João Pereira', 'Carlos Souza'],
  drivers: [
    { driverId: DRIVER_ID, driverName: 'João Pereira', driverTaxId: '12345678901', position: 1 },
    {
      driverId: OTHER_DRIVER_ID,
      driverName: 'Carlos Souza',
      driverTaxId: '12345678902',
      position: 2,
    },
  ],
  estimatedArrivalFrozenAt: null,
  estimatedFinishAt: null,
  id: TRIP_ID,
  occupancy: null,
  requiresMdfe: null,
  requiresMdfeReason: null,
  status: 'on_delivery_route',
  stops: [
    {
      addressKey: 'campinas-13010-100',
      arrivedAt: null,
      completedAt: null,
      deliveryWindowEnd: null,
      deliveryWindowStart: null,
      documents: DOCUMENTS,
      id: STOP_ID,
      label: 'Campinas/SP',
      sequence: 1,
    },
  ],
  updatedAt: '2026-09-18T09:00:00.000Z',
  vehicleId: '00000000-0000-4000-8000-000000000802',
}

type ScenarioOptions = Readonly<{
  denyCamera?: boolean
  failDocumentId?: string
  ocrEnabled?: boolean
  slowSend?: boolean
}>

async function registerFieldOfficeMocks(page: Page, options: ScenarioOptions): Promise<void> {
  await page.route(/\/trips\/[^/]+\/allowed-actions$/, (route) =>
    fulfillJson(route, {
      data: {
        documents: Object.fromEntries(
          DOCUMENT_IDS.map((id) => [id, ['fieldDelivery', 'fieldOccurrence']]),
        ),
        stops: { [STOP_ID]: ['arrive', 'occurrence'] },
        trip: ['startRoute'],
      },
    }),
  )
  await page.route(/\/trips\/occurrence-types\/field$/, (route) =>
    fulfillJson(route, {
      data: [
        { id: 'type-1', name: 'Cliente ausente' },
        { id: 'type-2', name: 'Avaria na mercadoria' },
        { id: 'type-3', name: 'Endereço não localizado' },
      ],
    }),
  )
  await page.route(/\/trips\/[^/]+$/, (route) => fulfillJson(route, { data: TRIP_DETAIL }))
  await page.route(/\/trips\/field-delivery-settings$/, (route) =>
    fulfillJson(route, { data: { canhotoOcrEnabled: options.ocrEnabled === true } }),
  )
  await page.route(/\/trips\/[^/]+\/field-delivery-documents$/, (route) =>
    fulfillJson(route, {
      data: {
        documents: DOCUMENTS.map((document, index) => ({
          accessKey: accessKeyAt(index) ?? null,
          id: document.id,
          nfeNumber: document.nfeNumber,
          nfeSeries: '1',
          releasedAt: null,
        })),
      },
    }),
  )
  const failedOnce = new Set<string>()
  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/field-delivery$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS, status: 204 })
      return
    }
    const documentId = route
      .request()
      .url()
      .match(/documents\/([^/]+)\/field-delivery$/u)?.[1]
    if (options.slowSend === true) await new Promise((done) => setTimeout(done, 60_000))
    if (documentId === options.failDocumentId && !failedOnce.has(documentId ?? '')) {
      failedOnce.add(documentId ?? '')
      await route.abort('failed')
      return
    }
    await fulfillJson(
      route,
      {
        data: {
          alreadySettled: false,
          id: `${documentId ?? ''}-event`,
          proofId: `${documentId ?? ''}-proof`,
          stopCompleted: false,
          tripCompleted: false,
        },
      },
      201,
    )
  })
  if (options.denyCamera === true) {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    })
  }
}

async function openTrip(
  input: Readonly<{ options?: ScenarioOptions; page: Page; theme: Theme; viewport: Viewport }>,
): Promise<void> {
  const { page } = input
  await page.setViewportSize(VIEWPORTS[input.viewport])
  await page.emulateMedia({ colorScheme: THEMES[input.theme] })
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: ['trip.read', 'trip.manage', 'trip.report-on-behalf', 'settings.manage'],
  })
  await mockTripTimelineApi(page)
  await registerFieldOfficeMocks(page, input.options ?? {})
  await loginAsLocalUser(page)
  await page.evaluate((tripId) => {
    window.history.pushState({}, '', `/trips/${tripId}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, TRIP_ID)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

function printPath(
  name: string,
  combination: Readonly<{ theme: Theme; viewport: Viewport }>,
): string {
  return resolve(
    PRINTS_DIRECTORY,
    `${PRINT_PREFIX}-${name}-${combination.viewport}-${combination.theme}.png`,
  )
}

/** Toque (`web.md` §10): todo controle visível do diálogo com menos de 44 px de altura. */
async function listSmallTouchTargets(scope: Locator): Promise<readonly string[]> {
  return scope.evaluate((root) =>
    [...root.querySelectorAll('button, a, input, textarea, [role=button], [role=combobox]')]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height < 44)
      .map(
        ({ element, rect }) =>
          `${element.tagName} "${(element.textContent ?? '').trim() || (element.getAttribute('aria-label') ?? '')}" ${String(Math.round(rect.width))}x${String(Math.round(rect.height))}`,
      ),
  )
}

async function recordAudit(page: Page, scope: Locator): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  test.info().annotations.push(
    { description: overflow ? 'SIM' : 'não', type: 'horizontal-overflow' },
    {
      description: (await listSmallTouchTargets(scope)).join(' | '),
      type: 'small-touch-targets',
    },
  )
}

/** PNG gerado no próprio navegador — código de barras sintético, texto ou folha em branco. */
async function renderCanhotoPng(
  page: Page,
  input: Readonly<{ accessKey?: string; text?: readonly string[] }>,
): Promise<Buffer> {
  const frame =
    input.accessKey === undefined ? undefined : buildAccessKeyBarcodeFrame(input.accessKey)
  const base64 = await page.evaluate(
    ({ barcode, text }) => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(barcode?.width ?? 0, 900) + 80
      canvas.height = 360
      const context = canvas.getContext('2d') as CanvasRenderingContext2D
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      if (barcode !== undefined) {
        const image = context.createImageData(barcode.width, barcode.height)
        barcode.luminance.forEach((value, index) => {
          image.data.set([value, value, value, 255], index * 4)
        })
        context.putImageData(image, 40, 100)
      }
      context.fillStyle = '#000000'
      context.font = '40px monospace'
      ;(text ?? []).forEach((line, index) => context.fillText(line, 40, 80 + index * 70))
      return canvas.toDataURL('image/png').split(',')[1] ?? ''
    },
    {
      barcode:
        frame === undefined
          ? undefined
          : { height: frame.height, luminance: [...frame.luminance], width: frame.width },
      text: input.text,
    },
  )
  return Buffer.from(base64, 'base64')
}

async function openWizard(page: Page, count: number = RECIPIENTS.length): Promise<Locator> {
  await page.getByRole('checkbox', { name: /Selecionar todas as notas da parada/u }).check()
  if (count < RECIPIENTS.length) {
    const rows = page.getByRole('checkbox', { name: /Selecionar a nota/u })
    for (let index = count; index < RECIPIENTS.length; index += 1) await rows.nth(index).uncheck()
  }
  await page.getByRole('button', { name: `Dar baixa em ${String(count)} notas` }).click()
  const dialog = page.getByRole('dialog', { name: 'Baixa com canhoto' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function uploadCanhoto(page: Page, dialog: Locator, png: Buffer): Promise<void> {
  const uploadButton = dialog.getByRole('button', { name: 'Enviar arquivo' })
  if ((await uploadButton.count()) > 0) await uploadButton.click()
  await dialog.locator('input[type=file]').setInputFiles({
    buffer: png,
    mimeType: 'image/png',
    name: 'canhoto.png',
  })
}

async function waitForCameraFrame(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const video = document.querySelector('video')
    return video !== null && video.videoWidth > 0
  })
}

for (const combination of COMBINATIONS) {
  const label = `${combination.viewport} ${combination.theme}`

  test(`painel Ações de campo e vizinhos — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    const heading = page.getByRole('heading', { name: /Ações de campo/u })
    await heading.scrollIntoViewIfNeeded()
    const panel = page.locator('[class*="_panel_"]', { has: heading }).last()
    await recordAudit(page, panel)
    await panel.screenshot({ path: printPath('acoes-de-campo', combination) })
  })

  test(`diálogo Chegou em — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    await page.getByRole('button', { exact: true, name: 'Registrar chegada' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await recordAudit(page, dialog)
    await page.screenshot({ path: printPath('chegada', combination) })
  })

  test(`ocorrência de parada — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    await page.getByRole('button', { exact: true, name: 'Registrar ocorrência' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await recordAudit(page, dialog)
    await page.screenshot({ path: printPath('ocorrencia-parada', combination) })
  })

  test(`ocorrência em lote — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    await page.getByRole('checkbox', { name: /Selecionar todas as notas da parada/u }).check()
    await page.getByRole('button', { name: 'Ocorrência em 10 notas' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await recordAudit(page, dialog)
    await page.screenshot({ path: printPath('ocorrencia-lote', combination) })
  })

  test(`assistente: captura com a faixa da nota — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    const dialog = await openWizard(page)
    await waitForCameraFrame(page)
    await recordAudit(page, dialog)
    await page.screenshot({ path: printPath('captura', combination) })
  })

  test(`assistente: conferência confirmada — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    const dialog = await openWizard(page)
    await uploadCanhoto(page, dialog, await renderCanhotoPng(page, { accessKey: accessKeyAt(0) }))
    await expect(dialog.getByRole('button', { name: 'Confirmar' })).toBeVisible()
    await recordAudit(page, dialog)
    await page.screenshot({ path: printPath('conferencia-confirmada', combination) })
  })

  test(`assistente: canhoto de outra nota do lote — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    const dialog = await openWizard(page)
    await uploadCanhoto(page, dialog, await renderCanhotoPng(page, { accessKey: accessKeyAt(2) }))
    await expect(dialog.getByRole('button', { name: 'Confirmar' })).toBeVisible()
    await page.screenshot({ path: printPath('conferencia-outra-nota', combination) })
  })

  test(`assistente: canhoto fora da viagem — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    const dialog = await openWizard(page)
    await uploadCanhoto(
      page,
      dialog,
      await renderCanhotoPng(page, { accessKey: OFF_TRIP_ACCESS_KEY }),
    )
    await expect(dialog.getByRole('alert')).toBeVisible()
    await page.screenshot({ path: printPath('bloqueio', combination) })
  })

  test(`assistente: sem código de barras (manual) — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    const dialog = await openWizard(page)
    await uploadCanhoto(
      page,
      dialog,
      await renderCanhotoPng(page, { text: ['Recebi a mercadoria'] }),
    )
    await expect(dialog.getByRole('button', { name: 'Confirmar' })).toBeVisible()
    await page.screenshot({ path: printPath('conferencia-manual', combination) })
  })

  test(`assistente: sugestão do OCR — ${label}`, async ({ page }) => {
    test.setTimeout(90_000)
    await openTrip({ options: { ocrEnabled: true }, page, ...combination })
    const dialog = await openWizard(page)
    await uploadCanhoto(
      page,
      dialog,
      await renderCanhotoPng(page, { text: ['NF-e No 000.009.000', 'SERIE 1'] }),
    )
    await expect(dialog.getByRole('button', { name: 'Confirmar' })).toBeVisible({ timeout: 60_000 })
    await page.screenshot({ path: printPath('sugestao-ocr', combination) })
  })

  test(`assistente: câmera negada — ${label}`, async ({ page }) => {
    await openTrip({ options: { denyCamera: true }, page, ...combination })
    const dialog = await openWizard(page)
    await expect(dialog.getByRole('alert')).toBeVisible()
    await recordAudit(page, dialog)
    await page.screenshot({ path: printPath('camera-negada', combination) })
  })

  test(`assistente: resumo, envio com falha parcial e repetição — ${label}`, async ({ page }) => {
    await openTrip({ options: { failDocumentId: DOCUMENT_IDS[1] ?? '' }, page, ...combination })
    const dialog = await openWizard(page, 4)
    await dialog.getByRole('button', { name: 'Pular nota' }).click()
    for (let step = 1; step < 4; step += 1) {
      await uploadCanhoto(
        page,
        dialog,
        await renderCanhotoPng(page, { accessKey: accessKeyAt(step) }),
      )
      await dialog.getByRole('button', { name: 'Confirmar' }).click()
    }
    await expect(dialog.getByRole('button', { name: 'Enviar 3 notas' })).toBeVisible()
    await recordAudit(page, dialog)
    await page.screenshot({ path: printPath('resumo', combination) })

    await dialog.getByRole('button', { name: 'Enviar 3 notas' }).click()
    await expect(dialog.getByText('1 nota falhou')).toBeVisible()
    await recordAudit(page, dialog)
    await page.screenshot({ path: printPath('envio-falha-parcial', combination) })

    await dialog.getByRole('button', { name: /Tentar de novo/u }).click()
    await expect(dialog.getByText('3 notas entregues')).toBeVisible()
    await page.screenshot({ path: printPath('envio-sucesso', combination) })
  })

  test(`assistente: fechar com fotos tiradas — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    const dialog = await openWizard(page)
    await uploadCanhoto(page, dialog, await renderCanhotoPng(page, { accessKey: accessKeyAt(0) }))
    await dialog.getByRole('button', { name: 'Confirmar' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /Sair do assistente/u })).toBeVisible()
    await page.screenshot({ path: printPath('fechar-com-fotos', combination) })
  })

  test(`linha do tempo com a autoria — ${label}`, async ({ page }) => {
    await openTrip({ page, ...combination })
    const section = page.getByRole('region', { name: 'Linha do tempo' })
    await section.scrollIntoViewIfNeeded()
    await section.screenshot({ path: printPath('linha-do-tempo', combination) })
  })

  test(`painel do OCR no Comprovante — ${label}`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[combination.viewport])
    await page.emulateMedia({ colorScheme: THEMES[combination.theme] })
    await page.addInitScript(() => sessionStorage.setItem('transportada.workspace', 'trip'))
    await mockTripWorkspaceApi({
      mode: 'all-authorized',
      page,
      permissions: ['fleet.read', 'trip.read', 'trip.manage', 'settings.manage'],
    })
    await page.route(/\/company-settings\/delivery-proof(\/overrides)?$/, (route) =>
      fulfillJson(route, {
        data: route.request().url().endsWith('/overrides')
          ? { overrides: [] }
          : {
              canhotoOcrEnabled: false,
              latePenaltyPoints: 5,
              missingAfterHours: 24,
              missingPenaltyPoints: 10,
              photo: 'optional',
              proofRadiusMeters: 300,
              proofWindowMinutes: 60,
              receiverDocument: 'off',
              receiverName: 'optional',
              signature: 'optional',
            },
      }),
    )
    await loginAsLocalUser(page)
    await page.getByRole('tab', { name: 'Comprovante' }).click()
    const panel = page.locator('section', { hasText: 'Leitura do canhoto por foto' }).last()
    await expect(panel.getByRole('button', { name: /Ligar a leitura/u })).toBeVisible()
    await recordAudit(page, panel)
    await panel.screenshot({ path: printPath('painel-ocr', combination) })
  })
}

/**
 * Usabilidade (T16): o caminho do teclado no desktop — Enter captura, Enter confirma quando o
 * código de barras bateu, e o foco nunca cai no `<body>` entre uma nota e outra (senão o Enter e o
 * Esc param de chegar ao diálogo). A câmera falsa repete sempre o canhoto da primeira nota: na
 * segunda, a leitura aponta "outra nota do lote", e o foco tem de ir ao seletor, não ao Confirmar.
 */
test('teclado: Enter captura e confirma, o foco segue a ação do passo e o Esc pergunta', async ({
  page,
}) => {
  await openTrip({ page, theme: 'escuro', viewport: 'desktop' })
  const dialog = await openWizard(page)
  await waitForCameraFrame(page)
  const focusedText = (): Promise<string> =>
    page.evaluate(() => (document.activeElement?.textContent ?? '').trim())

  expect(await focusedText()).toBe('Capturar')
  await page.keyboard.press('Enter')
  await expect(dialog.getByText('Código de barras lido: é a nota esperada.')).toBeVisible()
  expect(await focusedText()).toBe('Confirmar')
  await page.keyboard.press('Enter')

  await expect(dialog.getByText('Nota 2 de 10')).toBeVisible()
  await waitForCameraFrame(page)
  expect(await focusedText()).toBe('Capturar')
  await page.keyboard.press('Enter')
  await expect(dialog.getByText(/outra nota do lote/u)).toBeVisible()
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup') ?? ''),
  ).toBe('listbox')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /Sair do assistente/u })).toBeVisible()
  test.info().annotations.push({
    description: 'nota conferida pelo código de barras = 2 teclas (Enter, Enter)',
    type: 'keyboard-cost-per-note',
  })
})
