/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  mdfeFiscalDocuments,
  mdfeIssuanceAttempts,
  mdfeIssuanceEvents,
  mdfeManifestItems,
  mdfeManifests,
  type MdfeIssuanceStatus,
  type MdfeManifestStatus,
} from '../../database/mdfe-issuance-execution.schema.js'
import { storedObjects } from '../../database/nfe.schema.js'
import type {
  MdfeIssuanceFiscalDocument,
  MdfeIssuanceWriteBack,
  MdfeIssuanceWriteBackKey,
  MdfeRejectionWriteBack,
  MdfeStoredXmlObject,
} from '../application/mdfe-issuance-consumer.effect.js'
import { MDFE_NON_SETTLED_ATTEMPT_STATUSES } from '../domain/mdfe-attempt-status.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const CANCEL_OPERATION = 'cancel'
const CLOSE_OPERATION = 'close'
const DEFAULT_STORAGE_PROVIDER = 'minio'
const ISSUE_ATTEMPT_KIND = 'issue'
const MISSING_AUTHORIZED_XML_REASON = 'authorized_xml_missing'
const MISSING_CANCELLATION_XML_REASON = 'cancellation_xml_missing'
const MISSING_CLOSURE_XML_REASON = 'closure_xml_missing'
const RECONCILIATION_EVENT = 'reconciliation_required'
const XML_MIME_TYPE = 'application/xml'

type AttemptTransition = {
  readonly eventPayload: Record<string, unknown>
  readonly key: MdfeIssuanceWriteBackKey
  readonly lastErrorCause?: string
  readonly lastErrorCode?: string
  readonly lastErrorMessage?: string
  readonly manifestStatus?: MdfeManifestStatus
  readonly settle?: (transaction: Transaction) => Promise<void>
  readonly status: MdfeIssuanceStatus
}

type RejectionTransition = {
  readonly lastErrorCode: string
  readonly lastErrorMessage?: string
  readonly payload: Record<string, string>
}

function toWriteBackKey(input: MdfeIssuanceWriteBackKey): MdfeIssuanceWriteBackKey {
  return {
    attemptId: input.attemptId,
    companyId: input.companyId,
    manifestId: input.manifestId,
    occurredAt: input.occurredAt,
  }
}

/** Recusa sem mensagem não apaga a que já está gravada — a SEFAZ nem sempre repete o texto. */
function toRejectionTransition(input: MdfeRejectionWriteBack): RejectionTransition {
  return {
    lastErrorCode: input.errorCode,
    ...(input.errorMessage === undefined ? {} : { lastErrorMessage: input.errorMessage }),
    payload: {
      errorCode: input.errorCode,
      ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage }),
    },
  }
}

export class DrizzleMdfeIssuanceWriteBackRepository implements MdfeIssuanceWriteBack {
  readonly #database: Database
  readonly #storageProvider: string

  constructor(database: Database, storageProvider: string = DEFAULT_STORAGE_PROVIDER) {
    this.#database = database
    this.#storageProvider = storageProvider
  }

  async recordInFlight(key: MdfeIssuanceWriteBackKey): Promise<void> {
    await this.#apply({ eventPayload: {}, key, status: 'in_flight' })
  }

