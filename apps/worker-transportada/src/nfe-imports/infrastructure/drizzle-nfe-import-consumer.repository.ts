/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { ImportedNfeXml, NfeXmlDocument, NfeXmlParty } from '@adatechnology/fiscal-provider'
import { and, eq } from 'drizzle-orm'

import {
  companyFiscalProfiles,
  type NfeImportSource,
  nfeAddresses,
  nfeDocuments,
  nfeEvents,
  nfeImportItems,
  nfeImports,
  nfeParticipants,
  nfeProducts,
  nfeVolumes,
  storedObjects,
} from '../../database/nfe.schema.js'
import { NFE_PARTICIPANT_ROLE } from '../domain/nfe-participant-role.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const XML_MIME_TYPE = 'application/xml'
const DEFAULT_STORAGE_PROVIDER = 'minio'

type NfeImportSafeError = {
  readonly code: string
  readonly message: string
}

type NfeImportItemProcessingStatus = 'duplicated' | 'failed' | 'imported' | 'invalid' | 'rejected'

type NfeImportStoredObject = {
  readonly bucket: string
  readonly key: string
  readonly objectId: string
  readonly sha256: string
  readonly sizeBytes: number
}

type PendingImportItem = {
  readonly attempt: number
  readonly id: string
  readonly importId: string
  readonly ordinal: number
  readonly sourceContentType: 'application/xml' | 'application/zip'
  readonly sourceEntry: string
  readonly sourceKey: string
  readonly sourceName: string
  readonly sourceSha256: string
}

type PendingImportAggregate = {
  readonly companyCnpj: string
  readonly companyId: string
  readonly id: string
  readonly items: readonly PendingImportItem[]
}

type NfeImportConsumerSummary = {
  readonly duplicatedCount: number
  readonly failedCount: number
  readonly id: string
  readonly importedCount: number
  readonly invalidCount: number
  readonly processedCount: number
  readonly receivedCount: number
  readonly rejectedCount: number
  readonly status: 'completed' | 'failed' | 'partially_processed'
}

type CompleteItemInput = {
  readonly accessKey?: string
  readonly error?: NfeImportSafeError
  readonly finalObject?: NfeImportStoredObject
  readonly itemId: string
  readonly normalizedXml?: ImportedNfeXml
  readonly status: NfeImportItemProcessingStatus
  readonly variant?: 'complete' | 'event'
}

type DrizzleNfeImportConsumerRepositoryOptions = {
  readonly storageProvider?: string
}

export class DrizzleNfeImportConsumerRepository {
  readonly #database: Database
  readonly #storageProvider: string

  constructor(database: Database, options: DrizzleNfeImportConsumerRepositoryOptions = {}) {
    this.#database = database
    this.#storageProvider = options.storageProvider ?? DEFAULT_STORAGE_PROVIDER
  }

  async getPendingImport(input: {
    readonly companyId: string
    readonly importId: string
  }): Promise<PendingImportAggregate | null> {
    const [importRow] = await this.#database
      .select({ id: nfeImports.id })
      .from(nfeImports)
      .where(and(eq(nfeImports.companyId, input.companyId), eq(nfeImports.id, input.importId)))
      .limit(1)
    if (importRow === undefined) {
      return null
    }

    const [profile] = await this.#database
      .select({ cnpj: companyFiscalProfiles.cnpj })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)
    if (profile === undefined) {
      throw new Error('NFE_IMPORT_MISSING_FISCAL_PROFILE')
    }

