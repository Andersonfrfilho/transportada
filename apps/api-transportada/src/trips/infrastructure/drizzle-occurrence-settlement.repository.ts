/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T13/T18: escritor único de `trip_occurrence_item_settlements`. Molde de
 * `DrizzleRedeliveryApplicationRepository` (T14b) — trava a tratativa com `select … for no key
 * update`, reconfere a precondição sobre a linha travada e escreve dentro da mesma transação.
 *
 * `recordSettlement` (T13, RF22-RF25/CA9/CA9b/CA9c) substitui a lista inteira (`delete` + `insert`,
 * nunca acumula), valida item e valor com `resolveOccurrenceSettlement` (política pura) e, com ao
 * menos um item, chama a ponte `OccurrenceSettlementChargePort` (T17) na mesma transação — gravar o
 * acerto sem conseguir gravar a cobrança é o defeito mais caro desta spec. **Lista vazia é o
 * simétrico, não a ausência de caso**: remove a cobrança na mesma transação, e recusa com 409
 * quando ela já foi enviada.
 *
 * `reimburseSettlementItem` (T18, RF31/CA9e) só marca `reimbursed_at`/`reimbursed_by_user_id` —
 * idempotente, e recusa `payer_kind = 'carrier'` antes de tocar o banco.
 *
 * `findSettlement` (achado 2 da revisão): leitura simples, sem lock — a lista já veio da mesma
 * tabela que `recordSettlement` escreve, e quem chamou já resolveu `occurrenceId → caseId` (rota),
 * então a existência da tratativa não precisa ser reconferida aqui.
 */
import { and, asc, eq } from 'drizzle-orm'

