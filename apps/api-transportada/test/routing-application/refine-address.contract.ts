/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRefineAddressUseCase } from '../../src/routing/application/refine-address.use-case.js'
import type { GeocodedAddressRecord } from '../../src/routing/application/geocoding.port.js'
import type { RefineAddressResult } from '../../src/routing/application/refine-address.port.js'

const ADDRESS_KEY = '3550308|01310100|1000'
const INPUT = { actorUserId: 'user-1', addressKey: ADDRESS_KEY, companyId: 'company-1' }

const COMPONENTS = {
  addressKey: ADDRESS_KEY,
  city: 'São Paulo',
  cityCode: '3550308',
  district: 'Bela Vista',
  number: '1000',
  postalCode: '01310100',
  state: 'SP',
  street: 'Avenida Paulista',
}

const ROOFTOP: Omit<GeocodedAddressRecord, 'addressKey'> = {
  externalPlaceId: 'place-abc',
  latitude: '-23.5617698',
  longitude: '-46.6553299',
  precision: 'rooftop',
  source: 'google',
}

function stored(overrides: Partial<GeocodedAddressRecord> = {}): GeocodedAddressRecord {
  return {
    addressKey: ADDRESS_KEY,
    externalPlaceId: '',
    latitude: '-21.0',
    longitude: '-47.0',
    precision: 'postal_code',
    source: 'postal_code',
    ...overrides,
  }
}

function build(overrides: {
  readonly componentsMissing?: boolean
  readonly geocodeCalls?: string[]
  readonly noProvider?: boolean
  readonly resolved?: Omit<GeocodedAddressRecord, 'addressKey'> | null
  readonly saved?: GeocodedAddressRecord[]
  readonly stored?: readonly GeocodedAddressRecord[]
  readonly trail?: RefineAddressResult['outcome'][]
}) {
  return createRefineAddressUseCase({
    components: {
      byAddressKey: () => Promise.resolve(overrides.componentsMissing === true ? null : COMPONENTS),
    },
    geocoding:
      overrides.noProvider === true
        ? undefined
        : {
            geocode: (request) => {
              overrides.geocodeCalls?.push(request.addressKey)

              return Promise.resolve(
                overrides.resolved === undefined ? ROOFTOP : overrides.resolved,
              )
            },
          },
    repository: {
      findByKeys: () => Promise.resolve(overrides.stored ?? []),
      save: (record) => {
        overrides.saved?.push(record)

        return Promise.resolve()
      },
    },
    trail: {
      record: (entry) => {
        overrides.trail?.push(entry.outcome)

        return Promise.resolve()
      },
    },
  })
}

describe('marking an address as wrong (spec 069, degrau 2)', () => {
  test('buys the finer coordinate and replaces the stored one', async () => {
    const saved: GeocodedAddressRecord[] = []

    expect(await build({ saved, stored: [stored()] }).refine(INPUT)).toEqual({
      latitude: '-23.5617698',
      longitude: '-46.6553299',
      outcome: 'refined',
      precision: 'rooftop',
    })
    expect(saved[0]).toMatchObject({ externalPlaceId: 'place-abc', source: 'google' })
  })

  test('refines an address that was never resolved before', async () => {
    const saved: GeocodedAddressRecord[] = []

    expect((await build({ saved, stored: [] }).refine(INPUT)).outcome).toBe('refined')
    expect(saved).toHaveLength(1)
  })

  /**
   * ⚠️ RF5, e é a resposta que faz a marca ser usável. Sem ela o conferente marca, nada muda na
   * tela, e conclui que a marca está quebrada — e a linha em base fica **intacta**, o que é certo.
   */
  test('says nothing improved when the provider comes back coarser, and keeps the stored row', async () => {
    const saved: GeocodedAddressRecord[] = []
    const result = await build({
      resolved: { ...ROOFTOP, precision: 'city' },
      saved,
      stored: [stored({ precision: 'rooftop', source: 'google' })],
    }).refine(INPUT)

    expect(result).toEqual({ outcome: 'not_improved' })
    expect(saved).toEqual([])
  })

  test('says nothing improved when the provider does not find the address', async () => {
    const saved: GeocodedAddressRecord[] = []

    expect(await build({ resolved: null, saved, stored: [stored()] }).refine(INPUT)).toEqual({
      outcome: 'not_improved',
    })
    expect(saved).toEqual([])
  })

  /** ADR-0044 §3: o pino que o conferente arrastou não volta sozinho — nem custa uma chamada. */
  test('never overwrites a human correction, and does not even ask the provider', async () => {
    const geocodeCalls: string[] = []
    const result = await build({
      geocodeCalls,
      stored: [stored({ precision: 'rooftop', source: 'manual' })],
    }).refine(INPUT)

    expect(result).toEqual({ outcome: 'not_improved' })
    expect(geocodeCalls).toEqual([])
  })

  /** A app sobe sem a chave, e a marca responde em vez de estourar na cara de quem clicou (RF7). */
  test('says the fine provider is not configured instead of failing', async () => {
    expect(await build({ noProvider: true }).refine(INPUT)).toEqual({
      outcome: 'provider_not_configured',
    })
  })

  /** O endereço vem da nota, e ler a nota de outra empresa para montar a consulta seria vazamento. */
  test('does not call the provider for an address no note of this company carries', async () => {
    const geocodeCalls: string[] = []

    expect(await build({ componentsMissing: true, geocodeCalls }).refine(INPUT)).toEqual({
      outcome: 'not_improved',
    })
    expect(geocodeCalls).toEqual([])
  })

  /** RF10: sem trilha não há como responder se comprar precisão fina valeu a pena. */
  test('records every mark, including the ones that bought nothing', async () => {
    const trail: RefineAddressResult['outcome'][] = []

    await build({ stored: [stored()], trail }).refine(INPUT)
    await build({ noProvider: true, trail }).refine(INPUT)
    await build({ resolved: null, stored: [stored()], trail }).refine(INPUT)

    expect(trail).toEqual(['refined', 'provider_not_configured', 'not_improved'])
  })
})
