/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O rascunho da montagem de viagem (manual e automática) sobrevive a sair da tela — medir as caixas,
 * abrir a frota, recarregar — e é descartável por botão. O que vai para o `sessionStorage` é entrada
 * e id, nunca a nota inteira nem o endereço: a chave de parada é `cidade|CEP|número`, e a ordem das
 * paradas é guardada pelo id de uma nota de cada parada.
 */
import { describe, expect, test } from 'bun:test'

import { resolveStopKey } from '@/modules/trip/shared/assemblyOrder.service'
import {
  buildAutomaticAssemblyDraft,
  buildManualAssemblyDraft,
  readAutomaticAssemblyDraft,
  readManualAssemblyDraft,
  writeAutomaticAssemblyDraft,
  writeManualAssemblyDraft,
} from '@/modules/trip/shared/tripAssemblyDraft.service'
import {
  buildTripAssemblyDraftKey,
  clearAllTripAssemblyDrafts,
  clearOtherScopeTripAssemblyDrafts,
  clearTripAssemblyDraft,
  TRIP_ASSEMBLY_DRAFT_MODE,
  TRIP_ASSEMBLY_DRAFT_TTL_MS,
  type TripAssemblyDraftStorage,
} from '@/modules/trip/shared/tripAssemblyDraftStorage.service'
import type { TripQuickCreateQueue } from '@/modules/trip/shared/tripQuickCreate.service'
import type { ScannedNfeDocument } from '@/modules/trip/shared/trip.types'

const SCOPE = { companyId: 'company-1', userId: 'user-1' } as const
const NOW = Date.UTC(2026, 8, 18, 12)
const RECIPIENT_NAME = 'Maria Aparecida da Silva'
const RECIPIENT_STREET = 'Rua das Palmeiras'
const RECIPIENT_PHONE = '11987654321'
const POSTAL_CODE = '13049250'
const ADDRESS_NUMBER = 'Nº 4417-B'
const ACCESS_KEY = '35260912345678000190550010000001231000001234'

function createMemoryStorage(): TripAssemblyDraftStorage & {
  readonly entries: Map<string, string>
} {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size
    },
    removeItem: (key) => {
      entries.delete(key)
    },
    setItem: (key, value) => {
      entries.set(key, value)
    },
  }
}

/** A nota como a busca a entrega: com tudo que identifica o destinatário. */
function buildDocument(id: string, postalCode = POSTAL_CODE): ScannedNfeDocument {
  return {
    accessKey: ACCESS_KEY,
    id,
    number: '123',
    recipientAddressNumber: ADDRESS_NUMBER,
    recipientCity: 'Campinas',
    recipientCityCode: '3509502',
    recipientName: RECIPIENT_NAME,
    recipientPhone: RECIPIENT_PHONE,
    recipientPostalCode: postalCode,
    recipientState: 'SP',
    recipientStreet: RECIPIENT_STREET,
    series: '1',
    status: 'authorized',
    tripId: null,
  } as unknown as ScannedNfeDocument
}

function stopKeyOf(document: ScannedNfeDocument): string {
  return resolveStopKey({
    cityCode: document.recipientCityCode,
    number: document.recipientAddressNumber,
    postalCode: document.recipientPostalCode,
  })
}

const FIRST = buildDocument('nfe-1')
const SECOND = buildDocument('nfe-2', '13049999')
/** Mesma parada que a primeira: a ordem guarda **uma** nota por parada. */
const SAME_STOP = buildDocument('nfe-3')

const QUEUE: TripQuickCreateQueue = [
  { accessKey: 'a', document: FIRST, status: 'staged' },
  { accessKey: 'b', document: SECOND, status: 'staged' },
  { accessKey: 'c', document: SAME_STOP, status: 'staged' },
  { accessKey: 'x', refusal: 'notFound', status: 'refused' },
]

function manualDraft() {
  return buildManualAssemblyDraft({
    cityOrder: [stopKeyOf(SECOND), stopKeyOf(FIRST)],
    dailyAllowanceDaysInput: '2',
    driverIds: ['driver-1'],
    isOpen: true,
    queue: QUEUE,
    routeChoice: { criterion: 'cheapest', signature: '3f2a9c01d4e5b6a7' },
    vehicleId: 'vehicle-1',
  })
}