    const itemRows = await this.#database
      .select({
        attempt: nfeImportItems.attempt,
        id: nfeImportItems.id,
        importId: nfeImportItems.importId,
        mimeType: storedObjects.mimeType,
        ordinal: nfeImportItems.ordinal,
        sourceEntry: nfeImportItems.sourceEntry,
        sourceKey: storedObjects.objectKey,
        sourceName: nfeImportItems.sourceName,
        sourceSha256: nfeImportItems.sourceSha256,
      })
      .from(nfeImportItems)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.companyId, nfeImportItems.companyId),
          eq(storedObjects.id, nfeImportItems.sourceObjectId),
        ),
      )
      .where(
        and(
          eq(nfeImportItems.companyId, input.companyId),
          eq(nfeImportItems.importId, input.importId),
        ),
      )
      .orderBy(nfeImportItems.ordinal)

    return {
      companyCnpj: profile.cnpj,
      companyId: input.companyId,
      id: input.importId,
      items: itemRows.map((row) => ({
        attempt: Number(row.attempt),
        id: row.id,
        importId: row.importId,
        ordinal: Number(row.ordinal),
        sourceContentType: row.mimeType === 'application/zip' ? 'application/zip' : XML_MIME_TYPE,
        sourceEntry: row.sourceEntry,
        sourceKey: row.sourceKey,
        sourceName: row.sourceName,
        sourceSha256: row.sourceSha256,
      })),
    }
  }

  async findExistingDocument(input: {
    readonly accessKey: string
    readonly companyId: string
  }): Promise<{ readonly documentId: string } | null> {
    const [row] = await this.#database
      .select({ id: nfeDocuments.id })
      .from(nfeDocuments)
      .where(
        and(
          eq(nfeDocuments.companyId, input.companyId),
          eq(nfeDocuments.accessKey, input.accessKey),
        ),
      )
      .limit(1)

    return row === undefined ? null : { documentId: row.id }
  }

  async completeItem(input: CompleteItemInput): Promise<void> {
    const [item] = await this.#database
      .select({
        companyId: nfeImportItems.companyId,
        importId: nfeImportItems.importId,
      })
      .from(nfeImportItems)
      .where(eq(nfeImportItems.id, input.itemId))
      .limit(1)
    if (item === undefined) {
      throw new Error('NFE_IMPORT_ITEM_NOT_FOUND')
    }

    if (input.status !== 'imported') {
      await this.#database
        .update(nfeImportItems)
        .set({
          ...(input.accessKey === undefined ? {} : { accessKey: input.accessKey }),
          ...(input.error === undefined ? {} : { error: input.error }),
          ...(input.variant === undefined ? {} : { variant: input.variant }),
          status: input.status,
          updatedAt: new Date(),
        })
        .where(eq(nfeImportItems.id, input.itemId))
      return
    }

    if (input.finalObject === undefined || input.normalizedXml === undefined) {
      throw new Error('NFE_IMPORT_IMPORTED_ITEM_MISSING_FINAL_OBJECT')
    }

    const [importRow] = await this.#database
      .select({
        requestedByUserId: nfeImports.requestedByUserId,
        source: nfeImports.source,
      })
      .from(nfeImports)
      .where(and(eq(nfeImports.companyId, item.companyId), eq(nfeImports.id, item.importId)))
      .limit(1)
    if (importRow === undefined) {
      throw new Error('NFE_IMPORT_NOT_FOUND')
    }

    const normalizedXml = input.normalizedXml
    const finalObject = input.finalObject

    await this.#database.transaction(async (tx) => {
      await tx
        .insert(storedObjects)
        .values({
          bucket: finalObject.bucket,
          companyId: item.companyId,
          id: finalObject.objectId,
          mimeType: XML_MIME_TYPE,
          objectKey: finalObject.key,
          provider: this.#storageProvider,
          purpose: normalizedXml.kind === 'nfe-event' ? 'nfe_event' : 'nfe_document',
          sha256: finalObject.sha256,
          sizeBytes: BigInt(finalObject.sizeBytes),
          status: 'final',
        })
        .onConflictDoNothing({
          target: [
            storedObjects.companyId,
            storedObjects.provider,
            storedObjects.bucket,
            storedObjects.objectKey,
          ],
        })

      if (normalizedXml.kind === 'nfe-event') {
        await tx
          .insert(nfeEvents)
          .values({
            companyId: item.companyId,
            eventSequence: BigInt(normalizedXml.event.sequence),
            eventType: normalizedXml.event.type,
            occurredAt: new Date(normalizedXml.event.occurredAt),
            targetAccessKey: normalizedXml.event.accessKey,
            xmlObjectId: finalObject.objectId,
          })
          .onConflictDoNothing({
            target: [
              nfeEvents.companyId,
              nfeEvents.targetAccessKey,
              nfeEvents.eventType,
              nfeEvents.eventSequence,
            ],
          })
      } else {
        const document = normalizedXml.document
        const [created] = await tx
          .insert(nfeDocuments)
          .values({
            accessKey: document.accessKey,
            additionalInformation: document.additionalInformation ?? null,
            authorizationProtocol: document.protocol?.number ?? null,
            companyId: item.companyId,
            createdByUserId: importRow.requestedByUserId,
            discountValue: document.totals.discount ?? '0',
            freightValue: document.totals.freight ?? '0',
            importId: item.importId,
            insuranceValue: document.totals.insurance ?? '0',
            issuedAt: new Date(document.issuedAt),
            model: document.model,
            number: document.number,
            operationNature: document.operationNature,
            operationType: document.operationType,
            otherExpensesValue: document.totals.otherExpenses ?? '0',
            productsValue: document.totals.products,
            series: document.series,
            source: importRow.source as NfeImportSource,
            status: document.status,
            totalValue: document.totals.invoice,
            xmlObjectId: finalObject.objectId,
            xmlSha256: finalObject.sha256,
          })
          .onConflictDoNothing({ target: [nfeDocuments.companyId, nfeDocuments.accessKey] })
          .returning({ id: nfeDocuments.id })

        if (created !== undefined) {
          await writeDocumentChildren({
            companyId: item.companyId,
            document,
            documentId: created.id,
            tx,
          })
        }
      }

      await tx
        .update(nfeImportItems)
        .set({
          accessKey: input.accessKey ?? resolveAccessKey(normalizedXml),
          status: 'imported',
          updatedAt: new Date(),
          variant: input.variant ?? (normalizedXml.kind === 'nfe-event' ? 'event' : 'complete'),
        })
        .where(eq(nfeImportItems.id, input.itemId))
    })
  }

  async finalizeImport(input: {
    readonly importId: string
    readonly summary: NfeImportConsumerSummary
  }): Promise<NfeImportConsumerSummary> {
    await this.#database
      .update(nfeImports)
      .set({
        duplicatedCount: BigInt(input.summary.duplicatedCount),
        failedCount: BigInt(input.summary.failedCount),
        importedCount: BigInt(input.summary.importedCount),
        invalidCount: BigInt(input.summary.invalidCount),
        processedCount: BigInt(input.summary.processedCount),
        receivedCount: BigInt(input.summary.receivedCount),
        rejectedCount: BigInt(input.summary.rejectedCount),
        status: input.summary.status,
        updatedAt: new Date(),
      })
      .where(eq(nfeImports.id, input.importId))

    return input.summary
  }
}

