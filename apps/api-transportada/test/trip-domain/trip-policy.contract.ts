/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  TripDriverDuplicatedError,
  TripDriverNotAvailableError,
  TripDriverNotFoundError,
  TripVehicleNotAvailableError,
  TripVehicleNotFoundError,
} from '../../src/trips/domain/trip.error.js'
import {
  resolveTripCrew,
  resolveTripVehicle,
  type TripDriverCandidate,
} from '../../src/trips/domain/trip.policy.js'

const activeDriver = (overrides: Partial<TripDriverCandidate> = {}): TripDriverCandidate => ({
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
      },
      {
        driverId: 'driver-1',
        driverName: 'Motorista Titular',
        driverTaxId: '12345678901',
        position: 2,
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
})
