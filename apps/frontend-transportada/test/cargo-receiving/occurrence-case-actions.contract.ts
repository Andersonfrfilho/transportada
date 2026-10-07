/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b (RF8, ADR-0094 §9.5 ajuste 2): o que o escritório pode fazer na tratativa da avaria de
 * recebimento, por estado e por permissão. Espelha `occurrence-case-state.policy.ts` da API: cada estado oferece
 * EXATAMENTE as ações que a máquina aceita (botão que a API recusa é botão morto), `redelivery_authorized` nunca
 * é oferecida (a política `blocked` a recusa com 422), e sem `occurrences.resolve` nada é oferecido. Sem I/O.
 */
import { describe, expect, test } from 'bun:test'

import { CARGO_OCCURRENCE_CASE_STATUSES } from '@/modules/cargo-receiving/shared/cargoOccurrence.constant'
import {
  isCaseNoteRequired,
  resolveCargoCaseActions,
} from '@/modules/cargo-receiving/shared/cargoOccurrenceCase.service'

type ActionName =
  | 'canCancel'
  | 'canClose'
  | 'canDecide'
  | 'canReturnToWarehouse'
  | 'canReview'
  | 'canSubmit'

const ACTION_NAMES: readonly ActionName[] = [
  'canCancel',
  'canClose',
  'canDecide',
  'canReturnToWarehouse',
  'canReview',
  'canSubmit',
]

/** O que a API aceita em cada estado (`TRANSITIONS`): o resto é 409 `OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED`. */
const EXPECTED: Readonly<Record<string, readonly ActionName[]>> = {
  awaiting_contractor: ['canDecide'],
  cancelled: [],
  closed: [],
  decided: ['canClose'],
  recorded: ['canCancel', 'canReview'],
  returned_to_warehouse: [],
  under_review: ['canCancel', 'canReturnToWarehouse', 'canSubmit'],
}

function offered(status: string): readonly ActionName[] {
  const actions = resolveCargoCaseActions({
    canResolve: true,
    status: status as (typeof CARGO_OCCURRENCE_CASE_STATUSES)[number],
  })
  return ACTION_NAMES.filter((name) => actions[name])
}

describe('cada estado oferece exatamente as ações que a máquina da API aceita', () => {
  for (const status of CARGO_OCCURRENCE_CASE_STATUSES) {
    test(`${status}`, () => {
      expect(offered(status)).toEqual([...(EXPECTED[status] ?? [])].sort())
    })
  }

  test('a tabela cobre todos os estados da tratativa, sem sobrar nem faltar', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...CARGO_OCCURRENCE_CASE_STATUSES].sort())
  })
})

describe('permissão', () => {
  test('sem `occurrences.resolve` nenhuma ação, em estado nenhum', () => {
    for (const status of CARGO_OCCURRENCE_CASE_STATUSES) {
      const actions = resolveCargoCaseActions({ canResolve: false, status })
      expect(ACTION_NAMES.filter((name) => actions[name])).toEqual([])
      expect(actions.decisionKinds).toEqual([])
    }
  })

  test('ocorrência sem tratativa (`null`) não oferece ação nenhuma', () => {
    const actions = resolveCargoCaseActions({ canResolve: true, status: null })

    expect(ACTION_NAMES.filter((name) => actions[name])).toEqual([])
  })
})

describe('a decisão do escritório', () => {
  test('só `other` e `goods_paid`: a reentrega nunca é oferecida (422 com a política `blocked`)', () => {
    const actions = resolveCargoCaseActions({ canResolve: true, status: 'awaiting_contractor' })

    expect(actions.decisionKinds).toEqual(['other', 'goods_paid'])
    expect(actions.decisionKinds).not.toContain('redelivery_authorized' as never)
  })

  test('fora de `awaiting_contractor` não há decisão a escolher', () => {
    for (const status of CARGO_OCCURRENCE_CASE_STATUSES) {
      if (status === 'awaiting_contractor') continue
      expect(resolveCargoCaseActions({ canResolve: true, status }).decisionKinds).toEqual([])
    }
  })
})

describe('a nota é obrigatória onde a API a exige', () => {
  test('decidir, devolver ao galpão e cancelar exigem nota; o resto não', () => {
    expect(isCaseNoteRequired('decide')).toBe(true)
    expect(isCaseNoteRequired('warehouse-return')).toBe(true)
    expect(isCaseNoteRequired('cancel')).toBe(true)
    expect(isCaseNoteRequired('review')).toBe(false)
    expect(isCaseNoteRequired('submit')).toBe(false)
    expect(isCaseNoteRequired('close')).toBe(false)
  })
})
