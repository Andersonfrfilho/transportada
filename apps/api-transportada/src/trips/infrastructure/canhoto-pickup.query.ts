/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T2 (D4, D6): o escritor e as leituras da coleta de canhoto. Tudo roda **dentro** da transação de quem chama
 * (registro, trava de repetido, cancelamento): a coleta nunca existe sem a ocorrência, nem a ocorrência do tipo com
 * coleta sem a coleta. Nenhuma função daqui escreve em `trip_documents` (D3, CA03).
 */
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'

import {
  CANHOTO_PICKUP_OPEN_STATUSES,
  type CanhotoPickupStatus,
} from '../../shared/canhoto-pickup.constant.js'
import {
  tripCanhotoPickups,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../database/trip.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * Cria a coleta `pending` da ocorrência recém-gravada. A NF-e vem do próprio vínculo de origem (`insert ... select`,
 * mesma empresa): nunca do payload. Devolve o id da coleta, ou `null` se o vínculo não é desta empresa — o que não
 * acontece depois de `saveTripOccurrence` ter conferido a nota, e por isso quem chama trata `null` como erro.
 */
export async function createPendingCanhotoPickup(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly originTripDocumentId: string
  },
): Promise<null | string> {
  const rows = await queryable.execute<{ id: string }>(sql`
    insert into ${tripCanhotoPickups} (
      "company_id", "nfe_document_id", "origin_trip_document_id", "occurrence_id", "status"
    )
    select ${tripDocuments.companyId}, ${tripDocuments.nfeDocumentId}, ${tripDocuments.id}, ${input.occurrenceId}, 'pending'
    from ${tripDocuments}
    where ${tripDocuments.companyId} = ${input.companyId}
      and ${tripDocuments.id} = ${input.originTripDocumentId}
    returning "id"
  `)
  return rows[0]?.id ?? null
}

/** Cancelar a ocorrência (167) cancela a coleta ainda aberta; a já coletada fica como está. */
export async function cancelOpenCanhotoPickup(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<void> {
  await queryable
    .update(tripCanhotoPickups)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        eq(tripCanhotoPickups.occurrenceId, input.occurrenceId),
        inArray(tripCanhotoPickups.status, [...CANHOTO_PICKUP_OPEN_STATUSES]),
      ),
    )
}

/**
 * D6: a ocorrência com coleta aberta na mesma nota, de **qualquer** tipo com coleta — duas coletas abertas da mesma
 * entrega nunca correm juntas. "Mesma nota" é a NF-e (como na 276) ou, sem NF-e, o próprio vínculo. A ocorrência
 * cancelada nunca conta (o cancelamento já fecha a coleta, mas a leitura não depende disso).
 */
export async function findOpenCanhotoPickupOccurrenceId(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly nfeDocumentId: null | string
    readonly tripDocumentId: string
  },
): Promise<null | string> {
  const sameNote: SQL | undefined =
    input.nfeDocumentId === null
      ? eq(tripCanhotoPickups.originTripDocumentId, input.tripDocumentId)
      : or(
          eq(tripCanhotoPickups.originTripDocumentId, input.tripDocumentId),
          eq(tripCanhotoPickups.nfeDocumentId, input.nfeDocumentId),
        )
  const [row] = await queryable
    .select({ occurrenceId: tripCanhotoPickups.occurrenceId })
    .from(tripCanhotoPickups)
    .innerJoin(
      tripDocumentOccurrences,
      and(
        eq(tripDocumentOccurrences.companyId, tripCanhotoPickups.companyId),
        eq(tripDocumentOccurrences.id, tripCanhotoPickups.occurrenceId),
      ),
    )
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        inArray(tripCanhotoPickups.status, [...CANHOTO_PICKUP_OPEN_STATUSES]),
        isNull(tripDocumentOccurrences.cancelledAt),
        sameNote,
      ),
    )
    .orderBy(desc(tripCanhotoPickups.createdAt), desc(tripCanhotoPickups.id))
    .limit(1)
  return row?.occurrenceId ?? null
}

/** A coleta de cada ocorrência pedida (só as que têm), para a trava de repetido ler o estado pela D6. */
export async function readCanhotoPickupStatuses(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceIds: readonly string[] },
): Promise<ReadonlyMap<string, CanhotoPickupStatus>> {
  if (input.occurrenceIds.length === 0) return new Map()
  const rows = await queryable
    .select({ occurrenceId: tripCanhotoPickups.occurrenceId, status: tripCanhotoPickups.status })
    .from(tripCanhotoPickups)
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        inArray(tripCanhotoPickups.occurrenceId, [...input.occurrenceIds]),
      ),
    )
  return new Map(rows.map((row) => [row.occurrenceId, row.status]))
}