  async recordAuthorized(
    input: MdfeIssuanceWriteBackKey & {
      readonly accessKey?: string
      readonly fiscalDocument?: MdfeIssuanceFiscalDocument
      readonly protocol?: string
    },
  ): Promise<void> {
    const { accessKey, fiscalDocument, protocol, ...key } = input
    await this.#apply({
      eventPayload: {
        ...(accessKey === undefined ? {} : { accessKey }),
        ...(protocol === undefined ? {} : { protocol }),
      },
      key,
      manifestStatus: 'authorized',
      settle: async (transaction) => {
        if (fiscalDocument === undefined) {
          await insertIssuanceEvent(transaction, {
            eventName: RECONCILIATION_EVENT,
            key,
            payload: { reason: MISSING_AUTHORIZED_XML_REASON },
          })
          return
        }

        await persistFiscalDocument(transaction, {
          document: fiscalDocument,
          key,
          storageProvider: this.#storageProvider,
        })

        await transaction
          .update(mdfeManifests)
          .set({ fiscalNumber: fiscalDocument.fiscalNumber })
          .where(
            and(eq(mdfeManifests.companyId, key.companyId), eq(mdfeManifests.id, key.manifestId)),
          )
      },
      status: 'authorized',
    })
  }

  async recordRejected(input: MdfeIssuanceWriteBackKey & MdfeRejectionWriteBack): Promise<void> {
    const key = toWriteBackKey(input)
    const { payload, ...rejection } = toRejectionTransition(input)
    await this.#apply({
      ...rejection,
      eventPayload: payload,
      key,
      manifestStatus: 'rejected',
      status: 'rejected',
    })
  }

  async recordRetryScheduled(
    input: MdfeIssuanceWriteBackKey & { readonly cause: string },
  ): Promise<void> {
    const { cause, ...key } = input
    await this.#apply({
      eventPayload: { cause },
      key,
      lastErrorCause: cause,
      status: 'retry_scheduled',
    })
  }

  async recordClosed(
    input: MdfeIssuanceWriteBackKey & {
      readonly accessKey: string
      readonly closureCityCode: string
      readonly closureProtocol: string
      readonly closureState: string
      readonly xml?: MdfeStoredXmlObject
    },
  ): Promise<void> {
    const { accessKey, closureCityCode, closureProtocol, closureState, xml, ...key } = input
    await this.#apply({
      eventPayload: { accessKey, closureCityCode, closureProtocol, closureState },
      key,
      manifestStatus: 'closed',
      settle: async (transaction) => {
        const closureXmlObjectId = await this.#resolveEventXmlObjectId(transaction, {
          key,
          reason: MISSING_CLOSURE_XML_REASON,
          xml,
        })

        await transaction
          .update(mdfeFiscalDocuments)
          .set({
            closedAt: key.occurredAt,
            closureCityCode,
            closureProtocol,
            closureState,
            status: 'closed',
            updatedAt: key.occurredAt,
            ...(closureXmlObjectId === undefined
              ? {}
              : { closureXmlObjectId, closureXmlSha256: xml?.sha256 }),
          })
          .where(
            and(
              eq(mdfeFiscalDocuments.companyId, key.companyId),
              eq(mdfeFiscalDocuments.manifestId, key.manifestId),
            ),
          )
      },
      status: 'closed',
    })
  }

  /** SEFAZ recusou o 110112: o manifesto continua autorizado e o encerramento pode ser refeito. */
  async recordClosureRejected(
    input: MdfeIssuanceWriteBackKey & MdfeRejectionWriteBack,
  ): Promise<void> {
    const key = toWriteBackKey(input)
    const { payload, ...rejection } = toRejectionTransition(input)
    await this.#apply({
      ...rejection,
      eventPayload: { ...payload, operation: CLOSE_OPERATION },
      key,
      manifestStatus: 'authorized',
      status: 'rejected',
    })
  }

  async recordCancelled(
    input: MdfeIssuanceWriteBackKey & {
      readonly accessKey: string
      readonly cancellationProtocol: string
      readonly xml?: MdfeStoredXmlObject
    },
  ): Promise<void> {
    const { accessKey, cancellationProtocol, xml, ...key } = input
    await this.#apply({
      eventPayload: { accessKey, cancellationProtocol },
      key,
      manifestStatus: 'cancelled',
      settle: async (transaction) => {
        await releaseManifestItems(transaction, key)

        const cancellationXmlObjectId = await this.#resolveEventXmlObjectId(transaction, {
          key,
          reason: MISSING_CANCELLATION_XML_REASON,
          xml,
        })

        await transaction
          .update(mdfeFiscalDocuments)
          .set({
            cancellationProtocol,
            cancelledAt: key.occurredAt,
            status: 'cancelled',
            updatedAt: key.occurredAt,
            ...(cancellationXmlObjectId === undefined
              ? {}
              : { cancellationXmlObjectId, cancellationXmlSha256: xml?.sha256 }),
          })
          .where(
            and(
              eq(mdfeFiscalDocuments.companyId, key.companyId),
              eq(mdfeFiscalDocuments.manifestId, key.manifestId),
            ),
          )
      },
      status: 'cancelled',
    })
  }

  /** SEFAZ recusou o 110111: libera a intenção para que uma nova solicitação seja possível. */
  async recordCancellationRejected(
    input: MdfeIssuanceWriteBackKey & MdfeRejectionWriteBack,
  ): Promise<void> {
    const key = toWriteBackKey(input)
    const { payload, ...rejection } = toRejectionTransition(input)
    await this.#apply({
      ...rejection,
      eventPayload: { ...payload, operation: CANCEL_OPERATION },
      key,
      manifestStatus: 'authorized',
      settle: async (transaction) => {
        await transaction
          .update(mdfeFiscalDocuments)
          .set({
            cancellationJustification: null,
            cancellationRequestedAt: null,
            updatedAt: key.occurredAt,
          })
          .where(
            and(
              eq(mdfeFiscalDocuments.companyId, key.companyId),
              eq(mdfeFiscalDocuments.manifestId, key.manifestId),
            ),
          )
      },
      status: 'rejected',
    })
  }

  /** Dead-letter: a emissão volta para `rejected` para permitir nova tentativa manual. */
  async recordFailed(input: {
    readonly attemptId: string
    readonly cause: string
    readonly companyId: string
    readonly manifestId: string
    readonly occurredAt: Date
  }): Promise<void> {
    const { cause, ...key } = input
    const [attempt] = await this.#database
      .select({ attemptKind: mdfeIssuanceAttempts.attemptKind })
      .from(mdfeIssuanceAttempts)
      .where(
        and(
          eq(mdfeIssuanceAttempts.companyId, key.companyId),
          eq(mdfeIssuanceAttempts.id, key.attemptId),
        ),
      )
      .limit(1)

    await this.#apply({
      eventPayload: { cause },
      key,
      lastErrorCause: cause,
      ...(attempt?.attemptKind === ISSUE_ATTEMPT_KIND
        ? { manifestStatus: 'rejected' as const }
        : {}),
      status: 'failed',
    })
  }

  async #resolveEventXmlObjectId(
    transaction: Transaction,
    input: {
      readonly key: MdfeIssuanceWriteBackKey
      readonly reason: string
      readonly xml: MdfeStoredXmlObject | undefined
    },
  ): Promise<string | undefined> {
    if (input.xml === undefined) {
      await insertIssuanceEvent(transaction, {
        eventName: RECONCILIATION_EVENT,
        key: input.key,
        payload: { reason: input.reason },
      })
      return undefined
    }

    return upsertStoredObject(transaction, {
      companyId: input.key.companyId,
      storageProvider: this.#storageProvider,
      xml: input.xml,
    })
  }

  async #apply(transition: AttemptTransition): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(mdfeIssuanceAttempts)
        .set({
          status: transition.status,
          updatedAt: transition.key.occurredAt,
          ...(transition.lastErrorCause === undefined
            ? {}
            : { lastErrorCause: transition.lastErrorCause }),
          ...(transition.lastErrorCode === undefined
            ? {}
            : { lastErrorCode: transition.lastErrorCode }),
          ...(transition.lastErrorMessage === undefined
            ? {}
            : { lastErrorMessage: transition.lastErrorMessage }),
        })
        .where(
          and(
            eq(mdfeIssuanceAttempts.companyId, transition.key.companyId),
            eq(mdfeIssuanceAttempts.id, transition.key.attemptId),
            inArray(mdfeIssuanceAttempts.status, MDFE_NON_SETTLED_ATTEMPT_STATUSES),
          ),
        )
        .returning({ id: mdfeIssuanceAttempts.id })

      if (updated === undefined) {
        return
      }

      await insertIssuanceEvent(transaction, {
        eventName: transition.status,
        key: transition.key,
        payload: transition.eventPayload,
      })

      await transition.settle?.(transaction)

      if (transition.manifestStatus !== undefined) {
        await transaction
          .update(mdfeManifests)
          .set({ status: transition.manifestStatus, updatedAt: transition.key.occurredAt })
          .where(
            and(
              eq(mdfeManifests.companyId, transition.key.companyId),
              eq(mdfeManifests.id, transition.key.manifestId),
            ),
          )
      }
    })
  }
}

