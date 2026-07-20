/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq, lt, or, sql } from 'drizzle-orm'

import { digitalCertificates } from '../../database/database.schema.js'
import type {
  DigitalCertificateCursor,
  DigitalCertificateMetadata,
} from '../application/digital-certificate.port.js'
import type { DigitalCertificateDatabase } from './drizzle-digital-certificate.types.js'

export async function listDigitalCertificates(input: {
  readonly companyId: string
  readonly cursor?: DigitalCertificateCursor
  readonly database: DigitalCertificateDatabase
  readonly limit: number
}): Promise<{
  readonly items: readonly DigitalCertificateMetadata[]
  readonly nextCursor?: DigitalCertificateCursor
}> {
  const records = await input.database
    .select({
      createdAt: cursorTimestamp(),
      expiresAt: digitalCertificates.expiresAt,
      id: digitalCertificates.id,
      purpose: digitalCertificates.purpose,
      status: digitalCertificates.status,
      validFrom: digitalCertificates.validFrom,
      version: digitalCertificates.version,
    })
    .from(digitalCertificates)
    .where(listCondition(input))
    .orderBy(desc(cursorTimestamp()), desc(digitalCertificates.id))
    .limit(input.limit + 1)
  const items = records.slice(0, input.limit).map(toMetadata)
  const lastItem = items.at(-1)
  return {
    items,
    ...(records[input.limit] === undefined || lastItem === undefined
      ? {}
      : { nextCursor: { createdAt: lastItem.createdAt, id: lastItem.id } }),
  }
}

function listCondition(input: {
  readonly companyId: string
  readonly cursor?: DigitalCertificateCursor
}) {
  const company = eq(digitalCertificates.companyId, input.companyId)
  if (input.cursor === undefined) return company
  const createdAt = cursorTimestamp()
  return and(
    company,
    or(
      lt(createdAt, input.cursor.createdAt),
      and(eq(createdAt, input.cursor.createdAt), lt(digitalCertificates.id, input.cursor.id)),
    ),
  )
}

function cursorTimestamp() {
  return sql<Date>`date_trunc('milliseconds', ${digitalCertificates.createdAt})`
}

function toMetadata(record: DigitalCertificateMetadata): DigitalCertificateMetadata {
  return record
}
