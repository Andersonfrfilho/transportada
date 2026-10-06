/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (RF8, RF8a, ADR-0094 §9.3–9.5): a máquina da nota na tela — nenhuma → avaria aberta →
 * "a devolver" → "devolvida", com o desfazer voltando e a devolvida terminal. Tabela de verdade do que cada
 * papel enxerga: `trip.manage` abre, marca e conclui; só `occurrences.resolve` desfaz. A janela vencida
 * explica em vez de oferecer o botão. Espelha as políticas da API (`cargo-arrival-occurrence.policy.ts`,
 * `cargo-arrival-return.policy.ts`); sem I/O.
 */
import { describe, expect, test } from 'bun:test'

import {
  isOccurrenceWindowOpen,
  listCloseBlockers,
  resolveCargoNoteActions,
  type CargoNoteContext,
} from '@/modules/cargo-receiving/shared/cargoNoteActions.service'

import { buildOccurrence } from '../fixtures/cargoOccurrence.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const OPEN_DUE = '2026-10-06T18:00:00.000Z'
const CLOSED_DUE = '2026-10-06T06:00:00.000Z'
const DOCUMENT = documentIdOf(1001)
const OCCURRENCE = buildOccurrence({
  case: { id: 'case-1', status: 'recorded' },
  id: 'occ-1',
  nfeDocumentId: DOCUMENT,
})

function context(overrides: Partial<CargoNoteContext> = {}): CargoNoteContext {
  return {
    arrivalStatus: 'open',
    canManage: true,
    canResolve: false,
    document: { isInLiveTrip: false, separationState: 'received' },
    now: NOW,
    occurrences: [],
    returnOccurrenceId: null,
    returnState: 'none',
    separationDueAt: OPEN_DUE,
    ...overrides,
  }
}

const marked = (overrides: Partial<CargoNoteContext> = {}) =>
  context({
    occurrences: [OCCURRENCE],
    returnOccurrenceId: 'occ-1',
    returnState: 'marked',
    ...overrides,
  })

describe('a janela de separação', () => {
  test('aberta até o instante limite; vencida depois; sem janela, sempre aberta', () => {
    expect(isOccurrenceWindowOpen({ now: NOW, separationDueAt: OPEN_DUE })).toBe(true)
    expect(isOccurrenceWindowOpen({ now: Date.parse(OPEN_DUE), separationDueAt: OPEN_DUE })).toBe(
      true,
    )
    expect(
      isOccurrenceWindowOpen({ now: Date.parse(OPEN_DUE) + 1, separationDueAt: OPEN_DUE }),
    ).toBe(false)
    expect(isOccurrenceWindowOpen({ now: NOW, separationDueAt: CLOSED_DUE })).toBe(false)
    expect(isOccurrenceWindowOpen({ now: NOW, separationDueAt: null })).toBe(true)
  })
})

describe('abrir a avaria', () => {
  test('quem tem `trip.manage` abre em nota recebida ou separada, dentro da janela', () => {
    for (const separationState of ['received', 'separated'] as const) {
      const actions = resolveCargoNoteActions(
        context({ document: { isInLiveTrip: false, separationState } }),
      )
      expect(actions.canOpenOccurrence).toBe(true)
      expect(actions.isWindowClosed).toBe(false)
    }
  })

  test('nota esperada ainda não tem avaria: a nota precisa ser vista na doca primeiro', () => {
    const actions = resolveCargoNoteActions(
      context({ document: { isInLiveTrip: false, separationState: 'expected' } }),
    )

    expect(actions.canOpenOccurrence).toBe(false)
    expect(actions.isWindowClosed).toBe(false)
  })

  test('janela vencida: sem botão, e a tela explica em vez de falhar à toa', () => {
    const actions = resolveCargoNoteActions(context({ separationDueAt: CLOSED_DUE }))

    expect(actions.canOpenOccurrence).toBe(false)
    expect(actions.isWindowClosed).toBe(true)
  })

  test('sem `trip.manage` nada de abrir, nem a explicação da janela', () => {
    const actions = resolveCargoNoteActions(
      context({ canManage: false, separationDueAt: CLOSED_DUE }),
    )

    expect(actions.canOpenOccurrence).toBe(false)
    expect(actions.isWindowClosed).toBe(false)
  })

  test('chegada fechada e nota devolvida recusam, como a API', () => {
    expect(resolveCargoNoteActions(context({ arrivalStatus: 'closed' })).canOpenOccurrence).toBe(
      false,
    )
    expect(resolveCargoNoteActions(context({ returnState: 'returned' })).canOpenOccurrence).toBe(
      false,
    )
  })
})

