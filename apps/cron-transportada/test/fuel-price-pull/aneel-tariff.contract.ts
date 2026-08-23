/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O vocabulário aqui é medido, não inferido: em 21/08/2026 o recurso
 * `fcf2906c-7c32-4b9b-a637-054e7a5234f4` devolveu 324.609 registros, e o recorte
 * B3 · Convencional · Tarifa de Aplicação, 2.668 — dos quais 586 são SCEE, a compensação da geração
 * distribuída, cuja `VlrTE` é o fio B (`34,37` contra `337,39` na mesma linha da EDP ES). Ler o SCEE
 * como tarifa comum entregaria um décimo do preço da energia sem nada reclamar.
 */
import { describe, expect, test } from 'bun:test'

import {
  ANEEL_TARIFF_MODALITY,
  ANEEL_TARIFF_RECORTE,
  ANEEL_TARIFF_SUBGROUP,
} from '../../src/fuel-price-pull/domain/aneel-tariff.constant.js'
import { selectCurrentTariffs } from '../../src/fuel-price-pull/domain/aneel-tariff.policy.js'
import { createAneelDatastoreClient } from '../../src/fuel-price-pull/infrastructure/aneel-datastore.client.js'

const BASE_URL = 'https://dadosabertos.aneel.gov.br'
const ON_DAY = '2026-08-21'

type AneelRow = Record<string, string>

function row(overrides: Partial<AneelRow> = {}): AneelRow {
  return {
    DatFimVigencia: '2027-08-06',
    DatInicioVigencia: '2026-08-07',
    DscUnidadeTerciaria: 'MWh',
    NumCNPJDistribuidora: '28152650000171',
    SigAgente: 'EDP ES',
    VlrTE: '337,39',
    VlrTUSD: '506,32',
    ...overrides,
  }
}

describe('ANEEL tariff selection', () => {
  test('keeps what is in force on the day, and lets the later start win the tie', () => {
    // Medido: Ceraçá e CEA têm duas linhas cobrindo 21/08/2026, com início diferente
    const selection = selectCurrentTariffs({
      onDay: ON_DAY,
      rows: [
        row({
          DatFimVigencia: '2026-09-29',
          DatInicioVigencia: '2025-09-30',
          NumCNPJDistribuidora: '09364804000144',
          SigAgente: 'Ceraçá',
          VlrTE: '227,70',
          VlrTUSD: '500,00',
        }),
        row({
          DatFimVigencia: '2026-09-29',
          DatInicioVigencia: '2026-01-01',
          NumCNPJDistribuidora: '09364804000144',
          SigAgente: 'Ceraçá',
          VlrTE: '227,70',
          VlrTUSD: '567,80',
        }),
        row({ DatFimVigencia: '2026-08-06', DatInicioVigencia: '2025-08-07' }),
      ],
    })

    expect(selection.tariffs).toEqual([
      {
        distributorCode: 'CERAÇÁ',
        distributorTaxId: '09364804000144',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-09-29',
        modality: ANEEL_TARIFF_MODALITY,
        subgroup: ANEEL_TARIFF_SUBGROUP,
        tePerMegawattHour: '227.7000',
        tusdPerMegawattHour: '567.8000',
      },
    ])
    expect(selection.discardedRows).toBe(0)
  })

  /**
   * A sigla vem em caixa mista em sete distribuidoras da fonte (`Ceraçá`, `Neoenergia PE`, …). Sem
   * uma grafia só, a mesma concessionária viraria duas linhas e a escolha da empresa apontaria para
   * a que não foi coletada nesta semana.
   */
  test('reads the comma decimal, including the leading-comma form, in exact scale', () => {
    const selection = selectCurrentTariffs({
      onDay: ON_DAY,
      rows: [row({ VlrTE: ',38', VlrTUSD: '467,21' })],
    })

    expect(selection.tariffs[0]).toMatchObject({
      tePerMegawattHour: '0.3800',
      tusdPerMegawattHour: '467.2100',
    })
  })

  test('discards the row published in another unit instead of reading kW as MWh', () => {
    const selection = selectCurrentTariffs({
      onDay: ON_DAY,
      rows: [row({ DscUnidadeTerciaria: 'kW' }), row()],
    })

    expect(selection.discardedRows).toBe(1)
    expect(selection.tariffs).toHaveLength(1)
  })

  test('discards the nameless distributor and the document that is not a CNPJ', () => {
    const selection = selectCurrentTariffs({
      onDay: ON_DAY,
      rows: [
        row({ SigAgente: 'Não Informado' }),
        row({ NumCNPJDistribuidora: '123', SigAgente: 'CERFOX' }),
        row({ SigAgente: '   ' }),
      ],
    })

    expect(selection.tariffs).toBeEmpty()
    expect(selection.discardedRows).toBe(3)
  })

  test('refuses a pair that adds up to nothing, as the check in the database does', () => {
    const selection = selectCurrentTariffs({
      onDay: ON_DAY,
      rows: [row({ VlrTE: ',00', VlrTUSD: ',00' })],
    })

    expect(selection.tariffs).toBeEmpty()
    expect(selection.discardedRows).toBe(1)
  })
})

describe('ANEEL datastore client', () => {
  function createClient(input: {
    readonly pages: readonly { readonly records: readonly AneelRow[]; readonly total: number }[]
  }): {
    readonly client: ReturnType<typeof createAneelDatastoreClient>
    readonly requests: string[]
  } {
    const requests: string[] = []
    const client = createAneelDatastoreClient({
      baseUrl: BASE_URL,
      fetch: (url) => {
        requests.push(url)
        const page = input.pages[requests.length - 1]

        if (page === undefined) {
          throw new Error('unexpected page')
        }

        return Promise.resolve(
          new Response(JSON.stringify({ result: { ...page }, success: true }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
        )
      },
      timeoutInMilliseconds: 15_000,
    })

    return { client, requests }
  }

  test('asks the datastore for the recorte, and pages until the total is covered', async () => {
    const { client, requests } = createClient({
      pages: [
        { records: [row()], total: 2 },
        {
          records: [row({ SigAgente: 'CERFOX', NumCNPJDistribuidora: '97505838000179' })],
          total: 2,
        },
      ],
    })

    const series = await client.fetchCurrentTariffs({ onDay: ON_DAY })
    const filters = new URL(requests[0] ?? '').searchParams.get('filters') ?? '{}'

    expect(JSON.parse(filters)).toEqual({ ...ANEEL_TARIFF_RECORTE })
    expect(requests).toHaveLength(2)
    expect(new URL(requests[1] ?? '').searchParams.get('offset')).not.toBeNull()
    expect(series.tariffs.map((tariff) => tariff.distributorCode)).toEqual(['EDP ES', 'CERFOX'])
  })

  test('a refused page aborts the collection instead of writing half a series', async () => {
    const client = createAneelDatastoreClient({
      baseUrl: BASE_URL,
      fetch: () => Promise.resolve(new Response('nope', { status: 503 })),
      timeoutInMilliseconds: 15_000,
    })

    await expect(client.fetchCurrentTariffs({ onDay: ON_DAY })).rejects.toThrow(
      'ANEEL_TARIFF_UNAVAILABLE',
    )
  })

  test('a body that is not the datastore envelope aborts the same way', async () => {
    const client = createAneelDatastoreClient({
      baseUrl: BASE_URL,
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ success: false }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
        ),
      timeoutInMilliseconds: 15_000,
    })

    await expect(client.fetchCurrentTariffs({ onDay: ON_DAY })).rejects.toThrow(
      'ANEEL_MALFORMED_RESPONSE',
    )
  })
})
