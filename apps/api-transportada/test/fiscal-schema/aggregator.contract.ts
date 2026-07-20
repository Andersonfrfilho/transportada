import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  auditLogs,
  companyFiscalProfiles,
  digitalCertificates,
  directAuditLogs,
  directCompanyFiscalProfiles,
  directDigitalCertificates,
  directFiscalSequenceReservations,
  directFiscalSequences,
  directIdempotencyRecords,
  fiscalSequenceReservations,
  fiscalSequences,
  idempotencyRecords,
} from './tables.js'

describe('tenant fiscal schema', () => {
  test('exports the six fiscal tables through the database schema aggregator', () => {
    expect(companyFiscalProfiles).toBe(directCompanyFiscalProfiles)
    expect(digitalCertificates).toBe(directDigitalCertificates)
    expect(fiscalSequences).toBe(directFiscalSequences)
    expect(fiscalSequenceReservations).toBe(directFiscalSequenceReservations)
    expect(idempotencyRecords).toBe(directIdempotencyRecords)
    expect(auditLogs).toBe(directAuditLogs)

    expect(
      [
        companyFiscalProfiles,
        digitalCertificates,
        fiscalSequences,
        fiscalSequenceReservations,
        idempotencyRecords,
        auditLogs,
      ].map((table) => getTableConfig(table).name),
    ).toEqual([
      'company_fiscal_profiles',
      'digital_certificates',
      'fiscal_sequences',
      'fiscal_sequence_reservations',
      'idempotency_records',
      'audit_logs',
    ])
  })
})
