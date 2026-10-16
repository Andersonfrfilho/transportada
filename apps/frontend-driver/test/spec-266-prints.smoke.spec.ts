/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 266 T5.1 (`web.md` §15): o smoke e os prints das ocorrências da rota no app do motorista, em
 * 375 px — alerta no cabeçalho, ícones por nota no cartão da parada, lista, detalhe, chat da ocorrência
 * resolvida com o "Reabrir" e a viagem encerrada. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-266-prints.smoke.spec.ts` e grava os PNGs ao lado da spec 266.
 *
 * A API é dublada por `page.route`: a viagem e as rotas `/me/trips/current/route-occurrences/**` são deste
 * arquivo; as conversas vêm da API de demonstração do app (`scripts/driver-preview-api.ts`), na porta
 * própria do smoke, e a ocorrência `damage` dela é a que a lista da rota devolve como resolvida.
 */
import type { ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { PREVIEW_OCCURRENCE_IDS } from '../scripts/driver-preview-conversations-seed'
import { loginAsLocalUser } from './authenticated-smoke.helper'
import { resetDemo, routeApiToDemo, startDemoApi } from './conversation-smoke.helper'
import {
  DRIVER_ACCESS_KEY,
  DRIVER_DOCUMENT_ID,
  DRIVER_STOP_ID,
  mockDriverTripApi,
} from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/266-o-motorista-acompanha-as-ocorrencias-da-rota/prints',
)
const MOBILE = { height: 812, width: 375 } as const
const TRIP_ID = '00000000-0000-4000-8000-000000000100'
const SECOND_DOCUMENT_ID = '00000000-0000-4000-8000-000000000103'
const SECOND_STOP_ID = '00000000-0000-4000-8000-000000000111'
const THIRD_DOCUMENT_ID = '00000000-0000-4000-8000-000000000113'
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-origin': '*',
}
const NOTE_NUMBER = '900123'
const SECOND_NOTE_NUMBER = '900124'

type OccurrenceFixture = Readonly<{
  conversationExists?: boolean
  documentCount?: number
  documentId: string | null
  documentNumber: string | null
  id: string
  iconName?: string
  recordedAt: string
  reopenedAt?: string
  resolution?: Readonly<Record<string, unknown>>
  state: 'cancelled' | 'open' | 'resolved'
  stopId: string
  stopSequence: number
  typeId: string
  typeName: string
}>

function occurrenceId(sequence: number): string {
  return `00000000-0000-4000-8000-0000000003${String(sequence).padStart(2, '0')}`
}

function recordedAt(minutesAfterNine: number): string {
  return new Date(Date.UTC(2026, 9, 15, 12, minutesAfterNine)).toISOString()
}

