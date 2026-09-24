/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T13 (RF22-RF24, CA9/CA9b): o acerto por item, com o pagador. Pura, sem I/O — molde de
 * `occurrence-scope.policy.ts` para a validação de item e de `nfse-issuance-correction.policy.ts`
 * para a soma em `Decimal` (aritmética em `bigint` escalado, nunca `float`).
 *
 * ⚠️ **`productCode = ''` é a nota inteira, e é item válido.** Um validador que comparasse só
 * contra `trip_document_occurrence_products` recusaria o caso mais comum — avaria total, sem item
 * marcado. Quem chama resolve o conjunto de códigos válidos com `resolveOccurrenceProductCodes`
 * (`occurrence-scope.policy.ts`): lista vazia vira `['']`, nunca lista vazia de códigos válidos.
 *
 * ⚠️ **`driver` sem `payerId`, ou qualquer outro tipo com `payerId`, é 422** — o mesmo par que o
 * CHECK `trip_occurrence_item_settlements_payer_id_check` reprova no banco. A política aqui é a
 * primeira linha de defesa; o CHECK é a segunda, para quem escrever direto no banco por engano.
 */
import {
  MONEY_SCALE,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import type {
  TripOccurrenceSettlementAmountSource,
  TripOccurrenceSettlementPayerKind,
} from '../../database/trip.schema.js'
import {
  OccurrenceSettlementAmountInvalidError,
  OccurrenceSettlementItemUnknownError,
  OccurrenceSettlementPayerInvalidError,
} from './trip.error.js'

const ERROR_CODE_PREFIX = 'OCCURRENCE_SETTLEMENT'

export type OccurrenceSettlementItemInput = {
  readonly amount: string
  readonly amountSource: TripOccurrenceSettlementAmountSource
  readonly payerId?: string | undefined
  readonly payerKind: TripOccurrenceSettlementPayerKind
  readonly productCode: string
}

export type ResolvedOccurrenceSettlement = {
  readonly items: readonly OccurrenceSettlementItemInput[]
  readonly total: string
}

/** RF23: só grava com a tratativa em `decided` e a decisão `goods_paid` — as outras recusam 409. */
export function isOccurrenceSettlementWritable(input: {
  readonly decisionKind: string | null
  readonly status: string
}): boolean {
  return input.status === 'decided' && input.decisionKind === 'goods_paid'
}

/**
 * `knownProductCodes` já vem resolvido por quem chama (`resolveOccurrenceProductCodes` + a regra
 * do item `''`) — esta função não conhece a ocorrência, só a lista que lhe é dada.
 */
export function resolveOccurrenceSettlement(input: {
  readonly items: readonly OccurrenceSettlementItemInput[]
  readonly knownProductCodes: readonly string[]
}): ResolvedOccurrenceSettlement {
  const known = new Set(input.knownProductCodes)
  let totalScaled = 0n

  for (const item of input.items) {
    if (!known.has(item.productCode.trim())) throw new OccurrenceSettlementItemUnknownError()

    const payerIdPresent = item.payerId !== undefined && item.payerId.trim() !== ''
    const payerIdExpected = item.payerKind === 'driver'
    if (payerIdPresent !== payerIdExpected) throw new OccurrenceSettlementPayerInvalidError()

    const amountScaled = parseScaledDecimal({
      errorCodePrefix: ERROR_CODE_PREFIX,
      scale: MONEY_SCALE,
      value: item.amount,
    })
    if (amountScaled <= 0n) throw new OccurrenceSettlementAmountInvalidError()

    totalScaled += amountScaled
  }

  return { items: input.items, total: formatScaledDecimal(totalScaled, MONEY_SCALE) }
}
