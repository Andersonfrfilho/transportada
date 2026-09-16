/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { composeCostParcelDetail } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'
import type {
  TripDriverCostCrewLine,
  TripValuationCostParcelBasis,
} from '@/modules/trip-financials/shared/tripValuation.service'

import financialsEn from '../../src/modules/trip-financials/locales/tripFinancials.en.locale.json'
import financialsPt from '../../src/modules/trip-financials/locales/tripFinancials.locale.json'

/**
 * Spec 143 — **a API manda a diária crua, uma linha por condutor, e a tela compõe a frase.**
 *
 * `R$ {valor} × {dias} {dia|dias} · {origem}` é o molde que
 * `freeze-trip-financial-result.use-case.ts` congela em português puro na viagem fechada; a viagem
 * aberta compõe a mesma frase aqui — as duas nunca compartilham código (apps não importam fonte uma
 * da outra), e o texto idêntico é o contrato entre elas.
 */

type Dictionary = Record<string, unknown>

/** Só string ou número — nunca `Object`, senão a interpolação estringificaria `[object Object]`. */
function toText(value: unknown): null | string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)

  return null
}

/** Um `t()` mínimo, fiel ao sufixo `_one`/`_other` do i18next, sobre o JSON real da tela. */
function translate(dictionary: Dictionary) {
  return (key: string, options?: Record<string, unknown>): string => {
    const [namespace, ...rest] = key.split('.')
    const leaf = rest.pop() ?? ''
    const count = typeof options?.count === 'number' ? options.count : undefined
    const suffixed = count === undefined ? leaf : `${leaf}${count === 1 ? '_one' : '_other'}`

    let node: unknown = dictionary[namespace ?? '']
    for (const segment of rest) {
      node = typeof node === 'object' && node !== null ? (node as Dictionary)[segment] : undefined
    }
    const template =
      typeof node === 'object' && node !== null
        ? ((node as Dictionary)[suffixed] ?? (node as Dictionary)[leaf])
        : undefined
    if (typeof template !== 'string') return toText(options?.defaultValue) ?? key

    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => toText(options?.[name]) ?? '')
  }
}

function crewMember(overrides: Partial<TripDriverCostCrewLine> = {}): TripDriverCostCrewLine {
  return {
    dailyAmount: '250.0000',
    driverId: 'driver-1',
    driverName: 'eurides dias fontes',
    paymentModel: 'aggregate',
    rateOrigin: 'driver',
    subtotal: '750.0000',
    ...overrides,
  }
}

function driverBasis(
  crew: readonly TripDriverCostCrewLine[],
  overrides: Partial<{ days: number; daysOrigin: 'estimated' | 'informed' }> = {},
): TripValuationCostParcelBasis {
  return { crew, days: 3, daysOrigin: 'estimated', of: 'driver', ...overrides }
}

describe('the driver allowance sentence is composed on the screen (spec 143)', () => {
  test('one driver, rate taken from the driver record', () => {
    const detail = composeCostParcelDetail({
      basis: driverBasis([crewMember()]),
      detail: null,
      t: translate(financialsPt),
    })

    expect(detail).toBe(`${formatAmount('250.0000')} × 3 dias · valor do motorista`)
  })

  test('a single day uses the singular form', () => {
    const detail = composeCostParcelDetail({
      basis: driverBasis([crewMember()], { days: 1 }),
      detail: null,
      t: translate(financialsPt),
    })

    expect(detail).toBe(`${formatAmount('250.0000')} × 1 dia · valor do motorista`)
  })

  test('each rate origin names itself', () => {
    const company = composeCostParcelDetail({
      basis: driverBasis([crewMember({ rateOrigin: 'company' })]),
      detail: null,
      t: translate(financialsPt),
    })
    const defaultRate = composeCostParcelDetail({
      basis: driverBasis([crewMember({ rateOrigin: 'default' })]),
      detail: null,
      t: translate(financialsPt),
    })
    const driver = composeCostParcelDetail({
      basis: driverBasis([crewMember({ rateOrigin: 'driver' })]),
      detail: null,
      t: translate(financialsPt),
    })

    expect(company).toBe(`${formatAmount('250.0000')} × 3 dias · valor geral`)
    expect(defaultRate).toBe(`${formatAmount('250.0000')} × 3 dias · valor padrão`)
    expect(driver).toBe(`${formatAmount('250.0000')} × 3 dias · valor do motorista`)
  })

  test('the thousands separator groups before the decimal comma', () => {
    const detail = composeCostParcelDetail({
      basis: driverBasis([crewMember({ dailyAmount: '1234.5600' })]),
      detail: null,
      t: translate(financialsPt),
    })

    expect(detail).toBe(`${formatAmount('1234.5600')} × 3 dias · valor do motorista`)
    expect(detail).toContain('1.234,56')
  })

  test('two drivers become two sentences, separated by "; ", in crew order', () => {
    const detail = composeCostParcelDetail({
      basis: driverBasis([
        crewMember({ dailyAmount: '250.0000', driverId: 'a', rateOrigin: 'driver' }),
        crewMember({ dailyAmount: '180.0000', driverId: 'b', rateOrigin: 'company' }),
      ]),
      detail: null,
      t: translate(financialsPt),
    })

    expect(detail).toBe(
      `${formatAmount('250.0000')} × 3 dias · valor do motorista; ${formatAmount('180.0000')} × 3 dias · valor geral`,
    )
  })

  /**
   * ⚠️ Compatibilidade: resultado congelado antes desta spec guarda o código da lacuna, ou a frase
   * já composta, direto em `detail` — sem `basis`, o texto sobe cru, sem tradução.
   */
  test('without a structured basis the raw detail text is shown as-is (frozen result)', () => {
    const legacyText = '3.000 (CAJURU) · vuc'
    const detail = composeCostParcelDetail({
      basis: null,
      detail: legacyText,
      t: translate(financialsEn),
    })

    expect(detail).toBe(legacyText)
  })

  test('the sentence matches the one the API freezes, word for word', () => {
    const source = readFileSync(
      new URL(
        '../../../api-transportada/src/trips/application/freeze-trip-financial-result.use-case.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toContain("const dayLabel = days === 1 ? 'dia' : 'dias'")
    expect(source).toContain(
      '`R$ ${formatCurrencyText(dailyAmount)} × ${days} ${dayLabel} · ${DAILY_ALLOWANCE_RATE_ORIGIN_LABEL[rateOrigin]}`',
    )
    expect(source).toContain("company: 'valor geral'")
    expect(source).toContain("default: 'valor padrão'")
    expect(source).toContain("driver: 'valor do motorista'")
  })
})

/** Por texto de fonte: a API não formata moeda nem pluraliza — isso é da tela, sempre. */
describe('the domain stays raw for the frontend to translate (spec 143)', () => {
  test('both screens that print a cost parcel gap use the shared composer', () => {
    const ledger = readFileSync(
      new URL(
        '../../src/modules/trip-financials/components/ValuationLedger.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    const suggestion = readFileSync(
      new URL(
        '../../src/modules/routing/components/SuggestionVehicleValuation.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(ledger).toContain('composeCostParcelDetail')
    expect(suggestion).toContain('composeCostParcelDetail')
  })
})
