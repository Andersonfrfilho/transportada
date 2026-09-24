/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  serializeTripOccurrenceQuery,
  setTripOccurrenceCaseStatuses,
  EMPTY_TRIP_OCCURRENCE_FILTERS,
  TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'

const PANEL = new URL(
  '../../src/modules/trip/components/OccurrenceCasePanel.component.tsx',
  import.meta.url,
)

/**
 * Spec 164 T22 (RF33): o painel da tratativa só mostra o botão que o estado **e** a permissão
 * permitem. Sem harness de DOM neste app (CLAUDE.md § "Testes de hook com DOM"), o contrato prova
 * a fiação estática — cada ação condicionada ao status certo — e as funções puras de filtro.
 */
describe('spec 164 T22: painel da tratativa de ocorrência', () => {
  test('case: null não quebra — mostra "sem tratativa"', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('occurrenceCase === null')
    expect(panel).toContain("t('occurrenceCase.none')")
  })

  test('cada ação só aparece no estado certo, e todas exigem canResolve', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain("canResolve && status === 'recorded'")
    expect(panel).toMatch(/canWarehouseReturn = canResolve && status === 'under_review'/u)
    expect(panel).toMatch(/canSubmitToContractor = canResolve && status === 'under_review'/u)
    expect(panel).toContain(
      "canCancel = canResolve && (status === 'recorded' || status === 'under_review')",
    )
    expect(panel).toContain("canClose = canResolve && status === 'decided'")
  })

  test('cancelar e retornar ao barracão exigem nota antes de habilitar o botão', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('note.trim().length === 0 || isBusy')
  })

  test('aguardando o contratante mostra aviso, e o botão de decidir por ele só aparece nesse estado', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain("status === 'awaiting_contractor'")
    expect(panel).toContain("t('occurrenceCase.awaitingContractor')")
    expect(panel).toContain("canDecideOnBehalf = canResolve && status === 'awaiting_contractor'")
    expect(panel).toContain("t('occurrenceCase.action.decide')")
  })

  test('decidir em nome da contratante exige nota e avisa que a decisão é da transportadora', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('decisionNote.trim().length === 0 || isBusy')
    expect(panel).toContain("t('occurrenceCase.decisionWarning')")
  })

  test('reentrega some das opções quando a tratativa não admite — evita o 422 previsível', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain("kind !== 'redelivery_authorized' || redeliveryPolicy === 'allowed'")
  })

  test('usa Button e Icon do design system, nunca botão cru', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain("from '@/components/ui/button'")
    expect(panel).toContain("from '@/components/ui/icon'")
    expect(panel).not.toMatch(/<button[\s>]/u)
  })
})

describe('spec 164 T22 (RF11): filtro por estado da tratativa, incluindo "sem tratativa"', () => {
  test('o vocabulário do filtro inclui "none"', () => {
    expect(TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES).toContain('none')
  })

  test('selecionar um subconjunto restringe a consulta; todos selecionados não restringe nada', () => {
    const narrowed = setTripOccurrenceCaseStatuses(EMPTY_TRIP_OCCURRENCE_FILTERS, [
      'none',
      'recorded',
    ])
    const query = serializeTripOccurrenceQuery({
      cursor: null,
      filters: narrowed,
      order: 'desc',
      perPage: 25,
    })
    expect(new URLSearchParams(query).get('caseStatusIn')).toBe('none,recorded')

    const allSelected = serializeTripOccurrenceQuery({
      cursor: null,
      filters: EMPTY_TRIP_OCCURRENCE_FILTERS,
      order: 'desc',
      perPage: 25,
    })
    expect(new URLSearchParams(allSelected).get('caseStatusIn')).toBeNull()
  })
})

/** Revisão de design da spec 164 (T30): a ordem dos botões e o ruído da reentrega. */
describe('spec 164 T30: o painel da tratativa depois da revisão', () => {
  test('encerrar espera o acerto estar gravado, e diz por que está esperando', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).toContain('hasUnsavedSettlement')
    expect(panel).toContain('disabled={isBusy || hasUnsavedSettlement}')
    expect(panel).toContain("t('occurrenceCase.closeBlockedByDraft')")
    expect(panel).toContain('onDraftDirtyChange={setHasUnsavedSettlement}')
  })

  test('a política de reentrega só aparece com a tratativa em aberto', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).toContain('const isCaseOpen =')
    expect(panel).toContain('{isCaseOpen ? (')
    expect(panel).not.toContain("status === 'cancelled'")
    expect(panel).not.toContain("status === 'returned_to_warehouse'")
  })
})