/** Cinco na nota 900123 (o "+N" do cartão), duas delas do mesmo tipo; a resolvida com conversa e mensagens novas é do chat. */
const OCCURRENCES: readonly OccurrenceFixture[] = [
  {
    documentCount: 2,
    documentId: DRIVER_DOCUMENT_ID,
    documentNumber: NOTE_NUMBER,
    iconName: 'package',
    id: occurrenceId(1),
    recordedAt: recordedAt(5),
    state: 'open',
    stopId: DRIVER_STOP_ID,
    stopSequence: 1,
    typeId: 'type-damage',
    typeName: 'Avaria na carga',
  },
  {
    documentId: DRIVER_DOCUMENT_ID,
    documentNumber: NOTE_NUMBER,
    iconName: 'package',
    id: occurrenceId(2),
    recordedAt: recordedAt(9),
    state: 'open',
    stopId: DRIVER_STOP_ID,
    stopSequence: 1,
    typeId: 'type-damage',
    typeName: 'Avaria na carga',
  },
  {
    documentId: DRIVER_DOCUMENT_ID,
    documentNumber: NOTE_NUMBER,
    iconName: 'clock',
    id: occurrenceId(3),
    recordedAt: recordedAt(14),
    resolution: {
      actorKind: 'system',
      at: recordedAt(40),
      note: null,
      phraseKey: 'case_closed',
    },
    state: 'resolved',
    stopId: DRIVER_STOP_ID,
    stopSequence: 1,
    typeId: 'type-absent',
    typeName: 'Cliente ausente',
  },
  {
    documentId: DRIVER_DOCUMENT_ID,
    documentNumber: NOTE_NUMBER,
    iconName: 'money',
    id: occurrenceId(4),
    recordedAt: recordedAt(18),
    reopenedAt: recordedAt(50),
    state: 'open',
    stopId: DRIVER_STOP_ID,
    stopSequence: 1,
    typeId: 'type-charge',
    typeName: 'Cobrança inesperada',
  },
  {
    documentId: DRIVER_DOCUMENT_ID,
    documentNumber: NOTE_NUMBER,
    iconName: 'document',
    id: occurrenceId(5),
    recordedAt: recordedAt(22),
    resolution: {
      actorKind: 'internal',
      at: recordedAt(55),
      note: 'Cliente aceitou receber amanhã cedo.',
      phraseKey: null,
    },
    state: 'resolved',
    stopId: DRIVER_STOP_ID,
    stopSequence: 1,
    typeId: 'type-other',
    typeName: 'Outro motivo',
  },
  {
    documentId: DRIVER_DOCUMENT_ID,
    documentNumber: NOTE_NUMBER,
    iconName: 'truck',
    id: occurrenceId(6),
    recordedAt: recordedAt(26),
    state: 'open',
    stopId: DRIVER_STOP_ID,
    stopSequence: 1,
    typeId: 'type-vehicle',
    typeName: 'Veículo parado',
  },
  {
    conversationExists: true,
    documentCount: 3,
    documentId: SECOND_DOCUMENT_ID,
    documentNumber: SECOND_NOTE_NUMBER,
    iconName: 'alert',
    id: PREVIEW_OCCURRENCE_IDS.damage,
    recordedAt: recordedAt(30),
    resolution: {
      actorKind: 'internal',
      at: recordedAt(58),
      note: 'Sinistro aberto. Pode seguir viagem.',
      phraseKey: null,
    },
    state: 'resolved',
    stopId: DRIVER_STOP_ID,
    stopSequence: 1,
    typeId: 'type-damage-2',
    typeName: 'Avaria · Mercado Sol',
  },
  {
    documentId: null,
    documentNumber: null,
    iconName: 'truck',
    id: occurrenceId(8),
    recordedAt: recordedAt(33),
    state: 'open',
    stopId: SECOND_STOP_ID,
    stopSequence: 2,
    typeId: 'type-dock',
    typeName: 'Doca interditada',
  },
]

function toListItem(fixture: OccurrenceFixture) {
  return {
    conversation: { exists: fixture.conversationExists === true },
    documentCount: fixture.documentCount ?? 0,
    documentId: fixture.documentId,
    documentNumber: fixture.documentNumber,
    id: fixture.id,
    kind: fixture.documentId === null ? 'stop' : 'document',
    recordedAt: fixture.recordedAt,
    recordedByMe: true,
    reopenedAt: fixture.reopenedAt ?? null,
    reportKey: null,
    resolution: fixture.resolution ?? null,
    state: fixture.state,
    stopId: fixture.stopId,
    stopSequence: fixture.stopSequence,
    type: { iconName: fixture.iconName ?? null, id: fixture.typeId, name: fixture.typeName },
  }
}

const DETAIL_EXTRAS = {
  attachments: [
    {
      contentType: 'application/pdf',
      messageId: '00000000-0000-4000-8000-0000000004a1',
      name: 'laudo-da-avaria.pdf',
      objectId: 'object-attachment-1',
      sizeBytes: 182_400,
    },
  ],
  note: 'Duas caixas amassadas na descarga, lacre intacto.',
  photos: [
    {
      contentType: 'image/jpeg',
      name: 'foto-1.jpg',
      objectId: 'object-photo-1',
      sizeBytes: 90_112,
    },
    {
      contentType: 'image/jpeg',
      name: 'foto-2.jpg',
      objectId: 'object-photo-2',
      sizeBytes: 88_204,
    },
  ],
  signature: {
    contentType: 'image/png',
    name: 'assinatura.png',
    objectId: 'object-signature-1',
    sizeBytes: 4_096,
  },
}

type ApiControl = Readonly<{
  setOccurrences: (next: readonly OccurrenceFixture[]) => void
  setTripFinished: (isFinished: boolean) => void
}>

