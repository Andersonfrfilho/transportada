/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'

import { safeLogError } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { resolvePartyByRole } from '../domain/nfe-participant-role.constant.js'

const DEFAULT_BATCH_SIZE = 100

export type NfePartyContactPendingParty = {
  readonly addressId: null | string
  readonly participantId: string
  readonly role: string
}

export type NfePartyContactPendingDocument = {
  readonly bucket: string
  readonly documentId: string
  readonly objectKey: string
  readonly parties: readonly NfePartyContactPendingParty[]
}

export type NfePartyContactApplyResult = {
  readonly addressesUpdated: number
  readonly participantsUpdated: number
}

export type NfePartyContactBackfillRepository = {
  applyPartyContacts(input: {
    readonly companyId: string
    readonly phoneByAddressId: Readonly<Record<string, string>>
    readonly tradeNameByParticipantId: Readonly<Record<string, string>>
  }): Promise<NfePartyContactApplyResult>
  listDocumentsMissingPartyContact(input: {
    readonly companyId: string
    readonly cursor: string | undefined
    readonly limit: number
  }): Promise<readonly NfePartyContactPendingDocument[]>
}

export type NfePartyContactBackfillStorage = {
  readXml(input: { readonly bucket: string; readonly key: string }): Promise<string>
}

export type NfePartyContactBackfillImporter = {
  importXml(input: { readonly xml: string }): Promise<ImportedNfeXml>
}

export type NfePartyContactBackfillResult = {
  readonly addressesUpdated: number
  readonly documentsFailed: number
  readonly documentsScanned: number
  readonly documentsSkipped: number
  readonly participantsUpdated: number
}

export type NfePartyContactBackfill = {
  execute(input: {
    readonly batchSize?: number
    readonly companyId: string
  }): Promise<NfePartyContactBackfillResult>
}

type ResolvedContacts = {
  readonly phoneByAddressId: Record<string, string>
  readonly tradeNameByParticipantId: Record<string, string>
}

export function createNfePartyContactBackfill(dependencies: {
  readonly importer: NfePartyContactBackfillImporter
  readonly logger?: WorkerLogger
  readonly repository: NfePartyContactBackfillRepository
  readonly storage: NfePartyContactBackfillStorage
}): NfePartyContactBackfill {
  return {
    async execute(input): Promise<NfePartyContactBackfillResult> {
      const limit = input.batchSize ?? DEFAULT_BATCH_SIZE
      let addressesUpdated = 0
      let documentsFailed = 0
      let documentsScanned = 0
      let documentsSkipped = 0
      let participantsUpdated = 0
      let cursor: string | undefined

      for (;;) {
        const pending = await dependencies.repository.listDocumentsMissingPartyContact({
          companyId: input.companyId,
          cursor,
          limit,
        })
        if (pending.length === 0) break

        for (const document of pending) {
          documentsScanned += 1
          try {
            const contacts = await resolveContacts({ dependencies, document })
            if (isEmpty(contacts)) {
              documentsSkipped += 1
              continue
            }
            const applied = await dependencies.repository.applyPartyContacts({
              companyId: input.companyId,
              phoneByAddressId: contacts.phoneByAddressId,
              tradeNameByParticipantId: contacts.tradeNameByParticipantId,
            })
            addressesUpdated += applied.addressesUpdated
            participantsUpdated += applied.participantsUpdated
          } catch (error: unknown) {
            documentsFailed += 1
            logFailure({ document, error, logger: dependencies.logger })
          }
        }

        cursor = pending[pending.length - 1]?.documentId
      }

      return {
        addressesUpdated,
        documentsFailed,
        documentsScanned,
        documentsSkipped,
        participantsUpdated,
      }
    },
  }
}

async function resolveContacts(input: {
  readonly dependencies: {
    readonly importer: NfePartyContactBackfillImporter
    readonly storage: NfePartyContactBackfillStorage
  }
  readonly document: NfePartyContactPendingDocument
}): Promise<ResolvedContacts> {
  const empty: ResolvedContacts = { phoneByAddressId: {}, tradeNameByParticipantId: {} }
  const xml = await input.dependencies.storage.readXml({
    bucket: input.document.bucket,
    key: input.document.objectKey,
  })
  const imported = await input.dependencies.importer.importXml({ xml })
  if (imported.kind === 'nfe-event') return empty

  const phoneByAddressId: Record<string, string> = {}
  const tradeNameByParticipantId: Record<string, string> = {}
  for (const party of input.document.parties) {
    const resolved = resolvePartyByRole({ document: imported.document, role: party.role })
    if (resolved === undefined) continue
    if (resolved.tradeName !== undefined) {
      tradeNameByParticipantId[party.participantId] = resolved.tradeName
    }
    const phone = resolved.address?.phone
    if (party.addressId !== null && phone !== undefined) phoneByAddressId[party.addressId] = phone
  }

  return { phoneByAddressId, tradeNameByParticipantId }
}

function isEmpty(contacts: ResolvedContacts): boolean {
  return (
    Object.keys(contacts.phoneByAddressId).length === 0 &&
    Object.keys(contacts.tradeNameByParticipantId).length === 0
  )
}

function logFailure(input: {
  readonly document: NfePartyContactPendingDocument
  readonly error: unknown
  readonly logger: WorkerLogger | undefined
}): void {
  if (input.logger === undefined) return
  safeLogError({
    logger: input.logger,
    message: 'nfe_party_contact_backfill_failed',
    metadata: {
      documentId: input.document.documentId,
      reason: input.error instanceof Error ? input.error.message : 'unknown',
    },
  })
}
