/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §1, §5.2): a tabela espelhada das regras de `participantTranscriptionSchema`
 * do `@adatechnology/conversation-contracts`. A API não depende do pacote em produção; o contrato de
 * paridade (`devDependency`, só em `test/**`) prova que a saída do mapper é aceita pelo schema.
 */

export const PARTICIPANT_TRANSCRIPTION_STATUS = {
  DISABLED: 'disabled',
  FAILED: 'failed',
  PENDING: 'pending',
  READY: 'ready',
} as const

/** Só o motivo que muda o que o leitor vê; os demais códigos de falha ficam no servidor. */
export const PARTICIPANT_TRANSCRIPTION_FAILURE_REASON = { TOO_LONG: 'too_long' } as const

/** Unidades UTF-16 (o que o `.max` do zod conta); o banco guarda até 20 000 code points. */
export const PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16 = 40_000

export const PARTICIPANT_TRANSCRIPTION_LANGUAGE_PATTERN = /^[a-z]{2,3}$/u

export const PARTICIPANT_TRANSCRIPTION_ENGINE_MAX_LENGTH = 64

export const PARTICIPANT_AUDIO_DURATION_MAX_MS = 86_400_000
