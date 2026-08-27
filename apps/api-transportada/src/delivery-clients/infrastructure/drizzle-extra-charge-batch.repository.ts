/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm'

import {
  contractors,
  deliveryCharges,
  deliveryClients,
  extraChargeBatches,
} from '../../database/delivery-client.schema.js'
import type {
  ExtraChargeBatch,
  ExtraChargeBatchReport,
  ExtraChargeBatchRepositoryPort,
} from '../application/extra-charge-batch.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type BatchRow = typeof extraChargeBatches.$inferSelect

export class DrizzleExtraChargeBatchRepository implements ExtraChargeBatchRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async close(input: {
    readonly accessToken: string
    readonly actorUserId: string
    readonly companyId: string
    readonly contractorId: string
    readonly periodEnd: string
    readonly periodStart: string
  }): Promise<ExtraChargeBatch | null> {
    return this.database.transaction(async (transaction) => {
      /**
       * O recorte é `recorded` **e sem lote**: sugestão não confirmada fica fora (e continua na
       * fila, visível), e lançamento já submetido pertence ao lote anterior.
       */
      const eligible = and(
        eq(deliveryCharges.companyId, input.companyId),
        eq(deliveryCharges.contractorId, input.contractorId),
        eq(deliveryCharges.status, 'recorded'),
        isNull(deliveryCharges.batchId),
        gte(deliveryCharges.chargedOn, input.periodStart),
        lte(deliveryCharges.chargedOn, input.periodEnd),
      )

      const [totals] = await transaction
        .select({
          count: sql<string>`count(*)::text`,
          /** A soma é do Postgres, em `numeric`: somar dinheiro em JavaScript perde centavo. */
          total: sql<string>`coalesce(sum(${deliveryCharges.amount}), 0)::text`,
        })
        .from(deliveryCharges)
        .where(eligible)

      if (totals === undefined || totals.count === '0') return null

      const [batch] = await transaction
        .insert(extraChargeBatches)
        .values({
          accessToken: input.accessToken,
          closedByUserId: input.actorUserId,
          companyId: input.companyId,
          contractorId: input.contractorId,
          periodEnd: input.periodEnd,
          periodStart: input.periodStart,
          status: 'submitted',
          submittedAt: new Date(),
          totalAmount: totals.total,
        })
        .returning()
      if (batch === undefined) return null

      await transaction
        .update(deliveryCharges)
        .set({ batchId: batch.id, status: 'submitted', updatedAt: new Date() })
        .where(eligible)

      return toBatch(batch)
    })
  }

  public async findByToken(input: {
    readonly accessToken: string
  }): Promise<{ readonly batchId: string; readonly companyId: string } | null> {
    const [row] = await this.database
      .select({ batchId: extraChargeBatches.id, companyId: extraChargeBatches.companyId })
      .from(extraChargeBatches)
      .where(eq(extraChargeBatches.accessToken, input.accessToken))
      .limit(1)

    return row ?? null
  }

  public async readReport(input: {
    readonly batchId: string
    readonly companyId: string
  }): Promise<ExtraChargeBatchReport | null> {
    const [batch] = await this.database
      .select({ batch: extraChargeBatches, contractorName: contractors.displayName })
      .from(extraChargeBatches)
      .innerJoin(
        contractors,
        and(
          eq(contractors.companyId, extraChargeBatches.companyId),
          eq(contractors.id, extraChargeBatches.contractorId),
        ),
      )
      .where(
        and(
          eq(extraChargeBatches.companyId, input.companyId),
          eq(extraChargeBatches.id, input.batchId),
        ),
      )
      .limit(1)
    if (batch === undefined) return null

    const items = await this.database
      .select({
        amount: deliveryCharges.amount,
        chargedOn: deliveryCharges.chargedOn,
        chargeType: deliveryCharges.chargeType,
        clientName: deliveryClients.displayName,
        clientTaxId: deliveryClients.taxId,
        id: deliveryCharges.id,
        notes: deliveryCharges.notes,
        rejectionReason: deliveryCharges.rejectionReason,
        status: deliveryCharges.status,
      })
      .from(deliveryCharges)
      .innerJoin(
        deliveryClients,
        and(
          eq(deliveryClients.companyId, deliveryCharges.companyId),
          eq(deliveryClients.id, deliveryCharges.deliveryClientId),
        ),
      )
      .where(
        and(
          eq(deliveryCharges.companyId, input.companyId),
          eq(deliveryCharges.batchId, input.batchId),
        ),
      )
      .orderBy(asc(deliveryCharges.chargedOn), asc(deliveryCharges.id))

    const [sum] = await this.database
      .select({ total: sql<string>`coalesce(sum(${deliveryCharges.amount}), 0)::text` })
      .from(deliveryCharges)
      .where(
        and(
          eq(deliveryCharges.companyId, input.companyId),
          eq(deliveryCharges.batchId, input.batchId),
        ),
      )

    return {
      batch: toBatch(batch.batch),
      contractorName: batch.contractorName,
      items,
      /** Recalculado do banco, não lido do lote: o relatório confere o próprio total. */
      itemsTotal: sum?.total ?? '0',
    }
  }

  public async rotateToken(input: {
    readonly accessToken: string
    readonly batchId: string
    readonly companyId: string
  }): Promise<void> {
    await this.database
      .update(extraChargeBatches)
      .set({ accessToken: input.accessToken, tokenRotatedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(extraChargeBatches.companyId, input.companyId),
          eq(extraChargeBatches.id, input.batchId),
        ),
      )
  }
}

function toBatch(row: BatchRow): ExtraChargeBatch {
  return {
    closedAt: row.closedAt.toISOString(),
    contractorId: row.contractorId,
    id: row.id,
    periodEnd: row.periodEnd,
    periodStart: row.periodStart,
    status: row.status,
    totalAmount: row.totalAmount,
  }
}
