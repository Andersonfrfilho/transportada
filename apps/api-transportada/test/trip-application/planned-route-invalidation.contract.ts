/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T704 (M1, M2, L7): toda operação que muda o conjunto ou a coordenada das paradas de uma
 * viagem ainda não despachada dispara o recongelamento — e, quando ele falha, o motivo é **dito**
 * em vez de sumir num `catch` mudo. O que a rota vira nesse caso é nulo (D5), nunca a rota velha:
 * a limpeza mora na mesma transação da escrita principal, provada em
 * `trip-infrastructure/planned-route-invalidation.contract.ts`.
 *
 * ⚠️ O log carrega **só identificadores** — nunca coordenada, endereço ou rótulo de parada.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_ROUTE_FREEZE_FAILED_MESSAGE } from '../../src/trips/application/freeze-trip-route-gracefully.js'
import { createLinkTripDocumentsBatchUseCase } from '../../src/trips/application/link-trip-documents-batch.use-case.js'
import { overrideDeliveryAddress } from '../../src/trips/application/override-delivery-address.use-case.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { reorderTripStops } from '../../src/trips/application/reorder-trip-stops.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-0000000000t1'
const STOP_ID = '00000000-0000-4000-8000-0000000000s1'
const TRIP_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'

type FreezeCall = { readonly companyId: string; readonly tripId: string }

function createFreezer(input: { readonly fails: boolean }): {
  readonly calls: readonly FreezeCall[]
  freeze(call: FreezeCall): Promise<void>
} {
  const calls: FreezeCall[] = []
  return {
    get calls() {
      return calls
    },
    async freeze(call) {
      calls.push({ companyId: call.companyId, tripId: call.tripId })
      if (input.fails) throw new Error('osrm indisponível')
    },
  }
}

function createLogger(): {
  readonly warnings: readonly { readonly message: string; readonly metadata: unknown }[]
  warn(message: string, metadata?: Readonly<Record<string, unknown>>): void
} {
  const warnings: { readonly message: string; readonly metadata: unknown }[] = []
  return {
    get warnings() {
      return warnings
    },
    warn(message, metadata) {
      warnings.push({ message, metadata })
    },
  }
}

