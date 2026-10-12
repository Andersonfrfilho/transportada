/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord } from './occurrenceConversationGuards.validation'

const MILLISECONDS_PER_MINUTE = 60_000

export type AudioTranscriptionSettings = Readonly<{
  enabled: boolean
  maxDurationMs: number
  updatedAt: string | undefined
}>

/** Os minutos do aviso saem do teto que a API devolve, nunca de um número fixo na tela. */
export function minutesOfAudioTranscriptionLimit(maxDurationMs: number): number {
  return Math.floor(maxDurationMs / MILLISECONDS_PER_MINUTE)
}

/** Resposta fora do contrato (campo faltando, tipo errado) não vira configuração: vira erro de resposta. */
export function toAudioTranscriptionSettings(payload: unknown): AudioTranscriptionSettings | null {
  const data = isRecord(payload) ? payload.data : undefined
  if (
    !isRecord(data) ||
    typeof data.enabled !== 'boolean' ||
    typeof data.maxDurationMs !== 'number' ||
    !Number.isFinite(data.maxDurationMs) ||
    data.maxDurationMs <= 0
  ) {
    return null
  }
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : undefined
  return { enabled: data.enabled, maxDurationMs: data.maxDurationMs, updatedAt }
}
