/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * "Cheguei" com mais de uma viagem ativa: a lista do bot não repete "PARADA 1", e o número da nota continua escolhendo.
 */
import { describe, expect, test } from 'bun:test'

import { flattenTripStopsWithUniqueSequence } from '../../src/trips/domain/driver-stops-numbering.policy.js'
import { pickStopFromList } from '../../src/whatsapp-commands/domain/whatsapp-stop-list.policy.js'

const stop = (id: string, sequence: number) => ({ id, sequence })

describe('flattenTripStopsWithUniqueSequence', () => {
  test('uma viagem só: nada muda', () => {
    const trips = [{ stops: [stop('a', 1), stop('b', 2)] }]
    expect(flattenTripStopsWithUniqueSequence(trips)).toEqual([stop('a', 1), stop('b', 2)])
  })

  test('várias viagens: a sequência vira a posição na lista inteira', () => {
    const trips = [
      { stops: [stop('t1-2', 2), stop('t1-1', 1)] },
      { stops: [stop('t2-1', 1), stop('t2-2', 2)] },
    ]
    expect(flattenTripStopsWithUniqueSequence(trips)).toEqual([
      stop('t1-1', 1),
      stop('t1-2', 2),
      stop('t2-1', 3),
      stop('t2-2', 4),
    ])
  })

  test('o número da parada e o da nota escolhem a parada certa', () => {
    const options = flattenTripStopsWithUniqueSequence([
      { stops: [{ id: 'a', numbers: ['916075'], sequence: 1 }] },
      { stops: [{ id: 'b', numbers: ['914103'], sequence: 1 }] },
    ])
    expect(pickStopFromList(options, '2')).toMatchObject({ kind: 'picked', option: { id: 'b' } })
    expect(pickStopFromList(options, '916075')).toMatchObject({
      kind: 'picked',
      option: { id: 'a' },
    })
  })
})
