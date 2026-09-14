/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { composeCostParcelDetail } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import financialsEn from '../../src/modules/trip-financials/locales/tripFinancials.en.locale.json'
import financialsPt from '../../src/modules/trip-financials/locales/tripFinancials.locale.json'

/**
 * Spec 129 — **a API manda o empate cru, e a tela compõe a frase nos dois idiomas.**
 *
 * A spec 128 media o detalhe em texto pronto, sempre em português —
 * `'3 cidades · 1.003 (FRANCA) R$ 570,00 | 2.001 (SÃO CARLOS) R$ 480,00 · toco'` — mesmo com a tela
 * em inglês. `basis.tie` sobe cru (código, cidade, decimal em string ou ausência), e
 * `composeCostParcelDetail` é quem traduz "cidade(s)" e "sem preço" e formata a moeda, no molde de
 * `ledger.driverBasis` ao lado.
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

const TIE_BASIS = {
  of: 'driver' as const,
  paymentModel: 'route_table',
  regionCity: 'FRANCA',
  regionCode: '1.003',
  tie: {
    cityCount: 3,
    zones: [
      { amount: '570.0000', city: 'FRANCA', code: '1.003' },
      { amount: null, city: 'SÃO CARLOS', code: '2.001' },
    ],
  },
  vehicleClass: 'toco',
}

describe('the tie detail is composed on the screen, in either language (spec 129)', () => {
  test('pt-BR: cities, currency and "no price" are translated', () => {
    const detail = composeCostParcelDetail({
      basis: TIE_BASIS,
      detail: null,
      t: translate(financialsPt),
    })

    expect(detail).toBe(
      `3 cidades · 1.003 (FRANCA) ${formatAmount('570.0000')} | 2.001 (SÃO CARLOS) sem preço · toco`,
    )
  })

  /** ⚠️ A moeda é sempre real brasileiro — `formatAmount` não segue o idioma da tela. */
  test('en: the words translate, the currency stays BRL', () => {
    const detail = composeCostParcelDetail({
      basis: TIE_BASIS,
      detail: null,
      t: translate(financialsEn),
    })

    expect(detail).toBe(
      `3 cities · 1.003 (FRANCA) ${formatAmount('570.0000')} | 2.001 (SÃO CARLOS) no price · toco`,
    )
  })

  test('a single tied city, in Portuguese, uses the singular form', () => {
    const detail = composeCostParcelDetail({
      basis: { ...TIE_BASIS, tie: { ...TIE_BASIS.tie, cityCount: 1 } },
      detail: null,
      t: translate(financialsPt),
    })

    expect(detail).toStartWith('1 cidade ·')
  })

  /** Com mais de um condutor, o nome de quem carrega a lacuna vem depois da classe. */
  test('the driver name, when present, comes after the vehicle class', () => {
    const detail = composeCostParcelDetail({
      basis: TIE_BASIS,
      detail: 'eurides dias fontes',
      t: translate(financialsPt),
    })

    expect(detail).toBe(
      `3 cidades · 1.003 (FRANCA) ${formatAmount('570.0000')} | 2.001 (SÃO CARLOS) sem preço · toco · eurides dias fontes`,
    )
  })

  /**
   * ⚠️ Compatibilidade: parcela sem `basis.tie` (API anterior à 129, ainda mandando a frase
   * composta em `detail`) cai no texto **cru**, sem tradução — a tela não quebra, e não inventa
   * estrutura que a resposta não tem.
   */
  test('without a structured tie the raw detail text is shown as-is', () => {
    const legacyText = '3 cidades · 1.003 (FRANCA) R$ 570,00 | 2.001 (SÃO CARLOS) sem preço · toco'
    const detail = composeCostParcelDetail({
      basis: null,
      detail: legacyText,
      t: translate(financialsEn),
    })

    expect(detail).toBe(legacyText)
  })

  test('a basis without a tie (no dispute) is untouched too', () => {
    const detail = composeCostParcelDetail({
      basis: { ...TIE_BASIS, tie: null },
      detail: null,
      t: translate(financialsPt),
    })

    expect(detail).toBeNull()
  })
})

/** Por texto de fonte: a API não formata moeda nem pluraliza — isso é da tela, sempre. */
describe('the domain stays raw for the frontend to translate (spec 129)', () => {
  test('the shared service is the only place composing the tie sentence', () => {
    const service = readFileSync(
      new URL(
        '../../src/modules/trip-financials/shared/tripCostParcelDetail.service.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(service).toContain('formatAmount')
    expect(service).toContain("t('ledger.tieCityCount'")
    expect(service).toContain("t('ledger.tieNoPrice')")
  })

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
