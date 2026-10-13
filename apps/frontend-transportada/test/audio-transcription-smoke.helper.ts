/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Encanamento do smoke de áudio e transcrição do painel (spec 264 T5.3): o microfone injetado, a API da
 * conversa por assunto da viagem e a configuração da transcrição, tudo dublado em memória.
 *
 * ⚠️ **Microfone injetado por padrão**, pelo mesmo motivo do app do motorista (T4.4): no Chromium do Playwright
 * neste macOS o `getUserMedia({ audio })` fica pendente para sempre. A dupla entrega um WAV mudo; relógio,
 * parar, revisão, player, envio e upload em duas etapas são o código real. `PLAYWRIGHT_MICROPHONE=native` usa o
 * microfone do navegador.
 */
import type { Page, Route } from '@playwright/test'

import { TRIP_ID } from './trip-smoke.helper'

export const API_ORIGIN = 'http://localhost:53001'
export const AUDIO_TRANSCRIPTION_PATH = '/company-settings/audio-transcription'
export const DRIVER_AUDIO_ID = '00000000-0000-4000-8000-000000264001'
const SUBJECT_ID = TRIP_ID
/** A CSP do preview só libera `media-src 'self'`: o áudio sai da origem da própria página, como o armazenamento sai da dele em produção. */
const AUDIO_ORIGIN = `http://localhost:${process.env.PLAYWRIGHT_FRONTEND_PORT ?? '53000'}`
const STORAGE_PATH = '/smoke-storage'
const IS_NATIVE_MICROPHONE = process.env.PLAYWRIGHT_MICROPHONE === 'native'
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

/** O que cada estado da transcrição mostra, na ordem em que as mensagens do motorista chegam. */
export const TRANSCRIPTION_TEXT = 'Texto sintético da transcrição de teste.'
export const TRANSCRIPTION_MAX_DURATION_MS = 600_000

type TranscriptionFixture =
  | Readonly<{ maxDurationMs: number; reason: 'too_long'; status: 'failed' }>
  | Readonly<{ status: 'pending' }>
  | Readonly<{ generatedAt: string; language: string; status: 'ready'; text: string }>

type DriverAudio = Readonly<{ fileName: string; transcription: TranscriptionFixture }>

const GENERATED_AT = '2026-10-12T10:00:00.000Z'
const DRIVER_AUDIOS: readonly DriverAudio[] = [
  {
    fileName: 'audio-pronto.webm',
    transcription: {
      generatedAt: GENERATED_AT,
      language: 'pt',
      status: 'ready',
      text: TRANSCRIPTION_TEXT,
    },
  },
  { fileName: 'audio-pendente.webm', transcription: { status: 'pending' } },
  {
    fileName: 'audio-vazio.webm',
    transcription: { generatedAt: GENERATED_AT, language: 'pt', status: 'ready', text: '' },
  },
  {
    fileName: 'audio-longo.webm',
    transcription: {
      maxDurationMs: TRANSCRIPTION_MAX_DURATION_MS,
      reason: 'too_long',
      status: 'failed',
    },
  },
]

type StoredMessage = {
  attachments: {
    contentType: string
    durationMs?: number
    fileName: string
    id: string
    sizeBytes: number
    transcription?: TranscriptionFixture
    url: string
  }[]
  authorName: string
  bodyText: string
  channel: 'app'
  createdAt: string
  direction: 'inbound' | 'outbound'
  id: string
  status: null | 'sent'
}

export type SentMessage = Readonly<{ body: unknown; idempotencyKey: null | string }>

export type ConversationState = {
  /** `false` ⇒ a API devolve `{ status: 'disabled' }` nos anexos (a configuração da empresa está desligada). */
  isTranscriptionEnabled: boolean
  markReadCount: number
  messages: StoredMessage[]
  sentMessages: SentMessage[]
  storagePuts: number
  uploadRequests: unknown[]
}

export type SettingsState = {
  /** Status HTTP que o próximo `PUT` devolve no lugar do sucesso. */
  failNextPutWith: number | undefined
  getCount: number
  isEnabled: boolean
  puts: unknown[]
}

export function createConversationState(): ConversationState {
  return {
    isTranscriptionEnabled: true,
    markReadCount: 0,
    messages: DRIVER_AUDIOS.map((audio, index) => ({
      attachments: [
        {
          contentType: 'audio/webm',
          durationMs: 4_000,
          fileName: audio.fileName,
          id: `${DRIVER_AUDIO_ID.slice(0, -1)}${index + 1}`,
          sizeBytes: 24_044,
          transcription: audio.transcription,
          url: `${AUDIO_ORIGIN}${STORAGE_PATH}/get/${index}.wav`,
        },
      ],
      authorName: 'João Pereira',
      bodyText: '',
      channel: 'app',
      createdAt: `2026-10-12T09:0${index}:00.000Z`,
      direction: 'inbound',
      id: `00000000-0000-4000-8000-00000026410${index}`,
      status: null,
    })),
    sentMessages: [],
    storagePuts: 0,
    uploadRequests: [],
  }
}

