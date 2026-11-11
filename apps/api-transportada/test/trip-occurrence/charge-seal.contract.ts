/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E7, RF13, T14a): o selo "possível cobrança na entrega" chega ao motorista só nas paradas abertas, só pelo
 * leitor (que já olha o interruptor do tipo), e falha do leitor só tira o selo.
 */
import { describe, expect, test } from 'bun:test'

import { attachDriverStopChargeSeal } from '../../src/trips/application/attach-driver-stop-charge-seal.service.js'
import type { DriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'

function trip(): DriverTrip {
  return {
    stops: [
      { completedAt: null, id: 'open-flagged' },
      { completedAt: null, id: 'open-clean' },
      { completedAt: '2026-11-10T10:00:00.000Z', id: 'done-flagged' },
    ],
  } as unknown as DriverTrip
}

describe('spec 317 T14a — selo no cartão da parada', () => {
  test('marca só a parada aberta que o leitor devolveu', async () => {
    const asked: string[][] = []
    const result = await attachDriverStopChargeSeal({
      companyId: COMPANY,
      dependency: {
        reader: {
          listSealedStops: async ({ stopIds }) => {
            asked.push([...stopIds])
            return new Map([['open-flagged', '2026-11-01T00:00:00.000Z']])
          },
        },
      },
      trips: [trip()],
    })
    expect(asked).toEqual([['open-flagged', 'open-clean']])
    const stops = result[0]?.stops as unknown as Array<{ clientChargeSeal?: { flaggedAt: string } }>
    expect(stops[0]?.clientChargeSeal).toEqual({ flaggedAt: '2026-11-01T00:00:00.000Z' })
    expect(stops[1]?.clientChargeSeal).toBeUndefined()
    expect(stops[2]?.clientChargeSeal).toBeUndefined()
  })

  test('sem dependência ou com falha do leitor, a leitura segue igual', async () => {
    const original = [trip()]
    expect(await attachDriverStopChargeSeal({ companyId: COMPANY, trips: original })).toBe(original)
    const failing = await attachDriverStopChargeSeal({
      companyId: COMPANY,
      dependency: {
        reader: {
          listSealedStops: async () => {
            throw new Error('boom')
          },
        },
      },
      trips: original,
    })
    expect(failing).toBe(original)
  })

  test('o cadastro do tipo aceita o interruptor, ausente não mexe', async () => {
    const base = { flow: 'document', name: 'Cobrança', stage: 'delivery' }
    const on = await parseOccurrenceTypeRequest(
      new Request('http://localhost/x', {
        body: JSON.stringify({ ...base, showClientChargeSealToDriver: false }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      }),
    )
    expect(on.showClientChargeSealToDriver).toBe(false)
    const absent = await parseOccurrenceTypeRequest(
      new Request('http://localhost/x', {
        body: JSON.stringify(base),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      }),
    )
    expect(absent.showClientChargeSealToDriver).toBeUndefined()
  })
})