/**
 * ADR-0017: manifesto cancelado não prende mais o CT-e. Só as linhas ainda vivas são carimbadas —
 * recarimbar apagaria a data real da saída, e o unique parcial já solta o documento na primeira.
 */
async function releaseManifestItems(
  transaction: Transaction,
  key: MdfeIssuanceWriteBackKey,
): Promise<void> {
  await transaction
    .update(mdfeManifestItems)
    .set({ releasedAt: key.occurredAt })
    .where(
      and(
        eq(mdfeManifestItems.companyId, key.companyId),
        eq(mdfeManifestItems.manifestId, key.manifestId),
        isNull(mdfeManifestItems.releasedAt),
      ),
    )
}

async function persistFiscalDocument(
  transaction: Transaction,
  input: {
    readonly document: MdfeIssuanceFiscalDocument
    readonly key: MdfeIssuanceWriteBackKey
    readonly storageProvider: string
  },
): Promise<void> {
  const xmlObjectId = await upsertStoredObject(transaction, {
    companyId: input.key.companyId,
    storageProvider: input.storageProvider,
    xml: input.document.xml,
  })

  await transaction
    .insert(mdfeFiscalDocuments)
    .values({
      accessKey: input.document.accessKey,
      attemptId: input.key.attemptId,
      authorizationProtocol: input.document.authorizationProtocol,
      authorizedAt: input.key.occurredAt,
      companyId: input.key.companyId,
      fiscalEnvironment: input.document.fiscalEnvironment,
      fiscalNumber: input.document.fiscalNumber,
      fiscalSeries: input.document.fiscalSeries,
      manifestId: input.key.manifestId,
      status: 'authorized',
      updatedAt: input.key.occurredAt,
      xmlObjectId,
      xmlSha256: input.document.xml.sha256,
    })
    .onConflictDoNothing({
      target: [mdfeFiscalDocuments.companyId, mdfeFiscalDocuments.manifestId],
    })
}

