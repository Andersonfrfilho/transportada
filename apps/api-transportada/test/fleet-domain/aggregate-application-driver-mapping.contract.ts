/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  hasDeclaredVehicle,
  mapDeclaredDataToDriverInput,
  mapDeclaredDataToVehicleInput,
  resolveVehicleOwnerFields,
} from '../../src/fleet/domain/aggregate-application-driver-mapping.policy.js'

describe('aggregate application declared data mapping', () => {
  test('maps declared driver fields, flattening the two addresses onto the fleet_drivers columns', () => {
    const input = mapDeclaredDataToDriverInput({
      declaredData: {
        driver: {
          address: { city: 'São Paulo', postalCode: '01000000', state: 'SP', street: 'Rua Um' },
          licenseCategory: 'E',
          licenseNumber: '12345678901',
          linkedAddress: { city: 'Osasco', state: 'SP' },
          linkedLegalName: 'Fulano Transportes ME',
          linkedTaxId: '12345678000195',
          rntrc: '12345678',
        },
      },
      email: 'candidato@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
      taxId: '12345678901',
    })

    expect(input.city).toBe('São Paulo')
    expect(input.postalCode).toBe('01000000')
    expect(input.linkedCity).toBe('Osasco')
    expect(input.linkedLegalName).toBe('Fulano Transportes ME')
    expect(input.licenseCategory).toBe('E')
    expect(input.licenseNumber).toBe('12345678901')
    expect(input.rntrc).toBe('12345678')
    expect(input.name).toBe('Fulano de Tal')
    expect(input.email).toBe('candidato@example.com')
  })

  test('a candidatura sem nada declarado ainda produz uma ficha válida de gravar — tudo em branco', () => {
    const input = mapDeclaredDataToDriverInput({
      declaredData: {},
      email: 'candidato@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
      taxId: '12345678901',
    })

    expect(input.licenseNumber).toBe('')
    expect(input.city).toBe('')
    expect(input.linkedTaxId).toBe('')
    expect(input.birthDate).toBeNull()
  })

  test('sem placa declarada, não há veículo — o operador cadastra depois', () => {
    expect(hasDeclaredVehicle(undefined)).toBeFalse()
    expect(hasDeclaredVehicle({})).toBeFalse()
    expect(hasDeclaredVehicle({ plate: '  ' })).toBeFalse()
    expect(hasDeclaredVehicle({ plate: 'ABC1D23' })).toBeTrue()
  })

  test('mapeia o veículo declarado com os defaults que o schema do banco já aceita', () => {
    const vehicle = mapDeclaredDataToVehicleInput({
      brand: 'Volvo',
      model: 'FH 540',
      modelYear: 2022,
      plate: 'ABC1D23',
      vehicleType: 'tractor_unit',
    })

    expect(vehicle.plate).toBe('ABC1D23')
    expect(vehicle.brand).toBe('Volvo')
    expect(vehicle.modelYear).toBe(2022)
    expect(vehicle.vehicleType).toBe('tractor_unit')
    expect(vehicle.role).toBe('traction')
    expect(vehicle.fuelType).toBe('diesel-s10')
    expect(vehicle.bodyType).toBe('00')
    expect(vehicle.capacityKilograms).toBe('0')
  })

  test('sem UF declarada no veículo, usa a UF do endereço do motorista', () => {
    const vehicle = mapDeclaredDataToVehicleInput({ plate: 'ABC1D23' }, 'SP')
    expect(vehicle.state).toBe('SP')
  })

  test('sem UF nenhuma disponível, cai num placeholder válido em vez de violar a constraint', () => {
    const vehicle = mapDeclaredDataToVehicleInput({ plate: 'ABC1D23' }, '')
    expect(vehicle.state).toBe('SP')
  })

  test('motorista com RNTRC, UF e regime declarados vira dono do próprio veículo', () => {
    const driver = mapDeclaredDataToDriverInput({
      declaredData: {
        driver: {
          address: { state: 'SP' },
          anttCategory: '0',
          rntrc: '12345678',
        },
      },
      email: 'a@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
      taxId: '12345678901',
    })

    const owner = resolveVehicleOwnerFields({ driver, name: 'Fulano de Tal', taxId: '12345678901' })

    expect(owner.ownership).toBe('aggregate')
    expect(owner.ownerRntrc).toBe('12345678')
    expect(owner.ownerState).toBe('SP')
    expect(owner.ownerTaxRegime).toBe('0')
  })

  test('sem RNTRC, UF ou regime declarados, o veículo nasce sem dono — o operador completa depois', () => {
    const driver = mapDeclaredDataToDriverInput({
      declaredData: {},
      email: 'a@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
      taxId: '12345678901',
    })

    const owner = resolveVehicleOwnerFields({ driver, name: 'Fulano de Tal', taxId: '12345678901' })

    expect(owner.ownership).toBe('own')
    expect(owner.ownerName).toBe('')
    expect(owner.ownerTaxId).toBe('')
  })
})
