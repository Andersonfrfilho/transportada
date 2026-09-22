/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T16 (achado 1 da revisão do `architect`): `returned_goods` nasce **só** pela ponte
 * `occurrence-charge.policy.ts` (T17), nunca por rota que uma pessoa aciona. Este contrato reprova
 * a volta do tipo às duas rotas manuais — `POST .../charges` e `PUT .../charge-rules` — e
 * consequentemente à regra recorrente, que só propõe o que uma regra ativa pode ter.
 */
import { describe, expect, test } from 'bun:test'

import {
  DELIVERY_CHARGE_TYPES,
  MANUAL_DELIVERY_CHARGE_TYPES,
} from '../../src/database/delivery-client.schema.js'
import {
  deliveryChargeRecordSchema,
  deliveryChargeRuleSchema,
} from '../../src/delivery-clients/presentation/delivery-charge.routes.js'

describe('MANUAL_DELIVERY_CHARGE_TYPES', () => {
  test('exclui returned_goods, que DELIVERY_CHARGE_TYPES inclui', () => {
    expect(DELIVERY_CHARGE_TYPES).toContain('returned_goods')
    expect(MANUAL_DELIVERY_CHARGE_TYPES).not.toContain('returned_goods')
  })

  test('todo tipo manual continua fazendo parte da lista fechada do banco', () => {
    for (const type of MANUAL_DELIVERY_CHARGE_TYPES) {
      expect(DELIVERY_CHARGE_TYPES).toContain(type)
    }
  })

  test('POST .../documents/:id/charges recusa chargeType: returned_goods', () => {
    const result = deliveryChargeRecordSchema.safeParse({
      amount: '45.0000',
      chargedOn: '2026-09-22',
      chargeType: 'returned_goods',
      notes: '',
    })
    expect(result.success).toBe(false)
  })

  test('PUT .../delivery-clients/:id/charge-rules recusa chargeType: returned_goods', () => {
    const result = deliveryChargeRuleSchema.safeParse({
      chargeType: 'returned_goods',
      expectedAmount: '45.0000',
    })
    expect(result.success).toBe(false)
  })
})
