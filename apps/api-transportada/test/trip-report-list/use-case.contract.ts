/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import type { TripDocumentSeparationStatus } from '../../src/database/trip.schema.js'
import { createListTripReportUseCase } from '../../src/trips/application/list-trip-report.use-case.js'
import type {
  TripReportPort,
  TripReportRecord,
} from '../../src/trips/application/trip-report.port.js'
import { TRIP_REPORT_MAX_ROWS } from '../../src/trips/domain/trip-report.constant.js'
import type { TripReportQuery } from '../../src/trips/domain/trip-report.types.js'
import { TripReportTooLargeError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_A = '00000000-0000-4000-8000-0000000000a1'
const TRIP_B = '00000000-0000-4000-8000-0000000000b1'

function buildRecord(overrides: Partial<TripReportRecord> = {}): TripReportRecord {
  return {
    accessKey: '3'.repeat(44),
    amount: '100.0000',
    contractorName: 'Contratante',
    deliveredAt: null,
    documentNumber: '10',
    documentSeries: '1',
    documentStatus: 'loaded',
    recipientCity: 'Campinas',
    recipientName: 'Destinatario',
    recipientState: 'SP',
    returnReason: null,
    returnedAt: null,
    tripCreatedAt: '2026-10-07T12:34:56.123456Z',
    tripDocumentId: crypto.randomUUID(),
    tripId: TRIP_A,
    tripStatus: 'in_transit',
    ...overrides,
  }
}

type FakeRepositoryOptions = {
  readonly records?: readonly TripReportRecord[]
  readonly statusesByTrip?: ReadonlyMap<string, readonly TripDocumentSeparationStatus[]>
  readonly total?: number
  readonly withoutTrip?: number
}

function buildFakeRepository(options: FakeRepositoryOptions = {}) {
  const calls = { countRows: 0, listRows: [] as TripReportQuery[], statuses: 0, withoutTrip: 0 }
  const repository: TripReportPort = {
    countDocumentsWithoutTrip: async () => {
      calls.withoutTrip += 1
      return options.withoutTrip ?? 0
    },
    countRows: async () => {
      calls.countRows += 1
      return options.total ?? options.records?.length ?? 0
    },
    listDocumentStatusesByTrip: async () => {
      calls.statuses += 1
      return options.statusesByTrip ?? new Map()
    },
    listRows: async ({ query }) => {
      calls.listRows.push(query)
      return options.records ?? []
    },
  }
  return { calls, repository }
}

const FIRST_PAGE: TripReportQuery = { cursor: undefined, filters: {}, limit: 2 }

describe('createListTripReportUseCase', () => {
  it('devolve as linhas com total na primeira pagina e sem proxima pagina quando cabe', async () => {
    const { repository } = buildFakeRepository({ records: [buildRecord()] })
    const result = await createListTripReportUseCase({ repository })({
      canReadFinancials: true,
      companyId: COMPANY_ID,
      query: FIRST_PAGE,
    })

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({ amount: '100.0000', tone: 'on_route', tripId: TRIP_A })
    expect(result.page).toEqual({ nextCursor: null, total: 1 })
    expect(result.excludedWithoutTrip).toBeUndefined()
  })

  it('pede uma linha a mais que o limite e codifica o cursor com microssegundos', async () => {
    const records = [
      buildRecord({ tripDocumentId: 'doc-1' }),
      buildRecord({ tripDocumentId: 'doc-2' }),
      buildRecord({ tripDocumentId: 'doc-3' }),
    ]
    const { calls, repository } = buildFakeRepository({ records })
    const result = await createListTripReportUseCase({ repository })({
      canReadFinancials: true,
      companyId: COMPANY_ID,
      query: FIRST_PAGE,
    })

    expect(calls.listRows[0]?.limit).toBe(3)
    expect(result.data).toHaveLength(2)
    expect(result.page.nextCursor).toBe(`2026-10-07T12:34:56.123456Z::${TRIP_A}::doc-2`)
  })

  it('so calcula total e excludedWithoutTrip na primeira pagina', async () => {
    const { calls, repository } = buildFakeRepository({ records: [buildRecord()], withoutTrip: 3 })
    const execute = createListTripReportUseCase({ repository })
    const documentIdIn = ['00000000-0000-4000-8000-0000000000d1']

    const first = await execute({
      canReadFinancials: true,
      companyId: COMPANY_ID,
      query: { ...FIRST_PAGE, filters: { documentIdIn } },
    })
    const next = await execute({
      canReadFinancials: true,
      companyId: COMPANY_ID,
      query: {
        cursor: { createdAt: '2026-10-07T12:34:56.123456Z', tripDocumentId: 'd', tripId: 't' },
        filters: { documentIdIn },
        limit: 2,
      },
    })

    expect(first.excludedWithoutTrip).toBe(3)
    expect(first.page.total).toBe(1)
    expect(next.excludedWithoutTrip).toBeUndefined()
    expect(next.page.total).toBeUndefined()
    expect(calls.countRows).toBe(1)
    expect(calls.withoutTrip).toBe(1)
  })

  it('recusa acima do teto sem listar nenhuma linha', async () => {
    const { calls, repository } = buildFakeRepository({ total: TRIP_REPORT_MAX_ROWS + 1 })

    await expect(
      createListTripReportUseCase({ repository })({
        canReadFinancials: true,
        companyId: COMPANY_ID,
        query: FIRST_PAGE,
      }),
    ).rejects.toBeInstanceOf(TripReportTooLargeError)
    expect(calls.listRows).toHaveLength(0)
  })

  it('aceita exatamente o teto', async () => {
    const { repository } = buildFakeRepository({ total: TRIP_REPORT_MAX_ROWS })
    const result = await createListTripReportUseCase({ repository })({
      canReadFinancials: true,
      companyId: COMPANY_ID,
      query: FIRST_PAGE,
    })

    expect(result.page.total).toBe(TRIP_REPORT_MAX_ROWS)
  })

  it('omite amount sem trip.financials, a chave some em vez de virar null', async () => {
    const { repository } = buildFakeRepository({ records: [buildRecord()] })
    const result = await createListTripReportUseCase({ repository })({
      canReadFinancials: false,
      companyId: COMPANY_ID,
      query: FIRST_PAGE,
    })

    expect(result.data[0]).toBeDefined()
    expect('amount' in (result.data[0] ?? {})).toBe(false)
  })

  it('calcula o tom por viagem com as notas da viagem inteira, nao so as da pagina', async () => {
    const records = [
      buildRecord({ documentStatus: 'returned', tripId: TRIP_A, tripStatus: 'completed' }),
      buildRecord({ documentStatus: 'returned', tripId: TRIP_B, tripStatus: 'completed' }),
      buildRecord({ documentStatus: 'pending', tripId: TRIP_B, tripStatus: 'completed' }),
    ]
    const statusesByTrip = new Map<string, readonly TripDocumentSeparationStatus[]>([
      [TRIP_A, ['returned']],
      [TRIP_B, ['returned', 'delivered']],
    ])
    const { calls, repository } = buildFakeRepository({ records, statusesByTrip })
    const result = await createListTripReportUseCase({ repository })({
      canReadFinancials: true,
      companyId: COMPANY_ID,
      query: { ...FIRST_PAGE, limit: 5 },
    })

    expect(result.data.map((row) => row.tone)).toEqual(['total_return', 'finished', 'finished'])
    expect(calls.statuses).toBe(1)
  })

  it('descarta a linha de viagem cancelada e nao devolve dado pessoal', async () => {
    const { repository } = buildFakeRepository({
      records: [buildRecord({ tripStatus: 'cancelled' }), buildRecord({ tripStatus: 'draft' })],
    })
    const result = await createListTripReportUseCase({ repository })({
      canReadFinancials: true,
      companyId: COMPANY_ID,
      query: FIRST_PAGE,
    })

    expect(result.data.map((row) => row.tone)).toEqual(['warehouse'])
    expect(JSON.stringify(result)).not.toMatch(/phone|taxId|cpf/iu)
  })
})
