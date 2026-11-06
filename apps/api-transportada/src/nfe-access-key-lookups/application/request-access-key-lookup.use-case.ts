/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { nfeDistributionNotConfigured } from '../../nfe-imports/application/nfe-import.error.js'
import { accessKeyLookupConflict, accessKeyLookupQueueFull } from './nfe-access-key-lookup.error.js'
import {
  ACCESS_KEY_LOOKUP_ACTIVE_LIMIT,
  ACCESS_KEY_LOOKUP_IDEMPOTENCY_PREFIX,
  ACCESS_KEY_LOOKUP_IMPORT_AGGREGATE_TYPE,
  ACCESS_KEY_LOOKUP_QUEUED_STATUS,
  ACCESS_KEY_LOOKUP_REQUEST_OPERATION,
  ACCESS_KEY_LOOKUP_REQUESTED_EVENT,
  ACCESS_KEY_REFUSAL_WINDOW_MS,
} from './nfe-access-key-lookup.constant.js'
import type {
  AccessKeyLookupClockPort,
  IdempotencyFingerprintPort,
  NfeFiscalEnvironment,
  RequestAccessKeyLookupParams,
  RequestAccessKeyLookupResult,
  RequestAccessKeyLookupTransactionPort,
  RequestAccessKeyLookupUnitOfWorkPort,
} from './nfe-access-key-lookup.types.js'

const ENCODER = new TextEncoder()

type Dependencies = {
  readonly clock: AccessKeyLookupClockPort
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly unitOfWork: RequestAccessKeyLookupUnitOfWorkPort
}

export function createRequestAccessKeyLookupUseCase(dependencies: Dependencies) {
  return {
    execute: (request: RequestAccessKeyLookupParams): Promise<RequestAccessKeyLookupResult> =>
      dependencies.unitOfWork.execute((transaction) =>
        executeRequest({ dependencies, request, transaction }),
      ),
  }
}

async function executeRequest(input: {
  readonly dependencies: Dependencies
  readonly request: RequestAccessKeyLookupParams
  readonly transaction: RequestAccessKeyLookupTransactionPort
}): Promise<RequestAccessKeyLookupResult> {
  const { dependencies, request, transaction } = input
  const { accessKey } = request
  const companyId = request.context.companyId
  const environment = await transaction.readFiscalEnvironment({ companyId })
  if (environment === null) throw nfeDistributionNotConfigured()

  const documentId = await transaction.findDocumentId({ accessKey, companyId })
  if (documentId !== null) return { documentId, kind: 'found' }

  const locator = { accessKey, companyId, environment }
  const active = await transaction.findActiveLookup(locator)
  if (active !== null) return { kind: 'existing', lookup: active }

  const refusal = await transaction.findRecentRefusal({
    ...locator,
    finishedAfter: new Date(dependencies.clock.now().getTime() - ACCESS_KEY_REFUSAL_WINDOW_MS),
  })
  if (refusal !== null) return { kind: 'existing', lookup: refusal }

  const activeCount = await transaction.countActiveLookups({ companyId })
  if (activeCount >= ACCESS_KEY_LOOKUP_ACTIVE_LIMIT) throw accessKeyLookupQueueFull()

  const claim = {
    ...locator,
    correlationId: request.correlationId,
    requestedByUserId: request.context.userId,
  }
  let lookupId = await transaction.claimLookup(claim)
  if (lookupId === null) {
    const latest = await transaction.findLatestLookup(locator)
    if (latest !== null) return { kind: 'existing', lookup: latest }
    lookupId = await transaction.claimLookup(claim)
    if (lookupId === null) throw accessKeyLookupConflict()
  }
  return createQueuedLookup({ dependencies, environment, lookupId, request, transaction })
}

async function createQueuedLookup(input: {
  readonly dependencies: Dependencies
  readonly environment: NfeFiscalEnvironment
  readonly lookupId: string
  readonly request: RequestAccessKeyLookupParams
  readonly transaction: RequestAccessKeyLookupTransactionPort
}): Promise<RequestAccessKeyLookupResult> {
  const { dependencies, environment, lookupId, request, transaction } = input
  const { accessKey } = request
  const companyId = request.context.companyId
  const importId = await transaction.createImport({
    companyId,
    correlationId: request.correlationId,
    idempotencyKey: `${ACCESS_KEY_LOOKUP_IDEMPOTENCY_PREFIX}:${lookupId}`,
    requestFingerprint: await dependencies.fingerprintService.create({
      fields: [companyId, environment, accessKey].map((value) => ENCODER.encode(value)),
      operation: ACCESS_KEY_LOOKUP_REQUEST_OPERATION,
    }),
    requestedByUserId: request.context.userId,
  })
  await transaction.attachImport({ companyId, importId, lookupId })
  await transaction.saveOutbox({
    actorUserId: request.context.userId,
    aggregateId: importId,
    aggregateType: ACCESS_KEY_LOOKUP_IMPORT_AGGREGATE_TYPE,
    companyId,
    correlationId: request.correlationId,
    eventId: crypto.randomUUID(),
    eventType: ACCESS_KEY_LOOKUP_REQUESTED_EVENT,
    eventVersion: 1,
    payload: { companyId, importId, lookupId },
  })
  return { kind: 'created', lookup: { id: lookupId, status: ACCESS_KEY_LOOKUP_QUEUED_STATUS } }
}
