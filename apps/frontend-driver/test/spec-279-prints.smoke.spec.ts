/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 279 T6: o smoke e os prints do "Enviar ao cliente" no app do motorista, em 375 px — botão no cartão da
 * ocorrência e na conversa, folha com e-mails guardados, "Adicionar e-mail" (só enviar / enviar e guardar), resultado,
 * envio sem sinal (fila com a mesma chave) e tipo `off` sem botão. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-279-prints.smoke.spec.ts` e grava os PNGs em `PRINTS_DIRECTORY` (padrão: a pasta da spec).
 *
 * A API é dublada por `page.route`: a viagem, `/route-occurrences` e as rotas `client-boleto-emails` são deste arquivo;
 * as conversas vêm da API de demonstração do app.
 */
import type { ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { PREVIEW_OCCURRENCE_IDS } from '../scripts/driver-preview-conversations-seed'
import { registerInstallationBrandMock } from './installation-brand-smoke.helper'
import { registerNotificationMocks } from './notification-smoke.helper'
import { resetDemo, routeApiToDemo, startDemoApi } from './conversation-smoke.helper'
import {
  DRIVER_ACCESS_KEY,
  DRIVER_DOCUMENT_ID,
  DRIVER_STOP_ID,
  mockDriverTripApi,
} from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY =
  process.env.PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/279-o-cliente-tem-email-para-receber-boleto/prints')
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

const BOLETO_PHRASE = (at: string) => ({
  actorKind: 'system',
  at,
  note: null,
  phraseKey: 'contractor_reply_delivered',
})

/** O boleto da contratante entregue (com botão), um tipo sem boleto e o do chat da demonstração (também entregue). */
const OCCURRENCES: readonly OccurrenceFixture[] = [
  {
    documentCount: 1,
    documentId: DRIVER_DOCUMENT_ID,
    documentNumber: NOTE_NUMBER,
    iconName: 'invoice',
    id: occurrenceId(1),
    recordedAt: recordedAt(5),
    resolution: BOLETO_PHRASE(recordedAt(40)),
    state: 'resolved',
    stopId: DRIVER_STOP_ID,
    stopSequence: 1,
    typeId: 'type-boleto',
    typeName: 'Boleto da contratante',
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
    conversationExists: true,
    documentCount: 1,
    documentId: SECOND_DOCUMENT_ID,
    documentNumber: SECOND_NOTE_NUMBER,
    iconName: 'invoice',
    id: PREVIEW_OCCURRENCE_IDS.damage,
    recordedAt: recordedAt(30),
    resolution: BOLETO_PHRASE(recordedAt(58)),
    state: 'resolved',
    stopId: DRIVER_STOP_ID,
    stopSequence: 1,
    typeId: 'type-boleto-2',
    typeName: 'Boleto · Mercado Sol',
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
  emailsStatus: { current: number }
  sendBodies: unknown[]
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

  const emailsStatus = { current: 200 }
  const sendBodies: unknown[] = []
  await page.route(
    /\/me\/trips\/current\/occurrences\/[^/]+\/client-boleto-emails(\/send)?$/u,
    async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ headers: CORS_HEADERS, status: 204 })
        return
      }
      if (emailsStatus.current !== 200) {
        await fulfillJson(
          route,
          { error: { code: 'OCCURRENCE_CLIENT_EMAIL_OFF' } },
          emailsStatus.current,
        )
        return
      }
      if (request.method() === 'GET') {
        await fulfillJson(route, {
          data: {
            clientEmailType: 'boleto',
            clientEmails: [
              { addressMasked: 'fi***@mercadosol.com.br', emailId: 'e1', label: 'Financeiro' },
              { addressMasked: 'co***@mercadosol.com.br', emailId: 'e2', label: 'Compras' },
            ],
            sentCount: 1,
            sentLimit: 5,
          },
        })
        return
      }
      const body = request.postDataJSON() as {
        emailIds?: string[]
        newAddress?: string
        save?: boolean
      }
      sendBodies.push(body)
      const results = [
        ...(body.emailIds ?? []).map((id) => ({
          addressMasked: id === 'e1' ? 'fi***@mercadosol.com.br' : 'co***@mercadosol.com.br',
          emailId: id,
          kind: 'queued',
        })),
        ...(body.newAddress === undefined
          ? []
          : [{ addressMasked: 'no***@loja.com.br', emailId: null, kind: 'queued' }]),
      ]
      await fulfillJson(
        route,
        { data: { results, savedEmailId: body.save === true ? 'e3' : null } },
        201,
      )
    },
  )

  return {
    emailsStatus,
    sendBodies,
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

const KEYCLOAK_BASE = 'http://localhost:58080/realms/transportada-local'
const KEYCLOAK_CORS = {
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-credentials': 'true',
  'access-control-allow-origin': `http://localhost:${process.env.PLAYWRIGHT_DRIVER_PORT ?? '53112'}`,
}

