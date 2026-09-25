/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702c2: o lado Drizzle da expiração do pedido de upload do anexo da conversa. A unidade de
 * trabalho é a da rotina irmã da spec 179 (`expireOccurrenceUploadUnit`), que não conhece a tabela;
 * aqui só o gateway e a leitura dos candidatos. A varredura é da instalação, não de uma empresa: não
 * há contexto de tenant numa rotina agendada, e a linha só é tocada pelo `id` que ela mesma leu.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, lt } from 'drizzle-orm'

import { occurrenceConversationUploads } from '../../database/occurrence-conversation.schema.js'
import { expireOccurrenceUploadUnit } from '../../trip-occurrence-upload-expire/application/trip-occurrence-upload-expire-unit.service.js'
import type {
  DeleteStoredObjectBytes,
  TripOccurrenceUploadExpireGateway,
} from '../../trip-occurrence-upload-expire/application/trip-occurrence-upload-expire-unit.port.js'
import type { ExpireOccurrenceUploadBatch } from '../../trip-occurrence-upload-expire/application/trip-occurrence-upload-expire.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * `for update skip locked`, reconferindo `pending` e o vencimento no lock: o envio da mensagem que
 * liga o anexo (`attached`) ganha a corrida, e a unidade converge sem apagar nada.
 */
function createGateway(database: Database): TripOccurrenceUploadExpireGateway {
  return {
    async lockExpiredPendingUpload({ before, id }) {
      const [row] = await database
        .select({
          bucket: occurrenceConversationUploads.bucket,
          id: occurrenceConversationUploads.id,
          key: occurrenceConversationUploads.objectKey,
        })
        .from(occurrenceConversationUploads)
        .where(
          and(
            eq(occurrenceConversationUploads.id, id),
            eq(occurrenceConversationUploads.status, 'pending'),
            lt(occurrenceConversationUploads.expiresAt, before),
          ),
        )
        .limit(1)
        .for('update', { skipLocked: true })
      return row
    },

    async markExpired(id) {
      await database
        .update(occurrenceConversationUploads)
        .set({ status: 'expired' })
        .where(
          and(
            eq(occurrenceConversationUploads.id, id),
            eq(occurrenceConversationUploads.status, 'pending'),
          ),
        )
    },

    runInTransaction(work) {
      return database.transaction((transaction) => work(createGateway(transaction)))
    },
  }
}

export function createDrizzleExpireConversationUploadBatch(input: {
  readonly database: Database
  readonly deleteObject: DeleteStoredObjectBytes
}): ExpireOccurrenceUploadBatch {
  const gateway = createGateway(input.database)

  return async ({ before, limit }) => {
    /** Fora de transação: cada candidato abre a sua, e o lote não trava atrás do I/O do bucket. */
    const candidates = await input.database
      .select({ id: occurrenceConversationUploads.id })
      .from(occurrenceConversationUploads)
      .where(
        and(
          eq(occurrenceConversationUploads.status, 'pending'),
          lt(occurrenceConversationUploads.expiresAt, before),
        ),
      )
      .orderBy(asc(occurrenceConversationUploads.expiresAt))
      .limit(limit)

    let expired = 0
    let missing = 0
    let failed = 0
    for (const candidate of candidates) {
      const outcome = await expireOccurrenceUploadUnit({
        before,
        deleteObject: input.deleteObject,
        gateway,
        id: candidate.id,
      })
      if (outcome.result === 'expired') expired += 1
      else if (outcome.result === 'missing') missing += 1
      else failed += 1
    }
    return { expired, failed, missing, processed: candidates.length }
  }
}
