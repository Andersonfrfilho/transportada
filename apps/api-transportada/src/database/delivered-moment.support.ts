/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

type DeliveredMomentColumns = {
  readonly capturedAt: AnyPgColumn
  readonly occurredAt: AnyPgColumn
  readonly recordedAt: AnyPgColumn
}

/**
 * Spec 234 D3: o momento da entrega da nota e da pontualidade — a hora corrigida do toque, senão a
 * leitura do GPS, senão o recebimento. Uma expressão só para a nota, o comprovante e a lista de
 * pendências (risco 4 da T1.5), e a mesma do índice `trip_stop_events_company_delivered_moment_idx`:
 * qualquer outra forma (outra ordem, outro cast) deixa o índice de fora e o filtro da janela varre a
 * tabela. O índice antigo `coalesce(captured_at, recorded_at)` fica só para o rollback e deve ser
 * dropado numa migration futura, depois de a API estabilizar.
 */
export function deliveredMomentSql(columns: DeliveredMomentColumns): SQL<Date> {
  return sql`coalesce(${columns.occurredAt}, ${columns.capturedAt}, ${columns.recordedAt})`.mapWith(
    // O mesmo que `timestamp with time zone` faz no drizzle: o driver pode entregar texto ou `Date`.
    (value: unknown): Date => (value instanceof Date ? value : new Date(String(value))),
  )
}
