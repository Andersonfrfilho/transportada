/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (RF8a, ADR-0094 §9.3): a nota "a devolver ao contratante" sai da recomendação de viagens. A API
 * já a devolve como NÃO roteável (`isRoutable: false`); a tela só reflete — ela nunca vai ao fluxo de criação
 * de viagem nem ao roteirizador, e o roteiro que só tem notas marcadas não oferece o botão (com o motivo).
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveTripDraftAction,
  resolveTripDraftCreationIds,
  resolveTripDraftSolverScope,
} from '@/modules/cargo-receiving/shared/cargoPreviewTripDraftView.service'

import {
  buildDraftDocument,
  buildDraftRoute,
  buildTripDrafts,
} from '../fixtures/cargoPreviewTripDraft.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'

const GOING = buildDraftDocument(54_001)
const TO_RETURN = buildDraftDocument(54_002, { isRoutable: false })

describe('a nota marcada para devolução não é oferecida à viagem (spec 237 T3.3)', () => {
  const mixed = buildDraftRoute('FR.S.CAR', { documents: [GOING, TO_RETURN] })
  const onlyMarked = buildDraftRoute('FR.N.SOR', { documents: [TO_RETURN] })

  test('ao fluxo de criação vai só a roteável; a marcada fica de fora', () => {
    expect(resolveTripDraftCreationIds(mixed)).toEqual([documentIdOf(54_001)])
    expect(resolveTripDraftCreationIds(mixed)).not.toContain(documentIdOf(54_002))
  })

  test('ao roteirizador vai só a roteável, com ou sem roteiro escolhido', () => {
    const drafts = buildTripDrafts([mixed, onlyMarked])

    expect(
      resolveTripDraftSolverScope({ drafts, selectedRouteName: undefined }).documentIds,
    ).toEqual([documentIdOf(54_001)])
    expect(
      resolveTripDraftSolverScope({ drafts, selectedRouteName: 'FR.N.SOR' }).documentIds,
    ).toEqual([])
  })

  test('o roteiro que só tem nota marcada mostra o botão desligado, com o motivo', () => {
    expect(resolveTripDraftAction({ canManage: true, route: onlyMarked })).toEqual({
      kind: 'disabled',
      reason: 'none_routable',
    })
    expect(resolveTripDraftAction({ canManage: true, route: mixed })).toEqual({ kind: 'enabled' })
  })
})
