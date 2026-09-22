/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T17 (RF25/CA9c): a ponte acerto → cobrança. A escrita acontece **na mesma transação** do
 * `PUT /trip-occurrences/:id/case/settlement` (T13) — este port recebe a transação já aberta pelo
 * chamador, no molde de `RedeliveryApplicationPort`/`writeStopOrder`, nunca abrindo a própria.
 */
import type { DeliveryChargeStatus } from '../../database/delivery-client.schema.js'
import type { TripTransaction } from '../infrastructure/trip-queryable.type.js'

export type OccurrenceSettlementChargeResult = {
  readonly id: string
  readonly status: DeliveryChargeStatus
}

export type OccurrenceSettlementChargePort = {
  /**
   * Grava ou atualiza a linha de `delivery_charges` do acerto. Lança
   * `OccurrenceChargePartiesUnresolvedError` (422 `DELIVERY_CLIENT_NOT_RESOLVED`) quando a nota não
   * resolve cliente de entrega, e `DeliveryChargeTransitionNotAllowedError` (409) quando a linha já
   * passou de `recorded` — o valor não muda nesse caso.
   */
  applyOccurrenceSettlementCharge(input: {
    readonly actorUserId: string
    readonly amount: string
    readonly companyId: string
    readonly occurrenceId: string
    readonly transaction: TripTransaction
  }): Promise<OccurrenceSettlementChargeResult>
}