function automaticDraft() {
  return buildAutomaticAssemblyDraft({
    draft: { driverIds: ['driver-1'], vehicleIds: ['vehicle-9'] },
    isOpen: true,
    pendingSuggestionId: null,
    pool: [FIRST, SECOND],
    proposal: {
      draftOrderByVehicle: new Map([['vehicle-1', [stopKeyOf(SECOND), stopKeyOf(FIRST)]]]),
      draftStopMoves: new Map([['nfe-2', 'vehicle-2']]),
      openVehicleId: 'vehicle-1',
      orderByVehicle: new Map([['vehicle-2', [stopKeyOf(FIRST)]]]),
      pendingRemovals: new Set(['nfe-3']),
      releaseLayoutByVehicle: new Map([['vehicle-1', 'layout-7']]),
      routeChoiceByVehicle: new Map([['vehicle-1', { criterion: 'fastest', signature: 'ab12' }]]),
      selectedVehicleIds: new Set(['vehicle-1', 'vehicle-2']),
      stopMoves: new Map([['nfe-1', 'vehicle-2']]),
      suggestionId: 'suggestion-1',
    },
  })
}

describe('rascunho da montagem de viagem', () => {
  test('a chave separa modo, empresa e usuário', () => {
    expect(buildTripAssemblyDraftKey({ mode: TRIP_ASSEMBLY_DRAFT_MODE.manual, scope: SCOPE })).toBe(
      'transportada.trip.assembly-draft:manual:company-1:user-1',
    )
    expect(
      buildTripAssemblyDraftKey({ mode: TRIP_ASSEMBLY_DRAFT_MODE.automatic, scope: SCOPE }),
    ).toBe('transportada.trip.assembly-draft:automatic:company-1:user-1')
  })

  test('manual: a ordem das paradas é guardada por uma nota de cada parada', () => {
    const storage = createMemoryStorage()
    writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage })

    expect(readManualAssemblyDraft({ now: NOW + 1000, scope: SCOPE, storage })).toEqual({
      dailyAllowanceDaysInput: '2',
      documentIds: ['nfe-1', 'nfe-2', 'nfe-3'],
      driverIds: ['driver-1'],
      isOpen: true,
      routeChoice: { criterion: 'cheapest', signature: '3f2a9c01d4e5b6a7' },
      stopOrderDocumentIds: ['nfe-2', 'nfe-1'],
      vehicleId: 'vehicle-1',
    })
  })

  test('automático: proposta com Maps e Sets como listas, ordens por id de nota', () => {
    const storage = createMemoryStorage()
    writeAutomaticAssemblyDraft({ draft: automaticDraft(), now: NOW, scope: SCOPE, storage })

    expect(readAutomaticAssemblyDraft({ now: NOW, scope: SCOPE, storage })).toEqual({
      documentIds: ['nfe-1', 'nfe-2'],
      driverIds: ['driver-1'],
      isOpen: true,
      pendingSuggestionId: null,
      proposal: {
        draftOrderDocumentIdsByVehicle: [['vehicle-1', ['nfe-2', 'nfe-1']]],
        draftStopMoves: [['nfe-2', 'vehicle-2']],
        openVehicleId: 'vehicle-1',
        orderDocumentIdsByVehicle: [['vehicle-2', ['nfe-1']]],
        pendingRemovals: ['nfe-3'],
        releaseLayoutByVehicle: [['vehicle-1', 'layout-7']],
        routeChoiceByVehicle: [['vehicle-1', { criterion: 'fastest', signature: 'ab12' }]],
        selectedVehicleIds: ['vehicle-1', 'vehicle-2'],
        stopMoves: [['nfe-1', 'vehicle-2']],
        suggestionId: 'suggestion-1',
      },
      vehicleIds: ['vehicle-9'],
    })
  })

  test('a sugestão ainda calculando é guardada antes de ficar pronta', () => {
    const storage = createMemoryStorage()
    const draft = buildAutomaticAssemblyDraft({
      draft: { driverIds: [], vehicleIds: [] },
      isOpen: false,
      pendingSuggestionId: 'suggestion-9',
      pool: [],
      proposal: null,
    })
    writeAutomaticAssemblyDraft({ draft, now: NOW, scope: SCOPE, storage })

    expect(
      readAutomaticAssemblyDraft({ now: NOW, scope: SCOPE, storage })?.pendingSuggestionId,
    ).toBe('suggestion-9')
  })

  test('nenhum dado pessoal nem endereço chega ao armazenamento', () => {
    const storage = createMemoryStorage()
    writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage })
    writeAutomaticAssemblyDraft({ draft: automaticDraft(), now: NOW, scope: SCOPE, storage })

    const personal = [
      RECIPIENT_NAME,
      RECIPIENT_STREET,
      RECIPIENT_PHONE,
      ACCESS_KEY,
      POSTAL_CODE,
      '13049999',
      '4417',
      stopKeyOf(FIRST),
    ]
    expect(storage.entries.size).toBe(2)
    for (const raw of storage.entries.values()) {
      for (const value of personal) expect(raw).not.toContain(value)
      /** A chave de parada é `cidade|CEP|número`: o separador não tem por que aparecer. */
      expect(raw).not.toContain('|')
      const payload = JSON.parse(raw) as Record<string, unknown>
      expect(Object.keys(payload).sort()).toEqual(['companyId', 'draft', 'savedAt', 'userId', 'v'])
    }
  })

  test('versão, empresa ou usuário diferentes descartam o rascunho', () => {
    const cases: readonly Record<string, unknown>[] = [
      { v: 2 },
      { companyId: 'company-2' },
      { userId: 'user-2' },
    ]
    for (const override of cases) {
      const storage = createMemoryStorage()
      writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage })
      const key = buildTripAssemblyDraftKey({ mode: TRIP_ASSEMBLY_DRAFT_MODE.manual, scope: SCOPE })
      const stored = JSON.parse(storage.entries.get(key) ?? '{}') as Record<string, unknown>
      storage.entries.set(key, JSON.stringify({ ...stored, ...override }))

      expect(readManualAssemblyDraft({ now: NOW, scope: SCOPE, storage })).toBeUndefined()
      expect(storage.entries.has(key)).toBe(false)
    }
  })

  test('rascunho com mais de 8 horas vence e é apagado', () => {
    const storage = createMemoryStorage()
    writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage })

    expect(
      readManualAssemblyDraft({ now: NOW + TRIP_ASSEMBLY_DRAFT_TTL_MS - 1, scope: SCOPE, storage }),
    ).toBeDefined()
    expect(
      readManualAssemblyDraft({ now: NOW + TRIP_ASSEMBLY_DRAFT_TTL_MS + 1, scope: SCOPE, storage }),
    ).toBeUndefined()
    expect(storage.entries.size).toBe(0)
  })

  test('lixo no armazenamento vira ausência de rascunho, sem exceção', () => {
    const key = buildTripAssemblyDraftKey({
      mode: TRIP_ASSEMBLY_DRAFT_MODE.automatic,
      scope: SCOPE,
    })
    const envelope = { companyId: 'company-1', savedAt: NOW, userId: 'user-1', v: 1 }
    const base = {
      documentIds: [],
      driverIds: [],
      isOpen: true,
      pendingSuggestionId: null,
      proposal: null,
      vehicleIds: [],
    }
    const garbage = [
      'not json',
      'null',
      '[]',
      JSON.stringify({ ...envelope, draft: { ...base, documentIds: 'nfe-1' } }),
      JSON.stringify({ ...envelope, draft: { ...base, documentIds: [1] } }),
      JSON.stringify({ ...envelope, draft: { ...base, proposal: { suggestionId: 7 } } }),
      JSON.stringify({ ...envelope, draft: { ...base, pendingSuggestionId: 3 } }),
    ]
    for (const raw of garbage) {
      const storage = createMemoryStorage()
      storage.entries.set(key, raw)
      expect(readAutomaticAssemblyDraft({ now: NOW, scope: SCOPE, storage })).toBeUndefined()
    }
  })

  test('assinatura de rota fora do formato compacto não volta', () => {
    const storage = createMemoryStorage()
    const draft = {
      ...manualDraft(),
      routeChoice: { criterion: 'cheapest', signature: 'x'.repeat(500) },
    }
    const key = buildTripAssemblyDraftKey({ mode: TRIP_ASSEMBLY_DRAFT_MODE.manual, scope: SCOPE })
    storage.entries.set(
      key,
      JSON.stringify({ companyId: 'company-1', draft, savedAt: NOW, userId: 'user-1', v: 1 }),
    )

    expect(readManualAssemblyDraft({ now: NOW, scope: SCOPE, storage })).toBeUndefined()
  })

  test('armazenamento que lança avisa que não gravou; ausente não derruba a tela', () => {
    const throwing: TripAssemblyDraftStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      key: () => null,
      length: 0,
      removeItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(
      writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage: throwing }),
    ).toBe(false)
    expect(readManualAssemblyDraft({ now: NOW, scope: SCOPE, storage: throwing })).toBeUndefined()
    expect(readManualAssemblyDraft({ now: NOW, scope: SCOPE, storage: null })).toBeUndefined()
    expect(
      writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage: null }),
    ).toBe(false)
    expect(
      writeManualAssemblyDraft({
        draft: manualDraft(),
        now: NOW,
        scope: SCOPE,
        storage: createMemoryStorage(),
      }),
    ).toBe(true)
  })

  /**
   * Os três gatilhos de limpeza — criação, aceite e descarte — zeram o estado da montagem, e o
   * estado zerado gravado por cima **apaga** a entrada: rascunho vazio não fica no armazenamento.
   */
  test('estado zerado não é gravado: apaga o que havia', () => {
    const storage = createMemoryStorage()
    writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage })
    writeAutomaticAssemblyDraft({ draft: automaticDraft(), now: NOW, scope: SCOPE, storage })

    writeManualAssemblyDraft({
      draft: buildManualAssemblyDraft({
        cityOrder: [],
        dailyAllowanceDaysInput: undefined,
        driverIds: [],
        isOpen: false,
        queue: [],
        routeChoice: undefined,
        vehicleId: '',
      }),
      now: NOW,
      scope: SCOPE,
      storage,
    })
    writeAutomaticAssemblyDraft({
      draft: buildAutomaticAssemblyDraft({
        draft: { driverIds: [], vehicleIds: [] },
        isOpen: false,
        pendingSuggestionId: null,
        pool: [],
        proposal: null,
      }),
      now: NOW,
      scope: SCOPE,
      storage,
    })

    expect(storage.entries.size).toBe(0)
  })

  test('descartar apaga só o rascunho daquele modo', () => {
    const storage = createMemoryStorage()
    writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage })
    writeAutomaticAssemblyDraft({ draft: automaticDraft(), now: NOW, scope: SCOPE, storage })

    clearTripAssemblyDraft({ mode: TRIP_ASSEMBLY_DRAFT_MODE.manual, scope: SCOPE, storage })

    expect(readManualAssemblyDraft({ now: NOW, scope: SCOPE, storage })).toBeUndefined()
    expect(readAutomaticAssemblyDraft({ now: NOW, scope: SCOPE, storage })).toBeDefined()
  })

  test('sair da conta apaga todos os rascunhos da montagem e nada além deles', () => {
    const storage = createMemoryStorage()
    const otherScope = { companyId: 'company-2', userId: 'user-2' }
    writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage })
    writeAutomaticAssemblyDraft({ draft: automaticDraft(), now: NOW, scope: otherScope, storage })
    storage.setItem('transportada.navigation', 'trips')

    clearAllTripAssemblyDrafts(storage)

    expect([...storage.entries.keys()]).toEqual(['transportada.navigation'])
  })

  test('a volta apaga o rascunho de outra empresa ou usuário, e mantém o do atual', () => {
    const storage = createMemoryStorage()
    const otherScope = { companyId: 'company-2', userId: 'user-1' }
    writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: SCOPE, storage })
    writeManualAssemblyDraft({ draft: manualDraft(), now: NOW, scope: otherScope, storage })
    writeAutomaticAssemblyDraft({ draft: automaticDraft(), now: NOW, scope: otherScope, storage })

    clearOtherScopeTripAssemblyDrafts({ scope: SCOPE, storage })

    expect([...storage.entries.keys()]).toEqual([
      buildTripAssemblyDraftKey({ mode: TRIP_ASSEMBLY_DRAFT_MODE.manual, scope: SCOPE }),
    ])
  })
})
