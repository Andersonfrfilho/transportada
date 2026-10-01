/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCapacityUnknownReason,
  type CapacityUnknownReasonCandidate,
} from '../../src/trips/domain/capacity-unknown-reason.policy.js'

const traction = (
  overrides: Partial<CapacityUnknownReasonCandidate> = {},
): CapacityUnknownReasonCandidate => ({
  bodyType: '00',
  vehicleType: 'toco',
  ...overrides,
})

const trailer = (
  overrides: Partial<CapacityUnknownReasonCandidate> = {},
): CapacityUnknownReasonCandidate => ({
  bodyType: '02',
  vehicleType: '',
  ...overrides,
})

describe('resolveCapacityUnknownReason', () => {
  test.each([
    [
      'capacidade conhecida vence, mesmo com body_type 00 (a ficha vence)',
      { capacityM3: '35.500000', traction: traction(), trailer: null },
      null,
    ],
    [
      'toco com 00 e sem ficha e a carreta nao existe',
      {
        capacityM3: null,
        traction: traction({ bodyType: '00', vehicleType: 'toco' }),
        trailer: null,
      },
      'bodyTypeMissing',
    ],
    [
      'truck com 00 e sem ficha',
      {
        capacityM3: null,
        traction: traction({ bodyType: '00', vehicleType: 'truck' }),
        trailer: null,
      },
      'bodyTypeMissing',
    ],
    [
      'carro (que carrega) com 00 e sem ficha',
      {
        capacityM3: null,
        traction: traction({ bodyType: '00', vehicleType: 'car' }),
        trailer: null,
      },
      'bodyTypeMissing',
    ],
    [
      'cavalo (tractor_unit) com 00 e sem carreta e sem ficha',
      {
        capacityM3: null,
        traction: traction({ bodyType: '00', vehicleType: 'tractor_unit' }),
        trailer: null,
      },
      'trailerMissing',
    ],
    [
      'cavalo com carreta 02 sem ficha e sem linha de referencia: quem carrega ja tem carroceria',
      {
        capacityM3: null,
        traction: traction({ bodyType: '00', vehicleType: 'tractor_unit' }),
        trailer: trailer({ bodyType: '02' }),
      },
      'referenceMissing',
    ],
    [
      'cavalo com carreta antiga em 00: a carreta e quem carrega, e ela e quem esta sem carroceria',
      {
        capacityM3: null,
        traction: traction({ bodyType: '00', vehicleType: 'tractor_unit' }),
        trailer: trailer({ bodyType: '00' }),
      },
      'bodyTypeMissing',
    ],
    [
      'tipo sem linha de catalogo, como other, com carroceria escolhida e sem ficha',
      {
        capacityM3: null,
        traction: traction({ bodyType: '02', vehicleType: 'other' }),
        trailer: null,
      },
      'referenceMissing',
    ],
  ] as const)('%s', (_description, params, expected) => {
    expect(resolveCapacityUnknownReason(params)).toBe(expected)
  })
})
