/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  resolveTollRouteCost,
  type TollBoothRecord,
  type TollRouteCost,
} from '../../src/toll-booths/domain/toll-route-cost.policy.js'
import {
  parseFrozenBoothLegIndexes,
  parseTollRouteCost,
} from '../../src/toll-booths/domain/toll-route-cost-snapshot.policy.js'

function praca(osmNodeId: number, chargePerAxle: string): TollBoothRecord {
  return {
    chargeCar: chargePerAxle,
    chargePerAxle,
    chargePerAxleAutomatic: null,
    latitude: '-21.1775000',
    longitude: '-47.8103000',
    name: `Praça ${osmNodeId}`,
    operator: 'Operadora',
    osmNodeId,
  }
}

function validCost(): TollRouteCost {
  const cost = resolveTollRouteCost({
    axles: { count: 2, source: 'declared' },
    /** Toco: dois eixos de rodagem dupla, Categoria 2 — multiplicador 2. */
    multiplier: { denominator: 1, numerator: 2 },
    booths: [praca(1, '32.80')],
    hasAutomaticTollPayment: false,
    nodeIds: [1],
  })
  if (cost === null) throw new Error('fixture must produce a cost')
  return cost
}

describe('toll route cost snapshot (spec 090 T11)', () => {
  it('round-trips a value produced by the policy itself', () => {
    const cost = validCost()

    expect(parseTollRouteCost(JSON.parse(JSON.stringify(cost)))).toEqual(cost)
  })

  it('rejects null, primitives and arrays', () => {
    expect(parseTollRouteCost(null)).toBeNull()
    expect(parseTollRouteCost(undefined)).toBeNull()
    expect(parseTollRouteCost('68.40')).toBeNull()
    expect(parseTollRouteCost([])).toBeNull()
  })

  it('rejects a shape missing a required field, instead of a half-filled object', () => {
    const cost = validCost() as Record<string, unknown>
    const withoutTotal: Record<string, unknown> = {}
    for (const key of Object.keys(cost)) {
      if (key !== 'total') withoutTotal[key] = cost[key]
    }

    expect(parseTollRouteCost(withoutTotal)).toBeNull()
  })

  it('rejects an axle source outside the known catalogue', () => {
    const cost = validCost()

    expect(
      parseTollRouteCost({ ...cost, axles: { count: cost.axles.count, source: 'guessed' } }),
    ).toBeNull()
  })

  it('rejects a payment mode outside the known catalogue', () => {
    const cost = validCost()

    expect(parseTollRouteCost({ ...cost, paymentMode: 'cash' })).toBeNull()
  })

  it('rejects a booth with the wrong shape, even inside an otherwise valid list', () => {
    const cost = validCost()
    const [firstBooth] = cost.booths
    if (firstBooth === undefined) throw new Error('fixture must have a booth')
    const boothWithoutNodeId: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(firstBooth)) {
      if (key !== 'osmNodeId') boothWithoutNodeId[key] = value
    }

    expect(parseTollRouteCost({ ...cost, booths: [boothWithoutNodeId] })).toBeNull()
  })

  it('accepts nullable booth fields written as null', () => {
    const cost = validCost()

    expect(parseTollRouteCost(cost)).toEqual(cost)
  })
})

/**
 * L5 (revisão final da 153): `legIndex` viaja no jsonb junto de cada praça (o congelamento grava a
 * linha do extrato inteira, não só a observação — ver `toFrozenToll`), e este parser é a única
 * fronteira que o extrai de volta. Nunca derruba o pedágio inteiro por causa dele.
 */
describe('parseFrozenBoothLegIndexes (spec 153 L5)', () => {
  it('maps each booth by osmNodeId to the legIndex the freeze wrote', () => {
    const value = {
      booths: [
        { legIndex: 0, osmNodeId: 10 },
        { legIndex: 1, osmNodeId: 20 },
      ],
    }

    const map = parseFrozenBoothLegIndexes(value)

    expect(map.get(10)).toBe(0)
    expect(map.get(20)).toBe(1)
  })

  it('keeps a null legIndex as null — a booth outside every leg annotation', () => {
    const map = parseFrozenBoothLegIndexes({ booths: [{ legIndex: null, osmNodeId: 30 }] })

    expect(map.get(30)).toBeNull()
  })

  it('drops a booth with a malformed legIndex instead of failing the whole map', () => {
    const map = parseFrozenBoothLegIndexes({
      booths: [
        { legIndex: 'zero', osmNodeId: 40 },
        { legIndex: 2, osmNodeId: 50 },
      ],
    })

    expect(map.has(40)).toBe(false)
    expect(map.get(50)).toBe(2)
  })

  it('returns an empty map for a value with no booths — old shape, never a thrown error', () => {
    expect(parseFrozenBoothLegIndexes(null).size).toBe(0)
    expect(parseFrozenBoothLegIndexes({}).size).toBe(0)
    expect(parseFrozenBoothLegIndexes({ booths: 'not-an-array' }).size).toBe(0)
  })
})
