/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'bun:test'

import { createAudioCaptureBridge } from '../../src/modules/conversation/shared/driverAudioCapture.service'
import { reduceOutboxNotice } from '../../src/modules/conversation/shared/conversationOutboxNotice.service'
import {
  CAPTURE_KINDS,
  createCaptureRegistry,
} from '../../src/modules/driver-trip/shared/captureRegistry.service'

const PAGE = new URL(
  '../../src/modules/conversation/pages/DriverConversations.page.tsx',
  import.meta.url,
)
const LOCALES = {
  en: new URL(
    '../../src/modules/conversation/locales/conversation.en.locale.json',
    import.meta.url,
  ),
  'pt-BR': new URL(
    '../../src/modules/conversation/locales/conversation.locale.json',
    import.meta.url,
  ),
} as const

describe('gravação de áudio no app do motorista (spec 264 T4.3)', () => {
  it('a gravação aberta é uma captura: bloqueia a navegação da página até fechar', () => {
    const registry = createCaptureRegistry()
    const onCaptureChange = createAudioCaptureBridge(registry)

    expect(CAPTURE_KINDS).toContain('audio')
    onCaptureChange(true)
    expect(registry.isIdle()).toBe(false)
    onCaptureChange(false)
    expect(registry.isIdle()).toBe(true)
  })

  it('aviso repetido do SDK não empilha captura: um false basta para liberar', () => {
    const registry = createCaptureRegistry()
    const onCaptureChange = createAudioCaptureBridge(registry)

    onCaptureChange(true)
    onCaptureChange(true)
    onCaptureChange(false)
    onCaptureChange(false)

    expect(registry.isIdle()).toBe(true)
  })

  it('a página liga a prop audioRecording ao registro de capturas, sem teto próprio', async () => {
    const page = await readFile(PAGE, 'utf8')

    expect(page).toContain('audioRecording={')
    expect(page).toContain('createAudioCaptureBridge(captureRegistry)')
    expect(page).not.toContain('maxDurationMs')
    expect(page).not.toContain('maxSizeBytes')
  })

  it('fila cheia vira aviso até algo sair da fila; o resto dos eventos não mexe', () => {
    expect(reduceOutboxNotice(undefined, { type: 'enqueue-refused' })).toBe('outbox-full')
    expect(reduceOutboxNotice('outbox-full', { type: 'pending-changed' })).toBe('outbox-full')
    expect(
      reduceOutboxNotice('outbox-full', {
        subject: { subjectId: 'a', subjectType: 'trip' },
        type: 'message-settled',
      }),
    ).toBeUndefined()
  })

  for (const locale of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
    it(`${locale}: traz o aviso de fila cheia`, async () => {
      const catalog = JSON.parse(await readFile(LOCALES[locale], 'utf8')) as { outboxFull?: string }

      expect(catalog.outboxFull?.trim()).toBeTruthy()
    })
  }
})