function fakeJwt(claims: Readonly<Record<string, unknown>>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`
}

/**
 * O Keycloak do realm local não existe no ambiente dos prints: o login é dublado por `page.route` — descoberta,
 * autorização (302 de volta com `code`) e token (JWT sem assinatura, que o keycloak-js só decodifica). O que está
 * sob prova é a tela do app, não o Keycloak.
 */
async function loginWithMockedKeycloak(page: Page): Promise<void> {
  let nonce = ''
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'transportada.smoke-auth-me',
      JSON.stringify({ data: { roles: ['driver'] } }),
    )
  })
  await registerNotificationMocks(page)
  await registerInstallationBrandMock(page)
  await page.route(`${KEYCLOAK_BASE}/.well-known/openid-configuration`, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        authorization_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/auth`,
        end_session_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/logout`,
        issuer: KEYCLOAK_BASE,
        jwks_uri: `${KEYCLOAK_BASE}/protocol/openid-connect/certs`,
        token_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/token`,
        userinfo_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/userinfo`,
      }),
      contentType: 'application/json',
      headers: KEYCLOAK_CORS,
    })
  })
  await page.route(/\/protocol\/openid-connect\/auth\?/u, async (route) => {
    const url = new URL(route.request().url())
    nonce = url.searchParams.get('nonce') ?? ''
    const redirect = url.searchParams.get('redirect_uri') ?? ''
    const separator = url.searchParams.get('response_mode') === 'query' ? '?' : '#'
    const state = url.searchParams.get('state') ?? ''
    await route.fulfill({
      headers: {
        location: `${redirect}${separator}state=${state}&session_state=mock&iss=${encodeURIComponent(KEYCLOAK_BASE)}&code=mock-code`,
      },
      status: 302,
    })
  })
  await page.route(`${KEYCLOAK_BASE}/protocol/openid-connect/token`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: KEYCLOAK_CORS, status: 204 })
      return
    }
    const now = Math.floor(Date.now() / 1000)
    const claims = {
      aud: 'transportada-spa',
      azp: 'transportada-spa',
      exp: now + 3600,
      iat: now,
      iss: KEYCLOAK_BASE,
      nonce,
      preferred_username: 'local-user',
      realm_access: { roles: ['driver'] },
      sub: 'preview-driver-279',
      typ: 'Bearer',
    }
    await route.fulfill({
      body: JSON.stringify({
        access_token: fakeJwt(claims),
        expires_in: 3600,
        id_token: fakeJwt({ ...claims, typ: 'ID' }),
        refresh_expires_in: 7200,
        refresh_token: fakeJwt({ ...claims, typ: 'Refresh' }),
        token_type: 'Bearer',
      }),
      contentType: 'application/json',
      headers: KEYCLOAK_CORS,
    })
  })

  await page.goto('/')
}

async function openApp(page: Page): Promise<ApiControl> {
  await page.setViewportSize(MOBILE)
  await resetDemo()
  await routeApiToDemo(page)
  await mockDriverTripApi({ page })
  const control = await mockRouteOccurrences(page)
  await loginWithMockedKeycloak(page)
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

const SEND_BUTTON = /^Enviar o boleto ao cliente/u

async function openList(page: Page): Promise<void> {
  await navigateInApp(page, '/ocorrencias')
  await expect(page.getByRole('heading', { level: 1, name: 'Ocorrências da rota' })).toBeVisible()
}

test('cartão da ocorrência: o botão só aparece com o boleto entregue', async ({ page }) => {
  await openApp(page)
  await openList(page)
  await expect(page.getByRole('button', { name: SEND_BUTTON })).toHaveCount(2)
  await expect(page.getByText('Boleto da contratante', { exact: true })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  await shoot(page, '1-cartao-com-botao-enviar-ao-cliente-375.png')
})

test('folha: escolher guardados, adicionar e-mail e enviar e guardar', async ({ page }) => {
  const control = await openApp(page)
  await openList(page)
  await page.getByRole('button', { name: SEND_BUTTON }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Enviar o boleto ao cliente' })
  await expect(sheet.getByText('fi***@mercadosol.com.br')).toBeVisible()
  await expect(sheet.getByText('Enviados: 1 de 5')).toBeVisible()
  await sheet.getByRole('checkbox').first().check()
  await shoot(page, '2-folha-com-emails-guardados-375.png')

  await sheet.getByRole('button', { name: 'Adicionar e-mail' }).click()
  await sheet.getByLabel('E-mail do cliente').fill('novo@loja.com.br')
  await sheet.getByRole('radio', { name: 'Enviar e guardar para o cliente' }).check()
  await shoot(page, '3-adicionar-email-enviar-e-guardar-375.png')

  await sheet.getByRole('button', { name: 'Enviar boleto' }).click()
  await expect(sheet.getByText('E-mail guardado para o cliente.')).toBeVisible()
  expect(control.sendBodies).toHaveLength(1)
  expect(control.sendBodies[0]).toMatchObject({
    emailIds: ['e1'],
    newAddress: 'novo@loja.com.br',
    save: true,
  })
  expect(control.sendBodies[0]).toHaveProperty('idempotencyKey')
  await shoot(page, '4-resultado-do-envio-375.png')
})

test('folha: só enviar não guarda e e-mail inválido é barrado antes da API', async ({ page }) => {
  const control = await openApp(page)
  await openList(page)
  await page.getByRole('button', { name: SEND_BUTTON }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Enviar o boleto ao cliente' })
  await sheet.getByRole('button', { name: 'Adicionar e-mail' }).click()
  await sheet.getByLabel('E-mail do cliente').fill('sem-arroba')
  await sheet.getByRole('button', { name: 'Enviar boleto' }).click()
  await expect(sheet.getByRole('alert')).toContainText('Confira o e-mail')
  expect(control.sendBodies).toHaveLength(0)
  await shoot(page, '5-email-invalido-375.png')

  await sheet.getByLabel('E-mail do cliente').fill('so@loja.com.br')
  await sheet.getByRole('button', { name: 'Enviar boleto' }).click()
  await expect(sheet.getByText('no***@loja.com.br · Enviado')).toBeVisible()
  expect(control.sendBodies[0]).toMatchObject({ newAddress: 'so@loja.com.br' })
  expect(control.sendBodies[0]).not.toHaveProperty('save')
})

test('sem sinal: o envio entra na fila e sai uma vez só, com a mesma chave', async ({
  context,
  page,
}) => {
  const control = await openApp(page)
  await openList(page)
  await page.getByRole('button', { name: SEND_BUTTON }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Enviar o boleto ao cliente' })
  await sheet.getByRole('checkbox').first().check()
  await context.setOffline(true)
  await expect(sheet.getByText('Sem sinal: o envio entra na fila')).toBeVisible()
  await sheet.getByRole('button', { name: 'Enviar boleto' }).click()
  await expect(sheet.getByText(/^Na fila:/u)).toBeVisible()
  expect(control.sendBodies).toHaveLength(0)
  await shoot(page, '6-sem-sinal-na-fila-375.png')

  await context.setOffline(false)
  await expect.poll(() => control.sendBodies.length, { timeout: 20_000 }).toBe(1)
  await page.waitForTimeout(1500)
  expect(control.sendBodies).toHaveLength(1)
  expect(control.sendBodies[0]).toMatchObject({ emailIds: ['e1'] })
})

test('tipo off: a API recusa com 409 e o botão some', async ({ page }) => {
  const control = await openApp(page)
  control.emailsStatus.current = 409
  await openList(page)
  await expect(page.getByText('Boleto da contratante', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: SEND_BUTTON })).toHaveCount(0)
  await shoot(page, '7-tipo-off-sem-botao-375.png')
})

test('conversa: o botão aparece na faixa do cabeçalho da conversa', async ({ page }) => {
  await openApp(page)
  await navigateInApp(page, `/conversas/occurrence/${PREVIEW_OCCURRENCE_IDS.damage}`)
  await expect(page.getByRole('button', { name: SEND_BUTTON })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  await shoot(page, '8-conversa-com-botao-375.png')
  await page.getByRole('button', { name: SEND_BUTTON }).click()
  await expect(page.getByRole('dialog', { name: 'Enviar o boleto ao cliente' })).toBeVisible()
  await shoot(page, '9-conversa-folha-aberta-375.png')
})
