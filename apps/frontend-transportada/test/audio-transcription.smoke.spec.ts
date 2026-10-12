/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T5.3: o áudio e a transcrição no painel. Na conversa por assunto da viagem (o motorista fala por
 * áudio, o escritório grava e envia) e em Configurações (liga e desliga a transcrição da empresa). Toda rota
 * da API está dublada e todo teste afirma `failures()` vazio: rota sem dublê é o que derrubou o deploy de staging.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  createConversationState,
  createSettingsState,
  installMicrophone,
  mockAudioTranscriptionSettingsApi,
  mockSubjectConversationApi,
  trackApiFailures,
  TRANSCRIPTION_TEXT,
  type ConversationState,
  type SettingsState,
} from './audio-transcription-smoke.helper'
import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockSettingsShell } from './spec-238-prints-smoke.helper'
import { navigate } from './spec-237-prints-smoke.helper'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/264-o-audio-e-a-transcricao-chegam-a-conversa-por-assunto/prints',
)
const DESKTOP = { height: 900, width: 1440 } as const
const TOUCH_TARGET_MIN_PX = 44
const RECORDING_MS = 1200
const SETTINGS_URL = '/company-settings?tab=audioTranscription'
const TOGGLE_LABEL = 'Transcrever os áudios das conversas desta empresa'
const TAB_NAME = 'Transcrição de áudios'
const TRIP_PERMISSIONS = ['fleet.read', 'trip.manage'] as const

async function savePrint(page: Page, name: string): Promise<void> {
  if (process.env.PLAYWRIGHT_SAVE_PRINTS !== 'true') return
  mkdirSync(PRINTS_DIRECTORY, { recursive: true })
  await page.screenshot({ path: resolve(PRINTS_DIRECTORY, name) })
}

