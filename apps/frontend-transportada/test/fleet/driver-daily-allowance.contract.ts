/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import enLocale from '../../src/modules/fleet/locales/fleet.en.locale.json'
import ptBrLocale from '../../src/modules/fleet/locales/fleet.locale.json'
import {
  createDriverDraft,
  toDriverBody,
  toDriverFormState,
} from '../../src/modules/fleet/shared/fleetForm.service'
import { DRIVER_DETAIL } from './fleet.fixture'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('a diária que só este motorista recebe (spec 143 D7)', () => {
  test('abre em branco no cadastro novo', () => {
    expect(createDriverDraft().dailyAllowanceAmount).toBe('')
  })

  test('campo em branco vira null, o valor que apaga e devolve ao geral da empresa', () => {
    const body = toDriverBody({ ...createDriverDraft(), dailyAllowanceAmount: '' })

    expect(body.dailyAllowanceAmount).toBeNull()
  })

  test('digitado, sai como decimal de quatro casas, nunca como número', () => {
    const body = toDriverBody({ ...createDriverDraft(), dailyAllowanceAmount: '180,00' })

    expect(body.dailyAllowanceAmount).toBe('180.0000')
  })

  test('a ficha carregada mostra a diária gravada, e null volta em branco', () => {
    const withAllowance = toDriverFormState({ ...DRIVER_DETAIL, dailyAllowanceAmount: '180.0000' })
    const withoutAllowance = toDriverFormState({ ...DRIVER_DETAIL, dailyAllowanceAmount: null })

    expect(withAllowance.dailyAllowanceAmount).toBe('180,00')
    expect(withoutAllowance.dailyAllowanceAmount).toBe('')
  })

  test('nomeia o campo e a dica do valor padrão em ambas as fichas', () => {
    const forms = [
      'src/modules/fleet/components/DriverForm.component.tsx',
      'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
    ]

    for (const form of forms) {
      const source = readSource(form)
      expect(source).toContain("label={t('driverDailyAllowanceAmount')}")
      expect(source).toContain("t('driverDailyAllowanceAmountHint')")
    }
  })

  test('traduz o rótulo e a dica nos dois idiomas', () => {
    expect(ptBrLocale.driverDailyAllowanceAmount).toBeString()
    expect(ptBrLocale.driverDailyAllowanceAmountHint).toBeString()
    expect(enLocale.driverDailyAllowanceAmount).toBeString()
    expect(enLocale.driverDailyAllowanceAmountHint).toBeString()
  })
})