function buildStop(input: {
  readonly documents: readonly Readonly<{ id: string; number: string; recipient: string }>[]
  readonly id: string
  readonly label: string
  readonly sequence: number
}) {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: input.documents.map((document) => ({
      accessKey: DRIVER_ACCESS_KEY,
      deliveredAt: null,
      grossWeight: '12.50',
      id: document.id,
      number: document.number,
      proofPending: false,
      recipientName: document.recipient,
      returnReason: null,
      separationStatus: 'loaded',
      series: '1',
      totalAmount: '1500.00',
      volumeCount: '3',
    })),
    id: input.id,
    label: input.label,
    latitude: null,
    longitude: null,
    sequence: input.sequence,
  }
}

const TRIP_SNAPSHOT = {
  data: {
    isRegisteredDriver: true,
    pendingProofs: [],
    score: null,
    trips: [
      {
        createdAt: '2026-08-26T12:00:00.000Z',
        id: TRIP_ID,
        status: 'dispatched',
        stops: [
          buildStop({
            documents: [
              { id: DRIVER_DOCUMENT_ID, number: NOTE_NUMBER, recipient: 'Mercearia do Centro' },
              { id: SECOND_DOCUMENT_ID, number: SECOND_NOTE_NUMBER, recipient: 'Padaria Estrela' },
            ],
            id: DRIVER_STOP_ID,
            label: 'Praca da Se, 100',
            sequence: 1,
          }),
          buildStop({
            documents: [
              { id: THIRD_DOCUMENT_ID, number: '900125', recipient: 'Farmácia Bem Estar' },
            ],
            id: SECOND_STOP_ID,
            label: 'Av. Paulista, 1500',
            sequence: 2,
          }),
        ],
        vehiclePlate: 'GCQ8E47',
      },
    ],
  },
}

async function fulfillJson(
  route: Parameters<Parameters<Page['route']>[1]>[0],
  body: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
}

/** A lista, o detalhe e o link assinado da rota; registrado depois dos outros dublês, que ele precede. */
async function mockRouteOccurrences(page: Page): Promise<ApiControl> {
  let occurrences = OCCURRENCES
  let isTripFinished = false
  const tripFinishedBody = { error: { code: 'DRIVER_TRIP_NOT_ACTIVE' } }

  await page.route(/\/me\/trips\/current$/u, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await fulfillJson(route, TRIP_SNAPSHOT)
  })

  await page.route(/\/me\/trips\/current\/route-occurrences(\/.*)?$/u, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    if (isTripFinished) {
      await fulfillJson(route, tripFinishedBody, 404)
      return
    }
    const path = new URL(route.request().url()).pathname
    if (/\/attachments\/[^/]+\/url$/u.test(path)) {
      await fulfillJson(route, { data: { url: 'http://localhost:53912/__conversation-storage/x' } })
      return
    }
    const detail = /\/route-occurrences\/(document|stop)\/([^/]+)$/u.exec(path)
    if (detail === null) {
      await fulfillJson(route, { data: occurrences.map(toListItem) })
      return
    }
    const fixture = occurrences.find((candidate) => candidate.id === detail[2])
    if (fixture === undefined) {
      await fulfillJson(route, { error: { code: 'OCCURRENCE_NOT_FOUND' } }, 404)
      return
    }
    const timeline = [
      { at: fixture.recordedAt, kind: 'recorded' },
      { at: recordedAt(7), kind: 'photo' },
      ...(fixture.resolution === undefined
        ? []
        : [{ at: String(fixture.resolution.at), kind: 'resolution.resolved' }]),
      ...(fixture.reopenedAt === undefined
        ? []
        : [{ at: fixture.reopenedAt, kind: 'resolution.reopened' }]),
    ]
    await fulfillJson(route, {
      data: { ...toListItem(fixture), ...DETAIL_EXTRAS, timeline },
    })
  })

  return {
    setOccurrences: (next) => {
      occurrences = next
    },
    setTripFinished: (next) => {
      isTripFinished = next
    },
  }
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0)
  await page.screenshot({ animations: 'disabled', path: resolve(PRINTS_DIRECTORY, name) })
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
}

