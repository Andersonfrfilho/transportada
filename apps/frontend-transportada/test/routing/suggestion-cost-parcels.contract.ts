/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { buildSuggestionCostParcelLines } from '@/modules/routing/shared/suggestionCostParcelLine.service'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'
import type {
  TripDriverCostCrewLine,
  TripValuationCostParcel,
} from '@/modules/trip-financials/shared/tripValuation.service'

/** Só primitivo entra na frase — objeto viraria `[object Object]` calado. */
function readOption(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
}

/** Devolve a chave e os valores interpolados: prova o que a frase carrega sem depender do locale. */
const translate: Translate = (key, options) =>
  options === undefined
    ? key
    : `${key}[${readOption(options.amount)}|${readOption(options.days)}|${readOption(options.origin)}]`

function buildCrewLine(overrides: Partial<TripDriverCostCrewLine> = {}): TripDriverCostCrewLine {
  return {
    dailyAmount: '200.0000',
    driverId: '00000000-0000-4000-8000-000000000801',
    driverName: 'Condutor',
    paymentModel: 'aggregate',
    rateOrigin: 'company',
    subtotal: '600.0000',
    ...overrides,
  }
}

function buildDriverParcel(
  overrides: Partial<TripValuationCostParcel> = {},
): TripValuationCostParcel {
  return {
    amount: '600.0000',
    basis: { crew: [buildCrewLine()], days: 3, daysOrigin: 'informed', of: 'driver' },
    detail: null,
    gap: null,
    kind: 'driver',
    source: 'measured',
    ...overrides,
  }
}

/**
 * Spec 143: a proposta é onde se aceita ou recusa a carga. A parcela do motorista deixou de ter
 * lacuna quando a diária passou a sempre responder — e a tela, que listava só parcela com lacuna,
 * calou a frase da diária junto. Falar é o padrão: com lacuna, o motivo no lugar do número; sem
 * lacuna mas com derivação, o número e de onde ele veio.
 */
describe('as parcelas que a proposta explica (spec 143)', () => {
  test('a parcela do motorista sem lacuna aparece, com a frase da diária', () => {
    const lines = buildSuggestionCostParcelLines({ parcels: [buildDriverParcel()], t: translate })

    expect(lines).toHaveLength(1)
    expect(lines[0]?.kind).toBe('driver')
    expect(lines[0]?.gap).toBeNull()
    expect(lines[0]?.amount).toBe('600.0000')
    expect(lines[0]?.detail).toBe(
      `ledger.driverBasis[${formatAmount('200.0000')}|3|ledger.driverRateOrigin.company]`,
    )
  })

  test('dois condutores somam a viagem e somam a frase, na ordem da tripulação', () => {
    const parcel = buildDriverParcel({
      amount: '1100.0000',
      basis: {
        crew: [
          buildCrewLine(),
          buildCrewLine({
            dailyAmount: '250.0000',
            driverId: '00000000-0000-4000-8000-000000000802',
            rateOrigin: 'driver',
            subtotal: '500.0000',
          }),
        ],
        days: 3,
        daysOrigin: 'estimated',
        of: 'driver',
      },
    })

    const lines = buildSuggestionCostParcelLines({ parcels: [parcel], t: translate })

    expect(lines[0]?.detail).toBe(
      `ledger.driverBasis[${formatAmount('200.0000')}|3|ledger.driverRateOrigin.company]; ` +
        `ledger.driverBasis[${formatAmount('250.0000')}|3|ledger.driverRateOrigin.driver]`,
    )
  })

  test('a parcela com lacuna continua aparecendo, com o motivo e o detalhe crus', () => {
    const toll: TripValuationCostParcel = {
      amount: '48.0000',
      basis: null,
      detail: '2',
      gap: 'TOLL_PARTIAL',
      kind: 'toll',
      source: 'estimated',
    }

    const lines = buildSuggestionCostParcelLines({ parcels: [toll], t: translate })

    expect(lines).toHaveLength(1)
    expect(lines[0]?.gap).toBe('TOLL_PARTIAL')
    expect(lines[0]?.detail).toBe('2')
  })

  test('parcela sem lacuna e sem derivação fica de fora — o total já a contou', () => {
    const fuel: TripValuationCostParcel = {
      amount: '412.0000',
      basis: {
        kilometersPerLiter: '2.8000',
        litres: '65.5000',
        of: 'fuel',
        pricePerLiter: '6.2900',
      },
      detail: null,
      gap: null,
      kind: 'fuel',
      source: 'estimated',
    }

    expect(buildSuggestionCostParcelLines({ parcels: [fuel], t: translate })).toHaveLength(0)
  })

  test('a ordem das parcelas é a que a API mandou', () => {
    const lines = buildSuggestionCostParcelLines({
      parcels: [
        {
          amount: '0.0000',
          basis: null,
          detail: null,
          gap: 'NO_FREIGHT_RULE',
          kind: 'icms',
          source: 'missing',
        },
        buildDriverParcel(),
      ],
      t: translate,
    })

    expect(lines.map((line) => line.kind)).toEqual(['icms', 'driver'])
  })
})

/** Por texto de fonte: sem DOM nos testes, é assim que se prova que a tela usa a lista certa. */
describe('a tela da proposta lista pela derivação, não pela lacuna (spec 143)', () => {
  const component = readFileSync(
    new URL(
      '../../src/modules/routing/components/SuggestionVehicleValuation.component.tsx',
      import.meta.url,
    ),
    'utf8',
  )

  test('o filtro por lacuna saiu do componente', () => {
    expect(component).toContain('buildSuggestionCostParcelLines(')
    expect(component).not.toContain('.filter((parcel) => parcel.gap !== null)')
  })

  test('a limitação conhecida saiu junto com a causa dela', () => {
    expect(component).not.toContain('Limitação conhecida')
    expect(component).not.toContain('Fora do escopo desta task')
  })

  test('sem lacuna a tela imprime o número; com lacuna, o motivo no lugar dele', () => {
    expect(component).toContain('formatAmount(line.amount)')
    expect(component).toContain('line.gap === null')
  })
})