async function openConversation(
  page: Page,
  state: ConversationState,
): Promise<Readonly<{ dialog: Locator; failures: () => readonly string[] }>> {
  await page.setViewportSize(DESKTOP)
  await installMicrophone(page)
  const failures = trackApiFailures(page)
  await mockTripWorkspaceApi({ mode: 'all-authorized', page, permissions: TRIP_PERMISSIONS })
  await mockSubjectConversationApi({ page, state })
  await loginAsLocalUser(page)
  await navigate(page, `/trips/${TRIP_ID}`)
  await page.getByRole('button', { name: 'Conversa com o motorista' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Conversa com o motorista' })
  await expect(dialog.locator('.cv-p-audio').first()).toBeVisible()
  return { dialog, failures }
}

async function openSettings(
  page: Page,
  input: Readonly<{ permissions: readonly string[]; settings: SettingsState }>,
): Promise<() => readonly string[]> {
  await page.setViewportSize(DESKTOP)
  const failures = trackApiFailures(page)
  await mockSettingsShell(page, { permissions: input.permissions })
  await mockAudioTranscriptionSettingsApi({ page, state: input.settings })
  await loginAsLocalUser(page)
  await navigate(page, SETTINGS_URL)
  return failures
}

async function readBox(locator: Locator): Promise<{ height: number; width: number }> {
  return locator.evaluate((element) => {
    const { height, width } = element.getBoundingClientRect()
    return { height, width }
  })
}

async function expectTouchTarget(locator: Locator, name: string): Promise<void> {
  const box = await readBox(locator)
  expect(box.height, `${name} altura`).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
  expect(box.width, `${name} largura`).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
}

test('conversa: o player do motorista e a transcrição nos quatro estados', async ({ page }) => {
  const state = createConversationState()
  const { dialog, failures } = await openConversation(page, state)

  await expect(dialog.locator('.cv-p-audio')).toHaveCount(4)
  await expect(dialog.locator('.cv-p-audio__error')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Tocar áudio' })).toHaveCount(4)
  await expect(dialog.getByRole('button', { name: 'Tocar áudio' }).first()).toBeEnabled()
  const transcriptions = dialog.locator('.cv-p-transcription')
  await expect(dialog.locator('.cv-p-transcription__text')).toHaveText(TRANSCRIPTION_TEXT)
  await expect(dialog.locator('.cv-p-transcription__notice')).toHaveText([
    'Transcrição gerada por máquina',
    'Transcrição gerada por máquina',
  ])
  await expect(dialog.getByText('Transcrevendo…')).toHaveCount(1)
  await expect(dialog.locator('.cv-p-transcription--pending')).toBeVisible()
  await expect(dialog.getByText('Nada foi dito no áudio')).toBeVisible()
  await expect(dialog.locator('.cv-p-transcription--too-long')).toHaveText(
    'Transcrição só para áudios de menos de 10 minutos',
  )
  await expect(transcriptions.filter({ hasText: 'menos de 10 minutos' })).toHaveCount(1)
  await expect.poll(() => state.markReadCount).toBeGreaterThan(0)

  await savePrint(page, 't5-3-conversa-quatro-estados-1440x900.png')
  expect(failures()).toEqual([])
})

test('conversa: transcrição desligada mostra só o player', async ({ page }) => {
  const state = createConversationState()
  state.isTranscriptionEnabled = false
  const { dialog, failures } = await openConversation(page, state)

  await expect(dialog.locator('.cv-p-audio')).toHaveCount(4)
  await expect(dialog.locator('[class*="cv-p-transcription"]')).toHaveCount(0)
  await expect(dialog.getByText('Transcrição gerada por máquina')).toHaveCount(0)
  await expect(dialog.getByText('Transcrevendo…')).toHaveCount(0)
  await expect(dialog.getByText('Nada foi dito no áudio')).toHaveCount(0)
  expect(failures()).toEqual([])
})

test('conversa: gravar, ouvir e enviar manda uma mensagem de áudio, sem texto e sem duplicar', async ({
  page,
}) => {
  const state = createConversationState()
  const { dialog, failures } = await openConversation(page, state)
  const composer = dialog.locator('textarea.cv-p-composer__input')
  await expect(composer).toHaveValue('')

  const record = dialog.getByRole('button', { name: 'Gravar áudio' })
  await expect(record).toBeVisible()
  await expectTouchTarget(record, 'gravar')
  await record.click()
  await expect(dialog.locator('.cv-p-recorder__elapsed')).toBeVisible()
  await expect(dialog.locator('.cv-p-recorder__elapsed')).toContainText(/\d:\d\d de 5:00/u)
  await page.waitForTimeout(RECORDING_MS)
  await expectTouchTarget(dialog.locator('.cv-p-recorder__stop'), 'parar')
  await dialog.locator('.cv-p-recorder__stop').click()

  const review = dialog.locator('.cv-p-recorder--review')
  await expect(review.locator('.cv-p-audio')).toBeVisible()
  await expectTouchTarget(review.locator('.cv-p-recorder__send'), 'enviar')
  await expectTouchTarget(review.locator('.cv-p-recorder__discard'), 'descartar')
  await review.getByRole('button', { name: 'Tocar áudio' }).click()
  await review.locator('.cv-p-recorder__send').click()

  await expect(dialog.locator('.cv-p-recorder')).toHaveCount(0)
  await expect(dialog.locator('.cv-p-bubble--mine .cv-p-audio')).toHaveCount(1)
  await page.waitForTimeout(1500)
  expect(state.uploadRequests).toHaveLength(1)
  expect(state.storagePuts).toBe(1)
  expect(state.sentMessages).toHaveLength(1)
  const sent = state.sentMessages[0]
  expect(sent?.body).toMatchObject({ body: '' })
  expect((sent?.body as { attachmentIds: string[] }).attachmentIds).toHaveLength(1)
  expect(sent?.idempotencyKey).toMatch(/^subject-message:/u)
  expect(state.uploadRequests[0]).toMatchObject({ contentType: expect.stringMatching(/^audio\//u) })
  expect(failures()).toEqual([])
})

test('conversa: o texto continua indo e o descarte não envia', async ({ page }) => {
  const state = createConversationState()
  const { dialog, failures } = await openConversation(page, state)

  await dialog.getByRole('button', { name: 'Gravar áudio' }).click()
  await page.waitForTimeout(RECORDING_MS)
  await dialog.locator('.cv-p-recorder__stop').click()
  await dialog.locator('.cv-p-recorder__discard').click()
  await expect(dialog.locator('.cv-p-recorder')).toHaveCount(0)
  expect(state.sentMessages).toHaveLength(0)
  expect(state.uploadRequests).toHaveLength(0)

  await dialog.locator('textarea.cv-p-composer__input').fill('Mensagem de texto de teste')
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(dialog.getByText('Mensagem de texto de teste')).toBeVisible()
  expect(state.sentMessages).toHaveLength(1)
  expect(state.uploadRequests).toHaveLength(0)
  expect(failures()).toEqual([])
})

test('configurações: liga, desliga uma vez, religa e a frase do D9 fica à vista', async ({
  page,
}) => {
  const settings = createSettingsState(true)
  const failures = await openSettings(page, { permissions: ['settings.manage'], settings })

  const toggle = page.getByRole('checkbox', { name: TOGGLE_LABEL })
  await expect(toggle).toBeChecked()
  const description = page.locator('section', { hasText: TOGGLE_LABEL })
  await expect(
    description.getByText('Só áudios de menos de 10 minutos são transcritos.'),
  ).toBeVisible()
  await expect(
    description.getByText(/Ao desligar: as transcrições já geradas ficam guardadas/u),
  ).toBeVisible()
  await expect(description.getByText(/Última alteração:/u)).toBeVisible()
  await savePrint(page, 't5-3-configuracoes-1440x900.png')

  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect.poll(() => settings.puts).toEqual([{ enabled: false }])
  await expect(page.getByText('Salvando a configuração')).toHaveCount(0)
  expect(settings.puts).toHaveLength(1)

  await toggle.click()
  await expect(toggle).toBeChecked()
  await expect.poll(() => settings.puts).toEqual([{ enabled: false }, { enabled: true }])
  expect(failures()).toEqual([])
})

for (const status of [500, 403]) {
  test(`configurações: PUT ${status} volta ao valor anterior com o erro à vista`, async ({
    page,
  }) => {
    const settings = createSettingsState(true)
    const failures = await openSettings(page, { permissions: ['settings.manage'], settings })
    const toggle = page.getByRole('checkbox', { name: TOGGLE_LABEL })
    await expect(toggle).toBeChecked()

    settings.failNextPutWith = status
    await toggle.click()
    const alert = page.getByRole('alert').filter({ hasText: /configuração anterior|permissão/u })
    await expect(alert).toBeVisible()
    await expect(alert).toHaveText(
      status === 403
        ? 'Você não tem permissão para alterar esta configuração.'
        : 'Não foi possível falar com o servidor. A configuração anterior foi mantida.',
    )
    await expect(toggle).toBeChecked()
    expect(settings.puts).toEqual([{ enabled: false }])
    expect(settings.isEnabled).toBe(true)
    expect(failures()).toEqual([])
  })
}

test('configurações: acessibilidade do controle e da frase do limite', async ({ page }) => {
  const settings = createSettingsState(true)
  const failures = await openSettings(page, { permissions: ['settings.manage'], settings })
  const toggle = page.getByRole('checkbox', { name: TOGGLE_LABEL })
  await expect(toggle).toBeVisible()

  const described = await toggle.evaluate((input) => {
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
    return ids.map((id) => document.getElementById(id)?.textContent ?? '')
  })
  expect(described).toHaveLength(1)
  expect(described[0]).toContain('menos de 10 minutos')
  expect(described[0]).toContain('Ao desligar:')
  expect(described[0]).toContain('gerada por máquina')
  expect(failures()).toEqual([])
})

test('configurações: sem settings.manage a aba nem existe e nada é consultado', async ({
  page,
}) => {
  const settings = createSettingsState(true)
  const failures = await openSettings(page, { permissions: ['fleet.read'], settings })
  await page.waitForTimeout(1500)

  await expect(page.getByRole('tab', { name: TAB_NAME })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: TOGGLE_LABEL })).toHaveCount(0)
  expect(settings.getCount).toBe(0)
  expect(settings.puts).toHaveLength(0)
  expect(failures()).toEqual([])
})

test('configurações e conversa andam juntas: desligar na empresa tira a transcrição da conversa', async ({
  page,
}) => {
  const settings = createSettingsState(true)
  const conversation = createConversationState()
  await page.setViewportSize(DESKTOP)
  await installMicrophone(page)
  const failures = trackApiFailures(page)
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page,
    permissions: [...TRIP_PERMISSIONS, 'settings.manage'],
  })
  await mockSubjectConversationApi({ page, state: conversation })
  await mockSettingsShell(page, { permissions: [...TRIP_PERMISSIONS, 'settings.manage'] })
  await mockAudioTranscriptionSettingsApi({ conversation, page, state: settings })
  await loginAsLocalUser(page)

  await navigate(page, SETTINGS_URL)
  const toggle = page.getByRole('checkbox', { name: TOGGLE_LABEL })
  await toggle.click()
  await expect.poll(() => settings.puts).toEqual([{ enabled: false }])

  await navigate(page, `/trips/${TRIP_ID}`)
  await page.getByRole('button', { name: 'Conversa com o motorista' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Conversa com o motorista' })
  await expect(dialog.locator('.cv-p-audio')).toHaveCount(4)
  await expect(dialog.locator('[class*="cv-p-transcription"]')).toHaveCount(0)
  expect(failures()).toEqual([])
})
