/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T705 (RF17, P9): o áudio da conversa. A gravação escolhe o primeiro formato que o
 * navegador grava, na ordem do pacote (OGG, M4A, WEBM — os três da lista da API), e para sozinha no
 * teto do pacote (5 min). O arquivo gravado é um anexo como outro qualquer: o mesmo seletor, os
 * mesmos tetos por canal. O player troca a velocidade em 1×, 1,5× e 2×.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { DEFAULT_MAX_RECORDING_MILLISECONDS } from '@adatechnology/conversations-ui'

import {
  ATTACHMENT_URL_REUSE_MS,
  createAttachmentUrlCache,
  CONVERSATION_PLAYBACK_RATES,
  CONVERSATION_RECORDING_MAX_MS,
  buildRecordedAudioFile,
  formatAudioDuration,
  isConversationAudio,
  nextPlaybackRate,
  pickRecordingFormat,
} from '@/modules/occurrence-conversation/shared/conversationAudio.service'
import { pickConversationAttachments } from '@/modules/occurrence-conversation/shared/conversationAttachment.service'

describe('gravar (spec 183 T705)', () => {
  test('o primeiro formato que o navegador grava, na ordem OGG, M4A, WEBM', () => {
    expect(pickRecordingFormat((type) => type === 'audio/webm')?.uploadMimeType).toBe('audio/webm')
    expect(
      pickRecordingFormat((type) => type === 'audio/mp4' || type === 'audio/webm')?.uploadMimeType,
    ).toBe('audio/mp4')
    expect(pickRecordingFormat(() => true)?.uploadMimeType).toBe('audio/ogg')
    expect(pickRecordingFormat(() => false)).toBeUndefined()
    expect(pickRecordingFormat(undefined)).toBeUndefined()
  })

  test('o teto de duração é o do pacote: 5 minutos', () => {
    expect(CONVERSATION_RECORDING_MAX_MS).toBe(DEFAULT_MAX_RECORDING_MILLISECONDS)
    expect(CONVERSATION_RECORDING_MAX_MS).toBe(5 * 60 * 1000)
  })

  test('o arquivo gravado leva o tipo sem codec, a extensão e passa no seletor de cada canal', () => {
    const format = pickRecordingFormat((type) => type.startsWith('audio/webm'))
    if (format === undefined) throw new Error('EXPECTED_FORMAT')
    const file = buildRecordedAudioFile({
      chunks: [new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2])])],
      format,
      now: new Date('2026-09-25T18:04:05.000Z'),
    })

    expect(file.type).toBe('audio/webm')
    expect(file.name).toBe('audio-20260925-180405.webm')
    for (const channel of ['app', 'portal', 'email'] as const) {
      expect(pickConversationAttachments({ channel, current: [], incoming: [file] }).files).toEqual(
        [file],
      )
    }
  })
})

describe('ouvir (spec 183 T705)', () => {
  test('só os tipos de áudio da lista tocam no player', () => {
    expect(isConversationAudio('audio/ogg')).toBe(true)
    expect(isConversationAudio('audio/mpeg')).toBe(true)
    expect(isConversationAudio('application/pdf')).toBe(false)
    expect(isConversationAudio('audio/x-unknown')).toBe(false)
  })

  test('a velocidade roda 1×, 1,5×, 2× e volta', () => {
    expect(CONVERSATION_PLAYBACK_RATES).toEqual([1, 1.5, 2])
    expect(nextPlaybackRate(1)).toBe(1.5)
    expect(nextPlaybackRate(1.5)).toBe(2)
    expect(nextPlaybackRate(2)).toBe(1)
    expect(nextPlaybackRate(3)).toBe(1)
  })

  test('a duração em m:ss; indefinida vira traço', () => {
    expect(formatAudioDuration(0)).toBe('0:00')
    expect(formatAudioDuration(65_400)).toBe('1:05')
    expect(formatAudioDuration(300_000)).toBe('5:00')
    expect(formatAudioDuration(Number.NaN)).toBe('–')
  })
})

describe('a URL do anexo não muda a cada leitura (spec 183 T705)', () => {
  test('a mesma URL enquanto a assinada vale; depois do prazo, a nova', () => {
    const cache = createAttachmentUrlCache()
    const start = Date.parse('2026-09-25T18:00:00.000Z')

    expect(cache.resolve('attachment-1', 'https://s3.test/a?sig=1', start)).toBe(
      'https://s3.test/a?sig=1',
    )
    /** A leitura automática de 20 s traz outra assinatura: o `<audio>` que toca não recomeça. */
    expect(cache.resolve('attachment-1', 'https://s3.test/a?sig=2', start + 20_000)).toBe(
      'https://s3.test/a?sig=1',
    )
    expect(
      cache.resolve('attachment-1', 'https://s3.test/a?sig=3', start + ATTACHMENT_URL_REUSE_MS),
    ).toBe('https://s3.test/a?sig=3')
    expect(cache.resolve('attachment-2', 'https://s3.test/b?sig=1', start + 20_000)).toBe(
      'https://s3.test/b?sig=1',
    )
  })

  test('o reuso fica abaixo da validade da URL assinada (5 min)', () => {
    expect(ATTACHMENT_URL_REUSE_MS).toBeLessThan(5 * 60 * 1000)
  })
})

describe('o microfone não fica ligado de carona (spec 183 T903, achado F6)', () => {
  test('enquanto o navegador pede o microfone, o botão de gravar fica desabilitado', async () => {
    const component = await readFile(
      new URL(
        '../../src/modules/occurrence-conversation/components/ConversationAudioRecorder.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(component).toContain("setState('starting')")
    expect(component).toMatch(/disabled=\{disabled \|\| state === 'starting'\}/u)
  })
})
