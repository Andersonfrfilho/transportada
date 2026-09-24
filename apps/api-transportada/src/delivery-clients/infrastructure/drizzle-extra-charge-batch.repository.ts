/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'

import {
  contractors,
  deliveryCharges,
  deliveryClients,
  extraChargeBatches,
} from '../../database/delivery-client.schema.js'
import type {
  ExtraChargeBatch,
  ExtraChargeBatchCloseOutcome,
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
    readonly chargeIds?: readonly string[]
    readonly companyId: string
    readonly contractorId: string
    readonly periodEnd: string
    readonly periodStart: string
  }): Promise<ExtraChargeBatchCloseOutcome> {
    return this.database.transaction(async (transaction) => {
      /**
       * O recorte é `recorded` **e sem lote**: sugestão não confirmada fica fora (e continua na
       * fila, visível), e lançamento já submetido pertence ao lote anterior.
       */
      const baseEligible = and(
        eq(deliveryCharges.companyId, input.companyId),
        eq(deliveryCharges.contractorId, input.contractorId),
        eq(deliveryCharges.status, 'recorded'),
        isNull(deliveryCharges.batchId),
      )

      const eligible =
        input.chargeIds === undefined
          ? and(
              baseEligible,
              gte(deliveryCharges.chargedOn, input.periodStart),
              lte(deliveryCharges.chargedOn, input.periodEnd),
            )
          : and(baseEligible, inArray(deliveryCharges.id, input.chargeIds))

      if (input.chargeIds !== undefined) {
        /**
         * A seleção é validada dentro da própria transação: qualquer id fora do contratante, já
         * com lote ou fora de `recorded` derruba a requisição inteira — fechamento parcial
         * silencioso seria pior que erro (plan.md "O fechamento é por seleção, com filtros").
         *
         * ⚠️ **`for no key update`, e ordenado por id.** Sem o lock, duas requisições concorrentes
         * com ids sobrepostos passavam as duas: inseriam dois lotes, e o segundo `update` casava
         * zero linhas — lote `submitted` com total preenchido e nenhuma cobrança vinculada, com
         * demonstrativo gerado em cima. A ordem fixa é o que impede as duas travarem em ordens
         * opostas e deadlocarem. Nunca `for update`: a FK de `delivery_charges` para `batch_id`
         * pega `FOR KEY SHARE` do outro lado (CLAUDE.md da app).
         */
        const found = await transaction
          .select({ id: deliveryCharges.id })
          .from(deliveryCharges)
          .where(eligible)
          .orderBy(asc(deliveryCharges.id))
          .for('no key update')
        if (found.length !== input.chargeIds.length) return { kind: 'selection_ineligible' }
      }

      const [totals] = await transaction
        .select({
          count: sql<string>`count(*)::text`,
          periodEnd: sql<string | null>`max(${deliveryCharges.chargedOn})`,
          periodStart: sql<string | null>`min(${deliveryCharges.chargedOn})`,
          /** A soma é do Postgres, em `numeric`: somar dinheiro em JavaScript perde centavo. */
          total: sql<string>`coalesce(sum(${deliveryCharges.amount}), 0)::text`,
        })
        .from(deliveryCharges)
        .where(eligible)

      if (totals === undefined || totals.count === '0') return { kind: 'empty' }

      /**
       * Sem seleção, o período gravado é o pedido no corpo (comportamento de sempre). Com
       * seleção, é o intervalo que cobre exatamente as linhas escolhidas — nunca o do corpo.
       */
      const periodStart =
        input.chargeIds === undefined
          ? input.periodStart
          : (totals.periodStart ?? input.periodStart)
      const periodEnd =
        input.chargeIds === undefined ? input.periodEnd : (totals.periodEnd ?? input.periodEnd)

      const [batch] = await transaction
        .insert(extraChargeBatches)
        .values({
          accessToken: input.accessToken,
          closedByUserId: input.actorUserId,
          companyId: input.companyId,
          contractorId: input.contractorId,
          periodEnd,
          periodStart,
          status: 'submitted',
          submittedAt: new Date(),
          totalAmount: totals.total,
        })
        .returning()
      if (batch === undefined) return { kind: 'empty' }

      await transaction
        .update(deliveryCharges)
        .set({ batchId: batch.id, status: 'submitted', updatedAt: new Date() })
        .where(eligible)

      return { batch: toBatch(batch), kind: 'closed' }
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
