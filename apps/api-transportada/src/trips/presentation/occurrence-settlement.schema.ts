/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T13/T18: a fronteira das duas rotas do acerto. `productCode` aceita vazio — a nota
 * inteira (`occurrence-scope.policy.ts`) — mas nunca some do corpo: um item sem `productCode` seria
 * ambíguo entre "nota inteira" e "esqueci de mandar".
 */
import { z } from 'zod'

import { MONEY_DECIMAL } from '../../shared/money.constant.js'
import {
  TRIP_OCCURRENCE_SETTLEMENT_AMOUNT_SOURCES,
  TRIP_OCCURRENCE_SETTLEMENT_PAYER_KINDS,
} from '../../database/trip.schema.js'

const settlementItemSchema = z
  .object({
    amount: z.string().regex(MONEY_DECIMAL),
    amountSource: z.enum(TRIP_OCCURRENCE_SETTLEMENT_AMOUNT_SOURCES),
    payerId: z.string().uuid().optional(),
    payerKind: z.enum(TRIP_OCCURRENCE_SETTLEMENT_PAYER_KINDS),
    productCode: z.string().trim().max(60),
  })
  .strict()

export const RECORD_SETTLEMENT_BODY_SCHEMA = z
  .object({ items: z.array(settlementItemSchema).max(200) })
  .strict()

export const REIMBURSE_SETTLEMENT_BODY_SCHEMA = z
  .object({ productCode: z.string().trim().max(60) })
  .strict()

export type RecordSettlementBody = z.infer<typeof RECORD_SETTLEMENT_BODY_SCHEMA>
export type ReimburseSettlementBody = z.infer<typeof REIMBURSE_SETTLEMENT_BODY_SCHEMA>
