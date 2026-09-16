/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { invalidRequest, readListQuery, readPaging } from '../../http/request-parsing.service.js'

const EXPORT_QUERY_KEYS = new Set(['cursor', 'from', 'limit', 'to'])

export type PackageBoxMeasurementExportListing = {
  readonly cursor: string | null
  readonly from: string | undefined
  readonly limit: number
  readonly to: string | undefined
}

/**
 * Spec 152 (T5, R8, experimental): período (`from`/`to`, ISO 8601, ambos opcionais) + cursor +
 * `limit` (teto 100, `readPaging`) — só a empresa do token filtra, resolvida no use case pelo
 * contexto, nunca aqui.
 */
export function parsePackageBoxMeasurementExportList(url: URL): PackageBoxMeasurementExportListing {
  const parameters = readListQuery(url, EXPORT_QUERY_KEYS)
  const { cursor, limit } = readPaging(parameters)
  return {
    cursor,
    from: parseIsoDateTimeFilter(parameters.get('from')),
    limit,
    to: parseIsoDateTimeFilter(parameters.get('to')),
  }
}

function parseIsoDateTimeFilter(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!z.iso.datetime().safeParse(value).success) throw invalidRequest()
  return value
}
