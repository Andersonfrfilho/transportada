/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { nfeDistributionNotConfigured } from '../../nfe-imports/application/nfe-import.error.js'
import {
  ACCESS_KEY_LOOKUP_IDEMPOTENCY_PREFIX,
  ACCESS_KEY_LOOKUP_REQUEST_OPERATION,
  ACCESS_KEY_LOOKUP_REQUESTED_EVENT,
  ACCESS_KEY_REFUSAL_WINDOW_MS,
} from './nfe-access-key-lookup.constant.js'
import type {
  AccessKeyLookupClockPort,
  IdempotencyFingerprintPort,
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

  const lookupId = await transaction.claimLookup({
    ...locator,
    correlationId: request.correlationId,
    requestedByUserId: request.context.userId,
  })
  if (lookupId === null) return readWinningLookup(transaction, locator)

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
    aggregateType: 'nfe_import',
    companyId,
    correlationId: request.correlationId,
    eventId: crypto.randomUUID(),
    eventType: ACCESS_KEY_LOOKUP_REQUESTED_EVENT,
    eventVersion: 1,
    payload: { companyId, importId, lookupId },
  })
  return { kind: 'created', lookup: { id: lookupId, status: 'queued' } }
}

async function readWinningLookup(
  transaction: RequestAccessKeyLookupTransactionPort,
  locator: Parameters<RequestAccessKeyLookupTransactionPort['findActiveLookup']>[0],
): Promise<RequestAccessKeyLookupResult> {
  const winner = await transaction.findActiveLookup(locator)
  if (winner === null)
    throw new Error('Active access key lookup disappeared after a claim conflict')
  return { kind: 'existing', lookup: winner }
}