async function navigateInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function refetchOnFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('visibilitychange'))
  })
}

async function openApp(page: Page): Promise<ApiControl> {
  await page.setViewportSize(MOBILE)
  await resetDemo()
  await routeApiToDemo(page)
  await mockDriverTripApi({ page })
  const control = await mockRouteOccurrences(page)
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  return control
}

let demoProcess: ChildProcess | undefined

test.beforeAll(async () => {
  demoProcess = await startDemoApi()
})

test.afterAll(() => {
  demoProcess?.kill()
})

const OPEN_ALERT = /ocorrências? em aberto$/u

test('cabeçalho: o alerta conta as em aberto e some quando todas estão resolvidas', async ({
  page,
}) => {
  const control = await openApp(page)
  const alert = page.getByRole('button', { name: OPEN_ALERT })
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAccessibleName('5 ocorrências em aberto')
  await assertNoHorizontalOverflow(page)
  await shoot(page, 'cabecalho-com-alerta-375.png')

  control.setOccurrences(OCCURRENCES.map((fixture) => ({ ...fixture, state: 'resolved' as const })))
  await refetchOnFocus(page)
  await expect(alert).toHaveCount(0)
  await shoot(page, 'cabecalho-sem-alerta-375.png')
})

test('cartão da parada: ícones agrupados por nota, com o "+N" acima de quatro', async ({
  page,
}) => {
  await openApp(page)
  const firstNote = page.locator('[data-group="note"]', { hasText: `NF ${NOTE_NUMBER}` })
  await expect(firstNote).toBeVisible()
  await expect(firstNote.locator('[data-occurrence-icon]')).toHaveCount(3)
  await expect(firstNote.getByRole('button', { name: /^Ver mais 3 ocorrências/u })).toBeVisible()
  const secondNote = page.locator('[data-group="note"]', { hasText: `NF ${SECOND_NOTE_NUMBER}` })
  await expect(secondNote.locator('[data-occurrence-icon]')).toHaveCount(1)
  await expect(firstNote.getByRole('button', { name: /^Avaria na carga/u })).toHaveCount(2)
  await expect(page.locator('[data-group="stop"]')).toHaveCount(1)
  await firstNote.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await assertNoHorizontalOverflow(page)
  await shoot(page, 'cartao-da-parada-icones-por-nota-375.png')
})

