import {
  auditLogs,
  companyFiscalProfiles,
  digitalCertificates,
  fiscalSequenceReservations,
  fiscalSequences,
  idempotencyRecords,
} from '../../src/database/database.schema.js'
import {
  auditLogs as directAuditLogs,
  companyFiscalProfiles as directCompanyFiscalProfiles,
  digitalCertificates as directDigitalCertificates,
  fiscalSequenceReservations as directFiscalSequenceReservations,
  fiscalSequences as directFiscalSequences,
  idempotencyRecords as directIdempotencyRecords,
} from '../../src/database/fiscal.schema.js'

export {
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
}
