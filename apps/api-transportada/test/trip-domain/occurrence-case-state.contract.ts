/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_OCCURRENCE_CASE_STATUSES } from '../../src/database/trip.schema.js'
import {
  OCCURRENCE_CASE_ACTIONS,
  OCCURRENCE_CASE_TERMINAL_STATUSES,
  OCCURRENCE_CASE_TRANSITION_REFUSALS,
  checkOccurrenceCaseTransition,
  type OccurrenceCaseAction,
  type OccurrenceCaseTransition,
  type CheckOccurrenceCaseTransitionInput,
} from '../../src/trips/domain/occurrence-case-state.policy.js'

/**
 * Contexto neutro: `redeliveryPolicy: 'allowed'` e `hasSettlementItems: true` desligam as três
 * recusas de negócio (RF7, RF16, `settlementWithoutItems`), deixando só a forma da máquina
 * aparecer. `decisionKind: null` é o estado antes de qualquer decisão existir.
 */
function baseInput(
  overrides: Partial<CheckOccurrenceCaseTransitionInput> &
    Pick<CheckOccurrenceCaseTransitionInput, 'action' | 'status'>,
): CheckOccurrenceCaseTransitionInput {
  return {
    decisionKind: null,
    hasSettlementItems: true,
    redeliveryPolicy: 'allowed',
    ...overrides,
  }
}

const REFUSED_NOT_ALLOWED: OccurrenceCaseTransition = {
  code: OCCURRENCE_CASE_TRANSITION_REFUSALS.transitionNotAllowed,
  kind: 'refused',
}

/**
 * A tabela inteira, escrita à mão — `STATUSES × ACTIONS` do vocabulário do **schema**
 * (`TRIP_OCCURRENCE_CASE_STATUSES`) contra as ações da **política**
 * (`OCCURRENCE_CASE_ACTIONS`), sob o contexto neutro. Nada aqui é derivado do resultado da
 * própria política — é o desenho da máquina (D3 do spec.md), copiado à mão.
 */
const EXPECTED: Readonly<
  Record<
    (typeof TRIP_OCCURRENCE_CASE_STATUSES)[number],
    Readonly<Record<OccurrenceCaseAction, OccurrenceCaseTransition>>
  >
> = {
  awaiting_contractor: {
    cancel: REFUSED_NOT_ALLOWED,
    closure: REFUSED_NOT_ALLOWED,
    contractor_submission: { kind: 'unchanged', to: 'awaiting_contractor' },
    decide: { kind: 'changed', to: 'decided' },
    review: REFUSED_NOT_ALLOWED,
    warehouse_return: REFUSED_NOT_ALLOWED,
  },
  cancelled: {
    cancel: { kind: 'unchanged', to: 'cancelled' },
    closure: REFUSED_NOT_ALLOWED,
    contractor_submission: REFUSED_NOT_ALLOWED,
    decide: REFUSED_NOT_ALLOWED,
    review: REFUSED_NOT_ALLOWED,
    warehouse_return: REFUSED_NOT_ALLOWED,
  },
  closed: {
    cancel: REFUSED_NOT_ALLOWED,
    closure: { kind: 'unchanged', to: 'closed' },
    contractor_submission: REFUSED_NOT_ALLOWED,
    decide: REFUSED_NOT_ALLOWED,
    review: REFUSED_NOT_ALLOWED,
    warehouse_return: REFUSED_NOT_ALLOWED,
  },
  decided: {
    cancel: REFUSED_NOT_ALLOWED,
    closure: { kind: 'changed', to: 'closed' },
    contractor_submission: REFUSED_NOT_ALLOWED,
    decide: { kind: 'unchanged', to: 'decided' },
    review: REFUSED_NOT_ALLOWED,
    warehouse_return: REFUSED_NOT_ALLOWED,
  },
  recorded: {
    cancel: { kind: 'changed', to: 'cancelled' },
    closure: REFUSED_NOT_ALLOWED,
    contractor_submission: REFUSED_NOT_ALLOWED,
    decide: REFUSED_NOT_ALLOWED,
    review: { kind: 'changed', to: 'under_review' },
    warehouse_return: REFUSED_NOT_ALLOWED,
  },
  returned_to_warehouse: {
    cancel: REFUSED_NOT_ALLOWED,
    closure: REFUSED_NOT_ALLOWED,
    contractor_submission: REFUSED_NOT_ALLOWED,
    decide: REFUSED_NOT_ALLOWED,
    review: REFUSED_NOT_ALLOWED,
    warehouse_return: { kind: 'unchanged', to: 'returned_to_warehouse' },
  },
  under_review: {
    cancel: { kind: 'changed', to: 'cancelled' },
    closure: REFUSED_NOT_ALLOWED,
    contractor_submission: { kind: 'changed', to: 'awaiting_contractor' },
    decide: REFUSED_NOT_ALLOWED,
    review: { kind: 'unchanged', to: 'under_review' },
    warehouse_return: { kind: 'changed', to: 'returned_to_warehouse' },
  },
}

