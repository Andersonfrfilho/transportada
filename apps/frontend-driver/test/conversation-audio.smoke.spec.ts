/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Smoke do áudio e da transcrição na conversa do motorista (spec 264 T4.4), 375x812, tema escuro.
 * Usa a API de demonstração própria (53912) e o build com `VITE_OBJECT_STORAGE_URL` apontando para ela,
 * senão a CSP (`media-src`) não deixa o `<audio>` tocar. O microfone é injetado: ver o helper.
 */
import { mkdirSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { PREVIEW_OCCURRENCE_IDS } from '../scripts/driver-preview-conversations-seed'
import {
  COMPOSER_SELECTOR,
  QUEUE_DRAIN_TIMEOUT_MS,
  expectTouchTarget,
  fillOutboxBeyondByteLimit,
  openConversationsTab,
  openOccurrence,
  readMicrophone,
  readQueuedClientMessageIds,
  recordUntilReview,
  sendReviewedAudio,
  setNetwork,
} from './conversation-audio-smoke.helper'
import {
  DEMO_ORIGIN,
  postDebug,
  readServerMessages,
  startDemoApi,
  type DemoMessage,
} from './conversation-smoke.helper'

const DAMAGE = PREVIEW_OCCURRENCE_IDS.damage
const HEADERS_SERVER_PORT = Number(process.env.PLAYWRIGHT_DRIVER_HEADERS_PORT ?? '53913')
const SERVER_BOOT_TIMEOUT_MS = 15_000
const ARRIVAL_TIMEOUT_MS = 20_000
const TRANSCRIPTION_REFRESH_TIMEOUT_MS = 30_000
const PREVIEW_TEXT = 'Chego na portaria em dez minutos, pode liberar a doca.'
const SETTLED_STATUS = /Enviada|Entregue/u
const PRINTS_DIRECTORY = fileURLToPath(
  new URL(
    '../../../specs/264-o-audio-e-a-transcricao-chegam-a-conversa-por-assunto/prints/',
    import.meta.url,
  ),
)

let demoProcess: ChildProcess | undefined

test.use({ colorScheme: 'dark', viewport: { height: 812, width: 375 } })

test.beforeAll(async () => {
  demoProcess = await startDemoApi()
})

test.afterAll(() => {
  demoProcess?.kill()
})

/** O que o motorista mandou como áudio: o servidor da demonstração guarda a mensagem inteira. */
async function readDriverAudios(): Promise<readonly DemoMessage[]> {
  const messages = await readServerMessages(DAMAGE)
  return messages.filter(
    (message) =>
      message.direction === 'inbound' &&
      message.attachments.some((attachment) => attachment.contentType.startsWith('audio/')),
  )
}

/**
 * Tocando = o botão virou "Pausar", o `<audio>` carregou (duração finita, sem erro) e não está pausado.
 * ⚠️ Não afirma `currentTime`: sem dispositivo de saída o relógio do Chromium trava em ~0,06 s (ou 0) — medido.
 */
async function expectPlaying(player: Locator): Promise<void> {
  await expect(player.getByRole('button', { name: 'Pausar áudio' })).toBeVisible()
  await expect
    .poll(() =>
      player.locator('audio').evaluate((media: HTMLAudioElement) => ({
        hasError: media.error !== null,
        isLoaded: Number.isFinite(media.duration) && media.duration > 0,
        isPaused: media.paused,
      })),
    )
    .toEqual({ hasError: false, isLoaded: true, isPaused: false })
}

/** O preview do Vite não serve cabeçalho: quem serve é o `server.ts` de produção, sobre o mesmo `dist`. */
async function readHeadersWhenUp(url: string): Promise<Headers> {
  const deadline = Date.now() + SERVER_BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const response = await fetch(url).catch(() => undefined)
    if (response !== undefined) return response.headers
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`PRODUCTION_SERVER_NOT_READY_ON_${url}`)
}

async function savePrint(page: Page, name: string): Promise<void> {
  if (process.env.PLAYWRIGHT_SAVE_PRINTS !== 'true') return
  const target = resolve(PRINTS_DIRECTORY, name)
  mkdirSync(dirname(target), { recursive: true })
  await page.screenshot({ path: target })
}