export function createSettingsState(isEnabled = true): SettingsState {
  return { failNextPutWith: undefined, getCount: 0, isEnabled, puts: [] }
}

function buildSilentWav(): Buffer {
  const sampleRate = 8000
  const dataLength = sampleRate
  const bytes = Buffer.alloc(44 + dataLength, 128)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + dataLength, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate, 28)
  bytes.writeUInt16LE(1, 32)
  bytes.writeUInt16LE(8, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(dataLength, 40)
  return bytes
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ headers: CORS_HEADERS, status: 204 })
    return
  }
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
}

function publicMessage(message: StoredMessage, state: ConversationState): unknown {
  return {
    ...message,
    attachments: message.attachments.map(({ transcription, ...attachment }) => ({
      ...attachment,
      ...(transcription === undefined
        ? {}
        : { transcription: state.isTranscriptionEnabled ? transcription : { status: 'disabled' } }),
    })),
  }
}

function summary(state: ConversationState): unknown {
  return {
    awaitingDriver: false,
    channels: ['app'],
    driverName: 'João Pereira',
    lastMessageAt: state.messages.at(-1)?.createdAt ?? null,
    protocol: 'VG-264-0001',
    status: 'open',
    subjectId: SUBJECT_ID,
    subjectLabel: 'Viagem 264',
    subjectType: 'trip',
    tripId: TRIP_ID,
    unreadCount: 0,
  }
}

async function handleMessages(
  input: Readonly<{ route: Route; state: ConversationState }>,
): Promise<void> {
  const { route, state } = input
  const request = route.request()
  if (request.method() !== 'POST') {
    await fulfillJson(route, {
      data: state.messages.map((message) => publicMessage(message, state)),
    })
    return
  }
  const body = request.postDataJSON() as { attachmentIds?: string[]; body: string }
  state.sentMessages.push({ body, idempotencyKey: request.headers()['idempotency-key'] ?? null })
  const stored: StoredMessage = {
    attachments: (body.attachmentIds ?? []).map((id, index) => ({
      contentType: 'audio/webm',
      durationMs: 1_000,
      fileName: `audio-enviado-${index + 1}.webm`,
      id,
      sizeBytes: 9_000,
      transcription: { status: 'pending' },
      url: `${AUDIO_ORIGIN}${STORAGE_PATH}/get/sent-${index}.wav`,
    })),
    authorName: 'Marina Alves',
    bodyText: body.body,
    channel: 'app',
    createdAt: new Date().toISOString(),
    direction: 'outbound',
    id: `00000000-0000-4000-8000-0000002642${String(state.sentMessages.length).padStart(2, '0')}`,
    status: 'sent',
  }
  state.messages.push(stored)
  await fulfillJson(route, { data: publicMessage(stored, state) }, 201)
}

async function handleUpload(
  input: Readonly<{ route: Route; state: ConversationState }>,
): Promise<void> {
  const { route, state } = input
  if (route.request().method() === 'POST') {
    state.uploadRequests.push(route.request().postDataJSON())
    const uploadId = `00000000-0000-4000-8000-0000002643${String(state.uploadRequests.length).padStart(2, '0')}`
    await fulfillJson(route, {
      data: { uploadId, uploadUrl: `${API_ORIGIN}${STORAGE_PATH}/put/${uploadId}` },
    })
    return
  }
  await fulfillJson(route, {})
}

/** A conversa da viagem (assunto `trip`) com quatro áudios do motorista, um por estado; registra o que o painel envia. */
export async function mockSubjectConversationApi(
  input: Readonly<{ page: Page; state: ConversationState }>,
): Promise<void> {
  const { page, state } = input
  const base = `/trips/${TRIP_ID}/conversations`
  await page.route(new RegExp(`${base}(?:\\?.*)?$`), (route) =>
    fulfillJson(route, { data: [summary(state)] }),
  )
  await page.route(new RegExp(`${base}/trip/${SUBJECT_ID}/messages(?:\\?.*)?$`), (route) =>
    handleMessages({ route, state }),
  )
  await page.route(new RegExp(`${base}/trip/${SUBJECT_ID}/messages/read$`), async (route) => {
    if (route.request().method() === 'POST') state.markReadCount += 1
    await fulfillJson(route, { data: null })
  })
  await page.route(new RegExp(`${base}/trip/${SUBJECT_ID}/uploads$`), (route) =>
    handleUpload({ route, state }),
  )
  await page.route(/\/occurrence-quick-replies\?audience=driver$/, (route) =>
    fulfillJson(route, { data: [] }),
  )
  await page.route(`${API_ORIGIN}${STORAGE_PATH}/put/*`, async (route) => {
    if (route.request().method() === 'PUT') state.storagePuts += 1
    await route.fulfill({
      headers: CORS_HEADERS,
      status: route.request().method() === 'PUT' ? 200 : 204,
    })
  })
  await page.route(`${AUDIO_ORIGIN}${STORAGE_PATH}/get/*`, (route) =>
    route.fulfill({ body: buildSilentWav(), contentType: 'audio/wav', headers: CORS_HEADERS }),
  )
}

