/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import {
  TRIP_COLUMN_KEYS,
  sortTrips,
  visibleTripColumns,
  type TripSortState,
} from '../../src/modules/trip/shared/tripTable.service'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import type { Trip, TripAmounts } from '../../src/modules/trip/shared/trip.types'

const TABLE = new URL('../../src/modules/trip/components/TripTable.component.tsx', import.meta.url)
const WORKSPACE_PAGE = new URL(
  '../../src/modules/trip/pages/TripWorkspace.page.tsx',
  import.meta.url,
)
const TABLE_HOOK = new URL('../../src/modules/trip/hooks/useTripTable.hook.ts', import.meta.url)

function tripOf(id: string, amounts: TripAmounts | null): Trip {
  return {
    amounts,
    companyId: 'empresa-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    driverNames: [],
    id,
    requiresMdfe: null,
    requiresMdfeReason: null,
    status: 'draft',
    updatedAt: '2026-09-01T10:00:00.000Z',
    vehicleId: 'veiculo-1',
  }
}

function amountsOf(overrides: Partial<TripAmounts> = {}): TripAmounts {
  return {
    documentsTotal: '1000.0000',
    revenueSource: 'estimated',
    revenueTotal: '100.0000',
    ...overrides,
  }
}

const sortBy = (column: 'cargoValue' | 'revenue', direction: 'asc' | 'desc'): TripSortState => ({
  column,
  direction,
})

