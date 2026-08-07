/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DRIVER_DRAFT_BODY,
  LINKED_COMPANY_TAX_ID,
  loadFutureModule,
  MEMBERSHIP_ID,
  VEHICLE_DRAFT_BODY,
  VEHICLE_OWNER,
} from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('fleet presentation boundary contract', () => {
  test('offers the linked company tax id in the driver form and names it in both locales', async () => {
    const [form, ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/DriverForm.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    expect(form).toContain("t('driverLinkedTaxId')")
    expect(form).toContain('maxLength={14}')
    expect(form).toContain('linkedTaxId')
    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      expect(typeof dictionary['driverLinkedTaxId']).toBe('string')
      expect(typeof dictionary['driverLinkedTaxIdHint']).toBe('string')
    }
  })

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

  // A tela manda o registro como o certificado da ANTT o imprime; encurtar é assunto do fiscal.
  test('envia o RNTRC do proprietário com o zero da folha da ANTT', async () => {
    const { createVehicleDraft, toVehicleBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = {
      ...createVehicleDraft(),
      ownerName: VEHICLE_OWNER.name,
      ownerRntrc: '058.151.044',
      ownerState: VEHICLE_OWNER.state,
      ownerTaxId: VEHICLE_OWNER.taxId,
      ownerTaxRegime: VEHICLE_OWNER.taxRegime,
      ownership: 'third_party' as const,
    }

    expect(toVehicleBody(state).owner?.rntrc).toBe('058151044')
  })

  test('links the driver to a company membership only when one is chosen', async () => {
    const { createDriverDraft, toDriverBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = createDriverDraft()

    expect(toDriverBody({ ...state, membershipId: '' }).membershipId).toBe(null)
    expect(toDriverBody({ ...state, membershipId: MEMBERSHIP_ID }).membershipId).toBe(MEMBERSHIP_ID)
  })

  // O autônomo fatura pelo CNPJ próprio, mas o condutor do MDF-e continua sendo o CPF
  test('sends the linked company tax id beside the mandatory cpf, without the mask', async () => {
    const { createDriverDraft, toDriverBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = createDriverDraft()

    expect(toDriverBody({ ...state, linkedTaxId: '' }).linkedTaxId).toBe('')
    expect(toDriverBody({ ...state, linkedTaxId: '12.345.678/0001-95' }).linkedTaxId).toBe(
      LINKED_COMPANY_TAX_ID,
    )
    expect(toDriverBody({ ...state, taxId: '529.982.247-25' }).taxId).toBe('52998224725')
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

type FleetDriverFormState = Record<string, unknown> &
  Readonly<{ linkedTaxId: string; membershipId: string; taxId: string }>

type FleetFormModule = {
  readonly createDriverDraft: (input?: Record<string, unknown>) => FleetDriverFormState
  readonly createVehicleDraft: (input?: Record<string, unknown>) => FleetVehicleFormState
  readonly normalizeDigits: (value: string) => string
  readonly normalizePlate: (value: string) => string
  readonly normalizeUnsignedInteger: (value: string) => string
  readonly toDriverBody: (state: FleetDriverFormState) => Readonly<{
    linkedTaxId: string
    membershipId: null | string
    taxId: string
  }>
  readonly toVehicleBody: (state: FleetVehicleFormState) => Readonly<{
    owner: null | Record<string, unknown>
    wheelType: string
  }>
}
