/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.2 (contract.md §5.2): o mapper `toParticipantTranscription` por tabela de casos e o contrato
 * de paridade — cada saída é aceita, sem perda, por `participantTranscriptionSchema` e
 * `participantAttachmentSchema` do `@adatechnology/conversation-contracts` (0.6.0, `devDependency` exata).
 *
 * O pacote traz `zod ^3` e a API usa `zod 4`: a segunda cópia fica só em `test/**` e é inofensiva, porque o
 * schema é usado apenas pelo próprio pacote.
 */
import { describe, expect, test } from 'bun:test'

import {
  participantAttachmentSchema,
  participantTranscriptionSchema,
} from '@adatechnology/conversation-contracts'

import {
  PARTICIPANT_AUDIO_DURATION_MAX_MS,
  PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16,
} from '../../src/occurrence-conversation/domain/participant-transcription.constant.js'
import {
  resolveAudioDurationMs,
  toParticipantTranscription,
} from '../../src/occurrence-conversation/domain/participant-transcription.mapper.js'
import type { TranscriptionRowInput } from '../../src/occurrence-conversation/domain/participant-transcription.types.js'

const GENERATED_AT = new Date('2026-10-12T11:00:00.000Z')
const GENERATED_AT_ISO = '2026-10-12T11:00:00.000Z'
const EMOJI = '\u{1F600}'

function readyRow(overrides: Partial<TranscriptionRowInput> = {}): TranscriptionRowInput {
  return {
    engine: 'whisper-local',
    failureCode: null,
    generatedAt: GENERATED_AT,
    language: 'pt',
    maxDurationMs: null,
    status: 'ready',
    text: 'Cheguei na doca.',
    ...overrides,
  }
}

function otherRow(overrides: Partial<TranscriptionRowInput>): TranscriptionRowInput {
  return {
    engine: null,
    failureCode: null,
    generatedAt: null,
    language: null,
    maxDurationMs: null,
    status: 'pending',
    text: null,
    ...overrides,
  }
}

const TOO_LONG_ROW = otherRow({ failureCode: 'too_long', maxDurationMs: 600_000, status: 'failed' })

type MapperCase = {
  readonly expected: unknown
  readonly isEnabled: boolean
  readonly label: string
  readonly row: TranscriptionRowInput | undefined
}

const MAPPER_CASES: readonly MapperCase[] = [
  { expected: undefined, isEnabled: true, label: 'sem linha: ausente', row: undefined },
  {
    expected: { status: 'disabled' },
    isEnabled: false,
    label: 'empresa desligada sem linha: disabled',
    row: undefined,
  },
  {
    expected: { status: 'disabled' },
    isEnabled: false,
    label: 'empresa desligada com linha ready: disabled',
    row: readyRow(),
  },
  {
    expected: { status: 'pending' },
    isEnabled: true,
    label: 'pending',
    row: otherRow({ status: 'pending' }),
  },
  {
    expected: {
      engine: 'whisper-local',
      generatedAt: GENERATED_AT_ISO,
      language: 'pt',
      status: 'ready',
      text: 'Cheguei na doca.',
    },
    isEnabled: true,
    label: 'ready com texto, idioma e motor',
    row: readyRow(),
  },
  {
    expected: { generatedAt: GENERATED_AT_ISO, status: 'ready', text: 'oi' },
    isEnabled: true,
    label: 'ready com idioma e motor nulos: chaves omitidas',
    row: readyRow({ engine: null, language: null, text: 'oi' }),
  },
  {
    expected: { generatedAt: GENERATED_AT_ISO, status: 'ready', text: 'oi' },
    isEnabled: true,
    label: 'ready com idioma fora do padrão (PT, pt-BR, vazio): omitido',
    row: readyRow({ engine: '', language: 'pt-BR', text: 'oi' }),
  },
  {
    expected: { generatedAt: GENERATED_AT_ISO, language: 'por', status: 'ready', text: 'oi' },
    isEnabled: true,
    label: 'ready com idioma de três letras',
    row: readyRow({ engine: null, language: 'por', text: 'oi' }),
  },
  {
    expected: { generatedAt: GENERATED_AT_ISO, status: 'ready', text: '' },
    isEnabled: true,
    label: 'ready com texto vazio: silêncio é resultado',
    row: readyRow({ engine: null, language: null, text: '' }),
  },
  {
    expected: undefined,
    isEnabled: true,
    label: 'ready sem texto (expurgado): ausente',
    row: readyRow({ text: null }),
  },
  {
    expected: { generatedAt: GENERATED_AT_ISO, status: 'ready', text: 'ab' },
    isEnabled: true,
    label: 'ready com NUL no texto: NUL removido',
    row: readyRow({ engine: null, language: null, text: 'a\u0000b' }),
  },
  {
    expected: GENERATED_AT_ISO,
    isEnabled: true,
    label: 'generatedAt sai sempre em Z, qualquer que seja o fuso da origem',
    row: readyRow({ generatedAt: new Date('2026-10-12T08:00:00-03:00') }),
  },
  {
    expected: { maxDurationMs: 600_000, reason: 'too_long', status: 'failed' },
    isEnabled: true,
    label: 'failed/too_long',
    row: TOO_LONG_ROW,
  },
  {
    expected: undefined,
    isEnabled: true,
    label: 'failed de outro código: ausente',
    row: otherRow({ failureCode: 'engine_failed', status: 'failed' }),
  },
  {
    expected: undefined,
    isEnabled: true,
    label: 'status desconhecido (inclusive purged): ausente',
    row: otherRow({ status: 'purged' }),
  },
]

