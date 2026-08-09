/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, count, eq, sql } from 'drizzle-orm'

import {
  cteIssuanceAttempts,
  cteIssuanceEvents,
  cteIssuancePayloads,
  fiscalSequences,
} from '../../database/cte-issuance-execution.schema.js'
import type {
  CteFiscalNumberProbe,
  CteFiscalNumberProbeResult,
} from '../application/cte-issuance-consumer.effect.js'
import { classifyCteRejection } from '../domain/cte-rejection.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const CTE_MODEL = 'cte'

/** Nome do evento que conta as sondas e é o que a tela do lote mostra ao usuário. */
export const FISCAL_NUMBER_ADVANCED_EVENT = 'fiscal_number_advanced'

export class DrizzleCteFiscalNumberProbeRepository implements CteFiscalNumberProbe {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async advance(input: {
    readonly attemptId: string
    readonly batchItemId: string
    readonly burnedNumber: number
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly occurredAt: Date
    readonly rejectionCode: string
    readonly series: string
  }): Promise<CteFiscalNumberProbeResult> {
    return this.#database.transaction(async (transaction) => {
      const [probes] = await transaction
        .select({ total: count() })
        .from(cteIssuanceEvents)
        .where(
          and(
            eq(cteIssuanceEvents.companyId, input.companyId),
            eq(cteIssuanceEvents.batchItemId, input.batchItemId),
            eq(cteIssuanceEvents.eventName, FISCAL_NUMBER_ADVANCED_EVENT),
          ),
        )

      const disposition = classifyCteRejection({
        code: input.rejectionCode,
        probesMade: probes?.total ?? 0,
      })
      if (disposition !== 'advance_fiscal_number') return { outcome: 'exhausted' }

      const [sequence] = await transaction
        .update(fiscalSequences)
        .set({
          lastReservedNumber: sql`${fiscalSequences.nextNumber}`,
          nextNumber: sql`${fiscalSequences.nextNumber} + 1`,
          updatedAt: sql`now()`,
          version: sql`${fiscalSequences.version} + 1`,
        })
        .where(
          and(
            eq(fiscalSequences.companyId, input.companyId),
            eq(fiscalSequences.environment, input.environment),
            eq(fiscalSequences.model, CTE_MODEL),
            eq(fiscalSequences.series, BigInt(input.series)),
          ),
        )
        .returning({ reserved: fiscalSequences.lastReservedNumber })

      if (sequence?.reserved === undefined || sequence.reserved === null) {
        return { outcome: 'exhausted' }
      }

      const nextNumber = Number(sequence.reserved)

      await transaction
        .update(cteIssuancePayloads)
        .set({
          providerConfig: sql`jsonb_set(${cteIssuancePayloads.providerConfig}, '{numeroCte}', to_jsonb(${nextNumber}::bigint))`,
        })
        .where(
          and(
            eq(cteIssuancePayloads.companyId, input.companyId),
            eq(cteIssuancePayloads.attemptId, input.attemptId),
          ),
        )

      // A tentativa também carrega o número: sem isto a tela seguiria mostrando o número queimado.
      await transaction
        .update(cteIssuanceAttempts)
        .set({ fiscalNumber: sequence.reserved, updatedAt: input.occurredAt })
        .where(
          and(
            eq(cteIssuanceAttempts.companyId, input.companyId),
            eq(cteIssuanceAttempts.id, input.attemptId),
          ),
        )

      await transaction.insert(cteIssuanceEvents).values({
        attemptId: input.attemptId,
        batchItemId: input.batchItemId,
        companyId: input.companyId,
        eventName: FISCAL_NUMBER_ADVANCED_EVENT,
        id: crypto.randomUUID(),
        occurredAt: input.occurredAt,
        payload: {
          burnedNumber: input.burnedNumber,
          newNumber: nextNumber,
          reason: 'sefaz_duplicate_number',
          rejectionCode: input.rejectionCode,
          series: input.series,
        },
      })

      return { nextNumber, outcome: 'advanced' }
    })
  }
}
