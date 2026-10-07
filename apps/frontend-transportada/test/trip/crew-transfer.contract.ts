/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T2.1: transferir a tripulação de uma viagem que já saiu. A API publica
 * `transferCrew` em `allowed-actions` (só quem tem `trip.report-on-behalf`, e só na janela
 * `dispatched`/`in_transit`/`on_delivery_route`) e responde `POST /trips/:id/crew-transfers` com a
 * viagem e o resumo da troca. Os módulos novos entram por `loadFutureModule`: enquanto não existem,
 * só estes testes ficam vermelhos, nunca a suíte inteira do módulo.
 */
import { describe, expect, it } from 'bun:test'

import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { createTripClient } from '@/modules/trip/shared/tripClient.service'
import {
  canOfferTripFieldAction,
  resolveFieldActionCapabilities,
} from '@/modules/trip/shared/tripFieldActions.service'
import { parseTripAllowedActions } from '@/modules/trip/shared/tripAllowedActions.validation'
import type { TripDetail } from '@/modules/trip/shared/trip.types'

import { loadFutureModule, SYNTHETIC_ACCESS_TOKEN, TRIP_DETAIL, TRIP_ID } from './trip.fixture'

const API_URL = 'https://api.example.test'

type CrewTransfer = Readonly<{
  costAfter: string
  costBefore: string
  costDifference: string
  costHasGaps: boolean
  id: string
  mdfeDriverDivergence: boolean
}>

type CrewDraft = Readonly<{
  currentDriverIds: readonly string[]
  currentHelperIds: readonly string[]
  driverIds: readonly string[]
  helperIds: readonly string[]
  reason: string
  selectableDriverIds: readonly string[]
}>

type TransferModule = Readonly<{
  buildTransferTripCrewInput: (
    input: Readonly<{
      driverIds: readonly string[]
      helperIds: readonly string[]
      reason: string
      tripId: string
    }>,
  ) => Readonly<Record<string, unknown>>
  CREW_TRANSFER_REASON_MAX_LENGTH: number
  resolveCrewTransferBlocker: (input: CrewDraft) => string | undefined
  resolveCrewTransferErrorKey: (error: unknown) => string
  resolveCrewTransferOutcome: (transfer: CrewTransfer) => Readonly<{
    after: string
    before: string
    difference: string
    direction: 'decrease' | 'increase' | 'same'
    hasGaps: boolean
    hasMdfeDivergence: boolean
  }>
  summarizeCrewChange: (
    input: Readonly<{
      drivers: readonly Readonly<{ id: string; name: string }>[]
      nextDriverIds: readonly string[]
      nextHelperIds: readonly string[]
      trip: TripDetail
    }>,
  ) => Readonly<{
    entering: readonly Readonly<{ id: string; name: string; role: string }>[]
    leaving: readonly Readonly<{ id: string; name: string; role: string }>[]
  }>
}>

type ValidationModule = Readonly<{ parseCrewTransfer: (value: unknown) => CrewTransfer }>

const TRANSFER_SERVICE = '../../src/modules/trip/shared/tripCrewTransfer.service'
const TRANSFER_VALIDATION = '../../src/modules/trip/shared/tripCrewTransfer.validation'

const TRANSFER: CrewTransfer = {
  costAfter: '1350.00',
  costBefore: '1200.00',
  costDifference: '150.00',
  costHasGaps: false,
  id: '00000000-0000-4000-8000-000000000f01',
  mdfeDriverDivergence: true,
}

function tripWithCrew(
  lines: readonly { id: string; name: string; position: number; role: 'driver' | 'helper' }[],
): TripDetail {
  return {
    ...TRIP_DETAIL,
    drivers: lines.map((line) => ({
      driverId: line.id,
      driverName: line.name,
      driverTaxId: null,
      position: line.position,
      role: line.role,
    })),
  }
}

