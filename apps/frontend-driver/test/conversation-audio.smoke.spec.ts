/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Smoke do áudio na conversa do motorista (spec 264 T4.4), 375x812, tema escuro: gravar, ouvir antes de
 * enviar, enviar, enviar sem rede e reconectar sem duplicar, microfone negado e a transcrição
 * (`Transcrevendo…` até o texto com o aviso de máquina). Microfone falso do Chromium: o pedido de
 * permissão é aceito sozinho e a captura devolve um tom — a gravação tem bytes de verdade. A API é a de
 * demonstração (`scripts/driver-preview-api.ts`), em porta própria, com os quatro estados de
 * transcrição semeados na conversa de nota `NF 900202`.
 */
import type { ChildProcess } from 'node:child_process'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  PREVIEW_AUDIO_DOCUMENT_ID,
  PREVIEW_TRANSCRIPTION_TEXT,
} from '../scripts/driver-preview-conversations-audio'
import { PREVIEW_OCCURRENCE_IDS } from '../scripts/driver-preview-conversations-seed'
import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  DEMO_ORIGIN,
  postDebug,
  resetDemo,
  routeApiToDemo,
  startDemoApi,
} from './conversation-smoke.helper'

const NAV_SELECTOR = 'nav[aria-label]'
const RECORDING_MS = 1500
const ARRIVAL_TIMEOUT_MS = 20_000
const QUEUE_DRAIN_TIMEOUT_MS = 45_000
const TRANSCRIPTION_REFRESH_TIMEOUT_MS = 45_000
const TOUCH_TARGET_MIN_PX = 44
const MACHINE_NOTICE = 'Transcrição gerada por máquina'
const TOO_LONG_NOTICE = 'Transcrição só para áudios com menos de 10 minutos'

let demoProcess: ChildProcess | undefined

test.use({
  colorScheme: 'dark',
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['microphone'],
  viewport: { height: 812, width: 375 },
})

test.beforeAll(async () => {
  demoProcess = await startDemoApi()
})

test.afterAll(() => {
  demoProcess?.kill()
})

type ServerAttachment = Readonly<{ contentType: string; id: string }>
type ServerMessage = Readonly<{ attachments: readonly ServerAttachment[]; direction: string }>

/** Áudios que o motorista (`inbound`) mandou: a semente só tem áudio do escritório (`outbound`). */
async function countDriverAudios(subjectType: string, subjectId: string): Promise<number> {
  const response = await fetch(
    `${DEMO_ORIGIN}/me/trips/current/conversations/${subjectType}/${subjectId}/messages`,
  )
  const { data } = (await response.json()) as { data: ServerMessage[] }
  return data
    .filter((message) => message.direction === 'inbound')
    .flatMap((message) => message.attachments)
    .filter((attachment) => attachment.contentType.startsWith('audio/')).length
}

async function openConversation(
  page: Page,
  target: Readonly<{ subjectId: string; subjectType: string; term: string }>,
): Promise<void> {
  await resetDemo()
  await routeApiToDemo(page)
  await loginAsLocalUser(page)
  await page.locator(NAV_SELECTOR).getByRole('button', { name: 'Conversas' }).click()
  await page.locator('.cv-p-search__input').fill(target.term)
  await expect(page.locator('.cv-p-row')).toHaveCount(1)
  await page.locator('.cv-p-row').click()
  await expect(page).toHaveURL(
    new RegExp(`/conversas/${target.subjectType}/${target.subjectId}$`, 'u'),
  )
  await expect(page.locator('textarea.cv-p-composer__input')).toBeVisible()
}

async function openDamageOccurrence(page: Page): Promise<void> {
  await openConversation(page, {
    subjectId: PREVIEW_OCCURRENCE_IDS.damage,
    subjectType: 'occurrence',
    term: 'Avaria',
  })
}

async function recordUntilReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Gravar áudio' }).click()
  await expect(page.locator('.cv-p-recorder')).toBeVisible()
  await page.waitForTimeout(RECORDING_MS)
  await page.getByRole('button', { name: 'Parar gravação' }).click()
  await expect(page.locator('.cv-p-recorder--review')).toBeVisible()
}

test('gravar: o microfone ocupa o lugar do enviar com o campo vazio e tem alvo de 44 px', async ({
  page,
}) => {
  await openDamageOccurrence(page)

  const record = page.locator('.cv-p-composer__record')
  await expect(record).toBeVisible()
  const box = await record.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toHaveCount(0)

  await page.locator('textarea.cv-p-composer__input').fill('texto')
  await expect(record).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible()
})

