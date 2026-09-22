/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Voltar à tela de viagens reconstrói a montagem a partir dos ids guardados. O mundo andou enquanto
 * o operador media as caixas: nota que virou viagem sai (e é contada na tela), motorista ou veículo
 * que deixou de ser selecionável sai, e proposta que deixou de estar pronta é descartada **sem**
 * levar junto o pedido que a gerou. Falha de rede não é veredito: a proposta fica guardada.
 */
import { describe, expect, test } from 'bun:test'

import { resolveStopKey } from '@/modules/trip/shared/assemblyOrder.service'
import {
  isRouteChoiceSettled,
  resolvePreferredRouteOptionIndex,
} from '@/modules/trip/shared/assemblyRouteOptions.service'
import type {
  AutomaticAssemblyDraft,
  AutomaticProposalDraft,
  ManualAssemblyDraft,
} from '@/modules/trip/shared/tripAssemblyDraft.validation'
import {
  DRAFT_DOCUMENTS_UNREACHABLE,
  restoreAutomaticAssemblyDraft as restoreAutomaticRaw,
  restoreManualAssemblyDraft as restoreManualRaw,
} from '@/modules/trip/shared/tripAssemblyDraftRestore.service'
import type { RouteSuggestionStatus } from '@/modules/routing/shared/routeSuggestion.types'
import {
  isSettledSuggestionFailure,
  ROUTE_ASSEMBLY_TIMEOUT_CODE,
  RouteSuggestionSettledError,
} from '@/modules/trip/shared/routeAssemblyFailure.service'
import { isSameDocumentSelection } from '@/modules/trip/shared/tripAssemblyDraft.service'

type Document = Readonly<{
  id: string
  recipientAddressNumber: null | string
  recipientCityCode: null | string
  recipientPostalCode: null | string
  tripId: null | string
}>

function buildDocument(id: string, postalCode: string): Document {
  return {
    id,
    recipientAddressNumber: '10',
    recipientCityCode: '3509502',
    recipientPostalCode: postalCode,
    tripId: null,
  }
}

function keyOf(document: Document): string {
  return resolveStopKey({
    cityCode: document.recipientCityCode,
    number: document.recipientAddressNumber,
    postalCode: document.recipientPostalCode,
  })
}

const NFE_1 = buildDocument('nfe-1', '13000001')
const NFE_3 = buildDocument('nfe-3', '13000003')
/** Como `loadAvailableTripDocuments`: nota que já entrou em viagem (`nfe-2`) não volta da busca. */
const AVAILABLE: readonly Document[] = [NFE_1, NFE_3]

const MANUAL: ManualAssemblyDraft = {
  dailyAllowanceDaysInput: '3',
  documentIds: ['nfe-1', 'nfe-2', 'nfe-3'],
  driverIds: ['driver-1', 'driver-gone'],
  isOpen: true,
  routeChoice: { criterion: 'alternative', signature: 'sig' },
  stopOrderDocumentIds: ['nfe-3', 'nfe-2', 'nfe-1'],
  vehicleId: 'vehicle-1',
}

const PROPOSAL_STATE: AutomaticProposalDraft = {
  draftOrderDocumentIdsByVehicle: [],
  draftStopMoves: [],
  openVehicleId: 'vehicle-1',
  orderDocumentIdsByVehicle: [['vehicle-1', ['nfe-3', 'nfe-2', 'nfe-1']]],
  pendingRemovals: ['nfe-3'],
  releaseLayoutByVehicle: [['vehicle-1', 'layout-7']],
  routeChoiceByVehicle: [],
  selectedVehicleIds: ['vehicle-1', 'vehicle-gone'],
  stopMoves: [],
  suggestionId: 'suggestion-1',
}

const AUTOMATIC: AutomaticAssemblyDraft = {
  documentIds: ['nfe-1', 'nfe-2', 'nfe-3'],
  driverIds: ['driver-1'],
  isOpen: true,
  pendingSuggestionId: null,
  proposal: PROPOSAL_STATE,
  vehicleIds: ['vehicle-1', 'vehicle-gone'],
}

const SELECTABLE = { selectableDriverIds: ['driver-1'], selectableVehicleIds: ['vehicle-1'] }

function restoredOf<TRestoration>(
  restoration: TRestoration | typeof DRAFT_DOCUMENTS_UNREACHABLE,
): TRestoration {
  if (restoration === DRAFT_DOCUMENTS_UNREACHABLE) throw new Error('notas não relidas')
  return restoration
}

async function restoreManualAssemblyDraft(input: Parameters<typeof restoreManualRaw>[0]) {
  return restoredOf(await restoreManualRaw(input))
}

async function automatic(
  input: Readonly<{
    draft?: AutomaticAssemblyDraft
    readProposal?: (suggestionId: string) => Promise<unknown>
    readSuggestionStatus: (suggestionId: string) => Promise<RouteSuggestionStatus>
  }>,
) {
  return restoredOf(
    await restoreAutomaticRaw({
      ...SELECTABLE,
      draft: input.draft ?? AUTOMATIC,
      loadDocuments: () => Promise.resolve(AVAILABLE),
      readProposal: input.readProposal ?? ((suggestionId) => Promise.resolve({ id: suggestionId })),
      readSuggestionStatus: input.readSuggestionStatus,
    }),
  )
}