describe('transferCrew vem de allowed-actions (spec 249 RF1)', () => {
  it('parseTripAllowedActions mantém transferCrew como ação conhecida', () => {
    const parsed = parseTripAllowedActions({
      trip: { documentIds: [], stopIds: [] },
      value: { documents: {}, stops: {}, trip: ['transferCrew', 'cancel'] },
    })

    expect(parsed.trip).toEqual(['transferCrew', 'cancel'])
  })

  it('API anterior, que não publica a ação, equivale a falso — nunca quebra a tela', () => {
    const parsed = parseTripAllowedActions({
      trip: { documentIds: [], stopIds: [] },
      value: { documents: {}, stops: {}, trip: ['cancel'] },
    })

    expect(resolveFieldActionCapabilities(parsed).canTrip('transferCrew')).toBe(false)
  })

  it('o botão exige a permissão do escritório E a ação servida', () => {
    const served = resolveFieldActionCapabilities({
      documents: {},
      stops: {},
      trip: ['transferCrew'],
    })
    const notServed = resolveFieldActionCapabilities({ documents: {}, stops: {}, trip: [] })

    expect(
      canOfferTripFieldAction({
        action: 'transferCrew',
        canReportOnBehalf: true,
        capabilities: served,
      }),
    ).toBe(true)
    expect(
      canOfferTripFieldAction({
        action: 'transferCrew',
        canReportOnBehalf: false,
        capabilities: served,
      }),
    ).toBe(false)
    expect(
      canOfferTripFieldAction({
        action: 'transferCrew',
        canReportOnBehalf: true,
        capabilities: notServed,
      }),
    ).toBe(false)
  })
})

describe('resposta de POST /trips/:id/crew-transfers (spec 249 RF5)', () => {
  it('aceita o resumo da troca com decimais como string', async () => {
    const { parseCrewTransfer } = await loadFutureModule<ValidationModule>(TRANSFER_VALIDATION)

    expect(parseCrewTransfer(TRANSFER)).toEqual(TRANSFER)
    expect(parseCrewTransfer({ ...TRANSFER, costDifference: '-150.00' }).costDifference).toBe(
      '-150.00',
    )
  })

  it('recusa dinheiro que viajou como número: float binário não entra', async () => {
    const { parseCrewTransfer } = await loadFutureModule<ValidationModule>(TRANSFER_VALIDATION)

    expect(() => parseCrewTransfer({ ...TRANSFER, costDifference: 150 })).toThrow()
    expect(() => parseCrewTransfer({ ...TRANSFER, costBefore: '12,00' })).toThrow()
  })

  it('recusa resumo sem campo, com campo trocado de tipo ou com chave desconhecida', async () => {
    const { parseCrewTransfer } = await loadFutureModule<ValidationModule>(TRANSFER_VALIDATION)
    const { mdfeDriverDivergence: _removed, ...incomplete } = TRANSFER

    expect(() => parseCrewTransfer(incomplete)).toThrow()
    expect(() => parseCrewTransfer({ ...TRANSFER, costHasGaps: 'false' })).toThrow()
    expect(() => parseCrewTransfer({ ...TRANSFER, extra: true })).toThrow()
    expect(() => parseCrewTransfer(null)).toThrow()
  })

  it('o cliente envia driverIds, helperIds e reason, e devolve a viagem com o resumo', async () => {
    const requests: Request[] = []
    const client = createTripClient({
      apiUrl: API_URL,
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Response.json({ data: { transfer: TRANSFER, trip: TRIP_DETAIL } }, { status: 201 })
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    }) as unknown as Readonly<{
      transferTripCrew: (
        input: Readonly<{
          driverIds: readonly string[]
          helperIds: readonly string[]
          reason: string
          tripId: string
        }>,
      ) => Promise<Readonly<{ transfer: CrewTransfer; trip: TripDetail }>>
    }>

    const result = await client.transferTripCrew({
      driverIds: ['driver-2'],
      helperIds: [],
      reason: 'Motorista passou mal',
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ transfer: TRANSFER, trip: TRIP_DETAIL })
    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(`${API_URL}/trips/${TRIP_ID}/crew-transfers`)
    expect(await request?.json()).toEqual({
      driverIds: ['driver-2'],
      helperIds: [],
      reason: 'Motorista passou mal',
    })
  })

  it('o cliente nunca manda veículo: o caminhão fica travado na viagem em curso (D2)', async () => {
    const { buildTransferTripCrewInput } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)
    const input = buildTransferTripCrewInput({
      driverIds: ['driver-2'],
      helperIds: ['helper-1'],
      reason: '  Caminhão quebrou  ',
      tripId: TRIP_ID,
    })

    expect(input).toEqual({
      driverIds: ['driver-2'],
      helperIds: ['helper-1'],
      reason: 'Caminhão quebrou',
      tripId: TRIP_ID,
    })
    expect('vehicleId' in input).toBe(false)
  })
})