describe('a máquina da tratativa de ocorrência (spec 164 T2)', () => {
  test('a tabela inteira, status × ação, contra o desenho escrito à mão', () => {
    for (const status of TRIP_OCCURRENCE_CASE_STATUSES) {
      for (const action of OCCURRENCE_CASE_ACTIONS) {
        const result = checkOccurrenceCaseTransition(baseInput({ action, status }))
        expect({ action, result, status }).toEqual({
          action,
          result: EXPECTED[status][action],
          status,
        })
      }
    }
  })

  test('sete arestas mudam de estado — nem uma a mais, nem uma a menos', () => {
    const changedEdges = TRIP_OCCURRENCE_CASE_STATUSES.flatMap((status) =>
      OCCURRENCE_CASE_ACTIONS.filter((action) => EXPECTED[status][action].kind === 'changed').map(
        (action) => [status, action] as const,
      ),
    )
    expect(changedEdges.length).toBe(7)
  })

  test('nenhum `changed` sai de `closed`, `returned_to_warehouse` ou `cancelled`', () => {
    for (const status of OCCURRENCE_CASE_TERMINAL_STATUSES) {
      for (const action of OCCURRENCE_CASE_ACTIONS) {
        const result = checkOccurrenceCaseTransition(baseInput({ action, status }))
        expect({ action, kind: result.kind, status }).toEqual({
          action,
          kind: result.kind === 'unchanged' ? 'unchanged' : 'refused',
          status,
        })
      }
    }
  })

  test('travessia a partir de `recorded`: sem aresta de volta, todo estado alcançável', () => {
    const graph = new Map<string, string[]>()
    for (const status of TRIP_OCCURRENCE_CASE_STATUSES) graph.set(status, [])
    for (const status of TRIP_OCCURRENCE_CASE_STATUSES) {
      for (const action of OCCURRENCE_CASE_ACTIONS) {
        const expected = EXPECTED[status][action]
        if (expected.kind === 'changed') graph.get(status)?.push(expected.to)
      }
    }

    const visited = new Set<string>()
    const onPath = new Set<string>()

    function walk(node: string): void {
      onPath.add(node)
      visited.add(node)
      for (const next of graph.get(node) ?? []) {
        if (onPath.has(next)) {
          throw new Error(`aresta de volta: ${node} -> ${next}`)
        }
        if (!visited.has(next)) walk(next)
      }
      onPath.delete(node)
    }

    expect(() => walk('recorded')).not.toThrow()
    expect([...visited].sort()).toEqual([...TRIP_OCCURRENCE_CASE_STATUSES].sort())
  })

  test('idempotência: repetir a mesma ação converge', () => {
    for (const status of TRIP_OCCURRENCE_CASE_STATUSES) {
      for (const action of OCCURRENCE_CASE_ACTIONS) {
        const first = checkOccurrenceCaseTransition(baseInput({ action, status }))
        if (first.kind !== 'changed') continue
        const second = checkOccurrenceCaseTransition(baseInput({ action, status: first.to }))
        expect(second).toEqual({ kind: 'unchanged', to: first.to })
      }
    }
  })

  /** RF7: tratativa `blocked` sem item para acertar não tem pergunta a fazer ao contratante. */
  test('RF7 — `contractor_submission` recusa `blocked` sem item', () => {
    expect(
      checkOccurrenceCaseTransition(
        baseInput({
          action: 'contractor_submission',
          hasSettlementItems: false,
          redeliveryPolicy: 'blocked',
          status: 'under_review',
        }),
      ),
    ).toEqual({
      code: OCCURRENCE_CASE_TRANSITION_REFUSALS.redeliveryBlockedHasNoQuestion,
      kind: 'refused',
    })

    expect(
      checkOccurrenceCaseTransition(
        baseInput({
          action: 'contractor_submission',
          hasSettlementItems: true,
          redeliveryPolicy: 'blocked',
          status: 'under_review',
        }),
      ),
    ).toEqual({ kind: 'changed', to: 'awaiting_contractor' })
  })

  /** RF16: o tipo diz que aquele fato não admite segunda tentativa. */
  test('RF16 — `decide` recusa `redelivery_authorized` sobre `blocked`', () => {
    expect(
      checkOccurrenceCaseTransition(
        baseInput({
          action: 'decide',
          decisionKind: 'redelivery_authorized',
          redeliveryPolicy: 'blocked',
          status: 'awaiting_contractor',
        }),
      ),
    ).toEqual({ code: OCCURRENCE_CASE_TRANSITION_REFUSALS.redeliveryNotAllowed, kind: 'refused' })

    expect(
      checkOccurrenceCaseTransition(
        baseInput({
          action: 'decide',
          decisionKind: 'redelivery_authorized',
          redeliveryPolicy: 'allowed',
          status: 'awaiting_contractor',
        }),
      ),
    ).toEqual({ kind: 'changed', to: 'decided' })
  })

  test('`closure` recusa `goods_paid` sem nenhum item acertado', () => {
    expect(
      checkOccurrenceCaseTransition(
        baseInput({
          action: 'closure',
          decisionKind: 'goods_paid',
          hasSettlementItems: false,
          status: 'decided',
        }),
      ),
    ).toEqual({ code: OCCURRENCE_CASE_TRANSITION_REFUSALS.settlementWithoutItems, kind: 'refused' })

    expect(
      checkOccurrenceCaseTransition(
        baseInput({
          action: 'closure',
          decisionKind: 'goods_paid',
          hasSettlementItems: true,
          status: 'decided',
        }),
      ),
    ).toEqual({ kind: 'changed', to: 'closed' })
  })

  test('`OCCURRENCE_CASE_TERMINAL_STATUSES` casa com os CHECKs de terminal do schema', () => {
    const sorted: readonly string[] = [...OCCURRENCE_CASE_TERMINAL_STATUSES].sort()
    expect(sorted).toEqual(['cancelled', 'closed', 'returned_to_warehouse'])
  })
})
