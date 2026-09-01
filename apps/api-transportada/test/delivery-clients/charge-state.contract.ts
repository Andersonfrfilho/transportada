/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  DELIVERY_CHARGE_ORIGINS,
  DELIVERY_CHARGE_STATUSES,
  type DeliveryChargeStatus,
} from '../../src/database/delivery-client.schema.js'
import {
  DELIVERY_CHARGE_ACTIONS,
  checkDeliveryChargeTransition,
  isChargeBatchable,
  resolveInitialChargeStatus,
  type DeliveryChargeAction,
} from '../../src/delivery-clients/domain/delivery-charge-state.policy.js'

/** O caminho inteiro, do que a máquina propôs ao dinheiro de volta. */
const HAPPY_PATH: readonly (readonly [
  DeliveryChargeStatus,
  DeliveryChargeAction,
  DeliveryChargeStatus,
])[] = [
  ['suggested', 'confirm', 'recorded'],
  ['recorded', 'submit', 'submitted'],
  ['submitted', 'approve', 'approved'],
  ['approved', 'reimburse', 'reimbursed'],
]

const ALSO_ALLOWED: readonly (readonly [
  DeliveryChargeStatus,
  DeliveryChargeAction,
  DeliveryChargeStatus,
])[] = [
  ['suggested', 'dismiss', 'dismissed'],
  ['submitted', 'reject', 'rejected'],
]

describe('o ciclo do repasse (spec 060 T005)', () => {
  test('anda do proposto ao reembolsado', () => {
    for (const [status, action, to] of [...HAPPY_PATH, ...ALSO_ALLOWED]) {
      expect({ action, result: checkDeliveryChargeTransition({ action, status }) }).toEqual({
        action,
        result: { kind: 'changed', to },
      })
    }
  })

  /**
   * A trava que a máquina existe para garantir: sugestão que virasse lote seria taxa cobrada de
   * outra empresa **sem ninguém conferir**, e o erro só apareceria no fechamento.
   */
  test('`suggested` nunca alcança `submitted` sem passar por `recorded`', () => {
    expect(checkDeliveryChargeTransition({ action: 'submit', status: 'suggested' })).toEqual({
      code: 'DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED',
      kind: 'refused',
    })
  })

  /**
   * Recusado e descartado não voltam: ressuscitá-los mandaria a mesma cobrança duas vezes ao
   * contratante. A única ação que eles aceitam é a própria, e ela é no-op.
   */
  test('o recusado, o descartado e o reembolsado são terminais', () => {
    for (const [status, ownAction] of [
      ['rejected', 'reject'],
      ['dismissed', 'dismiss'],
      ['reimbursed', 'reimburse'],
    ] as const) {
      for (const action of DELIVERY_CHARGE_ACTIONS) {
        const transition = checkDeliveryChargeTransition({ action, status })
        expect({ action, kind: transition.kind, status }).toEqual({
          action,
          kind: action === ownAction ? 'unchanged' : 'refused',
          status,
        })
      }
    }
  })

  /** Repetir a mesma ação converge em vez de estourar: a rede cai e o operador toca duas vezes. */
  test('repetir a ação que já aconteceu é no-op, não erro', () => {
    for (const [, action, to] of [...HAPPY_PATH, ...ALSO_ALLOWED]) {
      expect(checkDeliveryChargeTransition({ action, status: to })).toEqual({
        kind: 'unchanged',
        to,
      })
    }
  })

  /**
   * A tabela inteira, e não só o caminho feliz: **toda** combinação que não está declarada acima é
   * recusa. É esta varredura que impede um estado novo de nascer alcançável por acidente.
   */
  test('toda transição não declarada é recusada, sem exceção', () => {
    const allowed = new Set(
      [...HAPPY_PATH, ...ALSO_ALLOWED].map(([status, action]) => `${status}:${action}`),
    )

    for (const status of DELIVERY_CHARGE_STATUSES) {
      for (const action of DELIVERY_CHARGE_ACTIONS) {
        const transition = checkDeliveryChargeTransition({ action, status })
        if (allowed.has(`${status}:${action}`)) {
          expect(transition.kind).toBe('changed')
          continue
        }
        expect({ action, kind: transition.kind, status }).toEqual({
          action,
          kind: transition.kind === 'unchanged' ? 'unchanged' : 'refused',
          status,
        })
      }
    }
  })

  /**
   * ADR-0048 §5: só o automático nasce proposto. Obrigar o lançamento manual a passar por
   * confirmação seria pedir que a mesma pessoa confirmasse o que acabou de digitar.
   */
  test('manual nasce registrado; regra e ocorrência nascem propostos', () => {
    expect(DELIVERY_CHARGE_ORIGINS.map(resolveInitialChargeStatus)).toEqual([
      'recorded',
      'suggested',
      'suggested',
    ])
  })

  /** Sugestão não confirmada fica fora do lote — e continua na fila, visível como pendência. */
  test('só o conferido entra no lote', () => {
    expect(DELIVERY_CHARGE_STATUSES.filter(isChargeBatchable)).toEqual(['recorded'])
  })
})