/** O teto da frase da UI (`maxDurationMs`) só vale inteiro positivo. */
const INVALID_TOO_LONG_ROWS: readonly [string, TranscriptionRowInput][] = [
  ['zero', { ...TOO_LONG_ROW, maxDurationMs: 0 }],
  ['negativo', { ...TOO_LONG_ROW, maxDurationMs: -1 }],
  ['fracionário', { ...TOO_LONG_ROW, maxDurationMs: 1.5 }],
  ['nulo', { ...TOO_LONG_ROW, maxDurationMs: null }],
]

function hasLoneSurrogate(text: string): boolean {
  return !text.isWellFormed()
}

describe('toParticipantTranscription (tabela de casos)', () => {
  for (const testCase of MAPPER_CASES) {
    test(testCase.label, () => {
      const result = toParticipantTranscription({
        isEnabled: testCase.isEnabled,
        row: testCase.row,
      })

      if (testCase.label.startsWith('generatedAt')) {
        expect(result).toMatchObject({ generatedAt: testCase.expected })
        return
      }
      expect(result).toEqual(testCase.expected as never)
    })
  }

  test.each(INVALID_TOO_LONG_ROWS)('failed/too_long com teto %s: ausente', (_label, row) => {
    expect(toParticipantTranscription({ isEnabled: true, row })).toBeUndefined()
  })

  test('nulo nunca vira null no JSON: nenhuma chave com valor nulo', () => {
    for (const testCase of MAPPER_CASES) {
      const json = JSON.stringify(
        toParticipantTranscription({ isEnabled: testCase.isEnabled, row: testCase.row }) ?? {},
      )
      expect(json).not.toContain('null')
    }
  })

  test('texto acima do teto é cortado em 40 000 unidades UTF-16', () => {
    const result = toParticipantTranscription({
      isEnabled: true,
      row: readyRow({ text: 'x'.repeat(PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16 + 1) }),
    })

    expect(result).toMatchObject({ status: 'ready' })
    expect((result as { text: string }).text).toHaveLength(PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16)
  })

  test('20 000 emojis (limite do banco) cabem inteiros nas 40 000 unidades', () => {
    const text = EMOJI.repeat(20_000)
    const result = toParticipantTranscription({ isEnabled: true, row: readyRow({ text }) })

    expect((result as { text: string }).text).toBe(text)
  })

  test('o corte nunca parte um par substituto', () => {
    const text = `a${EMOJI.repeat(20_000)}`
    const result = toParticipantTranscription({ isEnabled: true, row: readyRow({ text }) })
    const cut = (result as { text: string }).text

    expect(cut).toHaveLength(PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16 - 1)
    expect(hasLoneSurrogate(cut)).toBe(false)
  })
})

describe('resolveAudioDurationMs', () => {
  test.each([
    ['o anexo vence', 12_000, 9_000, 12_000],
    ['sem anexo, vale a medida do worker', null, 9_000, 9_000],
    ['anexo inválido cai para a medida', 0, 9_000, 9_000],
    ['nenhum: omitido', null, null, undefined],
    ['fracionário: omitido', 1.5, undefined, undefined],
    ['negativo: omitido', -5, null, undefined],
    ['acima do teto do contrato: omitido', PARTICIPANT_AUDIO_DURATION_MAX_MS + 1, null, undefined],
    [
      'no teto do contrato',
      PARTICIPANT_AUDIO_DURATION_MAX_MS,
      null,
      PARTICIPANT_AUDIO_DURATION_MAX_MS,
    ],
  ] as const)('%s', (_label, attachmentDurationMs, transcriptionDurationMs, expected) => {
    expect(resolveAudioDurationMs({ attachmentDurationMs, transcriptionDurationMs })).toBe(expected)
  })
})

describe('paridade com @adatechnology/conversation-contracts', () => {
  test('o schema do pacote ainda é a versão que a tabela espelha', () => {
    expect(PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16).toBe(40_000)
    expect(
      participantTranscriptionSchema.safeParse({
        status: 'ready',
        text: 'x'.repeat(40_001),
        generatedAt: GENERATED_AT_ISO,
      }).success,
    ).toBe(false)
    expect(
      participantTranscriptionSchema.safeParse({
        status: 'ready',
        text: 'x'.repeat(40_000),
        generatedAt: GENERATED_AT_ISO,
      }).success,
    ).toBe(true)
  })

  for (const testCase of MAPPER_CASES) {
    const output = toParticipantTranscription({
      isEnabled: testCase.isEnabled,
      row: testCase.row,
    })
    if (output === undefined) continue

    test(`transcrição aceita sem perda: ${testCase.label}`, () => {
      const parsed = participantTranscriptionSchema.safeParse(output)

      expect(parsed.success).toBe(true)
      expect(parsed.data).toEqual(output as never)
    })

    test(`anexo de áudio aceito com transcrição e duração: ${testCase.label}`, () => {
      const attachment = {
        durationMs: 12_000,
        filename: 'audio.ogg',
        id: 'attachment-1',
        kind: 'audio',
        mimeType: 'audio/ogg',
        sizeBytes: 2048,
        transcription: output,
      }
      const parsed = participantAttachmentSchema.safeParse(attachment)

      expect(parsed.success).toBe(true)
      expect(parsed.data).toEqual(attachment as never)
    })
  }

  test('as saídas extremas (corte, emoji, NUL) também passam no schema', () => {
    for (const text of [
      'x'.repeat(50_000),
      EMOJI.repeat(20_000),
      `a${EMOJI.repeat(20_000)}`,
      'a\u0000b',
    ]) {
      const output = toParticipantTranscription({ isEnabled: true, row: readyRow({ text }) })

      expect(participantTranscriptionSchema.safeParse(output).success).toBe(true)
    }
  })
})
