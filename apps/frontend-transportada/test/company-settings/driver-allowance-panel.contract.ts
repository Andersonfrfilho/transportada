/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  DRIVER_ALLOWANCE_RATE_ORIGINS,
  isDriverAllowanceResponse,
  isDriverAllowanceSettings,
} from '../../src/modules/company-settings/shared/driverAllowance.validation'

import en from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import pt from '../../src/modules/company-settings/locales/companySettings.locale.json'

/**
 * Spec 143 D7 — a aba "Diária do motorista" em Configurações da empresa, no mesmo molde de
 * `FederalTaxPanel`: `GET/PUT/DELETE /company-settings/driver-allowance`, sem linha gravada é
 * resposta `200` com o padrão do sistema, nunca `404`.
 */
const API_POLICY = '../../../api-transportada/src/trips/domain/daily-allowance.policy.ts'
const PANEL = '../../src/modules/company-settings/components/DriverAllowancePanel.component.tsx'
const PAGE = '../../src/modules/company-settings/pages/CompanySettings.page.tsx'

function apiRateOrigins(): readonly string[] {
  const source = readFileSync(new URL(API_POLICY, import.meta.url), 'utf8')
  const line = source.slice(source.indexOf('DAILY_ALLOWANCE_RATE_ORIGIN = {'))
  const body = line.slice(line.indexOf('{'), line.indexOf('}'))

  return [...body.matchAll(/(\w+):\s*'(\w+)'/g)].map((match) => match[2] ?? '')
}

describe('driver allowance panel (spec 143 D7)', () => {
  test('the origins are a copy by value of the API ones, minus the driver entry', () => {
    const apiOrigins = apiRateOrigins().filter((origin) => origin !== 'driver')
    expect([...DRIVER_ALLOWANCE_RATE_ORIGINS].map(String).sort()).toEqual([...apiOrigins].sort())
  })

  test('the settings guard requires amount, a known origin and updatedAt', () => {
    expect(
      isDriverAllowanceSettings({
        amount: '200.0000',
        rateOrigin: 'default',
        updatedAt: null,
      }),
    ).toBe(true)
    expect(
      isDriverAllowanceSettings({
        amount: '250.0000',
        rateOrigin: 'company',
        updatedAt: '2026-09-10T12:00:00.000Z',
      }),
    ).toBe(true)
    expect(isDriverAllowanceSettings({ amount: '200.0000', rateOrigin: 'driver' })).toBe(false)
    expect(isDriverAllowanceSettings({ rateOrigin: 'default' })).toBe(false)
    expect(isDriverAllowanceSettings({})).toBe(false)
  })

  test('the response guard never accepts a null data, unlike federal taxes', () => {
    expect(
      isDriverAllowanceResponse({
        data: { amount: '200.0000', rateOrigin: 'default', updatedAt: null },
      }),
    ).toBe(true)
    expect(isDriverAllowanceResponse({ data: null })).toBe(false)
    expect(isDriverAllowanceResponse({})).toBe(false)
  })

  test('the panel is built from the design system', () => {
    const panel = readFileSync(new URL(PANEL, import.meta.url), 'utf8')

    expect(panel).toContain("from '@/components/ui/skeleton'")
    expect(panel).toContain("from '@/modules/shared/decimalAmount.service'")
    expect(panel).not.toContain('<select')
    expect(panel).not.toContain(' title=')
  })

  test('the panel converts the typed amount through the shared decimal helpers, never by hand', () => {
    const panel = readFileSync(new URL(PANEL, import.meta.url), 'utf8')

    expect(panel).toContain('parseTypedAmount(')
    expect(panel).toContain('toTypedAmount(')
    expect(panel).not.toContain("replace(',', '.')")
  })

  test('the page hosts the panel on its own tab, and only there loads it', () => {
    const page = readFileSync(new URL(PAGE, import.meta.url), 'utf8')

    expect(page).toContain('<DriverAllowancePanel')
    expect(page).toContain("activeTab === 'driverAllowance'")
  })

  test('both languages name the tab and the panel', () => {
    for (const locale of [pt, en]) {
      expect(typeof locale.tabs.driverAllowance).toBe('string')
      expect(typeof locale.driverAllowance.title).toBe('string')
      expect(typeof locale.driverAllowance.amountLabel).toBe('string')
      expect(typeof locale.driverAllowance.origin.company).toBe('string')
      expect(typeof locale.driverAllowance.origin.default).toBe('string')
    }
  })
})