describe('os selos da nota', () => {
  test('nenhuma → avaria aberta → a devolver → devolvida', () => {
    expect(resolveCargoNoteActions(context()).badge).toBe('none')
    expect(resolveCargoNoteActions(context({ occurrences: [OCCURRENCE] })).badge).toBe(
      'occurrenceOpen',
    )
    expect(resolveCargoNoteActions(marked()).badge).toBe('toReturn')
    expect(resolveCargoNoteActions(marked({ returnState: 'returned' })).badge).toBe('returned')
  })

  test('ocorrência cancelada não conta como avaria aberta', () => {
    const cancelled = { ...OCCURRENCE, cancelledAt: '2026-10-06T10:00:00.000Z' }

    expect(resolveCargoNoteActions(context({ occurrences: [cancelled] })).badge).toBe('none')
  })
})

describe('devolver ao contratante', () => {
  test('marcar exige `trip.manage` e ao menos uma avaria não cancelada', () => {
    expect(resolveCargoNoteActions(context()).canMark).toBe(false)
    expect(resolveCargoNoteActions(context({ occurrences: [OCCURRENCE] })).canMark).toBe(true)
    expect(
      resolveCargoNoteActions(context({ canManage: false, occurrences: [OCCURRENCE] })).canMark,
    ).toBe(false)
    const cancelled = { ...OCCURRENCE, cancelledAt: '2026-10-06T10:00:00.000Z' }
    expect(resolveCargoNoteActions(context({ occurrences: [cancelled] })).canMark).toBe(false)
  })

  test('as origens oferecidas são só as avarias vivas da nota', () => {
    const cancelled = buildOccurrence({
      cancelledAt: '2026-10-06T10:00:00.000Z',
      id: 'occ-2',
      nfeDocumentId: DOCUMENT,
    })

    const actions = resolveCargoNoteActions(context({ occurrences: [OCCURRENCE, cancelled] }))

    expect(actions.markableOccurrences.map((item) => item.id)).toEqual(['occ-1'])
  })

  test('nota em viagem viva, chegada fechada e nota já marcada não marcam', () => {
    const base = { occurrences: [OCCURRENCE] }
    expect(
      resolveCargoNoteActions(
        context({ ...base, document: { isInLiveTrip: true, separationState: 'received' } }),
      ).canMark,
    ).toBe(false)
    expect(resolveCargoNoteActions(context({ ...base, arrivalStatus: 'closed' })).canMark).toBe(
      false,
    )
    expect(resolveCargoNoteActions(marked()).canMark).toBe(false)
  })

  test('a janela vencida NÃO impede marcar: a janela vale só para abrir a avaria', () => {
    const actions = resolveCargoNoteActions(
      context({ occurrences: [OCCURRENCE], separationDueAt: CLOSED_DUE }),
    )

    expect(actions.canMark).toBe(true)
  })
})