async function openDamage(page: Page, microphone: 'denied' | 'granted' = 'granted'): Promise<void> {
  await openConversationsTab(page, microphone)
  await openOccurrence(page, DAMAGE, 'Avaria')
}

async function simulateHiddenTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

test('cabeçalhos do servidor de produção: Permissions-Policy libera o microfone e a CSP libera o áudio da origem', async () => {
  const server = spawn('bun', ['run', 'server.ts'], {
    env: { ...process.env, PORT: String(HEADERS_SERVER_PORT) },
    stdio: 'ignore',
  })
  try {
    const headers = await readHeadersWhenUp(`http://localhost:${HEADERS_SERVER_PORT}/`)
    expect(headers.get('permissions-policy')).toContain('microphone=(self)')
    expect(headers.get('content-security-policy')).toContain(
      `media-src 'self' blob: ${DEMO_ORIGIN}`,
    )
  } finally {
    server.kill()
  }
})

test('gravar, ver o relógio, parar, ouvir antes de enviar e enviar: uma bolha com o player e uma só mensagem no servidor', async ({
  page,
}) => {
  test.slow()
  await openDamage(page)

  await page.getByRole('button', { name: 'Gravar áudio' }).click()
  await expect(page.locator('.cv-p-recorder__elapsed')).toHaveText(/^0:0\d de 2:00$/u)
  await savePrint(page, 't4-4-gravando-375x812.png')
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Parar gravação' }).click()

  const review = page.locator('.cv-p-recorder--review')
  await expect(review.locator('.cv-p-audio')).toBeVisible()
  await expect(review.locator('.cv-p-audio__error')).toHaveCount(0)
  await review.getByRole('button', { name: 'Tocar áudio' }).click()
  await expectPlaying(review)
  expect(await readDriverAudios()).toHaveLength(0)

  await sendReviewedAudio(page)
  const bubble = page.locator('.cv-p-bubble--mine').filter({ has: page.locator('.cv-p-audio') })
  await expect(bubble).toHaveCount(1)
  await expect(bubble).toContainText(SETTLED_STATUS, { timeout: ARRIVAL_TIMEOUT_MS })

  await page.waitForTimeout(3000)
  const sent = await readDriverAudios()
  expect(sent).toHaveLength(1)
  expect(sent[0]?.bodyText).toBe('')
  expect(sent[0]?.clientMessageId).toBeTruthy()
  expect(sent[0]?.attachments).toHaveLength(1)
  await expect(
    page.locator('.cv-p-bubble--mine').filter({ has: page.locator('.cv-p-audio') }),
  ).toHaveCount(1)
})

