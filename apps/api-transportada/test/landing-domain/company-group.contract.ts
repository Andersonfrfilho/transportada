/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  orderGroupUnits,
  type CompanyGroupUnit,
} from '../../src/landing/domain/company-group.policy.js'
import { resolveCompanyGroupRoot } from '../../src/shared/tax-id.service.js'

function buildUnit(overrides: Partial<CompanyGroupUnit>): CompanyGroupUnit {
  return {
    city: 'São Paulo',
    cnpj: '12345678000195',
    companyId: crypto.randomUUID(),
    complement: '',
    district: 'Centro',
    number: '100',
    phone: '11999999999',
    postalCode: '01000000',
    state: 'SP',
    street: 'Rua Um',
    tradeName: 'Unidade',
    ...overrides,
  }
}

describe('company group policy', () => {
  test('the root is the first eight positions of a normalized CNPJ', () => {
    expect(resolveCompanyGroupRoot('12345678000195')).toBe('12345678')
  })

  test('rejects a value that is not a normalized 14-position CNPJ', () => {
    expect(() => resolveCompanyGroupRoot('12345678')).toThrow(RangeError)
  })

  test('the matrix branch 0001 always comes first', () => {
    const branch = buildUnit({ cnpj: '12345678000285', tradeName: 'Filial Sul' })
    const matrix = buildUnit({ cnpj: '12345678000195', tradeName: 'Sede' })

    expect(orderGroupUnits([branch, matrix])).toEqual([matrix, branch])
  })

  test('ties among non-matrix branches sort by trade name', () => {
    const branchZ = buildUnit({ cnpj: '12345678000355', tradeName: 'Zebra' })
    const branchA = buildUnit({ cnpj: '12345678000474', tradeName: 'Alfa' })

    expect(orderGroupUnits([branchZ, branchA])).toEqual([branchA, branchZ])
  })

  test('a single-company group returns a list of one', () => {
    const solo = buildUnit({ cnpj: '98765432000155', tradeName: 'Única' })

    expect(orderGroupUnits([solo])).toEqual([solo])
  })
})
