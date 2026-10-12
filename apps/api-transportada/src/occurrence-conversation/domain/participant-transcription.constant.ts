/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.2): a tabela espelhada da forma que a visão do participante lê. A fonte da verdade
 * é `@adatechnology/conversation-contracts`, que a API não importa em produção; o contrato de paridade em
 * `test/**` confere cada valor abaixo contra o pacote.
 */
export const PARTICIPANT_TRANSCRIPTION_STATUS = {
  DISABLED: 'disabled',
  FAILED: 'failed',
  PENDING: 'pending',
  READY: 'ready',
} as const

/** Só o motivo que muda o que o leitor vê; os demais códigos de falha ficam no servidor. */
export const PARTICIPANT_TRANSCRIPTION_FAILURE_REASON = {
  TOO_LONG: 'too_long',
} as const

/** Em unidades UTF-16: o servidor guarda até 20 000 pontos de código, no máximo 40 000 unidades. */
export const PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16 = 40_000

export const PARTICIPANT_AUDIO_DURATION_MAX_MS = 86_400_000

/** O idioma é a dica pedida ao motor; o que não casa com o padrão não sai. */
export const PARTICIPANT_TRANSCRIPTION_LANGUAGE_PATTERN = /^[a-z]{2,3}$/

export const PARTICIPANT_AUDIO_CONTENT_TYPE_PREFIX = 'audio/'
