/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 102: quais notas o cancelamento devolve ao pool.
 *
 * ⚠️ Extraído como função para o contrato compilar o SQL e afirmar o recorte — a escrita inteira
 * compilaria igual com o `company_id` faltando, ou com a nota entregue voltando junto, e é
 * justamente isso que não pode passar.
 */
import { and, eq, isNull } from 'drizzle-orm'

import { tripDocuments } from '../../database/trip.schema.js'

export type CancelReleaseQuery = {
  readonly companyId: string
  readonly tripId: string
}

export function buildCancelReleaseFilters(input: CancelReleaseQuery) {
  return [
    eq(tripDocuments.companyId, input.companyId),
    eq(tripDocuments.tripId, input.tripId),
    /** Nota já solta guarda **quando** saiu: reescrever `released_at` apagaria essa hora. */
    isNull(tripDocuments.releasedAt),
    /**
     * ⚠️ **Nota entregue não volta ao pool.** Ela chegou ao destino, e devolvê-la a ofereceria para
     * uma segunda entrega da mesma carga.
     */
    isNull(tripDocuments.deliveredAt),
  ]
}

export function buildCancelReleaseWhere(input: CancelReleaseQuery) {
  return and(...buildCancelReleaseFilters(input))
}