export type NfeWriteTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

type Transaction = NfeWriteTransaction

export async function writeDocumentChildren(input: {
  readonly companyId: string
  readonly document: NfeXmlDocument
  readonly documentId: string
  readonly tx: Transaction
}): Promise<void> {
  const parties = buildParties(input.document)
  if (parties.length > 0) {
    await input.tx.insert(nfeParticipants).values(
      parties.map((entry) => ({
        companyId: input.companyId,
        documentId: input.documentId,
        id: entry.id,
        legalName: entry.party.name ?? null,
        role: entry.role,
        stateRegistration: entry.party.stateRegistration ?? null,
        taxId: entry.party.taxId ?? null,
        tradeName: entry.party.tradeName ?? null,
      })),
    )

    const addresses = parties.flatMap((entry) =>
      entry.party.address === undefined
        ? []
        : [
            {
              city: entry.party.address.city ?? null,
              cityCode: entry.party.address.cityCode ?? null,
              companyId: input.companyId,
              complement: entry.party.address.complement ?? null,
              countryCode: entry.party.address.countryCode ?? null,
              district: entry.party.address.district ?? null,
              number: entry.party.address.number ?? null,
              participantId: entry.id,
              phone: entry.party.address.phone ?? null,
              postalCode: entry.party.address.postalCode ?? null,
              state: entry.party.address.state ?? null,
              street: entry.party.address.street ?? null,
            },
          ],
    )
    if (addresses.length > 0) {
      await input.tx.insert(nfeAddresses).values(addresses)
    }
  }

  if (input.document.products.length > 0) {
    await input.tx.insert(nfeProducts).values(
      input.document.products.map((product) => ({
        cfop: product.cfop,
        code: product.code,
        commercialUnit: product.commercialUnit,
        companyId: input.companyId,
        description: product.description,
        documentId: input.documentId,
        ncm: product.ncm,
        ordinal: BigInt(product.lineNumber),
        quantity: product.commercialQuantity,
        totalValue: product.totalValue,
        unitValue: product.unitValue,
      })),
    )
  }

  if (input.document.volumes.length > 0) {
    await input.tx.insert(nfeVolumes).values(
      input.document.volumes.map((volume, index) => ({
        companyId: input.companyId,
        documentId: input.documentId,
        grossWeight: volume.grossWeight ?? '0',
        netWeight: volume.netWeight ?? '0',
        ordinal: BigInt(index + 1),
        quantity: volume.quantity ?? '0',
        species: volume.species ?? null,
      })),
    )
  }
}

function buildParties(
  document: NfeXmlDocument,
): readonly { readonly id: string; readonly party: NfeXmlParty; readonly role: string }[] {
  const entries: { readonly party: NfeXmlParty | undefined; readonly role: string }[] = [
    { party: document.issuer, role: NFE_PARTICIPANT_ROLE.EMITTER },
    { party: document.recipient, role: NFE_PARTICIPANT_ROLE.RECIPIENT },
    { party: document.carrier, role: NFE_PARTICIPANT_ROLE.CARRIER },
    { party: document.pickup, role: NFE_PARTICIPANT_ROLE.PICKUP },
    { party: document.delivery, role: NFE_PARTICIPANT_ROLE.DELIVERY },
  ]

  return entries.flatMap((entry) =>
    entry.party === undefined
      ? []
      : [{ id: crypto.randomUUID(), party: entry.party, role: entry.role }],
  )
}

function resolveAccessKey(normalizedXml: ImportedNfeXml): string {
  return normalizedXml.kind === 'nfe-event'
    ? normalizedXml.event.accessKey
    : normalizedXml.document.accessKey
}