test('gravar, ouvir antes de enviar e enviar: uma mensagem de áudio, que o servidor aceita pending', async ({
  page,
}) => {
  test.slow()
  await openDamageOccurrence(page)
  expect(await countDriverAudios('occurrence', PREVIEW_OCCURRENCE_IDS.damage)).toBe(0)

  await recordUntilReview(page)
  await expect(page.locator('.cv-p-recorder--review .cv-p-audio')).toBeVisible()
  await page.locator('.cv-p-recorder--review .cv-p-audio__toggle').click()
  await expect(page.locator('.cv-p-recorder--review .cv-p-audio__toggle')).toHaveAccessibleName(
    'Pausar áudio',
  )

  await page.getByRole('button', { name: 'Enviar áudio' }).click()
  const bubble = page.locator('.cv-p-bubble--mine').filter({ has: page.locator('.cv-p-audio') })
  await expect(bubble.locator('.cv-status-ticks--delivered')).toBeVisible({
    timeout: ARRIVAL_TIMEOUT_MS,
  })
  await expect(bubble).toContainText('Transcrevendo…', {
    timeout: TRANSCRIPTION_REFRESH_TIMEOUT_MS,
  })
  expect(await countDriverAudios('occurrence', PREVIEW_OCCURRENCE_IDS.damage)).toBe(1)
  await expect(page.locator('.cv-p-composer__record')).toBeVisible()
})

test('transcrição: Transcrevendo… vira o texto com o aviso de máquina, sem recarregar', async ({
  page,
}) => {
  test.slow()
  await openDamageOccurrence(page)
  await recordUntilReview(page)
  await page.getByRole('button', { name: 'Enviar áudio' }).click()
  const bubble = page.locator('.cv-p-bubble--mine').filter({ has: page.locator('.cv-p-audio') })
  await expect(bubble).toContainText('Transcrevendo…', {
    timeout: TRANSCRIPTION_REFRESH_TIMEOUT_MS,
  })
  await page.evaluate(() => Reflect.set(window, '__sameDocument', true))

  await postDebug('transcription-ready')

  await expect(bubble.locator('.cv-p-transcription__text')).toHaveText(PREVIEW_TRANSCRIPTION_TEXT, {
    timeout: TRANSCRIPTION_REFRESH_TIMEOUT_MS,
  })
  await expect(bubble.locator('.cv-p-transcription__notice')).toHaveText(MACHINE_NOTICE)
  await expect(bubble).not.toContainText('Transcrevendo…')
  expect(await page.evaluate(() => Reflect.get(window, '__sameDocument') === true)).toBe(true)
})

test('sem rede: a gravação entra na fila e, ao reconectar, chega uma vez só', async ({
  context,
  page,
}) => {
  test.slow()
  await openDamageOccurrence(page)
  await recordUntilReview(page)
  await context.setOffline(true)

  await page.getByRole('button', { name: 'Enviar áudio' }).click()
  const bubble = page.locator('.cv-p-bubble--mine').filter({ hasText: 'audio-' })
  await expect(bubble).toContainText('Na fila')
  expect(await countDriverAudios('occurrence', PREVIEW_OCCURRENCE_IDS.damage)).toBe(0)

  await context.setOffline(false)
  await expect(bubble).toContainText(/Enviada|Entregue/u, { timeout: QUEUE_DRAIN_TIMEOUT_MS })
  await expect.poll(() => countDriverAudios('occurrence', PREVIEW_OCCURRENCE_IDS.damage)).toBe(1)
  await page.waitForTimeout(2000)
  expect(await countDriverAudios('occurrence', PREVIEW_OCCURRENCE_IDS.damage)).toBe(1)
})

test('microfone negado: a frase aparece no compositor e o texto continua funcionando', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const denied = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: denied })
  })
  await openDamageOccurrence(page)

  await page.getByRole('button', { name: 'Gravar áudio' }).click()

  await expect(page.getByRole('alert')).toHaveText('Sem permissão para usar o microfone.')
  await expect(page.locator('.cv-p-recorder')).toHaveCount(0)
  await page.locator('textarea.cv-p-composer__input').fill('Sigo por texto')
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeEnabled()
})

test('os quatro estados da transcrição aparecem na conversa de áudios da demonstração', async ({
  page,
}) => {
  await openConversation(page, {
    subjectId: PREVIEW_AUDIO_DOCUMENT_ID,
    subjectType: 'document',
    term: 'Áudios',
  })

  const bubbles = page.locator('.cv-p-bubble').filter({ has: page.locator('.cv-p-audio') })
  await expect(bubbles).toHaveCount(4)
  await expect(bubbles.nth(0)).toContainText('Transcrevendo…')
  await expect(bubbles.nth(1).locator('.cv-p-transcription__text')).toHaveText(
    PREVIEW_TRANSCRIPTION_TEXT,
  )
  await expect(bubbles.nth(1).locator('.cv-p-transcription__notice')).toHaveText(MACHINE_NOTICE)
  await expect(bubbles.nth(2)).toContainText(TOO_LONG_NOTICE)
  await expect(bubbles.nth(3).locator('.cv-p-transcription')).toHaveCount(0)
  for (const bubble of await bubbles.all()) {
    await expect(bubble.getByRole('button', { name: 'Tocar áudio' })).toBeVisible()
  }
})