describe('regras do diálogo Transferir tripulação (spec 249 D3/D4/D5)', () => {
  const CURRENT = {
    currentDriverIds: ['driver-1'],
    currentHelperIds: ['helper-1'],
    selectableDriverIds: ['driver-1', 'driver-2'],
  }

  it('motivo vazio ou só de espaços desabilita a confirmação', async () => {
    const { resolveCrewTransferBlocker } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)
    const draft = { ...CURRENT, driverIds: ['driver-2'], helperIds: ['helper-1'] }

    expect(resolveCrewTransferBlocker({ ...draft, reason: '' })).toBe('reasonRequired')
    expect(resolveCrewTransferBlocker({ ...draft, reason: '   ' })).toBe('reasonRequired')
    expect(resolveCrewTransferBlocker({ ...draft, reason: 'Passou mal' })).toBeUndefined()
  })

  it('motivo acima de 500 caracteres é recusado, e 500 passa', async () => {
    const { CREW_TRANSFER_REASON_MAX_LENGTH, resolveCrewTransferBlocker } =
      await loadFutureModule<TransferModule>(TRANSFER_SERVICE)
    const draft = { ...CURRENT, driverIds: ['driver-2'], helperIds: [] }

    expect(CREW_TRANSFER_REASON_MAX_LENGTH).toBe(500)
    expect(resolveCrewTransferBlocker({ ...draft, reason: 'a'.repeat(500) })).toBeUndefined()
    expect(resolveCrewTransferBlocker({ ...draft, reason: 'a'.repeat(501) })).toBe('reasonTooLong')
  })

  it('exige ao menos um motorista', async () => {
    const { resolveCrewTransferBlocker } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)

    expect(
      resolveCrewTransferBlocker({
        ...CURRENT,
        driverIds: [],
        helperIds: ['helper-1'],
        reason: 'Passou mal',
      }),
    ).toBe('driverRequired')
  })

  it('ajudante nunca vira motorista: a mesma pessoa não ocupa os dois lugares', async () => {
    const { resolveCrewTransferBlocker } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)

    expect(
      resolveCrewTransferBlocker({
        ...CURRENT,
        driverIds: ['helper-1'],
        helperIds: ['helper-1'],
        reason: 'Passou mal',
        selectableDriverIds: ['driver-1', 'helper-1'],
      }),
    ).toBe('helperIsDriver')
  })

  it('quem não dirige não entra como motorista', async () => {
    const { resolveCrewTransferBlocker } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)

    expect(
      resolveCrewTransferBlocker({
        ...CURRENT,
        driverIds: ['helper-only'],
        helperIds: [],
        reason: 'Passou mal',
      }),
    ).toBe('driverCannotDrive')
  })

  it('tripulação igual à atual não é uma troca (D5)', async () => {
    const { resolveCrewTransferBlocker } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)

    expect(
      resolveCrewTransferBlocker({
        ...CURRENT,
        driverIds: ['driver-1'],
        helperIds: ['helper-1'],
        reason: 'Passou mal',
      }),
    ).toBe('crewUnchanged')
  })

  it('só o ajudante mudando já é uma troca', async () => {
    const { resolveCrewTransferBlocker } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)

    expect(
      resolveCrewTransferBlocker({
        ...CURRENT,
        driverIds: ['driver-1'],
        helperIds: [],
        reason: 'Ajudante faltou',
      }),
    ).toBeUndefined()
  })
})