test('Parar duas vezes e aba oculta logo depois do Parar: vai à revisão com o áudio, sem perder a gravação', async ({
  page,
}) => {
  await openDamage(page)
  await page.getByRole('button', { name: 'Gravar áudio' }).click()
  await page.waitForTimeout(1200)

  await page.getByRole('button', { name: 'Parar gravação' }).evaluate((button: HTMLElement) => {
    button.click()
    button.click()
  })
  await simulateHiddenTab(page)
  const review = page.locator('.cv-p-recorder--review')
  await expect(review.locator('.cv-p-audio')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar áudio' })).toBeEnabled()
  await expect(page.locator('.cv-p-composer__error')).toHaveCount(0)
  expect((await readMicrophone(page)).recordings).toBe(1)

  await page.getByRole('button', { name: 'Descartar áudio' }).click()
  await expect(page.getByRole('button', { name: 'Gravar áudio' })).toBeVisible()
})

test('aba oculta no meio da gravação: o que foi captado vai à revisão', async ({ page }) => {
  await openDamage(page)
  await page.getByRole('button', { name: 'Gravar áudio' }).click()
  await page.waitForTimeout(1200)
  await simulateHiddenTab(page)
  await expect(page.locator('.cv-p-recorder--review .cv-p-audio')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar áudio' })).toBeEnabled()
})

test('alvos de toque: gravar, parar, descartar e enviar têm 44 px, e descartar não envia nada', async ({
  page,
}) => {
  await openDamage(page)
  await expectTouchTarget(page, '.cv-p-composer__record')

  await page.getByRole('button', { name: 'Gravar áudio' }).click()
  await expectTouchTarget(page, '.cv-p-recorder__stop')
  await expectTouchTarget(page, '.cv-p-recorder__discard')
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Parar gravação' }).click()
  await expect(page.locator('.cv-p-recorder--review')).toBeVisible()
  await expectTouchTarget(page, '.cv-p-recorder__send')
  await expectTouchTarget(page, '.cv-p-recorder--review .cv-p-recorder__discard')

  await page.getByRole('button', { name: 'Descartar áudio' }).click()
  await expect(page.getByRole('button', { name: 'Gravar áudio' })).toBeFocused()
  expect(await readDriverAudios()).toHaveLength(0)
})

test('microfone negado: mostra a mensagem e o app segue usável (o texto ainda vai)', async ({
  page,
}) => {
  const text = 'Sem microfone, mando por escrito'
  await openDamage(page, 'denied')

  await page.getByRole('button', { name: 'Gravar áudio' }).click()
  await expect(page.getByRole('alert')).toHaveText('Sem permissão para usar o microfone.')
  await expect(page.getByRole('button', { name: 'Gravar áudio' })).toBeEnabled()

  await page.locator(COMPOSER_SELECTOR).fill(text)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  const bubble = page.locator('.cv-p-bubble--mine').filter({ hasText: text })
  await expect(bubble).toContainText(SETTLED_STATUS, { timeout: ARRIVAL_TIMEOUT_MS })
  expect((await readMicrophone(page)).requests).toBe(1)
})

test('áudio enviado sem rede: "Na fila" com o nome do arquivo, e ao reconectar sai exatamente uma vez com o mesmo clientMessageId', async ({
  page,
}) => {
  test.slow()
  await openDamage(page)
  await setNetwork(page, 'offline')

  await recordUntilReview(page)
  await sendReviewedAudio(page)
  // Contrato §3: a bolha pendente é a do anexo pendente — nome do arquivo e relógio, sem player de blob.
  const pending = page.locator('.cv-p-bubble--mine').filter({
    has: page.locator('.cv-p-attachment--pending'),
  })
  await expect(pending).toContainText('Na fila')
  await expect(pending).toContainText(/^.*audio-\d{8}-\d{6}\.webm/u)
  await expect.poll(() => readQueuedClientMessageIds(page)).toHaveLength(1)
  const [queuedId] = await readQueuedClientMessageIds(page)

  const deliveries: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (request.method() === 'POST' && /\/(messages|uploads)$/u.test(pathname)) {
      deliveries.push(pathname.split('/').at(-1) ?? '')
    }
  })
  await setNetwork(page, 'online')
  await page.evaluate(() => {
    for (let index = 0; index < 3; index += 1) window.dispatchEvent(new Event('online'))
  })
  const bubble = page.locator('.cv-p-bubble--mine').filter({ has: page.locator('.cv-p-audio') })
  await expect(bubble).toContainText(SETTLED_STATUS, { timeout: QUEUE_DRAIN_TIMEOUT_MS })
  await page.waitForTimeout(3000)
  // A Idempotency-Key já protege o servidor; a trava do outbox protege o aparelho de repetir upload e POST.
  expect(deliveries.filter((kind) => kind === 'uploads')).toHaveLength(1)
  expect(deliveries.filter((kind) => kind === 'messages')).toHaveLength(1)
  const sent = await readDriverAudios()
  expect(sent).toHaveLength(1)
  expect(sent[0]?.clientMessageId).toBe(queuedId)
  await expect(
    page.locator('.cv-p-bubble--mine').filter({ has: page.locator('.cv-p-audio') }),
  ).toHaveCount(1)
  expect(await readQueuedClientMessageIds(page)).toHaveLength(0)
})

test('fila cheia de arquivos: o áudio é recusado com "Fila cheia" e o texto ainda entra', async ({
  page,
}) => {
  test.slow()
  const text = 'Texto que cabe na fila cheia'
  await openDamage(page)
  await fillOutboxBeyondByteLimit(page)
  await setNetwork(page, 'offline')

  await recordUntilReview(page)
  await sendReviewedAudio(page)
  await expect(page.getByRole('alert')).toContainText('Fila cheia')
  await expect(page.getByRole('button', { name: /reenviar/ })).toBeVisible()
  expect(await readQueuedClientMessageIds(page)).toHaveLength(0)

  await page.locator(COMPOSER_SELECTOR).fill(text)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  const bubble = page.locator('.cv-p-bubble--mine').filter({ hasText: text })
  await expect(bubble).toContainText('Na fila')
  await expect.poll(() => readQueuedClientMessageIds(page)).toHaveLength(1)

  await setNetwork(page, 'online')
  await expect(bubble).toContainText(SETTLED_STATUS, { timeout: QUEUE_DRAIN_TIMEOUT_MS })
  const texts = (await readServerMessages(DAMAGE)).filter((message) => message.bodyText === text)
  expect(texts).toHaveLength(1)
  expect(await readDriverAudios()).toHaveLength(0)
})

