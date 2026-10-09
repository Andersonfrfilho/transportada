/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 259 T3.2: as colunas Ocupação e Resultado da lista de viagens. Ausência é dita (nunca 0% nem
 * 100%), a marca de estimativa anda junto do número e prejuízo não depende só de cor.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import '@/modules/shared/i18n/i18n.service'
import { TripOccupancyBars } from '@/modules/trip/components/TripOccupancyBars.component'
import { TripResultCell } from '@/modules/trip/components/TripResultCell.component'
import type { TripAmounts, TripOccupancySummary } from '@/modules/trip/shared/trip.types'
import {
  TRIP_COLUMN_KEYS,
  sortTrips,
  visibleTripColumns,
} from '@/modules/trip/shared/tripTable.service'
import { toOccupancyPercent } from '@/modules/trip/shared/tripListCells.service'
import type { Trip } from '@/modules/trip/shared/trip.types'

const FULL_OCCUPANCY: TripOccupancySummary = {
  capacityUnknownReason: null,
  volume: { documentsWithoutVolume: 0, occupancyRatio: '0.6200', source: 'measured' },
  weight: { documentsWithoutWeight: 0, payloadRatio: '0.8000', source: 'declared' },
}

function amountsOf(overrides: Partial<TripAmounts> = {}): TripAmounts {
  return {
    costTotal: '800.0000',
    hasGaps: false,
    marginPercentage: '20.00',
    marginTotal: '200.0000',
    revenueSource: 'measured',
    revenueTotal: '1000.0000',
    ...overrides,
  }
}

function bars(input: {
  hasVehicle?: boolean
  occupancy: TripOccupancySummary | null | undefined
}): string {
  return renderToStaticMarkup(
    <TripOccupancyBars hasVehicle={input.hasVehicle ?? true} occupancy={input.occupancy} />,
  )
}

describe('as colunas Ocupação e Resultado na lista de viagens (spec 259)', () => {
  it('Ocupação e Resultado entram entre as colunas e o Resultado some sem trip.financials', () => {
    expect(TRIP_COLUMN_KEYS).toContain('occupancy')
    expect(TRIP_COLUMN_KEYS).toContain('result')
    expect(visibleTripColumns({ canReadFinancials: true })).toContain('result')
    expect(visibleTripColumns({ canReadFinancials: false })).not.toContain('result')
    expect(visibleTripColumns({ canReadFinancials: false })).toContain('occupancy')
  })

  it('o percentual é o do painel de detalhe: razão vezes cem, arredondada', () => {
    expect(toOccupancyPercent('0.6249')).toBe(62)
    expect(toOccupancyPercent('0.625')).toBe(63)
    expect(toOccupancyPercent('1.66')).toBe(166)
  })

  it('ordena a coluna Resultado pela margem numérica, com a ausência no fim', () => {
    const item = (id: string, margin: string | undefined): Trip => ({
      amounts: margin === undefined ? null : amountsOf({ marginTotal: margin }),
      companyId: 'e',
      createdAt: '2026-10-01T10:00:00.000Z',
      driverNames: [],
      id,
      requiresMdfe: null,
      requiresMdfeReason: null,
      status: 'draft',
      updatedAt: '2026-10-01T10:00:00.000Z',
      vehicleId: 'v',
    })
    const rows = [item('a', '900.0000'), item('b', undefined), item('c', '-50.0000')]

    expect(sortTrips(rows, { column: 'result', direction: 'asc' }).map((row) => row.id)).toEqual([
      'c',
      'a',
      'b',
    ])
    expect(sortTrips(rows, { column: 'result', direction: 'desc' }).map((row) => row.id)).toEqual([
      'a',
      'c',
      'b',
    ])
  })
})

