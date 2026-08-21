/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DRIVER_DRAFT_BODY,
  LINKED_COMPANY_TAX_ID,
  loadFutureModule,
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

  test('submits the vehicle type only for traction vehicles', async () => {
    const { createVehicleDraft, toVehicleBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = createVehicleDraft()

    expect(
      toVehicleBody({ ...state, role: 'traction', vehicleType: 'tractor_unit' }).vehicleType,
    ).toBe('tractor_unit')
    expect(
      toVehicleBody({ ...state, role: 'trailer', vehicleType: 'tractor_unit' }).vehicleType,
    ).toBe('')
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

  // A razão social pende do CNPJ: sem o vínculo ela não descreve empresa nenhuma, e a API a recusa
  test('drops the linked legal name when the company tax id is empty', async () => {
    const { createDriverDraft, toDriverBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = { ...createDriverDraft(), linkedLegalName: 'Transportes Silva ME' }

    expect(toDriverBody({ ...state, linkedTaxId: '' }).linkedLegalName).toBe('')
    expect(toDriverBody({ ...state, linkedTaxId: LINKED_COMPANY_TAX_ID }).linkedLegalName).toBe(
      'Transportes Silva ME',
    )
  })

  test('sends the driver contact and ANTT fields the mobile app and the MDF-e will read', async () => {
    const { createDriverDraft, toDriverBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = createDriverDraft()

    expect(toDriverBody({ ...state, email: '  jose@transportes.com.br ' }).email).toBe(
      'jose@transportes.com.br',
    )
    expect(toDriverBody({ ...state, rntrc: '058.151.044' }).rntrc).toBe('058151044')
    expect(toDriverBody({ ...state, anttCategory: '1' }).anttCategory).toBe('1')
    // Categoria fora do catálogo da ANTT vira ausência: o CHECK do banco só conhece 0, 1 e 2
    expect(toDriverBody({ ...state, anttCategory: '9' }).anttCategory).toBe('')
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
    vehicleType: string
  }>

type FleetDriverFormState = Record<string, unknown> &
  Readonly<{
    anttCategory: string
    email: string
    linkedLegalName: string
    linkedTaxId: string
    profile: 'aggregate' | 'driver'
    rntrc: string
    taxId: string
  }>

type FleetFormModule = {
  readonly createDriverDraft: (input?: Record<string, unknown>) => FleetDriverFormState
  readonly createVehicleDraft: (input?: Record<string, unknown>) => FleetVehicleFormState
  readonly normalizeDigits: (value: string) => string
  readonly normalizePlate: (value: string) => string
  readonly normalizeUnsignedInteger: (value: string) => string
  readonly toDriverBody: (state: FleetDriverFormState) => Readonly<{
    anttCategory: string
    email: string
    linkedLegalName: string
    linkedTaxId: string
    rntrc: string
    taxId: string
  }>
  readonly toVehicleBody: (state: FleetVehicleFormState) => Readonly<{
    owner: null | Record<string, unknown>
    vehicleType: string
  }>
}
