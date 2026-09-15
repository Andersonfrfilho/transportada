/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  TripCrewHelperNotEligibleError,
  TripCrewHelperWithoutDriverError,
  TripDriverDuplicatedError,
  TripDriverNotAvailableError,
  TripDriverNotFoundError,
  TripVehicleNotAvailableError,
  TripVehicleNotFoundError,
} from '../../src/trips/domain/trip.error.js'
import {
  driversOnly,
  resolveTripCrew,
  resolveTripVehicle,
  type TripDriverCandidate,
} from '../../src/trips/domain/trip.policy.js'

const activeDriver = (overrides: Partial<TripDriverCandidate> = {}): TripDriverCandidate => ({
  canActAsHelper: false,
  id: 'driver-1',
  name: 'Motorista Titular',
  status: 'active',
  taxId: '12345678901',
  ...overrides,
})

describe('trip vehicle policy', () => {
  test('accepts an active traction vehicle', () => {
    const vehicle = { id: 'vehicle-1', role: 'traction', status: 'active' } as const

    expect(resolveTripVehicle({ vehicle })).toEqual(vehicle)
  })

  test('rejects a vehicle that does not exist', () => {
    expect(() => resolveTripVehicle({ vehicle: null })).toThrow(TripVehicleNotFoundError)
  })

  test('rejects a trailer even when active', () => {
    const vehicle = { id: 'vehicle-1', role: 'trailer', status: 'active' } as const

    expect(() => resolveTripVehicle({ vehicle })).toThrow(TripVehicleNotAvailableError)
  })

  test('rejects a traction vehicle that is not active', () => {
    const vehicle = { id: 'vehicle-1', role: 'traction', status: 'inactive' } as const

    expect(() => resolveTripVehicle({ vehicle })).toThrow(TripVehicleNotAvailableError)
  })
})

describe('trip crew policy', () => {
  test('assigns the requested order as the driver position, first is the main driver', () => {
    const drivers = [
      activeDriver({ id: 'driver-1', name: 'Motorista Titular' }),
      activeDriver({ id: 'driver-2', name: 'Motorista Reserva', taxId: '98765432100' }),
    ]

    const crew = resolveTripCrew({ driverIds: ['driver-2', 'driver-1'], drivers })

    expect(crew).toEqual([
      {
        driverId: 'driver-2',
        driverName: 'Motorista Reserva',
        driverTaxId: '98765432100',
        position: 1,
        role: 'driver',
      },
      {
        driverId: 'driver-1',
        driverName: 'Motorista Titular',
        driverTaxId: '12345678901',
        position: 2,
        role: 'driver',
      },
    ])
  })

  test('rejects the same driver taking two positions in the crew', () => {
    const drivers = [activeDriver()]

    expect(() => resolveTripCrew({ driverIds: ['driver-1', 'driver-1'], drivers })).toThrow(
      TripDriverDuplicatedError,
    )
  })

  test('rejects a driver that is not registered in this company', () => {
    expect(() => resolveTripCrew({ driverIds: ['driver-missing'], drivers: [] })).toThrow(
      TripDriverNotFoundError,
    )
  })

  test('rejects a driver that is not active', () => {
    const drivers = [activeDriver({ status: 'inactive' })]

    expect(() => resolveTripCrew({ driverIds: ['driver-1'], drivers })).toThrow(
      TripDriverNotAvailableError,
    )
  })

  // Spec 149 (ADR-0065): motorista primeiro (posição 1), depois ajudantes — critério de aceite 3.
  test('places helpers after the drivers, in the requested order', () => {
    const drivers = [
      activeDriver({ id: 'driver-1', name: 'Motorista Titular' }),
      activeDriver({
        canActAsHelper: true,
        id: 'helper-1',
        name: 'Ajudante Um',
        taxId: '11111111111',
      }),
      activeDriver({
        canActAsHelper: true,
        id: 'helper-2',
        name: 'Ajudante Dois',
        taxId: '22222222222',
      }),
    ]

    const crew = resolveTripCrew({
      driverIds: ['driver-1'],
      drivers,
      helperIds: ['helper-1', 'helper-2'],
    })

    expect(crew).toEqual([
      {
        driverId: 'driver-1',
        driverName: 'Motorista Titular',
        driverTaxId: '12345678901',
        position: 1,
        role: 'driver',
      },
      {
        driverId: 'helper-1',
        driverName: 'Ajudante Um',
        driverTaxId: '11111111111',
        position: 2,
        role: 'helper',
      },
      {
        driverId: 'helper-2',
        driverName: 'Ajudante Dois',
        driverTaxId: '22222222222',
        position: 3,
        role: 'helper',
      },
    ])
  })

  // Critério de aceite 3 / evidence T1: a posição 1 é sempre um motorista.
  test('rejects a helper without any driver in the crew', () => {
    const drivers = [activeDriver({ canActAsHelper: true, id: 'helper-1' })]

    expect(() => resolveTripCrew({ driverIds: [], drivers, helperIds: ['helper-1'] })).toThrow(
      TripCrewHelperWithoutDriverError,
    )
  })

  test('rejects the same person in driverIds and helperIds', () => {
    const drivers = [activeDriver({ canActAsHelper: true })]

    expect(() =>
      resolveTripCrew({ driverIds: ['driver-1'], drivers, helperIds: ['driver-1'] }),
    ).toThrow(TripDriverDuplicatedError)
  })

  test('rejects a helper whose driver record is not marked as able to help', () => {
    const drivers = [
      activeDriver({ id: 'driver-1' }),
      activeDriver({
        canActAsHelper: false,
        id: 'helper-1',
        name: 'Ajudante',
        taxId: '11111111111',
      }),
    ]

    const error = (() => {
      try {
        resolveTripCrew({ driverIds: ['driver-1'], drivers, helperIds: ['helper-1'] })
        return null
      } catch (caught) {
        return caught as TripCrewHelperNotEligibleError
      }
    })()

    expect(error).toBeInstanceOf(TripCrewHelperNotEligibleError)
    expect(error?.details).toEqual([{ field: 'helperIds', message: 'helper-1' }])
  })

  test('driversOnly filters helpers out, keeping the driver order', () => {
    const drivers = [
      activeDriver({ id: 'driver-1' }),
      activeDriver({
        canActAsHelper: true,
        id: 'helper-1',
        name: 'Ajudante',
        taxId: '11111111111',
      }),
    ]
    const crew = resolveTripCrew({ driverIds: ['driver-1'], drivers, helperIds: ['helper-1'] })

    expect(driversOnly(crew)).toEqual([
      {
        driverId: 'driver-1',
        driverName: 'Motorista Titular',
        driverTaxId: '12345678901',
        position: 1,
        role: 'driver',
      },
    ])
  })
})