test('lista: grupos, filtros por ícone, filtro por nota e compartilhar', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: OPEN_ALERT }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ocorrências da rota' })).toBeVisible()
  await expect(page).toHaveURL(/\/ocorrencias$/u)
  await expect(page.getByText('Em aberto', { exact: true })).toBeVisible()
  await expect(page.getByText('Resolvidas e canceladas', { exact: true })).toBeVisible()
  const filters = page.getByRole('group', { name: 'Filtrar' })
  await expect(filters.getByRole('button', { name: 'Todas: 8' })).toBeVisible()
  await expect(filters.getByRole('button', { name: 'Com documento: 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Compartilhar documentos de/u })).toHaveCount(2)
  await assertNoHorizontalOverflow(page)
  await shoot(page, 'lista-grupos-375.png')

  await filters.getByRole('button', { name: 'Com documento: 2' }).click()
  await expect(page.getByText('Avaria na carga', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Cliente ausente', { exact: true })).toHaveCount(0)
  await shoot(page, 'lista-filtro-com-documento-375.png')

  await filters.getByRole('button', { name: 'Todas: 8' }).click()
  await navigateInApp(page, `/ocorrencias?nota=${DRIVER_DOCUMENT_ID}`)
  await expect(page.getByText(`NF ${NOTE_NUMBER}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver todas' })).toBeVisible()
  await shoot(page, 'lista-filtro-por-nota-375.png')
})

test('detalhe: quadro da resolução, documentos, andamento e as outras da mesma nota', async ({
  page,
}) => {
  await openApp(page)
  await page.getByRole('button', { name: OPEN_ALERT }).click()
  await page
    .getByRole('button', { name: /Cobrança inesperada/u })
    .first()
    .click()
  await expect(page).toHaveURL(new RegExp(`/ocorrencias/document/${occurrenceId(4)}$`, 'u'))
  await expect(page.locator('[data-panel="timeline"]')).toBeVisible()
  await expect(page.getByText('Reaberta', { exact: true })).toBeVisible()
  await expect(page.locator('[data-panel="same-note"]')).toBeVisible()
  await assertNoHorizontalOverflow(page)
  await shoot(page, 'detalhe-aberta-reaberta-375.png')

  await navigateInApp(page, `/ocorrencias/document/${occurrenceId(5)}`)
  const resolution = page.locator('[data-panel="resolution"]')
  await expect(resolution).toContainText('Cliente aceitou receber amanhã cedo.')
  await shoot(page, 'detalhe-resolvida-com-observacao-375.png')

  await navigateInApp(page, `/ocorrencias/document/${occurrenceId(3)}`)
  await expect(page.locator('[data-panel="resolution"]')).toContainText('Encerrada pelo escritório')
  await shoot(page, 'detalhe-resolvida-frase-fixa-375.png')

  await navigateInApp(page, `/ocorrencias/document/${occurrenceId(1)}`)
  await expect(page.getByRole('heading', { name: 'Documentos · 4' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Ver (foto|assinatura|laudo)/u })).toHaveCount(4)
  await expect(
    page.getByRole('button', { name: /^Compartilhar (foto|assinatura|laudo)/u }),
  ).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Compartilhar os 4' })).toBeVisible()
  const siblings = page.locator('[data-panel="same-note"]')
  await expect(siblings).toBeVisible()
  await siblings.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await shoot(page, 'detalhe-irmas-da-mesma-nota-375.png')
  await page
    .locator('[data-panel="registered"]')
    .evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await page
    .getByRole('heading', { name: 'Documentos · 4' })
    .evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await shoot(page, 'detalhe-documentos-ver-compartilhar-375.png')
})

test('chat da ocorrência resolvida: campo travado com "Reabrir"; ao tocar destrava e o envio leva reopen', async ({
  page,
}) => {
  await openApp(page)
  const bodies: unknown[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/conversations\/occurrence\/[^/]+\/messages$/u.test(request.url())
    ) {
      bodies.push(request.postDataJSON())
    }
  })
  await page.locator('nav[aria-label]').getByRole('button', { name: 'Conversas' }).click()
  await page.locator('.cv-p-search__input').fill('Avaria')
  await page.locator('.cv-p-row').click()
  await expect(page).toHaveURL(
    new RegExp(`/conversas/occurrence/${PREVIEW_OCCURRENCE_IDS.damage}$`, 'u'),
  )
  await expect(page.getByText('Ocorrência resolvida. Para escrever, reabra.')).toBeVisible()
  await expect(page.locator('textarea.cv-p-composer__input')).toHaveCount(0)
  await shoot(page, 'chat-resolvida-composer-travado-375.png')

  await page.getByRole('button', { name: 'Reabrir', exact: true }).click()
  const composer = page.locator('textarea.cv-p-composer__input')
  await expect(composer).toBeVisible()
  expect(bodies).toHaveLength(0)
  await shoot(page, 'chat-reaberta-composer-liberado-375.png')

  await composer.fill('Preciso falar sobre o laudo.')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect.poll(() => bodies.length).toBe(1)
  expect(bodies[0]).toMatchObject({ body: 'Preciso falar sobre o laudo.', reopen: true })
})

test('viagem encerrada: a lista e o detalhe dizem "Viagem encerrada"', async ({ page }) => {
  const control = await openApp(page)
  await expect(page.getByRole('button', { name: OPEN_ALERT })).toBeVisible()
  control.setTripFinished(true)
  const finishedResponse = page.waitForResponse(
    (response) => response.url().endsWith('/route-occurrences') && response.status() === 404,
  )
  await refetchOnFocus(page)
  await finishedResponse
  await navigateInApp(page, '/ocorrencias')
  await expect(page.getByText('Viagem encerrada', { exact: true })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  await shoot(page, 'lista-viagem-encerrada-375.png')

  await navigateInApp(page, `/ocorrencias/document/${occurrenceId(1)}`)
  await expect(page.getByText('Viagem encerrada', { exact: true })).toBeVisible()
  await shoot(page, 'detalhe-viagem-encerrada-375.png')
})
