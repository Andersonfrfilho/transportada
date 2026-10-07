/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 D5/D6/D8: as três perguntas puras da transferência de tripulação — "o pedido muda
 * alguma coisa?", "o MDF-e autorizado ficou com o condutor errado?" e "como o evento guarda quem
 * entrou e quem saiu?". O repositório só as chama sob o lock; aqui não há banco.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildCrewSnapshot,
  hasDriverSetChanged,
  isCrewRequestUnchanged,
  parseCrewSnapshot,
} from '../../src/trips/domain/trip-crew-transfer.policy.js'
import type { TripCrewEventMember } from '../../src/database/trip.schema.js'
import { TripCrewUnchangedError } from '../../src/trips/domain/trip.error.js'

const ANA = '00000000-0000-4000-8000-0000000000a1'
const BRUNO = '00000000-0000-4000-8000-0000000000b2'
const CARLA = '00000000-0000-4000-8000-0000000000c3'
const DIOGO = '00000000-0000-4000-8000-0000000000d4'

describe('o pedido de transferência muda a tripulação? (spec 249 D5)', () => {
  test('mesmas pessoas, mesmos papéis, mesma ordem: nada a gravar', () => {
    expect(
      isCrewRequestUnchanged({
        current: [
          { driverId: ANA, role: 'driver' },
          { driverId: BRUNO, role: 'helper' },
        ],
        requested: [
          { driverId: ANA, role: 'driver' },
          { driverId: BRUNO, role: 'helper' },
        ],
      }),
    ).toBe(true)
  })

  test('a ordem importa: o primeiro motorista é o principal', () => {
    expect(
      isCrewRequestUnchanged({
        current: [
          { driverId: ANA, role: 'driver' },
          { driverId: BRUNO, role: 'driver' },
        ],
        requested: [
          { driverId: BRUNO, role: 'driver' },
          { driverId: ANA, role: 'driver' },
        ],
      }),
    ).toBe(false)
  })

  test('a mesma pessoa em outro papel é troca', () => {
    expect(
      isCrewRequestUnchanged({
        current: [
          { driverId: ANA, role: 'driver' },
          { driverId: BRUNO, role: 'helper' },
        ],
        requested: [
          { driverId: BRUNO, role: 'driver' },
          { driverId: ANA, role: 'helper' },
        ],
      }),
    ).toBe(false)
  })

  test('quem entra ou sai é troca, mesmo com o resto igual', () => {
    const current = [{ driverId: ANA, role: 'driver' as const }]
    expect(
      isCrewRequestUnchanged({
        current,
        requested: [...current, { driverId: BRUNO, role: 'helper' }],
      }),
    ).toBe(false)
    expect(
      isCrewRequestUnchanged({
        current: [...current, { driverId: BRUNO, role: 'helper' }],
        requested: current,
      }),
    ).toBe(false)
  })
})

describe('o MDF-e autorizado ficou com o condutor errado? (spec 249 D8)', () => {
  test('motorista trocado: o conjunto de condutores mudou', () => {
    expect(
      hasDriverSetChanged({
        next: [{ driverId: BRUNO, role: 'driver' }],
        previous: [{ driverId: ANA, role: 'driver' }],
      }),
    ).toBe(true)
  })

  test('trocar só o ajudante nunca diverge (ADR-0065: ajudante não é condutor)', () => {
    expect(
      hasDriverSetChanged({
        next: [
          { driverId: ANA, role: 'driver' },
          { driverId: DIOGO, role: 'helper' },
        ],
        previous: [
          { driverId: ANA, role: 'driver' },
          { driverId: CARLA, role: 'helper' },
        ],
      }),
    ).toBe(false)
  })

  test('o ajudante que assume o volante entra no conjunto de condutores', () => {
    expect(
      hasDriverSetChanged({
        next: [{ driverId: CARLA, role: 'driver' }],
        previous: [
          { driverId: ANA, role: 'driver' },
          { driverId: CARLA, role: 'helper' },
        ],
      }),
    ).toBe(true)
  })

  test('reordenar os mesmos condutores não muda o conjunto que o manifesto declara', () => {
    expect(
      hasDriverSetChanged({
        next: [
          { driverId: BRUNO, role: 'driver' },
          { driverId: ANA, role: 'driver' },
        ],
        previous: [
          { driverId: ANA, role: 'driver' },
          { driverId: BRUNO, role: 'driver' },
        ],
      }),
    ).toBe(false)
  })
})

describe('o retrato da tripulação no evento (spec 249 D6)', () => {
  test('guarda id, nome, papel e posição — nunca CPF', () => {
    const snapshot = buildCrewSnapshot([
      {
        driverId: ANA,
        driverName: 'Ana Souza',
        driverTaxId: '12345678909',
        position: 1,
        role: 'driver',
      },
    ])

    expect(snapshot).toEqual([{ driverId: ANA, name: 'Ana Souza', position: 1, role: 'driver' }])
    expect(Object.keys(snapshot[0] ?? {}).sort()).toEqual(['driverId', 'name', 'position', 'role'])
  })

  test('lê o jsonb que chegou como array', () => {
    const stored: readonly TripCrewEventMember[] = [
      { driverId: ANA, name: 'Ana Souza', position: 1, role: 'driver' },
    ]
    expect(parseCrewSnapshot(stored)).toEqual(stored)
  })

  test('lê o jsonb que o driver devolveu como texto', () => {
    const stored: readonly TripCrewEventMember[] = [
      { driverId: ANA, name: 'Ana Souza', position: 1, role: 'driver' },
    ]
    expect(parseCrewSnapshot(JSON.stringify(stored))).toEqual(stored)
  })

  test('descarta o integrante malformado em vez de derrubar a linha do tempo inteira', () => {
    const valid: TripCrewEventMember = {
      driverId: ANA,
      name: 'Ana Souza',
      position: 1,
      role: 'driver',
    }
    expect(
      parseCrewSnapshot([
        valid,
        { driverId: BRUNO, name: 'Bruno', position: '2', role: 'driver' },
        { driverId: CARLA, name: 'Carla', position: 3, role: 'passenger' },
        null,
      ]),
    ).toEqual([valid])
  })

  test('valor que não é lista nem texto de lista vira vazio', () => {
    expect(parseCrewSnapshot(null)).toEqual([])
    expect(parseCrewSnapshot('not json')).toEqual([])
    expect(parseCrewSnapshot({ driverId: ANA })).toEqual([])
  })
})

describe('TRIP_CREW_UNCHANGED (spec 249 D5)', () => {
  test('é 409 com código estável', () => {
    const error = new TripCrewUnchangedError()

    expect(error.code).toBe('TRIP_CREW_UNCHANGED')
    expect(error.status).toBe(409)
  })
})