test('transcrição: os quatro estados, e com a conversa aberta o "Transcrevendo…" vira texto sem recarregar', async ({
  page,
}) => {
  test.slow()
  await resetAndSeedSamples(page)

  await expect(page.locator('.cv-p-audio')).toHaveCount(4)
  await expect(page.locator('.cv-p-transcription--pending')).toHaveText('Transcrevendo…')
  await expect(page.locator('.cv-p-transcription__notice')).toHaveText([
    'Transcrição gerada por máquina',
    'Transcrição gerada por máquina',
  ])
  await expect(page.locator('.cv-p-transcription__text')).toHaveText(PREVIEW_TEXT)
  await expect(page.locator('.cv-p-transcription__empty')).toHaveText('Nada foi dito no áudio')
  await expect(page.locator('.cv-p-transcription--too-long')).toHaveText(
    'Transcrição só para áudios de menos de 10 minutos',
  )
  await expect(page.locator('.cv-p-thread__live')).toHaveCount(1)
  await page.locator('.cv-p-transcription--too-long').scrollIntoViewIfNeeded()
  await savePrint(page, 't4-4-quatro-estados-375x812.png')

  await page.evaluate(() => {
    Reflect.set(window, '__smokeSurvivesTranscription', true)
    Reflect.set(window, '__smokeAnnouncements', [] as string[])
    const live = document.querySelector('.cv-p-thread__live')
    if (live === null) return
    new MutationObserver(() => {
      const text = live.textContent ?? ''
      if (text !== '') (Reflect.get(window, '__smokeAnnouncements') as string[]).push(text)
    }).observe(live, { characterData: true, childList: true, subtree: true })
  })
  await postDebug('transcription-ready', { subjectId: DAMAGE })

  await expect(page.locator('.cv-p-transcription--pending')).toHaveCount(0, {
    timeout: TRANSCRIPTION_REFRESH_TIMEOUT_MS,
  })
  await expect(page.locator('.cv-p-transcription__text')).toHaveCount(2)
  expect(
    await page.evaluate(() => Reflect.get(window, '__smokeSurvivesTranscription') === true),
  ).toBe(true)
  await expect(page.locator('.cv-p-thread__live')).toHaveCount(1)
  const announcements = await page.evaluate(
    () => Reflect.get(window, '__smokeAnnouncements') as string[],
  )
  expect(announcements.filter((text) => text.includes('Transcrição pronta'))).not.toHaveLength(0)
})

test('player: tocar toca (carrega, não pausa), um áudio por vez, sem violação de CSP no console', async ({
  page,
}) => {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/Content Security Policy|media-src/u.test(message.text())) violations.push(message.text())
  })
  await resetAndSeedSamples(page)

  const players = page.locator('.cv-p-audio')
  await expect(players).toHaveCount(4)
  const first = players.nth(0)
  const second = players.nth(1)
  await first.getByRole('button', { name: 'Tocar áudio' }).click()
  await expectPlaying(first)

  await second.getByRole('button', { name: 'Tocar áudio' }).click()
  await expectPlaying(second)
  await expect(first.getByRole('button', { name: 'Tocar áudio' })).toBeVisible()
  await expect
    .poll(() => first.locator('audio').evaluate((media: HTMLAudioElement) => media.paused))
    .toBe(true)
  await expect(page.locator('.cv-p-audio__error')).toHaveCount(0)
  expect(violations).toEqual([])
})

async function resetAndSeedSamples(page: Page): Promise<void> {
  await openConversationsTab(page, 'granted')
  await postDebug('audio-samples', { subjectId: DAMAGE })
  await openOccurrence(page, DAMAGE, 'Avaria')
}
