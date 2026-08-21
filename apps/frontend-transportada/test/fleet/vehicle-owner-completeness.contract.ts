/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  VEHICLE_OWNER_REQUIRED_FIELDS,
  listIncompleteVehicleOwnerFields,
} from '../../src/modules/fleet/shared/vehicleOwner.service.js'
import { DRIVER_DETAIL } from './fleet.fixture.js'

const COMPLETE_OWNER = {
  ownerName: 'LAZARO MATIAS CIPRIANO',
  ownerRntrc: '054941988',
  ownerState: 'SP',
  ownerTaxId: '44423659891',
  ownership: 'aggregated',
} as const

describe('vehicle owner completeness contract', () => {
  test('names the four fields the MDF-e owner group demands', () => {
    expect(VEHICLE_OWNER_REQUIRED_FIELDS).toEqual([
      'ownerName',
      'ownerRntrc',
      'ownerState',
      'ownerTaxId',
    ])
  })

  test('the vehicle of the company itself carries no owner group', () => {
    expect(
      listIncompleteVehicleOwnerFields({
        ownerName: '',
        ownerRntrc: '',
        ownerState: '',
        ownerTaxId: '',
        ownership: 'own',
      }),
    ).toEqual([])
  })

  test('a complete driver record blocks nothing', () => {
    expect(listIncompleteVehicleOwnerFields(COMPLETE_OWNER)).toEqual([])
  })

  /**
   * A ficha sem UF é o caso real: a API recusa o veículo inteiro e o operador via só o erro
   * genérico de gravação, sem saber que o campo vazio estava na ficha do motorista.
   */
  test('reports the missing field instead of letting the generic 400 explain it', () => {
    expect(listIncompleteVehicleOwnerFields({ ...COMPLETE_OWNER, ownerState: '' })).toEqual([
      'ownerState',
    ])
    expect(
      listIncompleteVehicleOwnerFields({ ...COMPLETE_OWNER, ownerRntrc: ' ', ownerState: '' }),
    ).toEqual(['ownerRntrc', 'ownerState'])
  })

  test('the form refuses to submit before the request leaves the browser', async () => {
    const hook = await Bun.file(
      new URL('../../src/modules/fleet/hooks/useVehicleForm.hook.ts', import.meta.url),
    ).text()

    expect(hook).toContain('listIncompleteVehicleOwnerFields(state).length > 0')
    expect(hook).toMatch(/setFeedbackKey\(OWNER_INCOMPLETE_FEEDBACK_KEY\)[\s\S]{0,40}return/)
  })
})

describe('placeholder linked document contract', () => {
  /**
   * A ficha real do agregado guarda `00000000000000` enquanto o CNPJ verdadeiro não chega — o
   * proprietário do MDF-e tem de sair do CPF dele até lá, não do documento de zeros.
   */
  test('a linked document made of zeros is not a company yet', async () => {
    const { isPlaceholderTaxId, toVehicleOwnerFields } = await import(
      '../../src/modules/fleet/shared/vehicleOwner.service.js'
    )

    expect(isPlaceholderTaxId('00000000000000')).toBe(true)
    expect(isPlaceholderTaxId('')).toBe(false)
    expect(isPlaceholderTaxId('19131243000197')).toBe(false)

    /** A ficha da app guarda mais que o corpo da API restitado no fixture; nada disso o
     * proprietário lê, e o grupo do MDF-e sai dos seis campos abaixo. */
    const driver = {
      ...DRIVER_DETAIL,
      birthCity: '',
      birthState: '',
      fatherName: '',
      licenseIssuedCity: '',
      licenseIssuedState: '',
      linkedLegalName: 'LAZARO MATIAS CIPRIANO',
      linkedTaxId: '00000000000000',
      motherName: '',
      nationality: '',
    }

    expect(toVehicleOwnerFields(driver).ownerTaxId).toBe(driver.taxId)
    expect(toVehicleOwnerFields({ ...driver, linkedTaxId: '19131243000197' }).ownerTaxId).toBe(
      '19131243000197',
    )
  })
})
