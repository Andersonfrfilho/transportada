/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DRIVER_BODY_KEYS,
  DRIVER_CREATE_BODY_KEYS,
  DRIVER_DETAIL_KEYS,
} from '../../src/modules/fleet/shared/fleet.constant'
import { createFleetResponseAdapters } from '../../src/modules/fleet/shared/fleetResponse.validation'
import {
  createDriverDraft,
  toDriverBody,
  toDriverCreateBody,
  toDriverFormState,
} from '../../src/modules/fleet/shared/fleetForm.service'
import { FLEET_DRIVER_PROFILES } from '../../src/modules/fleet/shared/fleet.types'
import { DRIVER_DETAIL } from './fleet.fixture'

const LICENSE_FIELDS = {
  firstLicenseAt: '2010-01-01',
  licenseCategory: 'E',
  licenseExpiresAt: '2030-01-01',
  licenseIssuedCity: 'Ribeirão Preto',
  licenseIssuedState: 'SP',
  licenseNumber: '12345678900',
} as const

const EMPTY_LICENSE_BODY = {
  firstLicenseAt: null,
  licenseCategory: '',
  licenseExpiresAt: null,
  licenseIssuedCity: '',
  licenseIssuedState: '',
  licenseNumber: '',
} as const

describe('ajudante é um perfil da ficha de frota (spec 234 T8)', () => {
  test('o catálogo de perfis tem os três, na ordem da API', () => {
    expect(FLEET_DRIVER_PROFILES).toEqual(['aggregate', 'driver', 'helper'])
  })

  test('canDrive só viaja na leitura: nenhum corpo de escrita o carrega', () => {
    expect(DRIVER_DETAIL_KEYS).toContain('canDrive')
    expect(DRIVER_BODY_KEYS).not.toContain('canDrive')
    expect(DRIVER_CREATE_BODY_KEYS).not.toContain('canDrive')
  })

  test('a resposta da API sem canDrive é recusada, e com não-booleano também', () => {
    const { driverFromApi } = createFleetResponseAdapters()
    const withoutCanDrive: Record<string, unknown> = { ...DRIVER_DETAIL }
    delete withoutCanDrive.canDrive

    expect(driverFromApi(DRIVER_DETAIL).canDrive).toBe(true)
    expect(() => driverFromApi(withoutCanDrive)).toThrow()
    expect(() => driverFromApi({ ...DRIVER_DETAIL, canDrive: 'false' })).toThrow()
    expect(driverFromApi({ ...DRIVER_DETAIL, canDrive: false }).canDrive).toBe(false)
  })

  test('o formulário abre dirigindo e a ficha carregada traz o canDrive gravado', () => {
    expect(createDriverDraft().canDrive).toBe(true)
    expect(toDriverFormState({ ...DRIVER_DETAIL, canDrive: false }).canDrive).toBe(false)
    expect(toDriverFormState({ ...DRIVER_DETAIL, canDrive: true }).canDrive).toBe(true)
  })

  test('o corpo de criação e o de edição não mandam canDrive', () => {
    const state = { ...createDriverDraft(), profile: 'helper' as const }

    expect(Object.keys(toDriverCreateBody(state))).not.toContain('canDrive')
    expect(Object.keys(toDriverBody({ ...state, canDrive: false }))).not.toContain('canDrive')
  })

  test('o perfil ajudante vai no corpo de criação e dispensa a CNH, mesmo com resto digitado', () => {
    const state = { ...createDriverDraft(), ...LICENSE_FIELDS, profile: 'helper' as const }
    const body = toDriverCreateBody(state)

    expect(body.profile).toBe('helper')
    expect(body).toMatchObject(EMPTY_LICENSE_BODY)
  })

  test('na edição, quem não dirige tem a CNH vazia no corpo e segue ajudando', () => {
    const state = { ...createDriverDraft(), ...LICENSE_FIELDS, canActAsHelper: false }
    const body = toDriverBody({ ...state, canDrive: false })

    expect(body).toMatchObject(EMPTY_LICENSE_BODY)
    expect(body.canActAsHelper).toBe(true)
  })

  test('quem dirige mantém a CNH digitada e o switch como está', () => {
    const state = { ...createDriverDraft(), ...LICENSE_FIELDS, canActAsHelper: false }
    const body = toDriverBody(state)

    expect(body.licenseNumber).toBe('12345678900')
    expect(body.licenseCategory).toBe('E')
    expect(body.canActAsHelper).toBe(false)
  })
})
