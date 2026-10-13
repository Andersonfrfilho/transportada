/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Encanamento do smoke de áudio da conversa (spec 264 T4.4): microfone, rede e fila de envio.
 *
 * ⚠️ **Microfone injetado por padrão.** No Chromium do Playwright no macOS o `getUserMedia({ audio })`
 * fica pendente para sempre, mesmo com `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`
 * e a permissão concedida: o vídeo falso abre, a enumeração lista os dispositivos falsos, só a captura de
 * áudio não começa (e um `AudioContext` + `MediaStreamDestination` grava 110 bytes — o relógio de áudio não
 * anda sem dispositivo real). Então o teste troca `getUserMedia` e `MediaRecorder` por duplas que entregam um
 * WAV mudo, e **todo o resto é o código real**: relógio, parar, revisão, player, envio, fila, upload.
 * `PLAYWRIGHT_MICROPHONE=native` deixa o navegador com o dele (para uma máquina com áudio de verdade).
 */
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { resetDemo, routeApiToDemo } from './conversation-smoke.helper'

export const NAV_SELECTOR = 'nav[aria-label]'
export const COMPOSER_SELECTOR = 'textarea.cv-p-composer__input'
export const TOUCH_TARGET_MIN_PX = 44
export const QUEUE_DRAIN_TIMEOUT_MS = 45_000
const IS_NATIVE_MICROPHONE = process.env.PLAYWRIGHT_MICROPHONE === 'native'

export type MicrophoneMode = 'denied' | 'granted'

type MicrophoneControl = { mode: MicrophoneMode; recordings: number; requests: number }

/** Roda no navegador, antes do app. Sem importar nada: o Playwright a serializa. */
function installFakeMicrophone(initialMode: MicrophoneMode): void {
  const control: MicrophoneControl = { mode: initialMode, recordings: 0, requests: 0 }
  Reflect.set(window, '__smokeMicrophone', control)
  const SILENT_SECONDS = 3
  const SAMPLE_RATE = 8000
  const STOP_DELAY_MS = 150

  function buildSilentWav(): Uint8Array<ArrayBuffer> {
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
        control.recordings += 1
        this.ondataavailable?.({ data: new Blob([buildSilentWav()], { type: this.mimeType }) })
        this.onstop?.()
      }, STOP_DELAY_MS)
    }
  }

  Reflect.set(window, 'MediaRecorder', FakeMediaRecorder)
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    configurable: true,
    value: (): Promise<MediaStream> => {
      control.requests += 1
      return control.mode === 'denied'
        ? Promise.reject(new DOMException('denied', 'NotAllowedError'))
        : Promise.resolve(new MediaStream())
    },
  })
}

/** `denied` troca só o `getUserMedia`: é a recusa que o navegador devolve quando o motorista nega. */
export async function installMicrophone(page: Page, mode: MicrophoneMode): Promise<void> {
  if (IS_NATIVE_MICROPHONE && mode === 'granted') return
  await page.addInitScript(installFakeMicrophone, mode)
}

export async function readMicrophone(page: Page): Promise<MicrophoneControl> {
  return page.evaluate(() => Reflect.get(window, '__smokeMicrophone') as MicrophoneControl)
}

/**
 * `setOffline` zera `navigator.onLine`, mas o `route.fetch` do desvio para a demonstração roda no Node e
 * seguiria passando: a queda é também uma rota que aborta `/me/**` (a última registrada vale primeiro).
 */
export async function setNetwork(page: Page, state: 'offline' | 'online'): Promise<void> {
  await page.context().setOffline(state === 'offline')
  if (state === 'online') {
    await page.unroute('**/me/**', abortWhileOffline)
    return
  }
  await page.route('**/me/**', abortWhileOffline)
}

async function abortWhileOffline(
  route: Parameters<Parameters<Page['route']>[1]>[0],
): Promise<void> {
  await route.abort('internetdisconnected')
}

export async function openConversationsTab(page: Page, microphone: MicrophoneMode): Promise<void> {
  await resetDemo()
  await installMicrophone(page, microphone)
  await routeApiToDemo(page)
  await loginAsLocalUser(page)
  await page.locator(NAV_SELECTOR).getByRole('button', { name: 'Conversas' }).click()
  await expect(page.locator('.cv-p-row').first()).toBeVisible()
}

export async function openOccurrence(
  page: Page,
  occurrenceId: string,
  term: string,
): Promise<void> {
  await page.locator('.cv-p-search__input').fill(term)
  await expect(page.locator('.cv-p-row')).toHaveCount(1)
  await page.locator('.cv-p-row').click()
  await expect(page).toHaveURL(new RegExp(`/conversas/occurrence/${occurrenceId}$`, 'u'))
  await expect(page.locator(COMPOSER_SELECTOR)).toBeVisible()
}

const RECORDING_SECONDS_MS = 1200

/** Do microfone ao "Ouça antes de enviar": o relógio anda de verdade e o Parar é o do app. */
export async function recordUntilReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Gravar áudio' }).click()
  await expect(page.locator('.cv-p-recorder__elapsed')).toBeVisible()
  await page.waitForTimeout(RECORDING_SECONDS_MS)
  await page.getByRole('button', { name: 'Parar gravação' }).click()
  await expect(page.locator('.cv-p-recorder--review .cv-p-audio')).toBeVisible()
}

export async function sendReviewedAudio(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Enviar áudio' }).click()
  await expect(page.locator('.cv-p-recorder')).toHaveCount(0)
}

export async function expectTouchTarget(page: Page, selector: string): Promise<void> {
  const box = await page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const { height, width } = element.getBoundingClientRect()
      return { height, width }
    })
  expect(box.height, `${selector} altura`).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
  expect(box.width, `${selector} largura`).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
}

/** Enche a fila do aparelho (outra conta) além do teto de bytes, sem passar pelo app. */
export async function fillOutboxBeyondByteLimit(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('transportada.conversation-outbox', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('messages', { keyPath: 'clientMessageId' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('INDEXEDDB_REQUEST_FAILED'))
    })
    const SEVEN_MIB = 7 * 1024 * 1024
    const ITEMS = 8
    for (let index = 0; index < ITEMS; index += 1) {
      const blob = new Blob([new Uint8Array(SEVEN_MIB)], { type: 'audio/webm' })
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('messages', 'readwrite')
        transaction.objectStore('messages').put({
          attempts: 0,
          clientMessageId: `smoke-other-owner-${index}`,
          createdAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
          files: [{ blob, name: `audio-${index}.webm`, size: SEVEN_MIB, type: 'audio/webm' }],
          ownerKey: 'smoke-other-owner',
          state: 'failed',
          subject: { subjectId: 'smoke-other', subjectType: 'occurrence' },
          text: '',
        })
        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('INDEXEDDB_TRANSACTION_FAILED'))
      })
    }
    database.close()
  })
}

export async function readQueuedClientMessageIds(page: Page): Promise<readonly string[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('transportada.conversation-outbox', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('INDEXEDDB_REQUEST_FAILED'))
    })
    const records = await new Promise<{ clientMessageId: string; ownerKey: string }[]>(
      (resolve, reject) => {
        const request = database.transaction('messages').objectStore('messages').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('INDEXEDDB_REQUEST_FAILED'))
      },
    )
    database.close()
    return records
      .filter((record) => record.ownerKey !== 'smoke-other-owner')
      .map((record) => record.clientMessageId)
  })
}
