/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  TripCrewHelperNotEligibleError,
  TripDriverCannotDriveError,
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
  canDrive: true,
  id: 'driver-1',
  name: 'Motorista Titular',
  status: 'active',
  taxId: '12345678901',
  ...overrides,
})

describe('trip vehicle policy', () => {
  test('accepts an active traction vehicle', () => {
    const vehicle = {
      defaultTrailerVehicleId: null,
      id: 'vehicle-1',
      role: 'traction',
      status: 'active',
      vehicleType: 'tractor_unit',
    } as const

    expect(resolveTripVehicle({ vehicle })).toEqual(vehicle)
  })

  test('rejects a vehicle that does not exist', () => {
    expect(() => resolveTripVehicle({ vehicle: null })).toThrow(TripVehicleNotFoundError)
  })

  test('rejects a trailer even when active', () => {
    const vehicle = {
      defaultTrailerVehicleId: null,
      id: 'vehicle-1',
      role: 'trailer',
      status: 'active',
      vehicleType: '',
    } as const

    expect(() => resolveTripVehicle({ vehicle })).toThrow(TripVehicleNotAvailableError)
  })

  test('rejects a traction vehicle that is not active', () => {
    const vehicle = {
      defaultTrailerVehicleId: null,
      id: 'vehicle-1',
      role: 'traction',
      status: 'inactive',
      vehicleType: 'tractor_unit',
    } as const

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

  // Spec 235 D5: o ajudante-puro (`can_drive = false`) nunca entra como condutor.
  test('rejects a helper-only record in the driver list, naming every one in details', () => {
    const drivers = [
      activeDriver({ id: 'driver-1' }),
      activeDriver({ canActAsHelper: true, canDrive: false, id: 'helper-1' }),
      activeDriver({ canActAsHelper: true, canDrive: false, id: 'helper-2' }),
    ]

    const error = (() => {
      try {
        resolveTripCrew({ driverIds: ['helper-1', 'driver-1', 'helper-2'], drivers })
        return null
      } catch (caught) {
        return caught as TripDriverCannotDriveError
      }
    })()

    expect(error).toBeInstanceOf(TripDriverCannotDriveError)
    expect(error?.code).toBe('TRIP_DRIVER_CANNOT_DRIVE')
    expect(error?.status).toBe(409)
    expect(error?.details).toEqual([
      { field: 'driverIds', message: 'helper-1' },
      { field: 'driverIds', message: 'helper-2' },
    ])
  })

  test('accepts a helper-only record in the helper list', () => {
    const drivers = [
      activeDriver({ id: 'driver-1' }),
      activeDriver({ canActAsHelper: true, canDrive: false, id: 'helper-1' }),
    ]

    expect(
      resolveTripCrew({ driverIds: ['driver-1'], drivers, helperIds: ['helper-1'] }).map((line) => [
        line.driverId,
        line.role,
      ]),
    ).toEqual([
      ['driver-1', 'driver'],
      ['helper-1', 'helper'],
    ])
  })

  test('keeps a driver who also helps valid in both roles', () => {
    const drivers = [
      activeDriver({ canActAsHelper: true, id: 'driver-1' }),
      activeDriver({ canActAsHelper: true, id: 'driver-2' }),
    ]

    expect(resolveTripCrew({ driverIds: ['driver-1'], drivers }).map((line) => line.role)).toEqual([
      'driver',
    ])
    expect(
      resolveTripCrew({ driverIds: ['driver-2'], drivers, helperIds: ['driver-1'] }).map((line) => [
        line.driverId,
        line.role,
      ]),
    ).toEqual([
      ['driver-2', 'driver'],
      ['driver-1', 'helper'],
    ])
  })

  // A ordem das recusas: duplicado → ajudante sem motorista → não encontrado/inativo → não dirige.
  test('checks duplicates, a helper without driver and missing or inactive records before driving', () => {
    const helperOnly = activeDriver({ canActAsHelper: true, canDrive: false, id: 'helper-1' })

    expect(() =>
      resolveTripCrew({ driverIds: ['helper-1', 'helper-1'], drivers: [helperOnly] }),
    ).toThrow(TripDriverDuplicatedError)
    expect(() =>
      resolveTripCrew({ driverIds: [], drivers: [helperOnly], helperIds: ['helper-1'] }),
    ).toThrow(TripCrewHelperWithoutDriverError)
    expect(() =>
      resolveTripCrew({ driverIds: ['helper-1', 'ghost'], drivers: [helperOnly] }),
    ).toThrow(TripDriverNotFoundError)
    expect(() =>
      resolveTripCrew({
        driverIds: ['helper-1', 'inactive'],
        drivers: [helperOnly, activeDriver({ id: 'inactive', status: 'inactive' })],
      }),
    ).toThrow(TripDriverNotAvailableError)
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