describe('restauração do rascunho da montagem', () => {
  test('manual: nota que virou viagem sai e é contada; a ordem volta pelas notas relidas', async () => {
    const restored = await restoreManualAssemblyDraft({
      ...SELECTABLE,
      draft: MANUAL,
      loadDocuments: () => Promise.resolve(AVAILABLE),
    })

    expect(restored.documents.map((document) => document.id)).toEqual(['nfe-1', 'nfe-3'])
    expect(restored.droppedDocumentCount).toBe(1)
    expect(restored.cityOrder).toEqual([keyOf(NFE_3), keyOf(NFE_1)])
    expect(restored.driverIds).toEqual(['driver-1'])
    expect(restored.vehicleId).toBe('vehicle-1')
    expect(restored.dailyAllowanceDaysInput).toBe('3')
    expect(restored.routeChoice).toEqual({ criterion: 'alternative', signature: 'sig' })
    expect(restored.isOpen).toBe(true)
  })

  test('manual: veículo que deixou de ser selecionável volta vazio', async () => {
    const restored = await restoreManualAssemblyDraft({
      draft: MANUAL,
      loadDocuments: () => Promise.resolve(AVAILABLE),
      selectableDriverIds: [],
      selectableVehicleIds: [],
    })

    expect(restored.driverIds).toEqual([])
    expect(restored.vehicleId).toBe('')
  })

  /**
   * Busca que falha não é veredito: contar as notas como "viraram viagem" seria aviso falso, e
   * aplicar o formulário sem elas gravaria por cima do rascunho. A volta fica pendente.
   */
  test('manual: busca de notas que falha não aplica nada e fica pendente', async () => {
    const restored = await restoreManualRaw({
      ...SELECTABLE,
      draft: MANUAL,
      loadDocuments: () => Promise.reject(new Error('network')),
    })

    expect(restored).toBe(DRAFT_DOCUMENTS_UNREACHABLE)
  })

  test('automático: busca de notas que falha não consulta a proposta e fica pendente', async () => {
    const restored = await restoreAutomaticRaw({
      ...SELECTABLE,
      draft: AUTOMATIC,
      loadDocuments: () => Promise.reject(new Error('network')),
      readProposal: () => Promise.reject(new Error('não deveria reler')),
      readSuggestionStatus: () => Promise.reject(new Error('não deveria consultar')),
    })

    expect(restored).toBe(DRAFT_DOCUMENTS_UNREACHABLE)
  })

  test('automático: proposta pronta é relida, sem rodar o roteirizador', async () => {
    const read: string[] = []
    const restored = await automatic({
      readProposal: (suggestionId) => {
        read.push(suggestionId)
        return Promise.resolve({ id: suggestionId })
      },
      readSuggestionStatus: () => Promise.resolve('ready'),
    })

    expect(read).toEqual(['suggestion-1'])
    expect(restored.documents.map((document) => document.id)).toEqual(['nfe-1', 'nfe-3'])
    expect(restored.droppedDocumentCount).toBe(1)
    expect(restored.vehicleIds).toEqual(['vehicle-1'])
    if (restored.suggestion.kind !== 'restored') throw new Error(restored.suggestion.kind)
    expect(restored.suggestion.proposal).toEqual({ id: 'suggestion-1' })
    expect(restored.suggestion.state.orderByVehicle.get('vehicle-1')).toEqual([
      keyOf(NFE_3),
      keyOf(NFE_1),
    ])
    expect(restored.suggestion.state.releaseLayoutByVehicle.get('vehicle-1')).toBe('layout-7')
    expect([...restored.suggestion.state.pendingRemovals]).toEqual(['nfe-3'])
  })

  test('automático: caminhão da proposta que saiu da frota é desmarcado e contado', async () => {
    const restored = await automatic({ readSuggestionStatus: () => Promise.resolve('ready') })

    if (restored.suggestion.kind !== 'restored') throw new Error(restored.suggestion.kind)
    expect([...restored.suggestion.state.selectedVehicleIds]).toEqual(['vehicle-1'])
    expect(restored.suggestion.droppedVehicleCount).toBe(1)
  })

  for (const status of ['stale', 'failed', 'accepted', 'rejected'] as const) {
    test(`automático: proposta ${status} é descartada e o pedido fica`, async () => {
      const restored = await automatic({
        readProposal: () => Promise.reject(new Error('não deveria reler')),
        readSuggestionStatus: () => Promise.resolve(status),
      })

      expect(restored.suggestion.kind).toBe('dropped')
      expect(restored.driverIds).toEqual(['driver-1'])
      expect(restored.documents.map((document) => document.id)).toEqual(['nfe-1', 'nfe-3'])
      expect(restored.isOpen).toBe(true)
    })
  }

  test('automático: falha de rede guarda a proposta para tentar de novo', async () => {
    const restored = await automatic({
      readSuggestionStatus: () => Promise.reject(new Error('network')),
    })

    expect(restored.suggestion).toEqual({
      kind: 'unreachable',
      retained: { pendingSuggestionId: null, proposal: PROPOSAL_STATE },
    })
  })

  test('automático: proposta pronta que falha ao reler também fica guardada', async () => {
    const restored = await automatic({
      readProposal: () => Promise.reject(new Error('network')),
      readSuggestionStatus: () => Promise.resolve('ready'),
    })

    expect(restored.suggestion.kind).toBe('unreachable')
  })

  for (const status of ['queued', 'running', 'ready'] as const) {
    test(`automático: sugestão ainda sem resposta (${status}) retoma a espera`, async () => {
      const restored = await automatic({
        draft: { ...AUTOMATIC, pendingSuggestionId: 'suggestion-9', proposal: null },
        readSuggestionStatus: () => Promise.resolve(status),
      })

      expect(restored.suggestion).toEqual({ kind: 'resume', suggestionId: 'suggestion-9' })
    })
  }

  test('automático: sugestão pendente que terminou em falha é descartada', async () => {
    const restored = await automatic({
      draft: { ...AUTOMATIC, pendingSuggestionId: 'suggestion-9', proposal: null },
      readSuggestionStatus: () => Promise.resolve('failed'),
    })

    expect(restored.suggestion.kind).toBe('dropped')
  })

  test('automático sem proposta guardada não consulta o servidor', async () => {
    const restored = await automatic({
      draft: { ...AUTOMATIC, proposal: null },
      readProposal: () => Promise.reject(new Error('não deveria reler')),
      readSuggestionStatus: () => Promise.reject(new Error('não deveria consultar')),
    })

    expect(restored.suggestion).toEqual({ kind: 'none' })
  })
})

