/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DRIVER_DRAFT_BODY,
  loadFutureModule,
  MEMBERSHIP_ID,
  VEHICLE_DRAFT_BODY,
  VEHICLE_OWNER,
} from './fleet.fixture'

describe('fleet presentation boundary contract', () => {
  test('opens an own traction draft and refuses foreign fields', async () => {
    const { createDriverDraft, createVehicleDraft, toDriverBody, toVehicleBody } =
      await loadFutureModule<FleetFormModule>('../../src/modules/fleet/shared/fleetForm.service')

    expect(toVehicleBody(createVehicleDraft())).toEqual(VEHICLE_DRAFT_BODY)
    expect(toDriverBody(createDriverDraft())).toEqual(DRIVER_DRAFT_BODY)

    expect(() => createVehicleDraft({ companyId: 'forbidden-company' })).toThrow(
      'FLEET_INVALID_DRAFT',
    )
    expect(() => createDriverDraft({ companyId: 'forbidden-company' })).toThrow(
      'FLEET_INVALID_DRAFT',
    )
  })

  test('submits the wheel type only for traction vehicles', async () => {
    const { createVehicleDraft, toVehicleBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = createVehicleDraft()

    expect(toVehicleBody({ ...state, role: 'traction', wheelType: '03' }).wheelType).toBe('03')
    expect(toVehicleBody({ ...state, role: 'trailer', wheelType: '03' }).wheelType).toBe('')
  })

  test('submits the owner group only when the vehicle is not the carrier own', async () => {
    const { createVehicleDraft, toVehicleBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = {
      ...createVehicleDraft(),
      ownerName: VEHICLE_OWNER.name,
      ownerRntrc: VEHICLE_OWNER.rntrc,
      ownerState: VEHICLE_OWNER.state,
      ownerTaxId: VEHICLE_OWNER.taxId,
      ownerTaxRegime: VEHICLE_OWNER.taxRegime,
    }

    expect(toVehicleBody({ ...state, ownership: 'own' }).owner).toBe(null)
    expect(toVehicleBody({ ...state, ownership: 'aggregate' }).owner).toEqual(VEHICLE_OWNER)
    expect(toVehicleBody({ ...state, ownership: 'third_party' }).owner).toEqual(VEHICLE_OWNER)
  })

  test('links the driver to a company membership only when one is chosen', async () => {
    const { createDriverDraft, toDriverBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = createDriverDraft()

    expect(toDriverBody({ ...state, membershipId: '' }).membershipId).toBe(null)
    expect(toDriverBody({ ...state, membershipId: MEMBERSHIP_ID }).membershipId).toBe(MEMBERSHIP_ID)
  })

  test('normalizes plate, tax id and integer fields typed by the operator', async () => {
    const { normalizeDigits, normalizePlate, normalizeUnsignedInteger } =
      await loadFutureModule<FleetFormModule>('../../src/modules/fleet/shared/fleetForm.service')

    expect(normalizePlate('abc-1d23')).toBe('ABC1D23')
    expect(normalizePlate('abc 1234')).toBe('ABC1234')
    expect(normalizeDigits('123.456.789-01')).toBe('12345678901')
    expect(normalizeUnsignedInteger('27.000')).toBe('27000')
    expect(normalizeUnsignedInteger('')).toBe('0')
    expect(normalizeUnsignedInteger('007')).toBe('7')
  })
})

type FleetVehicleFormState = Record<string, unknown> &
  Readonly<{
    ownership: 'aggregate' | 'own' | 'third_party'
    role: 'traction' | 'trailer'
    wheelType: string
  }>

type FleetDriverFormState = Record<string, unknown> & Readonly<{ membershipId: string }>

type FleetFormModule = {
  readonly createDriverDraft: (input?: Record<string, unknown>) => FleetDriverFormState
  readonly createVehicleDraft: (input?: Record<string, unknown>) => FleetVehicleFormState
  readonly normalizeDigits: (value: string) => string
  readonly normalizePlate: (value: string) => string
  readonly normalizeUnsignedInteger: (value: string) => string
  readonly toDriverBody: (state: FleetDriverFormState) => Readonly<{ membershipId: null | string }>
  readonly toVehicleBody: (state: FleetVehicleFormState) => Readonly<{
    owner: null | Record<string, unknown>
    wheelType: string
  }>
}
