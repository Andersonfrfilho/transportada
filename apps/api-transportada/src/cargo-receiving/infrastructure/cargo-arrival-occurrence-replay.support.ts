/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2/T3.4a: a chave de idempotência da ocorrência de recebimento, lida do mesmo jeito de
 * dentro da transação (depois da trava) e de fora dela (a consulta barata que evita subir a foto).
 */
import { and, eq } from 'drizzle-orm'

import { idempotencyRecords } from '../../database/fiscal-operation.schema.js'
import { CargoArrivalOccurrenceReplayUnreadableError } from '../domain/cargo-arrival-occurrence.error.js'
import type { Database } from './cargo-arrival-persistence.support.js'
import { CARGO_ARRIVAL_OCCURRENCE_OPERATION } from './cargo-arrival-occurrence-write.support.js'

/** A resposta guardada é entrada do banco: só um `occurrenceId` texto vale como reenvio. */
function readStoredOccurrenceId(response: unknown): string | null {
  if (typeof response !== 'object' || response === null || !('occurrenceId' in response)) {
    return null
  }
  return typeof response.occurrenceId === 'string' ? response.occurrenceId : null
}

export async function findStoredOccurrenceReplay(
  queryable: Pick<Database, 'select'>,
  input: { readonly companyId: string; readonly idempotencyKey: string },
): Promise<{ readonly fingerprint: string; readonly occurrenceId: string } | null> {
  const [row] = await queryable
    .select({
      fingerprint: idempotencyRecords.requestFingerprint,
      response: idempotencyRecords.response,
    })
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.companyId, input.companyId),
        eq(idempotencyRecords.operation, CARGO_ARRIVAL_OCCURRENCE_OPERATION),
        eq(idempotencyRecords.idempotencyKey, input.idempotencyKey),
      ),
    )
  if (row === undefined) return null
  const occurrenceId = readStoredOccurrenceId(row.response)
  if (occurrenceId === null) throw new CargoArrivalOccurrenceReplayUnreadableError()
  return { fingerprint: row.fingerprint, occurrenceId }
}