import {
  tripDocumentOccurrences,
  tripOccurrenceCases,
  tripOccurrenceItemSettlements,
} from '../../database/trip.schema.js'
import { listOccurrenceProductCodes } from './drizzle-occurrence-product.repository.js'
import { resolveOccurrenceProductCodes } from '../domain/occurrence-scope.policy.js'
import {
  isOccurrenceSettlementWritable,
  resolveOccurrenceSettlement,
} from '../domain/occurrence-settlement.policy.js'
import type { OccurrenceSettlementItemInput } from '../domain/occurrence-settlement.policy.js'
import {
  OccurrenceCaseNotFoundError,
  OccurrenceCaseTransitionNotAllowedError,
  OccurrenceSettlementItemNotFoundError,
  OccurrenceSettlementNotReimbursableError,
} from '../domain/trip.error.js'
import type {
  RecordOccurrenceSettlementPort,
  RecordOccurrenceSettlementResult,
} from '../application/record-occurrence-settlement.use-case.js'
import type {
  ReimburseOccurrenceSettlementPort,
  ReimburseOccurrenceSettlementResult,
} from '../application/reimburse-occurrence-settlement.use-case.js'
import type {
  FindOccurrenceSettlementPort,
  FindOccurrenceSettlementResult,
} from '../application/find-occurrence-settlement.use-case.js'
import type { OccurrenceSettlementChargePort } from '../application/occurrence-settlement-charge.port.js'
import {
  MONEY_SCALE,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import type { TripDatabase, TripTransaction } from './trip-queryable.type.js'

const SETTLEMENT_ERROR_CODE_PREFIX = 'OCCURRENCE_SETTLEMENT'

/** Molde de `FindChargePartiesFunction` (`drizzle-occurrence-settlement-charge.repository.ts`). */
export class DrizzleOccurrenceSettlementRepository
  implements
    RecordOccurrenceSettlementPort,
    ReimburseOccurrenceSettlementPort,
    FindOccurrenceSettlementPort
{
  public constructor(
    private readonly database: TripDatabase,
    private readonly charges: OccurrenceSettlementChargePort,
  ) {}

  public async recordSettlement(input: {
    readonly actorUserId: string
    readonly caseId: string
    readonly companyId: string
    readonly items: readonly OccurrenceSettlementItemInput[]
  }): Promise<RecordOccurrenceSettlementResult> {
    const { actorUserId, caseId, companyId, items } = input

    return this.database.transaction(async (transaction) => {
      const locked = await lockWritableCase(transaction, { caseId, companyId })

      const productCodes = await listOccurrenceProductCodes(transaction, {
        companyId,
        occurrenceIds: [locked.occurrenceId],
      })
      const declaredCodes = resolveOccurrenceProductCodes({
        productCode: locked.occurrenceProductCode,
        productCodes: productCodes.get(locked.occurrenceId) ?? [],
      })
      const knownProductCodes = declaredCodes.length === 0 ? [''] : declaredCodes

      const resolved = resolveOccurrenceSettlement({ items, knownProductCodes })

      /**
       * ⚠️ A lista vazia decide a cobrança **antes** de apagar os itens: sem prejuízo declarado não
       * há o que cobrar, e uma cobrança já enviada recusa em 409 — o `delete` da lista não pode
       * apagar a evidência de uma cobrança que já foi à contratante (revisão final, B4).
       */
      if (resolved.items.length === 0) {
        await this.charges.clearOccurrenceSettlementCharge({
          companyId,
          occurrenceId: locked.occurrenceId,
          transaction,
        })
      }

      await transaction
        .delete(tripOccurrenceItemSettlements)
        .where(
          and(
            eq(tripOccurrenceItemSettlements.companyId, companyId),
            eq(tripOccurrenceItemSettlements.caseId, caseId),
          ),
        )

      if (resolved.items.length > 0) {
        await transaction.insert(tripOccurrenceItemSettlements).values(
          resolved.items.map((item) => ({
            amount: item.amount,
            amountSource: item.amountSource,
            caseId,
            companyId,
            payerId: item.payerKind === 'driver' ? (item.payerId ?? null) : null,
            payerKind: item.payerKind,
            productCode: item.productCode.trim(),
            recordedByUserId: actorUserId,
          })),
        )

        await this.charges.applyOccurrenceSettlementCharge({
          actorUserId,
          amount: resolved.total,
          companyId,
          occurrenceId: locked.occurrenceId,
          transaction,
        })
      }

      return { items: resolved.items, total: resolved.total }
    })
  }

  public async reimburseSettlementItem(input: {
    readonly actorUserId: string
    readonly caseId: string
    readonly companyId: string
    readonly productCode: string
  }): Promise<ReimburseOccurrenceSettlementResult> {
    const { actorUserId, caseId, companyId, productCode } = input

    return this.database.transaction(async (transaction) => {
      const [locked] = await transaction
        .select({
          id: tripOccurrenceItemSettlements.id,
          payerKind: tripOccurrenceItemSettlements.payerKind,
          reimbursedAt: tripOccurrenceItemSettlements.reimbursedAt,
        })
        .from(tripOccurrenceItemSettlements)
        .where(
          and(
            eq(tripOccurrenceItemSettlements.companyId, companyId),
            eq(tripOccurrenceItemSettlements.caseId, caseId),
            eq(tripOccurrenceItemSettlements.productCode, productCode.trim()),
          ),
        )
        .for('no key update')
        .limit(1)
      if (locked === undefined) throw new OccurrenceSettlementItemNotFoundError()
      if (locked.payerKind === 'carrier') throw new OccurrenceSettlementNotReimbursableError()

      if (locked.reimbursedAt !== null) {
        return { kind: 'unchanged' as const }
      }

      await transaction
        .update(tripOccurrenceItemSettlements)
        .set({ reimbursedAt: new Date(), reimbursedByUserId: actorUserId })
        .where(
          and(
            eq(tripOccurrenceItemSettlements.companyId, companyId),
            eq(tripOccurrenceItemSettlements.id, locked.id),
          ),
        )

      return { kind: 'changed' as const }
    })
  }

  public async findSettlement(input: {
    readonly caseId: string
    readonly companyId: string
  }): Promise<FindOccurrenceSettlementResult> {
    const rows = await this.database
      .select({
        amount: tripOccurrenceItemSettlements.amount,
        amountSource: tripOccurrenceItemSettlements.amountSource,
        payerId: tripOccurrenceItemSettlements.payerId,
        payerKind: tripOccurrenceItemSettlements.payerKind,
        productCode: tripOccurrenceItemSettlements.productCode,
        reimbursedAt: tripOccurrenceItemSettlements.reimbursedAt,
      })
      .from(tripOccurrenceItemSettlements)
      .where(
        and(
          eq(tripOccurrenceItemSettlements.companyId, input.companyId),
          eq(tripOccurrenceItemSettlements.caseId, input.caseId),
        ),
      )
      .orderBy(asc(tripOccurrenceItemSettlements.productCode))

    let totalScaled = 0n
    const items = rows.map((row) => {
      totalScaled += parseScaledDecimal({
        errorCodePrefix: SETTLEMENT_ERROR_CODE_PREFIX,
        scale: MONEY_SCALE,
        value: row.amount,
      })
      return {
        amount: row.amount,
        amountSource: row.amountSource,
        ...(row.payerId === null ? {} : { payerId: row.payerId }),
        payerKind: row.payerKind,
        productCode: row.productCode,
        reimbursedAt: row.reimbursedAt === null ? null : row.reimbursedAt.toISOString(),
      }
    })

    return { items, total: formatScaledDecimal(totalScaled, MONEY_SCALE) }
  }
}

async function lockWritableCase(
  transaction: TripTransaction,
  input: { readonly caseId: string; readonly companyId: string },
): Promise<{ readonly occurrenceId: string; readonly occurrenceProductCode: string }> {
  const [lockedCase] = await transaction
    .select({
      decisionKind: tripOccurrenceCases.decisionKind,
      occurrenceId: tripOccurrenceCases.occurrenceId,
      status: tripOccurrenceCases.status,
    })
    .from(tripOccurrenceCases)
    .where(
      and(
        eq(tripOccurrenceCases.companyId, input.companyId),
        eq(tripOccurrenceCases.id, input.caseId),
      ),
    )
    .for('no key update')
    .limit(1)
  if (lockedCase === undefined) throw new OccurrenceCaseNotFoundError()
  if (!isOccurrenceSettlementWritable(lockedCase)) {
    throw new OccurrenceCaseTransitionNotAllowedError()
  }

  const [occurrenceRow] = await transaction
    .select({ productCode: tripDocumentOccurrences.productCode })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, lockedCase.occurrenceId),
      ),
    )
    .limit(1)
  if (occurrenceRow === undefined) throw new OccurrenceCaseNotFoundError()

  return { occurrenceId: lockedCase.occurrenceId, occurrenceProductCode: occurrenceRow.productCode }
}
