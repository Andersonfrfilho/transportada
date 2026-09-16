/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createDriverSchema,
  updateDriverSchema,
} from '../../src/fleet/presentation/fleet-request.schema.js'

const UPDATE_BASE = {
  address: {
    city: 'Ribeirão Preto',
    complement: '',
    district: 'Jardim Sumaré',
    number: '480',
    postalCode: '14020210',
    state: 'SP',
    street: 'Avenida Independência',
  },
  anttCategory: '',
  securesCargo: false,
  birthCity: '',
  birthDate: null,
  birthState: '',
  email: '',
  expectedVersion: '1',
  fatherName: '',
  firstLicenseAt: null,
  identityDocument: '',
  identityDocumentIssuer: '',
  identityDocumentState: '',
  licenseCategory: '',
  licenseExpiresAt: null,
  licenseIssuedCity: '',
  licenseIssuedState: '',
  licenseNumber: '',
  linkedAddress: {
    city: '',
    complement: '',
    district: '',
    number: '',
    postalCode: '',
    state: '',
    street: '',
  },
  linkedLegalName: '',
  linkedTaxId: '',
  membershipId: null,
  motherName: '',
  pixKey: '',
  pixKeyType: '',
  rntrc: '',
  name: 'Adalberto Rocha',
  nationality: '',
  phone: '',
  status: 'active',
  taxId: '31820947016',
} as const

const CREATE_BASE: Record<string, unknown> = { ...UPDATE_BASE }
delete CREATE_BASE.expectedVersion
delete CREATE_BASE.membershipId
delete CREATE_BASE.status

describe('a diária que só este motorista recebe (spec 143 D5/D6)', () => {
  /** Dinheiro é `Decimal`/`numeric`, nunca float binário — o zod grava a mesma string que recebe. */
  test('aceita a diária como string decimal, nunca como número', () => {
    const parsed = updateDriverSchema.parse({ ...UPDATE_BASE, dailyAllowanceAmount: '180.0000' })

    expect(parsed.dailyAllowanceAmount).toBe('180.0000')
    expect(() => updateDriverSchema.parse({ ...UPDATE_BASE, dailyAllowanceAmount: 180 })).toThrow()
  })

  /** `null` devolve o motorista ao valor geral da empresa — é apagar, não silêncio. */
  test('null apaga a diária combinada com o motorista', () => {
    const parsed = updateDriverSchema.parse({ ...UPDATE_BASE, dailyAllowanceAmount: null })

    expect(parsed.dailyAllowanceAmount).toBeNull()
  })

  /**
   * ⚠️ Ausente é "não mexeram nela", nunca "apague". Com `exactOptionalPropertyTypes`, a chave
   * ausente não pode colapsar no mesmo caminho do `null` explícito.
   */
  test('omitir a diária é silêncio, não ordem de apagar', () => {
    const parsed = updateDriverSchema.parse(UPDATE_BASE)

    expect(Object.hasOwn(parsed, 'dailyAllowanceAmount')).toBeFalse()
  })

  test('recusa diária menor ou igual a zero (aceite 8)', () => {
    expect(() =>
      updateDriverSchema.parse({ ...UPDATE_BASE, dailyAllowanceAmount: '0.0000' }),
    ).toThrow()
  })

  test('a criação aceita o mesmo campo, ao lado dos demais da ficha', () => {
    const parsed = createDriverSchema.parse({
      ...CREATE_BASE,
      dailyAllowanceAmount: '180.0000',
      profile: 'driver',
    })

    expect(parsed.dailyAllowanceAmount).toBe('180.0000')
  })
})
