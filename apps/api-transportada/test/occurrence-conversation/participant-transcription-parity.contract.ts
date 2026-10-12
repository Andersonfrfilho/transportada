/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.2 (contract.md §5.2): a paridade com a fonte da verdade da forma. O pacote
 * `@adatechnology/conversation-contracts` é `devDependency` exata e só `test/**` o importa; aqui cada saída
 * do mapper passa por `participantTranscriptionSchema` e volta idêntica (o schema do pacote descarta o que
 * não conhece, então sobra == nada a mais), e a tabela espelhada confere com as constantes do pacote.
 */
import { readdir, readFile } from 'node:fs/promises'

import {
  PARTICIPANT_AUDIO_DURATION_MAX_MS,
  PARTICIPANT_TRANSCRIPTION_FAILURE_REASONS,
  PARTICIPANT_TRANSCRIPTION_STATUS,
  PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16,
  participantTranscriptionSchema,
} from '@adatechnology/conversation-contracts'
import { describe, expect, test } from 'bun:test'

import {
  PARTICIPANT_AUDIO_DURATION_MAX_MS as MIRRORED_DURATION_MAX_MS,
  PARTICIPANT_TRANSCRIPTION_FAILURE_REASON,
  PARTICIPANT_TRANSCRIPTION_LANGUAGE_PATTERN,
  PARTICIPANT_TRANSCRIPTION_STATUS as MIRRORED_STATUS,
  PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16 as MIRRORED_TEXT_MAX_UTF16,
} from '../../src/occurrence-conversation/domain/participant-transcription.constant.js'
import { toParticipantTranscription } from '../../src/occurrence-conversation/domain/participant-transcription.policy.js'
import { transcriptionRow } from '../fixtures/participant-transcription.fixture.js'
import { MAPPER_CASES } from './participant-transcription-mapper.contract.js'

describe('paridade com @adatechnology/conversation-contracts (spec 264 T2.2)', () => {
  for (const testCase of MAPPER_CASES) {
    if (testCase.expected === undefined) continue
    test(`a saída "${testCase.name}" passa no schema do pacote e volta idêntica`, () => {
      const output = toParticipantTranscription(testCase.row, testCase.enabled)
      const parsed = participantTranscriptionSchema.safeParse(output)
      expect(parsed.success).toBe(true)
      expect(parsed.data).toEqual(output as never)
    })
  }

  test('o texto de 20 000 pontos de código astrais cabe nos 40 000 UTF-16 do contrato', () => {
    const text = '😀'.repeat(20_000)
    const output = toParticipantTranscription(
      transcriptionRow({
        generatedAt: new Date('2026-10-12T10:30:00.000Z'),
        status: 'ready',
        text,
      }),
      true,
    )
    expect(participantTranscriptionSchema.safeParse(output).success).toBe(true)
  })

  test('a tabela espelhada tem os mesmos estados, motivo, tetos e regex do pacote', () => {
    expect(Object.values(MIRRORED_STATUS).toSorted()).toEqual(
      [...PARTICIPANT_TRANSCRIPTION_STATUS].toSorted(),
    )
    expect(Object.values(PARTICIPANT_TRANSCRIPTION_FAILURE_REASON)).toEqual([
      ...PARTICIPANT_TRANSCRIPTION_FAILURE_REASONS,
    ])
    expect(MIRRORED_TEXT_MAX_UTF16).toBe(PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16)
    expect(MIRRORED_DURATION_MAX_MS).toBe(PARTICIPANT_AUDIO_DURATION_MAX_MS)
    for (const language of ['pt', 'por', 'p', 'PT', 'pt-BR', 'portu']) {
      const schemaResult = participantTranscriptionSchema.safeParse({
        generatedAt: '2026-10-12T10:30:00.000Z',
        language,
        status: 'ready',
        text: '',
      }).success
      expect(PARTICIPANT_TRANSCRIPTION_LANGUAGE_PATTERN.test(language)).toBe(schemaResult)
    }
  })
})

describe('o pacote de contratos fica fora da produção da API (spec 264 T2.2)', () => {
  const SOURCE_ROOT = new URL('../../src/', import.meta.url)
  const FORBIDDEN =
    /from\s+['"]@adatechnology\/conversation-contracts|require\(\s*['"]@adatechnology\/conversation-contracts/

  test('o detector reconhece o import proibido', () => {
    expect(FORBIDDEN.test(`import { x } from '@adatechnology/conversation-contracts'`)).toBe(true)
    expect(FORBIDDEN.test(`import { x } from "@adatechnology/conversation-contracts"`)).toBe(true)
    expect(FORBIDDEN.test(`import { x } from './conversation-contracts.js'`)).toBe(false)
  })

  test('nenhum arquivo de src/** importa @adatechnology/conversation-contracts', async () => {
    const files = (await readdir(SOURCE_ROOT, { recursive: true })).filter((file) =>
      file.endsWith('.ts'),
    )
    const offenders: string[] = []
    for (const file of files) {
      if (FORBIDDEN.test(await readFile(new URL(file, SOURCE_ROOT), 'utf8'))) offenders.push(file)
    }
    expect(files.length).toBeGreaterThan(100)
    expect(offenders).toEqual([])
  })

  test('o pacote está em devDependencies, em versão exata, e fora de dependencies', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      readonly dependencies: Record<string, string>
      readonly devDependencies: Record<string, string>
    }
    expect(manifest.devDependencies['@adatechnology/conversation-contracts']).toMatch(
      /^\d+\.\d+\.\d+$/,
    )
    expect(manifest.dependencies['@adatechnology/conversation-contracts']).toBeUndefined()
  })
})