describe('rota escolhida devolvida ao mapa', () => {
  const OPTIONS = [{ signature: 'sig-a' }, { signature: 'sig-b' }, { signature: null }]

  test('a assinatura guardada reencontra a opção, em qualquer posição', () => {
    expect(
      resolvePreferredRouteOptionIndex({
        options: OPTIONS,
        preferred: { criterion: 'alternative', signature: 'sig-b' },
      }),
    ).toBe(1)
  })

  test('estrada diferente não herda a escolha: sem assinatura igual, nada muda', () => {
    expect(
      resolvePreferredRouteOptionIndex({
        options: OPTIONS,
        preferred: { criterion: 'cheapest', signature: 'sig-z' },
      }),
    ).toBeUndefined()
    expect(
      resolvePreferredRouteOptionIndex({
        options: OPTIONS,
        preferred: { criterion: 'cheapest', signature: null },
      }),
    ).toBeUndefined()
    expect(resolvePreferredRouteOptionIndex({ options: OPTIONS, preferred: undefined })).toBe(
      undefined,
    )
  })

  /**
   * Com a consulta ainda desligada (mapa montando, pontos por chegar) não há resposta, e publicar
   * "sem escolha" apagaria a rota que acabou de voltar do rascunho.
   */
  test('sem resposta da estrada nada é publicado', () => {
    expect(isRouteChoiceSettled({ hasResponse: false, isDraft: false, isFetching: false })).toBe(
      false,
    )
    expect(isRouteChoiceSettled({ hasResponse: true, isDraft: false, isFetching: true })).toBe(
      false,
    )
    expect(isRouteChoiceSettled({ hasResponse: true, isDraft: true, isFetching: false })).toBe(
      false,
    )
    expect(isRouteChoiceSettled({ hasResponse: true, isDraft: false, isFetching: false })).toBe(
      true,
    )
  })
})

describe('fim da espera pela sugestão', () => {
  /**
   * Só o fim de verdade esquece a sugestão pedida: falhou, envelheceu ou estourou o teto. Queda de
   * rede na espera não diz nada sobre a sugestão — esquecê-la a deixaria órfã no servidor.
   */
  test('falha, proposta velha e teto estourado encerram; rede não', () => {
    expect(
      isSettledSuggestionFailure(new RouteSuggestionSettledError('ROUTE_SUGGESTION_FAILED')),
    ).toBe(true)
    expect(
      isSettledSuggestionFailure(new RouteSuggestionSettledError('ROUTE_SUGGESTION_STALE')),
    ).toBe(true)
    expect(isSettledSuggestionFailure(new Error(ROUTE_ASSEMBLY_TIMEOUT_CODE))).toBe(true)
    expect(isSettledSuggestionFailure(new Error('TRIP_REQUEST_FAILED'))).toBe(false)
    expect(isSettledSuggestionFailure(new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('seleção do lote', () => {
  test('a mesma seleção em outra ordem não é mudança do operador', () => {
    expect(isSameDocumentSelection([{ id: 'b' }, { id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toBe(
      true,
    )
    expect(isSameDocumentSelection([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toBe(false)
    expect(isSameDocumentSelection([{ id: 'a,b' }], [{ id: 'a' }, { id: 'b' }])).toBe(false)
  })
})
