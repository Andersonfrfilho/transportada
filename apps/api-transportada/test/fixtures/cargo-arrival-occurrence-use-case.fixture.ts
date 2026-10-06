/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: a chegada, a nota e o tipo de recebimento dos contratos de caso de uso — dublês, sem
 * banco. Dados inventados.
 */
import type {
  LockedOccurrenceArrival,
  LockedOccurrenceDocument,
  ReceivingOccurrenceType,
} from '../../src/cargo-receiving/application/cargo-arrival-occurrence.types.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

export const NOW = new Date('2026-10-06T12:00:00.000Z')
export const CONTEXT = { companyId: 'company-1', userId: 'user-1' } as CompanyContext
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

export const ARRIVAL: LockedOccurrenceArrival = {
  contractorId: 'contractor-1',
  separationDueAt: new Date('2026-10-07T08:00:00.000Z'),
  status: 'open',
}
export const DOCUMENT: LockedOccurrenceDocument = {
  id: 'arrival-document-1',
  isInLiveTrip: false,
  nfeDocumentId: 'nfe-1',
  returnOccurrenceId: null,
  returnToContractor: 'none',
  separationState: 'received',
}
export const TYPE: ReceivingOccurrenceType = {
  active: true,
  allowsMultipleItems: true,
  id: 'type-1',
  itemsMode: 'optional',
  name: 'Item avariado',
  redeliveryPolicy: 'blocked',
  stage: 'receiving',
}
