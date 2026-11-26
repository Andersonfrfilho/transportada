/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d: escritor único do "Descartar" o alerta de canhoto de outra nota. Trava a prova,
 * confere que o alerta existe, grava o carimbo e a trilha na mesma transação. Reusa a trava e a
 * derivação do mover, para as duas ações enxergarem o mesmo alerta.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { tripDeliveryProofs } from '../../database/trip.schema.js'
import type {
  CanhotoDismissAuditEntry,
  CanhotoDismissTransaction,
  CanhotoDismissUnitOfWork,
} from '../application/canhoto-dismiss.port.js'
import { deriveMoveSourceMismatch, lockMoveSource } from './drizzle-canhoto-move.repository.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCanhotoDismissUnitOfWork implements CanhotoDismissUnitOfWork {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: CanhotoDismissTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(createCanhotoDismissTransaction(transaction)),
    )
  }
}

function createCanhotoDismissTransaction(queryable: TripQueryable): CanhotoDismissTransaction {
  return {
    deriveMismatch: (input) => deriveMoveSourceMismatch(queryable, input),
    insertAudit: (entry) => insertDismissAudit(queryable, entry),
    lockSourceProof: (input) => lockMoveSource(queryable, input),
    markDismissed: async (input) => {
      await queryable
        .update(tripDeliveryProofs)
        .set({ canhotoMismatchDismissedAt: input.at })
        .where(
          and(
            eq(tripDeliveryProofs.companyId, input.companyId),
            eq(tripDeliveryProofs.id, input.proofId),
          ),
        )
    },
  }
}

/** `security.md` §10: ator, alvo, IP e instante — ids apenas, nunca número, série ou texto lido. */
async function insertDismissAudit(
  queryable: TripQueryable,
  entry: CanhotoDismissAuditEntry,
): Promise<void> {
  await queryable.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId,
    companyId: entry.companyId,
    correlationId: entry.correlationId,
    entityId: entry.proofId,
    entityType: 'trip_delivery_proof',
    metadata: { documentId: entry.documentId, ipAddress: entry.ipAddress },
    permission: entry.permission,
    targetId: entry.tripId,
    targetType: 'trip',
  })
}
