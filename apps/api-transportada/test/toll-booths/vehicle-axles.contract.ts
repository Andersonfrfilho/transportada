/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { VEHICLE_TYPES } from '../../src/shared/vehicle-type.constant.js'
import {
  resolveDeclaredVehicleAxles,
  resolveVehicleAxles,
} from '../../src/toll-booths/domain/vehicle-axles.policy.js'

describe('vehicle axles (spec 090 T6)', () => {
  it('believes the ficha when it declares the axles', () => {
    expect(resolveVehicleAxles({ axleCount: 6, vehicleType: 'toco' })).toEqual({
      count: 6,
      source: 'declared',
    })
  })

  /**
   * ⚠️ `axle_count` é zero por padrão na ficha, e **8 de 12** veículos da base real estão assim. Zero
   * é ausência, nunca caminhão sem eixo — e é essa ausência que faz a referência existir.
   */
  it('falls back to the market reference when the ficha is silent', () => {
    expect(resolveVehicleAxles({ axleCount: 0, vehicleType: 'truck' })).toEqual({
      count: 3,
      source: 'estimated',
    })
  })

  /**
   * ⚠️ `toco` é caminhão de **dois** eixos — um dianteiro e um traseiro simples —, e `truck`
   * (truncado) é de três. O `spec.md` da 090 dizia "um toco de 3 eixos paga R$ 98,40" na abertura e
   * "toco e truck (2 e 3 eixos)" na T6: a primeira frase estava errada e foi corrigida. A conta
   * certa de um toco nas três praças medidas é 32,80 × 2 = R$ 65,60.
   */
  it('counts a toco as two axles and a truck as three', () => {
    expect(resolveVehicleAxles({ axleCount: 0, vehicleType: 'toco' }).count).toBe(2)
    expect(resolveVehicleAxles({ axleCount: 0, vehicleType: 'truck' }).count).toBe(3)
  })

  it('gives every catalogued vehicle type a reference, so no route loses its toll', () => {
    for (const vehicleType of VEHICLE_TYPES) {
      const axles = resolveVehicleAxles({ axleCount: 0, vehicleType })
      expect(axles.count).toBeGreaterThanOrEqual(2)
      expect(axles.source).toBe('estimated')
    }
  })
})

/**
 * Spec 090 T7/T9: a mesma resolução, para a coluna crua da ficha (`vehicleType` é `VehicleType | ''`
 * — implemento, ou cadastro incompleto). Usada por `read-route-geometry.use-case.ts` (T7) e
 * `trip-valuation.query.ts` (T9), que leem o veículo direto do banco.
 */
describe('vehicle axles declarados na ficha crua (spec 090 T7/T9)', () => {
  it('a ficha vence mesmo sem tipo válido', () => {
    expect(resolveDeclaredVehicleAxles({ axleCount: 5, vehicleType: '' })).toEqual({
      count: 5,
      source: 'declared',
    })
  })

  it('estima pelo tipo quando a ficha está silenciosa', () => {
    expect(resolveDeclaredVehicleAxles({ axleCount: 0, vehicleType: 'toco' })).toEqual({
      count: 2,
      source: 'estimated',
    })
  })

  /** Sem ficha e sem tipo válido não há o que estimar — nunca dois eixos por padrão. */
  it('sem eixo declarado e sem tipo válido, é ausência', () => {
    expect(resolveDeclaredVehicleAxles({ axleCount: 0, vehicleType: '' })).toBeNull()
    expect(resolveDeclaredVehicleAxles({ axleCount: 0, vehicleType: 'implement' })).toBeNull()
  })
})
