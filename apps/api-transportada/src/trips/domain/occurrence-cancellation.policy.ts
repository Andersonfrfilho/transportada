/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 167 (RF6): o motivo do cancelamento — obrigatório, teto de 500. Política pura; os estados
 * que recusam (já cancelada, tratativa aberta) são conferidos pelo caso de uso dentro da transação,
 * porque dependem de leitura de banco.
 */
import {
  OccurrenceCancellationReasonRequiredError,
  OccurrenceCancellationReasonTooLongError,
} from './trip.error.js'

const CANCELLATION_REASON_MAX_LENGTH = 500

/** Recorta espaço nas pontas antes de validar — motivo só espaço é motivo vazio. */
export function resolveOccurrenceCancellationReason(rawReason: string): string {
  const reason = rawReason.trim()
  if (reason === '') throw new OccurrenceCancellationReasonRequiredError()
  if (reason.length > CANCELLATION_REASON_MAX_LENGTH) {
    throw new OccurrenceCancellationReasonTooLongError()
  }
  return reason
}
