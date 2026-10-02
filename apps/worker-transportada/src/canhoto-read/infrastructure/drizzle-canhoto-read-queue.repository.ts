/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql, type SQL } from 'drizzle-orm'

import type { CanhotoTripDocument } from '../domain/canhoto-barcode.policy.js'
import type {
  CanhotoReadQueuePort,
  ListPendingCanhotoProofsParams,
} from '../application/canhoto-read-queue.port.js'

export type CanhotoReadDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * ⚠️ Os três predicados da fila são **literais SQL**, idênticos caractere a caractere aos do índice
 * parcial `trip_delivery_proofs_canhoto_pending_idx`. Com `eq()` e valor de JS o Postgres recebe
 * parâmetro, não literal, não consegue provar que a consulta implica o predicado do índice e o
 * ignora em silêncio — a consulta continua certa e passa a varrer a tabela inteira a cada cinco
 * minutos. `canhoto-read-queue.integration.ts` prova o plano.
 */
const QUEUE_PREDICATE = sql`p."canhoto_review" = 'pending'
  and p."canhoto_read_source" is null
  and p."canhoto_read_attempted_at" is null`

/**
 * `trip_delivery_proofs` não tem `trip_id` nem `document_id`: vêm de `stop_event_id` →
 * `trip_stop_events.trip_document_id` → `trip_documents`. Objeto que não está `final` (apagado ou
 * ainda em staging) fica de fora: ele nunca será baixável e, como falha de infraestrutura não
 * carimba a tentativa, ficaria para sempre no começo da fila empurrando os outros.
 */
export function buildPendingCanhotoProofsQuery(params: ListPendingCanhotoProofsParams): SQL {
  const exclusion =
    params.excludeProofIds.length === 0
      ? sql``
      : sql`and p."id" not in (${sql.join(
          params.excludeProofIds.map((proofId) => sql`${proofId}::uuid`),
          sql`, `,
        )})`

  return sql`
    select
      p."id" as proof_id,
      p."company_id" as company_id,
      d."id" as document_id,
      d."trip_id" as trip_id,
      o."bucket" as bucket,
      o."object_key" as object_key,
      o."mime_type" as mime_type,
      o."size_bytes" as size_bytes
    from trip_delivery_proofs p
    join trip_stop_events e on e."id" = p."stop_event_id" and e."company_id" = p."company_id"
    join trip_documents d on d."id" = e."trip_document_id" and d."company_id" = e."company_id"
    join trips t on t."id" = d."trip_id" and t."company_id" = d."company_id"
    join companies c on c."id" = p."company_id"
    join stored_objects o on o."id" = p."object_id" and o."company_id" = p."company_id"
    where p."kind" = 'photo'
      and ${QUEUE_PREDICATE}
      and c."status" = 'active'
      and t."status" <> 'cancelled'
      and d."released_at" is null
      and o."status" = 'final'
      ${exclusion}
    order by p."created_at"
    limit ${params.limit}
  `
}

type PendingRow = Readonly<{
  bucket: string
  company_id: string
  document_id: string
  mime_type: string
  object_key: string
  proof_id: string
  size_bytes: bigint | number | string
  trip_id: string
}>

type TripDocumentRow = Readonly<{
  access_key: null | string
  id: string
  number: null | string
  released_at: Date | null | string
  series: null | string
}>

export function createDrizzleCanhotoReadQueue(database: CanhotoReadDatabase): CanhotoReadQueuePort {
  return {
    async listPending(params) {
      const rows = (await database.execute(
        buildPendingCanhotoProofsQuery(params),
      )) as unknown as readonly PendingRow[]

      return rows.map((row) => ({
        bucket: row.bucket,
        companyId: row.company_id,
        documentId: row.document_id,
        mimeType: row.mime_type,
        objectKey: row.object_key,
        proofId: row.proof_id,
        sizeBytes: Number(row.size_bytes),
        tripId: row.trip_id,
      }))
    },

    async listTripDocuments(params) {
      const rows = (await database.execute(sql`
        select d."id" as id, n."access_key" as access_key, n."number" as number,
               n."series" as series, d."released_at" as released_at
        from trip_documents d
        left join nfe_documents n on n."id" = d."nfe_document_id" and n."company_id" = d."company_id"
        where d."company_id" = ${params.companyId} and d."trip_id" = ${params.tripId}
      `)) as unknown as readonly TripDocumentRow[]

      return rows.map(toTripDocument)
    },

    async markAttempted(params) {
      const rows = (await database.execute(sql`
        update trip_delivery_proofs p
        set "canhoto_read_attempted_at" = ${params.attemptedAt.toISOString()}::timestamptz
        where p."id" = ${params.proofId}::uuid
          and p."company_id" = ${params.companyId}::uuid
          and ${QUEUE_PREDICATE}
        returning p."id"
      `)) as unknown as readonly unknown[]

      return rows.length > 0
    },
  }
}

function toTripDocument(row: TripDocumentRow): CanhotoTripDocument {
  return {
    accessKey: row.access_key,
    id: row.id,
    nfeNumber: row.number,
    nfeSeries: row.series,
    releasedAt: row.released_at === null ? null : new Date(row.released_at),
  }
}
