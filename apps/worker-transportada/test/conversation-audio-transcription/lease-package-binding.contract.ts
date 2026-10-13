/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (revisão da T3.4, H4): o pacote `whisper-local` usa o `timeoutMs` DUAS vezes — a conversão com
 * `ffmpeg` e depois o `whisper-cli` —, então o pior caso do motor é 2 × o timeout. A fórmula do lease fica
 * presa ao código instalado: se o pacote mudar o número de usos, este contrato reprova.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { computeLeaseMilliseconds } from '../../src/conversation-audio-transcription/audio-transcription-retry.policy.js'

const PACKAGE_SOURCE = readFileSync(
  new URL(
    '../../node_modules/@adatechnology/audio-transcription-provider/dist/whisper-local/index.js',
    import.meta.url,
  ),
  'utf8',
)

describe('the lease formula follows the installed whisper-local package (spec 264 H4)', () => {
  test('the package applies the engine timeout to two child processes', () => {
    const uses = [...PACKAGE_SOURCE.matchAll(/timeout:\s*timeoutMs/gu)]
    expect(uses).toHaveLength(2)
    expect(PACKAGE_SOURCE).toContain('convertToWav')
    expect(PACKAGE_SOURCE).toContain('runWhisper')
  })

  test('each extra millisecond of engine timeout costs two milliseconds of lease', () => {
    expect(computeLeaseMilliseconds(1_000) - computeLeaseMilliseconds(0)).toBe(2_000)
  })
})
