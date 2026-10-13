/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DEFAULT_PARTICIPANT_AUDIO_LABELS } from '@adatechnology/conversations-ui/participant'
import { describe, expect, it } from 'bun:test'

import {
  DRIVER_AUDIO_RECORDING_LIMITS,
  createDriverAudioRecordingOptions,
} from '../../src/modules/conversation/shared/driverAudioRecording.service'
import { createCaptureRegistry } from '../../src/modules/driver-trip/shared/captureRegistry.service'

const PAGE_SOURCE = new URL(
  '../../src/modules/conversation/pages/DriverConversations.page.tsx',
  import.meta.url,
)
const SERVICE_SOURCE = new URL(
  '../../src/modules/conversation/shared/driverAudioRecording.service.ts',
  import.meta.url,
)
const SDK_DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000
const SDK_DEFAULT_MAX_BYTES = 16 * 1024 * 1024

describe('gravação de áudio do motorista: opções e captura (spec 264 T4.2/T4.3)', () => {
  it('os tetos só baixam o padrão do pacote: 5 min e 16 MiB (política de áudio da API)', () => {
    expect(DRIVER_AUDIO_RECORDING_LIMITS.maxDurationMs).toBeGreaterThan(0)
    expect(DRIVER_AUDIO_RECORDING_LIMITS.maxDurationMs).toBeLessThanOrEqual(
      SDK_DEFAULT_MAX_DURATION_MS,
    )
    expect(DRIVER_AUDIO_RECORDING_LIMITS.maxSizeBytes).toBeGreaterThan(0)
    expect(DRIVER_AUDIO_RECORDING_LIMITS.maxSizeBytes).toBeLessThanOrEqual(SDK_DEFAULT_MAX_BYTES)
  })

  it('gravação aberta segura o registro de capturas e fechar o libera', () => {
    const registry = createCaptureRegistry()
    const options = createDriverAudioRecordingOptions(registry)
    let idleCalls = 0
    registry.onIdle(() => {
      idleCalls += 1
    })

    options.onCaptureChange?.(true)
    expect(registry.isIdle()).toBe(false)
    expect(registry.hasOpened()).toBe(true)

    options.onCaptureChange?.(false)
    expect(registry.isIdle()).toBe(true)
    expect(idleCalls).toBe(1)
  })

  it('avisos repetidos não empilham nem deixam a captura presa', () => {
    const registry = createCaptureRegistry()
    const options = createDriverAudioRecordingOptions(registry)

    options.onCaptureChange?.(true)
    options.onCaptureChange?.(true)
    options.onCaptureChange?.(false)
    expect(registry.isIdle()).toBe(true)

    options.onCaptureChange?.(false)
    options.onCaptureChange?.(true)
    expect(registry.isIdle()).toBe(false)
    options.onCaptureChange?.(false)
    expect(registry.isIdle()).toBe(true)
  })

  it('a gravação conta como captura para a atualização do app e para o "Entrar de novo"', () => {
    const registry = createCaptureRegistry()
    createDriverAudioRecordingOptions(registry).onCaptureChange?.(true)

    expect(registry.isIdle(['proof-form'])).toBe(false)
  })

  it('a opção do app usa o registro da página e a página a passa ao pacote', async () => {
    const service = await Bun.file(SERVICE_SOURCE).text()
    const page = await Bun.file(PAGE_SOURCE).text()

    expect(service).toMatch(
      /export const driverAudioRecordingOptions = createDriverAudioRecordingOptions\(captureRegistry\)/u,
    )
    expect(page).toMatch(/audioRecording=\{driverAudioRecordingOptions\}/u)
  })
})

describe('rótulos do gravador nos dois idiomas (spec 264 T4.3)', () => {
  const locales = {
    en: new URL(
      '../../src/modules/conversation/locales/conversation.en.locale.json',
      import.meta.url,
    ),
    'pt-BR': new URL(
      '../../src/modules/conversation/locales/conversation.locale.json',
      import.meta.url,
    ),
  }

  it.each(Object.entries(locales))(
    '%s traduz todas as chaves de áudio do pacote',
    async (_name, url) => {
      const labels = ((await Bun.file(url).json()) as { labels: Record<string, unknown> }).labels

      for (const key of Object.keys(DEFAULT_PARTICIPANT_AUDIO_LABELS)) {
        expect(typeof labels[key]).toBe('string')
        expect((labels[key] as string).trim()).not.toBe('')
      }
    },
  )

  it('placeholders do pacote sobrevivem à tradução', async () => {
    for (const url of Object.values(locales)) {
      const labels = ((await Bun.file(url).json()) as { labels: Record<string, string> }).labels
      expect(labels.recordingElapsed).toContain('{elapsed}')
      expect(labels.recordingElapsed).toContain('{limit}')
      expect(labels.transcriptionTooLong).toContain('{minutes}')
    }
  })

  it('a frase da fila cheia existe nos dois idiomas', async () => {
    for (const url of Object.values(locales)) {
      const file = (await Bun.file(url).json()) as { outboxFull?: string }
      expect(file.outboxFull?.trim()).toBeTruthy()
    }
  })
})
