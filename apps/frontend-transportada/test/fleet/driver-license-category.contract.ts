/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import ptBrLocale from '../../src/modules/fleet/locales/fleet.locale.json'
import enLocale from '../../src/modules/fleet/locales/fleet.en.locale.json'
import { LICENSE_CATEGORIES } from '../../src/modules/fleet/shared/fleet.types'
import { createDriverDraft, toDriverBody } from '../../src/modules/fleet/shared/fleetForm.service'

describe('driver licence category contract', () => {
  // Cópia por valor do catálogo da API: a ordem é contrato, e é ela que a carteira imprime
  test('closes the CNH category on the CONTRAN catalog', () => {
    expect(LICENSE_CATEGORIES).toEqual(['ACC', 'A', 'B', 'AB', 'C', 'AC', 'D', 'AD', 'E', 'AE'])
  })

  test('names every category in both locales', () => {
    for (const category of LICENSE_CATEGORIES) {
      expect(ptBrLocale.licenseCategoryOption[category]).toBeString()
      expect(enLocale.licenseCategoryOption[category]).toBeString()
    }
  })

  // Categoria fora do catálogo vira ausência: o CHECK do banco só conhece as dez do CONTRAN
  test('drops a category the catalog does not name', () => {
    const state = createDriverDraft()

    expect(toDriverBody({ ...state, licenseCategory: 'E' }).licenseCategory).toBe('E')
    expect(toDriverBody({ ...state, licenseCategory: 'Z' }).licenseCategory).toBe('')
    expect(toDriverBody(state).licenseCategory).toBe('')
  })

  // O campo é select nos dois caminhos de cadastro: digitar categoria deixaria 'e' fora do CHECK
  test('offers the category as a select in both driver forms', () => {
    const forms = [
      'src/modules/fleet/components/DriverForm.component.tsx',
      'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
    ]

    for (const form of forms) {
      const source = readFileSync(new URL(`../../${form}`, import.meta.url), 'utf8')
      expect(source).toContain('options={LICENSE_CATEGORIES}')
      expect(source).toContain("label={t('driverLicenseCategory')}")
    }
  })

  // Data em branco é ausência, não texto vazio: a coluna é `date` e a API recusaria ''
  test('sends the first-licence date as an absence when the operator leaves it blank', () => {
    const state = createDriverDraft()

    expect(toDriverBody(state).firstLicenseAt).toBeNull()
    expect(toDriverBody({ ...state, firstLicenseAt: '2008-03-14' }).firstLicenseAt).toBe(
      '2008-03-14',
    )
  })

  test('offers the first-licence date as a calendar field in both driver forms', () => {
    const forms = [
      'src/modules/fleet/components/DriverForm.component.tsx',
      'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
    ]

    for (const form of forms) {
      const source = readFileSync(new URL(`../../${form}`, import.meta.url), 'utf8')
      expect(source).toContain("label={t('driverFirstLicenseAt')}")
    }
  })
})
