/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T5.3 (RF12, RF17): o áudio na conversa por assunto do painel — gravar e enviar, ver a
 * transcrição (com o aviso de máquina), desligar em Configurações e ver só o player. Microfone falso do
 * Chromium (`--use-fake-device-for-media-stream`). Fora do smoke da CI, como os outros da 183/263: rode com
 * `PLAYWRIGHT_TEST_MATCH=spec-264-audio.smoke.spec.ts bun run smoke`.
 */
import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { COMPANY_SETTINGS_RESPONSE } from './company-settings/company-settings.fixture'
import { AUTHORIZED_DOCUMENT_ID, mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}
const PERMISSIONS = ['fleet.read', 'trip.manage', 'settings.manage'] as const
const MAX_DURATION_MS = 600_000
const UPLOAD_ID = '00000000-0000-4000-8000-000000264001'
const UPLOAD_ORIGIN = 'http://localhost:53001'
const TRANSCRIPT = 'Chego no portão dois em dez minutos.'
const CONVERSATIONS_PATH = new RegExp(`/trips/${TRIP_ID}/conversations`, 'u')

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['microphone'],
  viewport: { height: 900, width: 1440 },
})

type ServerState = {
  enabled: boolean
  readonly messages: Record<string, unknown>[]
  readonly puts: unknown[]
  sentFileNames: string[]
}

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
}

function transcriptionOf(state: ServerState): Record<string, unknown> {
  if (!state.enabled) return { status: 'disabled' }
  return {
    engine: 'whisper-local',
    generatedAt: '2026-10-13T12:00:00.000Z',
    language: 'pt',
    status: 'ready',
    text: TRANSCRIPT,
  }
}

function buildSummary(): Record<string, unknown> {
  return {
    awaitingDriver: true,
    channels: ['app'],
    driverName: 'Motorista Sintético',
    lastMessageAt: null,
    protocol: '261013-A7K2',
    status: 'open',
    subjectId: AUTHORIZED_DOCUMENT_ID,
    subjectLabel: 'NF 1001 · Sintética',
    subjectType: 'document',
    tripId: TRIP_ID,
    unreadCount: 0,
  }
}

function buildAudioMessage(state: ServerState, clientKey: string): Record<string, unknown> {
  return {
    attachments: [
      {
        contentType: 'audio/webm',
        durationMs: 3000,
        fileName: state.sentFileNames.at(-1) ?? 'audio.webm',
        id: UPLOAD_ID,
        sizeBytes: 4096,
        transcription: transcriptionOf(state),
        url: `${UPLOAD_ORIGIN}/__media/${UPLOAD_ID}.webm`,
      },
    ],
    authorName: 'Operadora Sintética',
    bodyText: '',
    channel: 'app',
    clientMessageId: clientKey,
    createdAt: '2026-10-13T12:00:00.000Z',
    direction: 'outbound',
    id: `message-${state.messages.length + 1}`,
    status: 'sent',
  }
}

/** A mensagem de áudio guarda o anexo; a transcrição é reescrita a cada leitura conforme a empresa liga ou desliga. */
function renderMessages(state: ServerState): Record<string, unknown>[] {
  return state.messages.map((message) => ({
    ...message,
    attachments: (message.attachments as Record<string, unknown>[]).map((attachment) => ({
      ...attachment,
      transcription: transcriptionOf(state),
    })),
  }))
}

async function handleConversationRoute(route: Route, state: ServerState): Promise<void> {
  const request = route.request()
  if (request.method() === 'OPTIONS') return route.fulfill({ headers: CORS_HEADERS, status: 204 })
  const { pathname } = new URL(request.url())
  const method = request.method()
  if (pathname.endsWith('/uploads')) {
    const declared = request.postDataJSON() as { fileName: string }
    state.sentFileNames.push(declared.fileName)
    return fulfillJson(route, {
      data: { uploadId: UPLOAD_ID, uploadUrl: `${UPLOAD_ORIGIN}/__upload/${UPLOAD_ID}` },
    })
  }
  if (pathname.endsWith('/messages/read')) {
    return route.fulfill({ headers: CORS_HEADERS, status: 204 })
  }
  if (pathname.endsWith('/messages') && method === 'POST') {
    const key = request.headers()['idempotency-key'] ?? 'key'
    const message = buildAudioMessage(state, key)
    state.messages.push(message)
    return fulfillJson(route, { data: message }, 201)
  }
  if (pathname.endsWith('/messages')) {
    return fulfillJson(route, { data: renderMessages(state) })
  }
  if (pathname.endsWith('/conversations/open')) return fulfillJson(route, { data: buildSummary() })
  return fulfillJson(route, { data: [buildSummary()] })
}

