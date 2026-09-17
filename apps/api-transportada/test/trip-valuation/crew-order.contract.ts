/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { TripCrewMember } from '../../src/trips/domain/trip-driver-cost.policy.js'
import { orderCrewByRequest } from '../../src/trips/domain/trip-crew-order.policy.js'

const ANA = '00000000-0000-4000-8000-0000000000a1'
const BRUNO = '00000000-0000-4000-8000-0000000000b2'
const CARLA = '00000000-0000-4000-8000-0000000000c3'

function member(driverId: string, driverName: string): TripCrewMember {
  return { driverAmount: null, driverId, driverName, paymentModel: 'route_table' }
}

/**
 * Spec 143 — revisão final, achado 8. A tripulação da prévia sai de um `IN (...)`, e `IN` não
 * promete ordem nenhuma. A lista é o que a tela imprime e o que o congelamento guarda na base da
 * parcela: duas leituras iguais podendo trocar os motoristas de lugar é diferença sem causa.
 */
describe('a tripulação da prévia sai na ordem em que o formulário pediu (spec 143)', () => {
  test('a ordem do pedido manda, não a ordem que o banco devolveu', () => {
    const ordered = orderCrewByRequest({
      crew: [member(CARLA, 'Carla'), member(ANA, 'Ana'), member(BRUNO, 'Bruno')],
      driverIds: [ANA, BRUNO, CARLA],
    })

    expect(ordered.crew.map((crewMember) => crewMember.driverName)).toEqual([
      'Ana',
      'Bruno',
      'Carla',
    ])
  })

  test('a mesma leitura duas vezes devolve a mesma ordem', () => {
    const input = {
      crew: [member(BRUNO, 'Bruno'), member(ANA, 'Ana')],
      driverIds: [ANA, BRUNO],
    }

    expect(orderCrewByRequest(input).crew).toEqual(orderCrewByRequest(input).crew)
  })

  /**
   * Achado 20: o `IN` casado com `company_id` está **certo** — é ele que impede a prévia de uma
   * empresa precificar motorista de outra. O que faltava era dizer que alguém foi descartado: a
   * margem saía menor com um motorista a menos e nada, em lugar nenhum, registrava o sumiço.
   */
  test('o id que o banco não respondeu é devolvido nomeado, não engolido', () => {
    const ordered = orderCrewByRequest({
      crew: [member(ANA, 'Ana')],
      driverIds: [ANA, BRUNO],
    })

    expect(ordered.crew).toHaveLength(1)
    expect(ordered.missingDriverIds).toEqual([BRUNO])
  })

  test('com todo mundo respondido, não sobra id nenhum', () => {
    const ordered = orderCrewByRequest({
      crew: [member(ANA, 'Ana')],
      driverIds: [ANA],
    })

    expect(ordered.missingDriverIds).toEqual([])
  })

  test('pedido vazio devolve tripulação vazia, sem id perdido', () => {
    const ordered = orderCrewByRequest({ crew: [], driverIds: [] })

    expect(ordered.crew).toEqual([])
    expect(ordered.missingDriverIds).toEqual([])
  })

  /** Id repetido no formulário não duplica o motorista na conta — pagaria a diária duas vezes. */
  test('id repetido no pedido não duplica a diária', () => {
    const ordered = orderCrewByRequest({
      crew: [member(ANA, 'Ana')],
      driverIds: [ANA, ANA],
    })

    expect(ordered.crew).toHaveLength(1)
    expect(ordered.missingDriverIds).toEqual([])
  })
})