describe('TripOccupancyBars', () => {
  it('mostra duas barras com role=progressbar, valor e texto', () => {
    const markup = bars({ occupancy: FULL_OCCUPANCY })

    expect(markup.match(/role="progressbar"/g)).toHaveLength(2)
    expect(markup).toContain('aria-valuenow="80"')
    expect(markup).toContain('aria-valuenow="62"')
    expect(markup).toContain('aria-valuemin="0"')
    expect(markup).toContain('aria-valuemax="100"')
    expect(markup).toContain('Peso 80%')
    expect(markup).toContain('Volume 62%')
    expect(markup).not.toContain('estimado')
    expect(markup).not.toContain('parcial')
  })

  it('sem veículo diz "Sem veículo", sem barra nem porcentagem', () => {
    const markup = bars({ hasVehicle: false, occupancy: null })

    expect(markup).toContain('Sem veículo')
    expect(markup).not.toContain('progressbar')
    expect(markup).not.toContain('%')
  })

  it('peso estimado leva a marca junto do número', () => {
    const markup = bars({
      occupancy: {
        ...FULL_OCCUPANCY,
        weight: { documentsWithoutWeight: 0, payloadRatio: '0.8000', source: 'estimated' },
      },
    })

    expect(markup).toContain('Peso 80% · estimado')
  })

  it('volume parcial e nota sem medida levam a marca "parcial"', () => {
    const partial = bars({
      occupancy: {
        ...FULL_OCCUPANCY,
        volume: { documentsWithoutVolume: 0, occupancyRatio: '0.6200', source: 'partial' },
      },
    })
    const withoutVolume = bars({
      occupancy: {
        ...FULL_OCCUPANCY,
        volume: { documentsWithoutVolume: 2, occupancyRatio: '0.6200', source: 'measured' },
      },
    })

    expect(partial).toContain('Volume 62% · parcial')
    expect(withoutVolume).toContain('Volume 62% · parcial')
  })

  it('sem capacidade diz o que falta e nunca imprime 0% ou 100%', () => {
    const markup = bars({
      occupancy: { capacityUnknownReason: 'bodyTypeMissing', volume: null, weight: null },
    })

    expect(markup).toContain('sem carroceria cadastrada')
    expect(markup).toContain('sem teto de carga')
    expect(markup).not.toContain('progressbar')
    expect(markup).not.toContain('0%')
    expect(markup).not.toContain('100%')
  })

  it('carga acima do teto mostra o número real, sem aparar em 100', () => {
    const markup = bars({
      occupancy: {
        ...FULL_OCCUPANCY,
        weight: { documentsWithoutWeight: 0, payloadRatio: '1.3000', source: 'declared' },
      },
    })

    expect(markup).toContain('Peso 130% · acima do teto')
    expect(markup).not.toContain('Volume 62% · acima do teto')
  })

  it('API anterior (sem o campo) mostra "—"', () => {
    expect(bars({ occupancy: undefined })).toContain('—')
  })
})

describe('TripResultCell', () => {
  function cell(amounts: TripAmounts | null | undefined): string {
    return renderToStaticMarkup(<TripResultCell amounts={amounts} />)
  }

  it('mostra gasto, lucro e margem, sem marca quando a receita é medida e completa', () => {
    const markup = cell(amountsOf())

    expect(markup).toContain('Gasto')
    expect(markup).toContain('800,00')
    expect(markup).toContain('Lucro')
    expect(markup).toContain('200,00')
    expect(markup).toContain('20,00% de margem')
    expect(markup).not.toContain('previsto')
    expect(markup).not.toContain('parcial')
  })

  it('receita estimada marca "previsto" e lacuna marca "parcial"', () => {
    const markup = cell(amountsOf({ hasGaps: true, revenueSource: 'estimated' }))

    expect(markup).toContain('previsto')
    expect(markup).toContain('parcial')
  })

  it('prejuízo é dito com a palavra, não só pela cor', () => {
    const markup = cell(amountsOf({ marginPercentage: '-5.00', marginTotal: '-50.0000' }))

    expect(markup).toContain('Prejuízo')
    expect(markup).not.toContain('Lucro')
    expect(markup).toContain('50,00')
  })

  it('sem os campos (sem trip.financials ou API anterior) mostra "—", nunca zero', () => {
    const redacted = cell({ revenueSource: 'measured' })

    expect(redacted).toContain('—')
    expect(redacted).not.toContain('0,00')
    expect(cell(null)).toContain('—')
    expect(cell(undefined)).toContain('—')
  })
})
