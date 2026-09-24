/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T17: escritor único da cobrança de mercadoria devolvida. Molde de
 * `DrizzleRedeliveryApplicationRepository` — importa tabelas de outro módulo diretamente na camada
 * de infraestrutura (o schema é compartilhado via `database.schema.ts`), e recebe a `TripTransaction`
 * já aberta pelo chamador em vez de abrir a própria.
 *
 * `findChargeParties` é **injetada**, não reimplementada: é a mesma consulta que a sugestão
 * recorrente usa (`DrizzleDeliveryChargeRepository.findChargeParties`), amarrada por composição no
 * `main.ts` — duas cópias da mesma junção nota → cliente → contratante divergiriam com o tempo.
 */
import { and, eq, sql } from 'drizzle-orm'

import {
  deliveryCharges,
  type DeliveryChargeStatus,
} from '../../database/delivery-client.schema.js'
import { tripDocumentOccurrences } from '../../database/trip.schema.js'
import type { ChargeParties } from '../../delivery-clients/application/delivery-charge.port.js'
import { DeliveryChargeTransitionNotAllowedError } from '../../delivery-clients/application/delivery-charges.use-case.js'
import { isOccurrenceChargeWritable } from '../domain/occurrence-charge.policy.js'
import {
  OccurrenceChargeConcurrentWriteError,
  OccurrenceChargePartiesUnresolvedError,
  TripOccurrenceNotFoundError,
} from '../domain/trip.error.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import type {
  OccurrenceSettlementChargePort,
  OccurrenceSettlementChargeResult,
} from '../application/occurrence-settlement-charge.port.js'

export type FindChargePartiesFunction = (input: {
  readonly companyId: string
  readonly tripDocumentId: string
}) => Promise<ChargeParties | null>

const OCCURRENCE_CHARGE_UNIQUE_CONSTRAINT = 'delivery_charges_occurrence_unique'
const RETURNED_GOODS_CHARGE_TYPE = 'returned_goods'
const RETURNED_GOODS_ORIGIN = 'occurrence'

export class DrizzleOccurrenceSettlementChargeRepository implements OccurrenceSettlementChargePort {
  public constructor(private readonly findChargeParties: FindChargePartiesFunction) {}

  public async applyOccurrenceSettlementCharge(input: {
    readonly actorUserId: string
    readonly amount: string
    readonly companyId: string
    readonly occurrenceId: string
    readonly transaction: Parameters<
      OccurrenceSettlementChargePort['applyOccurrenceSettlementCharge']
    >[0]['transaction']
  }): Promise<OccurrenceSettlementChargeResult> {
    const { actorUserId, amount, companyId, occurrenceId, transaction } = input

    const [occurrenceRow] = await transaction
      .select({
        chargedOn: sql<string>`${tripDocumentOccurrences.createdAt}::date`,
        tripDocumentId: tripDocumentOccurrences.tripDocumentId,
      })
      .from(tripDocumentOccurrences)
      .where(
        and(
          eq(tripDocumentOccurrences.companyId, companyId),
          eq(tripDocumentOccurrences.id, occurrenceId),
        ),
      )
      .limit(1)
    if (occurrenceRow === undefined) throw new TripOccurrenceNotFoundError()

    const parties = await this.findChargeParties({
      companyId,
      tripDocumentId: occurrenceRow.tripDocumentId,
    })
    if (parties === null) throw new OccurrenceChargePartiesUnresolvedError()

    const [existing] = await transaction
      .select({ id: deliveryCharges.id, status: deliveryCharges.status })
      .from(deliveryCharges)
      .where(
        and(
          eq(deliveryCharges.companyId, companyId),
          eq(deliveryCharges.occurrenceId, occurrenceId),
        ),
      )
      .for('no key update')
      .limit(1)

    if (existing === undefined) {
      /**
       * ⚠️ O `for no key update` acima **não trava o que ainda não existe**: duas requisições
       * concorrentes chegam as duas aqui, e quem perde bate no índice único
       * `delivery_charges_occurrence_unique`. 409, nunca a violação crua como 500.
       */
      try {
        const [inserted] = await transaction
          .insert(deliveryCharges)
          .values({
            amount,
            chargedOn: occurrenceRow.chargedOn,
            chargeType: RETURNED_GOODS_CHARGE_TYPE,
            companyId,
            contractorId: parties.contractorId,
            deliveryClientId: parties.deliveryClientId,
            occurrenceId,
            origin: RETURNED_GOODS_ORIGIN,
            recordedByUserId: actorUserId,
            status: 'recorded' satisfies DeliveryChargeStatus,
            tripDocumentId: occurrenceRow.tripDocumentId,
            tripId: parties.tripId,
          })
          .returning({ id: deliveryCharges.id, status: deliveryCharges.status })
        /** Sem `onConflictDoNothing`: quem perde a corrida precisa saber, não convergir em silêncio. */
        if (inserted === undefined) {
          throw new Error('delivery_charges insert returned no row')
        }
        return inserted
      } catch (error) {
        if (violatedUniqueConstraint(error) === OCCURRENCE_CHARGE_UNIQUE_CONSTRAINT) {
          throw new OccurrenceChargeConcurrentWriteError()
        }
        throw error
      }
    }

    if (!isOccurrenceChargeWritable(existing.status)) {
      throw new DeliveryChargeTransitionNotAllowedError({ from: existing.status, to: 'recorded' })
    }

    const [updated] = await transaction
      .update(deliveryCharges)
      .set({ amount, updatedAt: new Date() })
      .where(and(eq(deliveryCharges.companyId, companyId), eq(deliveryCharges.id, existing.id)))
      .returning({ id: deliveryCharges.id, status: deliveryCharges.status })
    if (updated === undefined) {
      throw new DeliveryChargeTransitionNotAllowedError({ from: existing.status, to: 'recorded' })
    }

    return updated
  }

  public async clearOccurrenceSettlementCharge(input: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly transaction: Parameters<
      OccurrenceSettlementChargePort['clearOccurrenceSettlementCharge']
    >[0]['transaction']
  }): Promise<void> {
    const { companyId, occurrenceId, transaction } = input

    const [existing] = await transaction
      .select({ id: deliveryCharges.id, status: deliveryCharges.status })
      .from(deliveryCharges)
      .where(
        and(
          eq(deliveryCharges.companyId, companyId),
          eq(deliveryCharges.occurrenceId, occurrenceId),
        ),
      )
      .for('no key update')
      .limit(1)
    if (existing === undefined) return

    if (!isOccurrenceChargeWritable(existing.status)) {
      throw new DeliveryChargeTransitionNotAllowedError({ from: existing.status, to: 'recorded' })
    }

    await transaction
      .delete(deliveryCharges)
      .where(and(eq(deliveryCharges.companyId, companyId), eq(deliveryCharges.id, existing.id)))
  }
}
