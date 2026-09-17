/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  DRIVER_ALLOWANCE_RATE_ORIGINS,
  isDriverAllowanceResponse,
  isDriverAllowanceSettings,
} from '../../src/modules/company-settings/shared/driverAllowance.validation'
import {
  buildDriverAllowanceSubmission,
  startDriverAllowanceDraft,
  typeDriverAllowanceAmount,
} from '../../src/modules/company-settings/shared/driverAllowanceForm.service'

import en from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import pt from '../../src/modules/company-settings/locales/companySettings.locale.json'

/**
 * Spec 143 D7 — a aba "Diária do motorista" em Configurações da empresa, no mesmo molde de
 * `FederalTaxPanel`: `GET/PUT/DELETE /company-settings/driver-allowance`, sem linha gravada é
 * resposta `200` com o padrão do sistema, nunca `404`.
 */
const API_POLICY = '../../../api-transportada/src/trips/domain/daily-allowance.policy.ts'
const API_MONEY = '../../../api-transportada/src/shared/money.constant.ts'
const PANEL = '../../src/modules/company-settings/components/DriverAllowancePanel.component.tsx'
const CLIENT = '../../src/modules/company-settings/shared/driverAllowanceClient.service.ts'
const PAGE = '../../src/modules/company-settings/pages/CompanySettings.page.tsx'

/** O que o operador realmente digita num campo de dinheiro, incluindo o passo intermediário. */
const TYPED_ENTRIES = ['200,', '200.', 'R$ 200,00', '1,2,3', 'abc', '0', '200', '  ', '1.250,00']

function apiRateOrigins(): readonly string[] {
  const source = readFileSync(new URL(API_POLICY, import.meta.url), 'utf8')
  const line = source.slice(source.indexOf('DAILY_ALLOWANCE_RATE_ORIGIN = {'))
  const body = line.slice(line.indexOf('{'), line.indexOf('}'))

  return [...body.matchAll(/(\w+):\s*'(\w+)'/g)].map((match) => match[2] ?? '')
}

/**
 * Lê o `MONEY_DECIMAL` da própria API: o que o campo envia tem de passar lá. Ele deixou de morar no
 * schema da diária — sete módulos declaravam a mesma expressão, e agora ela é uma constante só.
 */
