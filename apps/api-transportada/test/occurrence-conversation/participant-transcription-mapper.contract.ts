/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.2 (contract.md §5.2): o mapper puro `toParticipantTranscription` e a duração, uma linha por
 * caso da tabela. Nulo nunca vira `null` no JSON: a chave some.
 */
import { describe, expect, test } from 'bun:test'

import {
  toParticipantDurationMs,
  toParticipantTranscription,
} from '../../src/occurrence-conversation/domain/participant-transcription.policy.js'
import {
  GENERATED_AT,
  READY_ROW,
  transcriptionRow,
} from '../fixtures/participant-transcription.fixture.js'

export const MAPPER_CASES = [
  { enabled: true, expected: undefined, name: 'sem linha: ausente', row: undefined },
  {
    enabled: false,
    expected: { status: 'disabled' },
    name: 'empresa desligada sem linha',
    row: undefined,
  },
  {
    enabled: false,
    expected: { status: 'disabled' },
    name: 'empresa desligada com linha pronta',
    row: READY_ROW,
  },
  {
    enabled: true,
    expected: { status: 'pending' },
    name: 'pending',
    row: transcriptionRow({ status: 'pending' }),
  },
  {
    enabled: true,
    expected: {
      engine: 'whisper-local',
      generatedAt: '2026-10-12T10:30:00.000Z',
      language: 'pt',
      status: 'ready',
      text: 'Cheguei na doca.',
    },
    name: 'ready com idioma e motor',
    row: { ...READY_ROW, engine: 'whisper-local' },
  },
  {
    enabled: true,
    expected: { generatedAt: '2026-10-12T10:30:00.000Z', status: 'ready', text: '' },
    name: 'ready com texto vazio e sem idioma nem motor: chaves omitidas, nunca null',
    row: transcriptionRow({
      engine: null,
      generatedAt: GENERATED_AT,
      language: null,
      status: 'ready',
      text: '',
    }),
  },
  {
    enabled: true,
    expected: { generatedAt: '2026-10-12T10:30:00.000Z', status: 'ready', text: 'Oi' },
    name: 'ready com texto nulo vira texto vazio e idioma fora de /^[a-z]{2,3}$/ some',
    row: transcriptionRow({
      engine: null,
      generatedAt: GENERATED_AT,
      language: 'pt-BR',
      status: 'ready',
      text: 'Oi',
    }),
  },
  {
    enabled: true,
    expected: { maxDurationMs: 600_000, reason: 'too_long', status: 'failed' },
    name: 'failed too_long carrega o teto',
    row: transcriptionRow({ failureCode: 'too_long', maxDurationMs: 600_000, status: 'failed' }),
  },
  {
    enabled: true,
    expected: { status: 'failed' },
    name: 'failed com outro código é failed comum',
    row: transcriptionRow({ failureCode: 'engine_failed', status: 'failed' }),
  },
  {
    enabled: true,
    expected: { status: 'failed' },
    name: 'failed por empresa desligada e religada é failed comum',
    row: transcriptionRow({ failureCode: 'company_disabled', status: 'failed' }),
  },
  {
    enabled: true,
    expected: undefined,
    name: 'purged: ausente',
    row: transcriptionRow({ status: 'purged' }),
  },
] as const

describe('toParticipantTranscription (spec 264 T2.2, contract.md §5.2)', () => {
  for (const testCase of MAPPER_CASES) {
    test(testCase.name, () => {
      const output = toParticipantTranscription(testCase.row, testCase.enabled)
      expect(output).toEqual(testCase.expected)
      expect(JSON.stringify(output ?? {})).not.toInclude('null')
    })
  }

  test('o texto só sai em ready: pending e failed não carregam text', () => {
    const pending = toParticipantTranscription(
      transcriptionRow({ text: 'vazou', status: 'pending' }),
      true,
    )
    const failed = toParticipantTranscription(
      transcriptionRow({ failureCode: 'engine_failed', status: 'failed', text: 'vazou' }),
      true,
    )
    expect(pending).not.toHaveProperty('text')
    expect(failed).not.toHaveProperty('text')
  })
})

describe('toParticipantDurationMs (spec 264 T2.2)', () => {
  test('a duração do anexo vence a da transcrição', () => {
    expect(toParticipantDurationMs(3000, 4200)).toBe(3000)
  })

  test('sem a do anexo, vale a da transcrição', () => {
    expect(toParticipantDurationMs(null, 4200)).toBe(4200)
    expect(toParticipantDurationMs(undefined, 4200)).toBe(4200)
  })

  test('só inteiro positivo até o teto do contrato; o resto some', () => {
    expect(toParticipantDurationMs(null, null)).toBeUndefined()
    expect(toParticipantDurationMs(0, null)).toBeUndefined()
    expect(toParticipantDurationMs(-5, null)).toBeUndefined()
    expect(toParticipantDurationMs(1.5, null)).toBeUndefined()
    expect(toParticipantDurationMs(86_400_001, null)).toBeUndefined()
    expect(toParticipantDurationMs(86_400_000, null)).toBe(86_400_000)
  })
})
