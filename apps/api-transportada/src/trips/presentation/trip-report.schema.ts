/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { TRIP_DOCUMENT_SEPARATION_STATUSES, TRIP_STATUSES } from '../../database/trip.schema.js'
import {
  invalidRequest,
  parseAgainstSchema,
  parseBooleanFilter,
  parseContains,
  parseLimit,
  parseListFilter,
  parseOption,
  parseOptionList,
  parseUuidListFilter,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import {
  TRIP_REPORT_CURSOR_SEPARATOR,
  TRIP_REPORT_DEFAULT_LIMIT,
  TRIP_REPORT_NO_CONTRACTOR_MARKER,
  TRIP_REPORT_VALUE_OPERATORS,
} from '../domain/trip-report.constant.js'
import type {
  TripReportContractorFilter,
  TripReportCursor,
  TripReportFilters,
  TripReportQuery,
} from '../domain/trip-report.types.js'
import { parseIsoDateTime } from './trip.schema.js'

const INVALID_VALUE_MESSAGE = 'Invalid value.'
const MICROSECOND_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const STATE_CODE = /^[A-Z]{2}$/
const DECIMAL_AMOUNT = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?$/

/** Os parsers compartilhados com `GET /trips` lançam `ApiError` sem detalhe; aqui viram issue do Zod. */
function fromParser<TValue>(parse: (value: string) => TValue) {
  return z.string().transform((value, context): TValue => {
    try {
      return parse(value)
    } catch {
      context.addIssue({ code: 'custom', message: INVALID_VALUE_MESSAGE })
      return z.NEVER
    }
  })
}

function parseCursor(value: string): TripReportCursor {
  const [createdAt = '', tripId = '', tripDocumentId = '', ...rest] = value.split(
    TRIP_REPORT_CURSOR_SEPARATOR,
  )
  const isCreatedAtValid =
    MICROSECOND_TIMESTAMP.test(createdAt) && Number.isFinite(Date.parse(createdAt))
  if (!isCreatedAtValid || rest.length > 0) throw invalidRequest()
  return {
    createdAt,
    tripDocumentId: parseUuidPathIdentifier(tripDocumentId),
    tripId: parseUuidPathIdentifier(tripId),
  }
}

function parseContractorFilter(value: string): TripReportContractorFilter {
  const items = value.split(',')
  const marked = items.filter((item) => item === TRIP_REPORT_NO_CONTRACTOR_MARKER)
  if (marked.length > 1) throw invalidRequest()
  const identifiers = items.filter((item) => item !== TRIP_REPORT_NO_CONTRACTOR_MARKER)
  return {
    contractorIds: parseUuidListFilter(identifiers.length > 0 ? identifiers.join(',') : null) ?? [],
    includesNone: marked.length === 1,
  }
}

function parseStateCodes(value: string): readonly string[] {
  const codes = parseListFilter(value) ?? []
  if (!codes.every((code) => STATE_CODE.test(code))) throw invalidRequest()
  return codes
}

function parseDecimalAmount(value: string): string {
  if (!DECIMAL_AMOUNT.test(value)) throw invalidRequest()
  return value
}

function required<TValue>(value: TValue | undefined): TValue {
  if (value === undefined) throw invalidRequest()
  return value
}

const tripReportQuerySchema = z
  .strictObject({
    contractorIdIn: fromParser(parseContractorFilter).optional(),
    createdFrom: fromParser((value) => required(parseIsoDateTime(value))).optional(),
    createdUntil: fromParser((value) => required(parseIsoDateTime(value))).optional(),
    cursor: fromParser(parseCursor).optional(),
    documentIdIn: fromParser((value) => required(parseUuidListFilter(value))).optional(),
    documentStatusIn: fromParser((value) =>
      required(parseOptionList(value, TRIP_DOCUMENT_SEPARATION_STATUSES)),
    ).optional(),
    driverIdIn: fromParser((value) => required(parseUuidListFilter(value))).optional(),
    limit: fromParser(parseLimit).optional(),
    proofPendingEq: fromParser((value) => required(parseBooleanFilter(value))).optional(),
    recipientCityIn: fromParser((value) => required(parseListFilter(value))).optional(),
    recipientStateIn: fromParser(parseStateCodes).optional(),
    search: fromParser((value) => required(parseContains(value))).optional(),
    statusIn: fromParser((value) => required(parseOptionList(value, TRIP_STATUSES))).optional(),
    tripIdIn: fromParser((value) => required(parseUuidListFilter(value))).optional(),
    valueAmount: fromParser(parseDecimalAmount).optional(),
    valueOperator: fromParser((value) =>
      required(parseOption(value, TRIP_REPORT_VALUE_OPERATORS)),
    ).optional(),
    vehicleIdIn: fromParser((value) => required(parseUuidListFilter(value))).optional(),
  })
  .refine((fields) => fields.valueOperator === undefined || fields.valueAmount !== undefined, {
    message: 'Required with valueOperator.',
    path: ['valueAmount'],
    when: () => true,
  })
  .refine((fields) => fields.valueAmount === undefined || fields.valueOperator !== undefined, {
    message: 'Required with valueAmount.',
    path: ['valueOperator'],
    when: () => true,
  })

function readQueryRecord(url: URL): Record<string, string | readonly string[]> {
  const record: Record<string, string | readonly string[]> = {}
  for (const [key, value] of url.searchParams.entries()) {
    const previous = record[key]
    record[key] = previous === undefined ? value : [...[previous].flat(), value]
  }
  return record
}

/** Todos os erros da query voltam juntos em `details` (`INVALID_REQUEST`). */
export function parseTripReportQuery(url: URL): TripReportQuery {
  const { cursor, limit, ...filters } = parseAgainstSchema(
    tripReportQuerySchema,
    readQueryRecord(url),
  )
  return {
    cursor,
    filters: filters satisfies TripReportFilters,
    limit: limit ?? TRIP_REPORT_DEFAULT_LIMIT,
  }
}
