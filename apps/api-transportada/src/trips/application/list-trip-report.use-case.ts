/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF1/RF2: uma linha por nota de viagem. O teto recusa em vez de truncar — planilha cortada
 * parece inteira. O tom da linha é da viagem inteira, não da página: vem de todas as notas dela.
 */
import { redactMoneyFields } from '../../shared/monetary-redaction.service.js'
import { resolveTripReportTone } from '../domain/resolve-trip-report-tone.policy.js'
import {
  TRIP_REPORT_CURSOR_SEPARATOR,
  TRIP_REPORT_MAX_ROWS,
} from '../domain/trip-report.constant.js'
import type {
  ListTripReportParams,
  ListTripReportResult,
  TripReportRow,
} from '../domain/trip-report.types.js'
import { TripReportTooLargeError } from '../domain/trip.error.js'
import type { TripReportPort, TripReportRecord } from './trip-report.port.js'

type FirstPageTotals = Pick<ListTripReportResult, 'excludedWithoutTrip'> & {
  readonly total: number
}

export function createListTripReportUseCase(dependencies: {
  readonly repository: TripReportPort
}): (params: ListTripReportParams) => Promise<ListTripReportResult> {
  const { repository } = dependencies

  async function readFirstPageTotals(params: ListTripReportParams): Promise<FirstPageTotals> {
    const { filters } = params.query
    const total = await repository.countRows({ companyId: params.companyId, filters })
    if (total > TRIP_REPORT_MAX_ROWS) throw new TripReportTooLargeError()
    if (filters.documentIdIn === undefined) return { total }
    const excludedWithoutTrip = await repository.countDocumentsWithoutTrip({
      companyId: params.companyId,
      documentIds: filters.documentIdIn,
    })
    return { excludedWithoutTrip, total }
  }

  return async (params) => {
    const isFirstPage = params.query.cursor === undefined
    const totals = isFirstPage ? await readFirstPageTotals(params) : undefined

    const fetched = await repository.listRows({
      companyId: params.companyId,
      query: { ...params.query, limit: params.query.limit + 1 },
    })
    const records = fetched.slice(0, params.query.limit)
    const lastRecord = records.at(-1)
    const hasNextPage = fetched.length > params.query.limit && lastRecord !== undefined

    const documentStatusesByTrip = await repository.listDocumentStatusesByTrip({
      companyId: params.companyId,
      tripIds: [...new Set(records.map((record) => record.tripId))],
    })
    const data = records.flatMap((record) => {
      const row = toReportRow({
        canReadFinancials: params.canReadFinancials,
        documentStatuses: documentStatusesByTrip.get(record.tripId) ?? [],
        record,
      })
      return row === undefined ? [] : [row]
    })

    return {
      data,
      ...(totals?.excludedWithoutTrip === undefined
        ? {}
        : { excludedWithoutTrip: totals.excludedWithoutTrip }),
      page: {
        nextCursor: hasNextPage ? encodeCursor(lastRecord) : null,
        ...(totals === undefined ? {} : { total: totals.total }),
      },
    }
  }
}

function encodeCursor(record: TripReportRecord): string {
  return [record.tripCreatedAt, record.tripId, record.tripDocumentId].join(
    TRIP_REPORT_CURSOR_SEPARATOR,
  )
}

export function toReportRow(input: {
  readonly canReadFinancials: boolean
  readonly documentStatuses: Parameters<typeof resolveTripReportTone>[1]
  readonly record: TripReportRecord
}): TripReportRow | undefined {
  const { record } = input
  const tone = resolveTripReportTone(record.tripStatus, input.documentStatuses)
  if (tone === undefined) return undefined

  return redactMoneyFields({
    canReadFinancials: input.canReadFinancials,
    fields: ['amount'],
    record: {
      accessKey: record.accessKey,
      amount: record.amount,
      contractorName: record.contractorName,
      ...(record.deliveredAt === null ? {} : { deliveredAt: record.deliveredAt.toISOString() }),
      documentNumber: record.documentNumber,
      documentSeries: record.documentSeries,
      documentStatus: record.documentStatus,
      recipientCity: record.recipientCity,
      recipientName: record.recipientName,
      recipientState: record.recipientState,
      ...(record.returnReason === null ? {} : { returnReason: record.returnReason }),
      ...(record.returnedAt === null ? {} : { returnedAt: record.returnedAt.toISOString() }),
      tone,
      tripId: record.tripId,
    },
  })
}
