/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord } from './occurrenceConversationGuards.validation'

export type DriverOccurrenceEmailSettings = Readonly<{
  enabled: boolean
  updatedAt: string | undefined
}>

/** Resposta fora do contrato (campo faltando, tipo errado) não vira configuração: vira erro de resposta. */
export function toDriverOccurrenceEmailSettings(
  payload: unknown,
): DriverOccurrenceEmailSettings | null {
  const data = isRecord(payload) ? payload.data : undefined
  if (!isRecord(data) || typeof data.enabled !== 'boolean') return null
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : undefined
  return { enabled: data.enabled, updatedAt }
}