/** `GET/PUT /company-settings/audio-transcription` com o estado da empresa em memória. */
export async function mockAudioTranscriptionSettingsApi(
  input: Readonly<{
    conversation?: ConversationState
    page: Page
    state: SettingsState
  }>,
): Promise<void> {
  const { conversation, page, state } = input
  // A página de Configurações busca o logo da empresa ao abrir; 404 é "sem logo" e a tela desenha o vazio.
  await page.route(/\/company-settings\/logo(?:\?.*)?$/, (route) => fulfillJson(route, {}, 404))
  await page.route(new RegExp(`${AUDIO_TRANSCRIPTION_PATH}$`), async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await fulfillJson(route, {})
      return
    }
    if (request.method() === 'PUT') {
      state.puts.push(request.postDataJSON())
      if (state.failNextPutWith !== undefined) {
        const status = state.failNextPutWith
        state.failNextPutWith = undefined
        await fulfillJson(route, { error: { code: 'SMOKE_FAILURE', message: 'falha' } }, status)
        return
      }
      state.isEnabled = (request.postDataJSON() as { enabled: boolean }).enabled
      if (conversation !== undefined) conversation.isTranscriptionEnabled = state.isEnabled
    } else {
      state.getCount += 1
    }
    await fulfillJson(route, {
      data: {
        enabled: state.isEnabled,
        maxDurationMs: TRANSCRIPTION_MAX_DURATION_MS,
        updatedAt: '2026-10-12T12:00:00.000Z',
      },
    })
  })
}

/** Requisição em voo que a navegação descartou não é falha de API; rota sem dublê (`ERR_FAILED`) continua reprovando. */
function isDiscardedByNavigation(errorText: string | undefined): boolean {
  return errorText === 'net::ERR_ABORTED'
}

/** O teste afirma lista vazia no fim: rota da API sem dublê foi o que derrubou o deploy de staging. */
export function trackApiFailures(page: Page): () => readonly string[] {
  const failures: string[] = []
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText
    if (isDiscardedByNavigation(errorText)) return
    if (new URL(request.url()).origin === API_ORIGIN) failures.push(`${request.url()} ${errorText}`)
  })
  return () => failures
}

/** Roda no navegador, antes do app. Sem importar nada: o Playwright a serializa. */
function installFakeMicrophone(): void {
  const SILENT_SECONDS = 3
  const SAMPLE_RATE = 8000
  const STOP_DELAY_MS = 150

  function buildWav(): Uint8Array<ArrayBuffer> {
    const dataLength = SAMPLE_RATE * SILENT_SECONDS
    const bytes = new Uint8Array(new ArrayBuffer(44 + dataLength))
    const view = new DataView(bytes.buffer)
    const writeText = (offset: number, text: string): void => {
      for (let index = 0; index < text.length; index += 1) {
        view.setUint8(offset + index, text.charCodeAt(index))
      }
    }
    writeText(0, 'RIFF')
    view.setUint32(4, 36 + dataLength, true)
    writeText(8, 'WAVEfmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, SAMPLE_RATE, true)
    view.setUint32(28, SAMPLE_RATE, true)
    view.setUint16(32, 1, true)
    view.setUint16(34, 8, true)
    writeText(36, 'data')
    view.setUint32(40, dataLength, true)
    bytes.fill(128, 44)
    return bytes
  }

  class FakeMediaRecorder {
    static isTypeSupported(type: string): boolean {
      return type.startsWith('audio/webm')
    }
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onerror: (() => void) | null = null
    onstop: (() => void) | null = null
    readonly mimeType: string
    state: 'inactive' | 'recording' = 'inactive'

    constructor(_stream: MediaStream, options?: { mimeType?: string }) {
      this.mimeType = options?.mimeType ?? 'audio/webm'
    }

    start(): void {
      this.state = 'recording'
    }

    stop(): void {
      if (this.state === 'inactive') throw new DOMException('inactive', 'InvalidStateError')
      this.state = 'inactive'
      setTimeout(() => {
        this.ondataavailable?.({ data: new Blob([buildWav()], { type: this.mimeType }) })
        this.onstop?.()
      }, STOP_DELAY_MS)
    }
  }

  Reflect.set(window, 'MediaRecorder', FakeMediaRecorder)
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    configurable: true,
    value: (): Promise<MediaStream> => Promise.resolve(new MediaStream()),
  })
}

export async function installMicrophone(page: Page): Promise<void> {
  if (IS_NATIVE_MICROPHONE) return
  await page.addInitScript(installFakeMicrophone)
}