async function upsertStoredObject(
  transaction: Transaction,
  input: {
    readonly companyId: string
    readonly storageProvider: string
    readonly xml: MdfeStoredXmlObject
  },
): Promise<string> {
  const [inserted] = await transaction
    .insert(storedObjects)
    .values({
      bucket: input.xml.bucket,
      companyId: input.companyId,
      id: input.xml.objectId,
      mimeType: XML_MIME_TYPE,
      objectKey: input.xml.key,
      provider: input.storageProvider,
      purpose: 'mdfe_document',
      sha256: input.xml.sha256,
      sizeBytes: BigInt(input.xml.sizeBytes),
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
    .returning({ id: storedObjects.id })

  if (inserted !== undefined) {
    return inserted.id
  }

  const [existing] = await transaction
    .select({ id: storedObjects.id })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.companyId, input.companyId),
        eq(storedObjects.provider, input.storageProvider),
        eq(storedObjects.bucket, input.xml.bucket),
        eq(storedObjects.objectKey, input.xml.key),
      ),
    )
    .limit(1)

  if (existing === undefined) {
    throw new Error('MDFE_FISCAL_XML_OBJECT_NOT_FOUND')
  }

  return existing.id
}

async function insertIssuanceEvent(
  transaction: Transaction,
  input: {
    readonly eventName: string
    readonly key: MdfeIssuanceWriteBackKey
    readonly payload: Record<string, unknown>
  },
): Promise<void> {
  await transaction.insert(mdfeIssuanceEvents).values({
    attemptId: input.key.attemptId,
    companyId: input.key.companyId,
    eventName: input.eventName,
    manifestId: input.key.manifestId,
    occurredAt: input.key.occurredAt,
    payload: input.payload,
  })
}