function apiMoneyPattern(): RegExp {
  const source = readFileSync(new URL(API_MONEY, import.meta.url), 'utf8')
  const declaration = source.slice(source.indexOf('MONEY_DECIMAL = '))
  const literal = declaration.slice(declaration.indexOf('/') + 1, declaration.indexOf('\n'))

  return new RegExp(literal.slice(0, literal.lastIndexOf('/')))
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

  test('typing never throws, whatever the operator writes in the field', () => {
    for (const entry of TYPED_ENTRIES) {
      const typed = typeDriverAllowanceAmount(entry)
      expect(() => buildDriverAllowanceSubmission(typed)).not.toThrow()
    }
  })

  test('the mask writes the field, so the digits enter from the right and the group shows up', () => {
    expect(typeDriverAllowanceAmount('2')).toBe('0,02')
    expect(typeDriverAllowanceAmount('200')).toBe('2,00')
    expect(typeDriverAllowanceAmount('20000')).toBe('200,00')
    expect(typeDriverAllowanceAmount('R$ 200,00')).toBe('200,00')
    expect(typeDriverAllowanceAmount('200,')).toBe('2,00')
    expect(typeDriverAllowanceAmount('1,2,3')).toBe('1,23')
    expect(typeDriverAllowanceAmount('125000000')).toBe('1.250.000,00')
    expect(typeDriverAllowanceAmount('abc')).toBe('')
  })

  test('the mask is idempotent: retyping over its own output gives the same output', () => {
    for (const entry of TYPED_ENTRIES) {
      const once = typeDriverAllowanceAmount(entry)
      expect(typeDriverAllowanceAmount(once)).toBe(once)
    }
  })

  test('the submission is the API decimal, and it is null while the field is not a daily rate', () => {
    expect(buildDriverAllowanceSubmission(typeDriverAllowanceAmount('20000'))).toBe('200.0000')
    expect(buildDriverAllowanceSubmission(typeDriverAllowanceAmount('125000'))).toBe('1250.0000')
    expect(buildDriverAllowanceSubmission('')).toBe(null)
    expect(buildDriverAllowanceSubmission('0,00')).toBe(null)
    expect(buildDriverAllowanceSubmission('200,')).toBe(null)
    expect(buildDriverAllowanceSubmission('abc')).toBe(null)
  })

  test('what the field submits passes the API money pattern, zero included', () => {
    const pattern = apiMoneyPattern()

    for (const entry of [...TYPED_ENTRIES, '125000', '999999999999999']) {
      const submission = buildDriverAllowanceSubmission(typeDriverAllowanceAmount(entry))
      if (submission === null) continue
      expect(pattern.test(submission)).toBe(true)
      expect(Number.parseFloat(submission)).toBeGreaterThan(0)
    }
  })

  test('the stored amount opens the field already masked, and the draft round-trips', () => {
    expect(startDriverAllowanceDraft(undefined)).toBe('')
    expect(
      startDriverAllowanceDraft({ amount: '200.0000', rateOrigin: 'default', updatedAt: null }),
    ).toBe('200,00')
    const stored = startDriverAllowanceDraft({
      amount: '1250.0000',
      rateOrigin: 'company',
      updatedAt: '2026-09-10T12:00:00.000Z',
    })
    expect(stored).toBe('1.250,00')
    expect(buildDriverAllowanceSubmission(stored)).toBe('1250.0000')
  })

  /**
   * ⚠️ §16: a mesma recusa redigitada em quatro saídas do cliente. Basta uma delas envelhecer e a
   * tela passa a receber dois códigos para o mesmo caso, sem que nenhum arquivo pareça errado.
   */
  test('the refusal code is written once, and the API code still wins when it comes', async () => {
    const source = readFileSync(new URL(CLIENT, import.meta.url), 'utf8')
    expect(source.match(/'DRIVER_ALLOWANCE_REQUEST_FAILED'/gu)).toHaveLength(1)

    const { createDriverAllowanceClient } = await import(
      '../../src/modules/company-settings/shared/driverAllowanceClient.service'
    )
    const client = createDriverAllowanceClient({
      apiBaseUrl: 'https://api.test',
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'DRIVER_ALLOWANCE_NOT_ALLOWED' } }), {
            status: 403,
          }),
        ),
      getAccessToken: () => Promise.resolve('token'),
    })

    expect(client.save('250.0000')).rejects.toThrow('DRIVER_ALLOWANCE_NOT_ALLOWED')
  })

  /** Corpo que não é o envelope de erro da API cai no código genérico, nunca em `undefined`. */
  test('a body without the error envelope still names the refusal', async () => {
    const { createDriverAllowanceClient } = await import(
      '../../src/modules/company-settings/shared/driverAllowanceClient.service'
    )
    const client = createDriverAllowanceClient({
      apiBaseUrl: 'https://api.test',
      fetch: () => Promise.resolve(new Response('<html>502</html>', { status: 502 })),
      getAccessToken: () => Promise.resolve('token'),
    })

    expect(client.get()).rejects.toThrow('DRIVER_ALLOWANCE_REQUEST_FAILED')
  })

  test('the panel is built from the design system', () => {
    const panel = readFileSync(new URL(PANEL, import.meta.url), 'utf8')

    expect(panel).toContain("from '@/components/ui/skeleton'")
    expect(panel).toContain("from '../shared/driverAllowanceForm.service'")
    expect(panel).not.toContain('<select')
    expect(panel).not.toContain(' title=')
  })

  test('the panel never parses the typed amount inside the handler, it goes through the service', () => {
    const panel = readFileSync(new URL(PANEL, import.meta.url), 'utf8')

    expect(panel).toContain('typeDriverAllowanceAmount(')
    expect(panel).toContain('buildDriverAllowanceSubmission(')
    expect(panel).not.toContain('parseTypedAmount(')
    expect(panel).not.toContain("replace(',', '.')")
    expect(panel).toContain('submission === null')
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