describe('resumo "quem sai → quem entra" (spec 249 RF4)', () => {
  it('lista quem saiu e quem entrou, cada um no seu papel', async () => {
    const { summarizeCrewChange } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)
    const trip = tripWithCrew([
      { id: 'driver-1', name: 'Maria', position: 1, role: 'driver' },
      { id: 'helper-1', name: 'Ana', position: 2, role: 'helper' },
    ])

    expect(
      summarizeCrewChange({
        drivers: [
          { id: 'driver-1', name: 'Maria' },
          { id: 'driver-2', name: 'João' },
          { id: 'helper-1', name: 'Ana' },
        ],
        nextDriverIds: ['driver-2'],
        nextHelperIds: ['helper-1'],
        trip,
      }),
    ).toEqual({
      entering: [{ id: 'driver-2', name: 'João', role: 'driver' }],
      leaving: [{ id: 'driver-1', name: 'Maria', role: 'driver' }],
    })
  })

  it('quem fica não aparece, e quem sobe de ajudante a motorista sai de um papel e entra no outro', async () => {
    const { summarizeCrewChange } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)
    const trip = tripWithCrew([
      { id: 'driver-1', name: 'Maria', position: 1, role: 'driver' },
      { id: 'helper-1', name: 'Ana', position: 2, role: 'helper' },
    ])

    expect(
      summarizeCrewChange({
        drivers: [
          { id: 'driver-1', name: 'Maria' },
          { id: 'helper-1', name: 'Ana' },
        ],
        nextDriverIds: ['driver-1', 'helper-1'],
        nextHelperIds: [],
        trip,
      }),
    ).toEqual({
      entering: [{ id: 'helper-1', name: 'Ana', role: 'driver' }],
      leaving: [{ id: 'helper-1', name: 'Ana', role: 'helper' }],
    })
  })
})

describe('depois da troca: diferença de custo e aviso de MDF-e (spec 249 RF4/RF5)', () => {
  it('custo maior: sinal positivo e valores formatados em reais', async () => {
    const { resolveCrewTransferOutcome } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)

    expect(resolveCrewTransferOutcome(TRANSFER)).toEqual({
      after: formatAmount('1350.00'),
      before: formatAmount('1200.00'),
      difference: formatAmount('150.00'),
      direction: 'increase',
      hasGaps: false,
      hasMdfeDivergence: true,
    })
  })

  it('custo menor: sinal negativo preservado', async () => {
    const { resolveCrewTransferOutcome } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)
    const outcome = resolveCrewTransferOutcome({
      ...TRANSFER,
      costAfter: '1050.00',
      costDifference: '-150.00',
      mdfeDriverDivergence: false,
    })

    expect(outcome.direction).toBe('decrease')
    expect(outcome.difference).toBe(formatAmount('-150.00'))
    expect(outcome.hasMdfeDivergence).toBe(false)
  })

  it('custo igual: sem diferença, e a lacuna de parcela continua avisada', async () => {
    const { resolveCrewTransferOutcome } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)
    const outcome = resolveCrewTransferOutcome({
      ...TRANSFER,
      costAfter: '1200.00',
      costDifference: '0.00',
      costHasGaps: true,
    })

    expect(outcome.direction).toBe('same')
    expect(outcome.hasGaps).toBe(true)
  })
})

describe('erro da troca pelo código, nunca pelo texto (spec 249 D5/D4)', () => {
  it('mapeia os três códigos da API para uma mensagem própria', async () => {
    const { resolveCrewTransferErrorKey } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)

    expect(resolveCrewTransferErrorKey(new Error('TRIP_CREW_UNCHANGED'))).toBe('unchanged')
    expect(resolveCrewTransferErrorKey(new Error('STATE_TRANSITION_NOT_ALLOWED'))).toBe(
      'notAllowed',
    )
    expect(resolveCrewTransferErrorKey(new Error('TRIP_DRIVER_CANNOT_DRIVE'))).toBe(
      'driverCannotDrive',
    )
  })

  it('código desconhecido e erro que não é Error viram a mensagem genérica', async () => {
    const { resolveCrewTransferErrorKey } = await loadFutureModule<TransferModule>(TRANSFER_SERVICE)

    expect(resolveCrewTransferErrorKey(new Error('TRIP_REQUEST_FAILED'))).toBe('generic')
    expect(resolveCrewTransferErrorKey('não é um Error')).toBe('generic')
  })
})
