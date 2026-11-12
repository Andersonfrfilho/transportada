/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E7, T6): leitura e limpeza da marca "cobra no recebimento" do cliente, sempre pela empresa do contexto.
 * A limpeza trava a linha, zera data e origem (o CHECK do banco exige a origem nula sem data) e grava
 * `audit_logs` na mesma transação, só com ids — nunca valor nem PIX.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { deliveryClients } from '../../database/delivery-client.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type {
  DeliveryClientReceivingChargeFlag,
  DeliveryClientReceivingChargeFlagPort,
} from '../application/delivery-client-receiving-charge-flag.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const AUDIT_ACTION = 'delivery-client.receiving-charge-flag.cleared'
const AUDIT_ENTITY_TYPE = 'delivery_client'
const AUDIT_PERMISSION = 'fleet.manage'

const FLAG_COLUMNS = {
  flaggedAt: deliveryClients.receivingChargeFlaggedAt,
  sourceStopOccurrenceId: deliveryClients.receivingChargeSourceStopOccurrenceId,
} as const

function toFlag(row: {
  readonly flaggedAt: Date | null
  readonly sourceStopOccurrenceId: string | null
}): DeliveryClientReceivingChargeFlag {
  return {
    flaggedAt: row.flaggedAt?.toISOString() ?? null,
    sourceStopOccurrenceId: row.sourceStopOccurrenceId,
  }
}

export class DrizzleDeliveryClientReceivingChargeFlagRepository
  implements DeliveryClientReceivingChargeFlagPort
{
  public constructor(private readonly database: Database) {}

  public async read(input: {
    readonly companyId: string
    readonly deliveryClientId: string
  }): Promise<DeliveryClientReceivingChargeFlag | null> {
    const [row] = await this.database
      .select(FLAG_COLUMNS)
      .from(deliveryClients)
      .where(
        and(
          eq(deliveryClients.companyId, input.companyId),
          eq(deliveryClients.id, input.deliveryClientId),
        ),
      )
      .limit(1)
    return row === undefined ? null : toFlag(row)
  }

  public async clear(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
    readonly deliveryClientId: string
  }): Promise<DeliveryClientReceivingChargeFlag | null> {
    return this.database.transaction(async (transaction) => {
      const where = and(
        eq(deliveryClients.companyId, input.companyId),
        eq(deliveryClients.id, input.deliveryClientId),
      )
      const [current] = await transaction
        .select(FLAG_COLUMNS)
        .from(deliveryClients)
        .where(where)
        .for('update')
        .limit(1)
      if (current === undefined) return null
      if (current.flaggedAt === null) return toFlag(current)

      await transaction
        .update(deliveryClients)
        .set({ receivingChargeFlaggedAt: null, receivingChargeSourceStopOccurrenceId: null })
        .where(where)
      await transaction.insert(auditLogs).values({
        action: AUDIT_ACTION,
        actorUserId: input.actorUserId,
        afterSnapshot: { flaggedAt: null, sourceStopOccurrenceId: null },
        beforeSnapshot: toFlag(current),
        companyId: input.companyId,
        correlationId: input.correlationId,
        entityId: input.deliveryClientId,
        entityType: AUDIT_ENTITY_TYPE,
        permission: AUDIT_PERMISSION,
        targetId: input.deliveryClientId,
        targetType: AUDIT_ENTITY_TYPE,
      })
      return { flaggedAt: null, sourceStopOccurrenceId: null }
    })
  }
}