describe('desfazer a devolução é de quem decide a tratativa', () => {
  test('só `occurrences.resolve` desfaz, e só a nota marcada', () => {
    expect(resolveCargoNoteActions(marked({ canResolve: true })).canUnmark).toBe(true)
    expect(resolveCargoNoteActions(marked({ canManage: true, canResolve: false })).canUnmark).toBe(
      false,
    )
    expect(resolveCargoNoteActions(context({ canResolve: true })).canUnmark).toBe(false)
  })

  test('o desfazer volta a nota ao fluxo normal: de novo pode marcar', () => {
    const afterUnmark = context({
      occurrences: [OCCURRENCE],
      returnOccurrenceId: null,
      returnState: 'none',
    })

    expect(resolveCargoNoteActions(afterUnmark).canMark).toBe(true)
    expect(resolveCargoNoteActions(afterUnmark).badge).toBe('occurrenceOpen')
  })

  test('chegada fechada recusa o desfazer', () => {
    expect(
      resolveCargoNoteActions(marked({ arrivalStatus: 'closed', canResolve: true })).canUnmark,
    ).toBe(false)
  })
})

describe('concluir a devolução espera a decisão do contratante', () => {
  const withCase = (
    status: 'awaiting_contractor' | 'closed' | 'decided' | 'recorded' | 'under_review',
  ) => marked({ occurrences: [{ ...OCCURRENCE, case: { id: 'case-1', status } }] })

  test('com a tratativa `decided` ou `closed` conclui; antes disso diz que espera', () => {
    for (const status of ['decided', 'closed'] as const) {
      expect(resolveCargoNoteActions(withCase(status)).canComplete).toBe(true)
    }
    for (const status of ['recorded', 'under_review', 'awaiting_contractor'] as const) {
      const actions = resolveCargoNoteActions(withCase(status))
      expect(actions.canComplete).toBe(false)
      expect(actions.isAwaitingDecision).toBe(true)
    }
  })

  test('tipo que não abre tratativa (`case: null`) conclui sem esperar', () => {
    const actions = resolveCargoNoteActions(
      marked({ occurrences: [{ ...OCCURRENCE, case: null }] }),
    )

    expect(actions.canComplete).toBe(true)
    expect(actions.isAwaitingDecision).toBe(false)
  })

  test('concluir é de `trip.manage`, não de quem só lê, e a chegada fechada recusa', () => {
    const decided = {
      occurrences: [{ ...OCCURRENCE, case: { id: 'case-1', status: 'decided' as const } }],
    }
    expect(resolveCargoNoteActions(marked({ ...decided, canManage: false })).canComplete).toBe(
      false,
    )
    expect(
      resolveCargoNoteActions(marked({ ...decided, arrivalStatus: 'closed' })).canComplete,
    ).toBe(false)
  })

  test('origem que a leitura não trouxe não deixa concluir às cegas', () => {
    expect(resolveCargoNoteActions(marked({ occurrences: [] })).canComplete).toBe(false)
  })
})

describe('a nota devolvida é terminal', () => {
  test('nenhuma ação de escrita sobra, para nenhum papel', () => {
    const returned = marked({ canManage: true, canResolve: true, returnState: 'returned' })
    const actions = resolveCargoNoteActions(returned)

    expect(actions).toMatchObject({
      badge: 'returned',
      canComplete: false,
      canMark: false,
      canOpenOccurrence: false,
      canUnmark: false,
      isWindowClosed: false,
    })
  })
})

describe('o que segura o fechamento', () => {
  const documents = [
    { nfeDocumentId: 'a', number: '1001' },
    { nfeDocumentId: 'b', number: '1002' },
    { nfeDocumentId: 'c', number: '1003' },
  ]
  const returns = new Map([
    ['a', { returnOccurrenceId: 'occ-1', returnToContractor: 'marked' as const }],
    ['b', { returnOccurrenceId: 'occ-2', returnToContractor: 'returned' as const }],
  ])

  test('só a nota marcada segura; a devolvida e a sem marca não', () => {
    expect(listCloseBlockers({ documents, returns })).toEqual([{ documentId: 'a', number: '1001' }])
  })

  test('sem nota marcada não há motivo para mostrar', () => {
    expect(listCloseBlockers({ documents, returns: new Map() })).toEqual([])
  })
})