async function mockServer(page: Page, state: ServerState): Promise<void> {
  await mockTripWorkspaceApi({ mode: 'all-authorized', page, permissions: PERMISSIONS })
  await page.route(CONVERSATIONS_PATH, (route) => handleConversationRoute(route, state))
  await page.route(/\/__upload\//u, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ headers: CORS_HEADERS, status: 204 })
      : route.fulfill({ headers: CORS_HEADERS, status: 200 }),
  )
  await page.route(/\/__media\//u, (route) =>
    route.fulfill({ body: Buffer.alloc(64), contentType: 'audio/webm', headers: CORS_HEADERS }),
  )
  await page.route(/\/company-settings\/audio-transcription$/u, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ headers: CORS_HEADERS, status: 204 })
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { enabled: boolean }
      state.puts.push(body)
      state.enabled = body.enabled
    }
    return fulfillJson(route, {
      data: {
        enabled: state.enabled,
        maxDurationMs: MAX_DURATION_MS,
        updatedAt: state.puts.length === 0 ? null : '2026-10-13T12:05:00.000Z',
      },
    })
  })
  await page.route(/\/company-settings$/u, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ headers: CORS_HEADERS, status: 204 })
      : fulfillJson(route, COMPANY_SETTINGS_RESPONSE),
  )
  await page.route(/\/company-settings\/logo$/u, (route) =>
    route.fulfill({ headers: CORS_HEADERS, status: 404 }),
  )
  await page.route(/\/digital-certificates(\?.*)?$/u, (route) =>
    fulfillJson(route, { data: [], page: { nextCursor: null } }),
  )
}

async function navigate(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function openConversation(page: Page): Promise<void> {
  await navigate(page, `/trips/${TRIP_ID}`)
  const talk = page.getByRole('button', { name: /Falar com o motorista|Conversa com o motorista/u })
  await talk.first().click()
  await expect(page.getByRole('button', { name: 'Gravar áudio' })).toBeVisible()
}

test('grava, envia e vê a transcrição; desliga e vê só o player', async ({ page }) => {
  const state: ServerState = { enabled: true, messages: [], puts: [], sentFileNames: [] }
  await mockServer(page, state)
  await loginAsLocalUser(page)
  await openConversation(page)

  await page.getByRole('button', { name: 'Gravar áudio' }).click()
  await expect(page.getByText('Gravando')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Parar gravação' }).click()
  await expect(page.getByText('Ouça antes de enviar')).toBeVisible()
  await page.getByRole('button', { name: 'Enviar áudio' }).click()

  await expect(page.getByRole('button', { name: 'Tocar áudio' })).toBeVisible()
  await expect(page.getByText(TRANSCRIPT)).toBeVisible()
  await expect(page.getByText('Transcrição gerada por máquina')).toBeVisible()
  expect(state.sentFileNames).toHaveLength(1)

  await navigate(page, '/company-settings?tab=audioTranscription')
  const toggle = page.getByRole('checkbox', { name: 'Transcrever áudios das conversas' })
  await expect(toggle).toBeChecked()
  await expect(page.getByText(/Só áudios de menos de 10 minutos são transcritos/u)).toBeVisible()
  await toggle.click()
  await expect(page.getByText('Salvo.')).toBeVisible()
  await expect(toggle).not.toBeChecked()
  await expect(page.getByText(/não é apagado/u)).toBeVisible()
  expect(state.puts).toEqual([{ enabled: false }])

  await openConversation(page)
  await expect(page.getByRole('button', { name: 'Tocar áudio' })).toBeVisible()
  await expect(page.getByText(TRANSCRIPT)).toHaveCount(0)
  await expect(page.getByText('Transcrição gerada por máquina')).toHaveCount(0)
})