describe('as colunas de dinheiro da listagem de viagens', () => {
  it('fica entre o veículo e as datas, que é onde o olho procura', () => {
    expect([...TRIP_COLUMN_KEYS]).toEqual([
      'vehicleId',
      'status',
      'cargoValue',
      'revenue',
      'createdAt',
      'updatedAt',
    ])
  })

  /**
   * ⚠️ **Dinheiro não se ordena por texto.** `'900,00'` vem depois de `'1.000,00'` no alfabeto, e a
   * coluna diria que a viagem menor é a maior — errado de um jeito que ninguém confere, porque a
   * lista *parece* ordenada.
   */
  it('ordena pelo número, não pela grafia do número', () => {
    const items = [
      tripOf('a', amountsOf({ documentsTotal: '900.0000' })),
      tripOf('b', amountsOf({ documentsTotal: '1000.0000' })),
    ]

    expect(sortTrips(items, sortBy('cargoValue', 'asc')).map((row) => row.id)).toEqual(['a', 'b'])
    expect(sortTrips(items, sortBy('cargoValue', 'desc')).map((row) => row.id)).toEqual(['b', 'a'])
  })

  /**
   * ⚠️ **Ausência vai para o fim nos dois sentidos.** Ela não é o menor valor — é a falta dele —, e
   * inverter a ordem não pode promover ao topo justamente as linhas sem número.
   */
  it('mantém o desconhecido no fim, ordenando para cima ou para baixo', () => {
    const items = [
      tripOf('sem', amountsOf({ documentsTotal: null })),
      tripOf('com', amountsOf({ documentsTotal: '10.0000' })),
    ]

    expect(sortTrips(items, sortBy('cargoValue', 'asc')).at(-1)?.id).toBe('sem')
    expect(sortTrips(items, sortBy('cargoValue', 'desc')).at(-1)?.id).toBe('sem')
  })

  it('trata a viagem sem conta nenhuma como desconhecida, não como zero', () => {
    const items = [tripOf('sem', null), tripOf('com', amountsOf({ revenueTotal: '5.0000' }))]

    expect(sortTrips(items, sortBy('revenue', 'asc')).at(-1)?.id).toBe('sem')
  })

  /**
   * ⚠️ **O contrato de tela, e é o que este arquivo existe para travar.** A receita da listagem sai
   * da parametrização de frete, sem CT-e emitido. Um valor previsto lido como realizado é o erro que
   * só aparece na conciliação do mês, e o número sozinho não tem como avisar.
   *
   * Mesma regra da ocupação da viagem: a marca vem junto do número, e nenhuma condição a esconde.
   */
  it('imprime a marca de previsão junto do número, e só a dispensa no realizado', () => {
    const source = readFileSync(TABLE, 'utf8')

    expect(source).toContain('table.revenueEstimated')
    /** A única condição legítima: realizado não leva marca. Qualquer outra esconderia a previsão. */
    expect(source).toContain("amounts.revenueSource === 'measured' ? null : (")
  })

  /** Sem regra de frete cadastrada não há número: zero seria uma resposta inventada. */
  it('não imprime valor quando não há regra aplicável', () => {
    const source = readFileSync(TABLE, 'utf8')

    expect(source).toContain("amounts.revenueSource === 'missing'")
    expect(source).toContain('table.revenueMissing')
  })

  it('publica os rótulos das duas colunas e das três ausências', () => {
    expect(trip.columns.cargoValue.length).toBeGreaterThan(0)
    expect(trip.columns.revenue.length).toBeGreaterThan(0)
    expect(trip.table.noAmount.length).toBeGreaterThan(0)
    expect(trip.table.revenueEstimated.length).toBeGreaterThan(0)
    expect(trip.table.revenueMissing.length).toBeGreaterThan(0)
  })

  /**
   * Spec 156 L6 (ADR-0049, spec 061 D4): sem `trip.financials` a API tira `amounts` da linha. A
   * coluna não pode continuar lá dizendo "sem valor" — seria afirmar que a viagem não tem carga
   * valorada, quando o que falta é a permissão. A coluna sai, como o painel de resultado do detalhe.
   */
  it('tira as duas colunas de dinheiro de quem não tem trip.financials', () => {
    expect([...visibleTripColumns({ canReadFinancials: false })]).toEqual([
      'vehicleId',
      'status',
      'createdAt',
      'updatedAt',
    ])
    expect([...visibleTripColumns({ canReadFinancials: true })]).toEqual([...TRIP_COLUMN_KEYS])
  })

  it('desenha o cabeçalho e as células pelas colunas visíveis, nunca pela lista inteira', () => {
    const table = readFileSync(TABLE, 'utf8')
    const hook = readFileSync(TABLE_HOOK, 'utf8')

    expect(table).not.toContain('TRIP_COLUMN_KEYS')
    expect(table.match(/table\.columns\.map/g)?.length).toBe(2)
    expect(hook).toContain('permissions.includes(FINANCIALS_PERMISSION)')
  })

  /** A linha recortada não pode derrubar a lista inteira: ausente e `null` passam, forma errada não. */
  it('aceita a linha da listagem sem amounts, com null e com o objeto', () => {
    const adapters = createTripResponseAdapters()
    const withoutAmounts = Object.fromEntries(
      Object.entries(tripOf('recortada', amountsOf())).filter(([key]) => key !== 'amounts'),
    )
    const page = (row: unknown) => ({ data: [row], page: { nextCursor: null } })

    expect(adapters.tripListFromApi(page(withoutAmounts)).items[0]?.amounts).toBeUndefined()
    expect(adapters.tripListFromApi(page(tripOf('nula', null))).items[0]?.amounts).toBeNull()
    expect(adapters.tripListFromApi(page(tripOf('cheia', amountsOf()))).items[0]?.amounts).toEqual(
      amountsOf(),
    )
    expect(() => adapters.tripListFromApi(page({ ...withoutAmounts, amounts: {} }))).toThrow()
  })

  /**
   * O esqueleto desenhava as seis colunas para todo mundo — e só cinco células por linha, porque as
   * duas de dinheiro entraram sem célula. Ele segue as colunas da tabela real: com a lista pedida, as
   * do `useTripTable`; antes de saber a permissão, as sem dinheiro, para nunca anunciar o que a
   * pessoa pode não ter.
   */
  it('desenha o esqueleto pelas mesmas colunas, uma célula por cabeçalho', () => {
    const page = readFileSync(WORKSPACE_PAGE, 'utf8')

    expect(page).not.toContain('TRIP_COLUMN_KEYS')
    expect(page).toContain('<TripsTableSkeleton columns={table.columns} />')
    expect(page).toContain(
      '<TripsTableSkeleton columns={visibleTripColumns({ canReadFinancials: false })} />',
    )
    expect(page.match(/columns\.map\(\(column\) =>/g)?.length).toBe(2)
  })
})