describe('T704 M1/L7: reordenar parada recongela e conta quando não consegue', () => {
  test('dispara o congelamento com a viagem reordenada', async () => {
    const routeFreezer = createFreezer({ fails: false })

    await reorderTripStops({
      companyId: COMPANY_ID,
      orderedStopIds: [STOP_ID],
      repository: {
        async readStopOrderPreconditions() {
          return { stopIds: [STOP_ID], tripStatus: 'draft' as const }
        },
        async reorderStops() {},
      },
      routeFreezer,
      tripId: TRIP_ID,
    })

    expect(routeFreezer.calls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
  })

  test('congelamento que falha não derruba a reordenação, mas vira aviso com os ids', async () => {
    const logger = createLogger()

    const result = await reorderTripStops({
      companyId: COMPANY_ID,
      logger,
      orderedStopIds: [STOP_ID],
      repository: {
        async readStopOrderPreconditions() {
          return { stopIds: [STOP_ID], tripStatus: 'draft' as const }
        },
        async reorderStops() {},
      },
      routeFreezer: createFreezer({ fails: true }),
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('draft')
    expect(logger.warnings).toHaveLength(1)
    const [warning] = logger.warnings
    expect(warning?.message).toBe(TRIP_ROUTE_FREEZE_FAILED_MESSAGE)
    expect(warning?.metadata).toEqual({
      companyId: COMPANY_ID,
      reason: 'osrm indisponível',
      tripId: TRIP_ID,
    })
  })
})

describe('T704 L7: o lote de vínculo também conta o congelamento perdido', () => {
  test('avisa com os ids quando o congelamento falha', async () => {
    const logger = createLogger()
    const useCase = createLinkTripDocumentsBatchUseCase({
      logger,
      repository: {
        async linkDocumentsBatch() {
          return {
            linked: [
              {
                createdAt: '2026-09-17T00:00:00.000Z',
                deliveredAt: null,
                destinationOrigin: null,
                freightCalculationId: null,
                id: TRIP_DOCUMENT_ID,
                loadedAt: null,
                nfeDocumentId: '00000000-0000-4000-8000-0000000000n1',
                releasedAt: null,
                returnReason: null,
                returnedAt: null,
                separatedAt: null,
                separationStatus: 'pending' as const,
                stopId: null,
                tripId: TRIP_ID,
                updatedAt: '2026-09-17T00:00:00.000Z',
              },
            ],
            skipped: [],
            tripStatus: 'draft' as const,
          }
        },
      },
      routeFreezer: createFreezer({ fails: true }),
    })

    await useCase.execute({
      context: { companyId: COMPANY_ID },
      nfeDocumentIds: ['00000000-0000-4000-8000-0000000000n1'],
      tripId: TRIP_ID,
    })

    expect(logger.warnings.map((warning) => warning.message)).toEqual([
      TRIP_ROUTE_FREEZE_FAILED_MESSAGE,
    ])
  })
})

describe('T704 L7: planejar roteiro conta o congelamento perdido', () => {
  test('avisa com os ids quando o congelamento falha', async () => {
    const logger = createLogger()

    await planTripRoute({
      companyId: COMPANY_ID,
      logger,
      repository: {
        async markRoutePlanned() {
          return 'route_planned' as const
        },
        async readRouteState() {
          return { hasRoute: true, tripStatus: 'draft' as const }
        },
      },
      tollFreezer: createFreezer({ fails: true }),
      tripId: TRIP_ID,
    })

    expect(logger.warnings.map((warning) => warning.message)).toEqual([
      TRIP_ROUTE_FREEZE_FAILED_MESSAGE,
    ])
  })
})

describe('T704 M2: sobrescrever endereço de entrega recalcula a rota', () => {
  const OVERRIDE_RECORD = {
    actorUserId: '00000000-0000-4000-8000-0000000000u1',
    createdAt: '2026-09-17T00:00:00.000Z',
    id: '00000000-0000-4000-8000-0000000000o1',
    newAddress: { cityCode: '3549904', number: '100', postalCode: '14020000' },
    newLabel: 'Destino novo',
    previousAddress: { cityCode: '3549904', number: '1', postalCode: '14010000' },
    previousLabel: 'Destino velho',
    reason: 'cliente mudou',
    requestedBy: 'Fulano',
    tripDocumentId: TRIP_DOCUMENT_ID,
  }

  function createRepository() {
    return {
      async applyOverride() {
        return OVERRIDE_RECORD
      },
      async readPreconditions() {
        return { tripId: TRIP_ID, tripStatus: 'draft' as const }
      },
    }
  }

  const OVERRIDE_INPUT = {
    actorUserId: OVERRIDE_RECORD.actorUserId,
    companyId: COMPANY_ID,
    newAddress: OVERRIDE_RECORD.newAddress,
    newLabel: OVERRIDE_RECORD.newLabel,
    reason: OVERRIDE_RECORD.reason,
    requestedBy: OVERRIDE_RECORD.requestedBy,
    tripDocumentId: TRIP_DOCUMENT_ID,
  }

  test('a coordenada mudou: o congelamento roda com a viagem da nota', async () => {
    const routeFreezer = createFreezer({ fails: false })

    await overrideDeliveryAddress({
      ...OVERRIDE_INPUT,
      repository: createRepository(),
      routeFreezer,
    })

    expect(routeFreezer.calls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
  })

  test('congelamento que falha não derruba a sobrescrita, e vira aviso com os ids', async () => {
    const logger = createLogger()

    const record = await overrideDeliveryAddress({
      ...OVERRIDE_INPUT,
      logger,
      repository: createRepository(),
      routeFreezer: createFreezer({ fails: true }),
    })

    expect(record.id).toBe(OVERRIDE_RECORD.id)
    expect(logger.warnings).toEqual([
      {
        message: TRIP_ROUTE_FREEZE_FAILED_MESSAGE,
        metadata: { companyId: COMPANY_ID, reason: 'osrm indisponível', tripId: TRIP_ID },
      },
    ])
  })

  /** ⚠️ O aviso é de identificador: endereço, rótulo e coordenada nunca entram no log (LGPD §1). */
  test('o aviso não carrega endereço, rótulo nem motivo declarado pelo operador', async () => {
    const logger = createLogger()

    await overrideDeliveryAddress({
      ...OVERRIDE_INPUT,
      logger,
      repository: createRepository(),
      routeFreezer: createFreezer({ fails: true }),
    })

    const serialized = JSON.stringify(logger.warnings)
    expect(serialized).not.toContain(OVERRIDE_RECORD.newLabel)
    expect(serialized).not.toContain(OVERRIDE_RECORD.newAddress.postalCode)
    expect(serialized).not.toContain(OVERRIDE_RECORD.requestedBy)
  })
})
