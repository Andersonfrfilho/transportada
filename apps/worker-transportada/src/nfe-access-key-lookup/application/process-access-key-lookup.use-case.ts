/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { NfeAccessKeyEnvelopeV1 } from '../../messaging/nfe-access-key-envelope.schema.js'
import {
  ACTIVE_LOOKUP_STATUSES,
  SEFAZ_UNAVAILABLE_REASON,
} from '../domain/nfe-access-key-lookup.constant.js'
import {
  NFE_ACCESS_KEY_LOOKUP_ERROR_CODE,
  NfeAccessKeyLookupNonRetryableError,
} from '../domain/nfe-access-key-lookup.error.js'
import { logLookupFinished } from './access-key-lookup-finished.log.js'
import { applyLookupOutcome } from './apply-access-key-lookup-outcome.js'
import type {
  AccessKeyLookupRecord,
  ProcessAccessKeyLookupDependencies,
  ProcessAccessKeyLookupUseCase,
} from './process-access-key-lookup.types.js'

export const NFE_ACCESS_KEY_LOOKUP_CONSUMER_NAME = 'nfe-access-key-lookup-consumer'

const RESUMABLE_STATUSES: ReadonlySet<string> = new Set(ACTIVE_LOOKUP_STATUSES)
const ACK = { type: 'ack' } as const

type Dependencies = ProcessAccessKeyLookupDependencies
type ProcessParams = {
  readonly dependencies: Dependencies
  readonly envelope: NfeAccessKeyEnvelopeV1
}

function assertEnvelopeMatchesLookup(params: {
  readonly envelope: NfeAccessKeyEnvelopeV1
  readonly lookup: AccessKeyLookupRecord
}): void {
  const { envelope, lookup } = params
  if (lookup.importId === null) {
    throw new NfeAccessKeyLookupNonRetryableError(NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.IMPORT_MISSING)
  }
  if (lookup.importId !== envelope.payload.importId) {
    throw new NfeAccessKeyLookupNonRetryableError(
      NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.IMPORT_ID_MISMATCH,
    )
  }
}

async function completeFromExistingDocument(
  params: ProcessParams & { readonly lookup: AccessKeyLookupRecord },
): Promise<boolean> {
  const { dependencies, lookup } = params
  const documentId = await dependencies.repository.findDocumentId({
    accessKey: lookup.accessKey,
    companyId: lookup.companyId,
  })
  if (documentId === undefined) return false

  await dependencies.repository.completeWithExistingDocument({
    documentId,
    lookup,
    now: dependencies.clock.now(),
  })
  logLookupFinished({ entry: { lookup, status: 'imported' }, logger: dependencies.logger })
  return true
}

/** O ambiente da reserva é o da chamada: busca gravada para um ambiente que o perfil já trocou não gasta a cota do outro. */
async function resolveProfileEnvironment(
  params: ProcessParams & { readonly lookup: AccessKeyLookupRecord },
) {
  const { dependencies, lookup } = params
  const environment = await dependencies.profile.loadEnvironment({ companyId: lookup.companyId })
  if (environment === lookup.environment) return environment

  safeLogWarn({
    logger: dependencies.logger,
    message: 'environment_mismatch',
    metadata: {
      companyId: lookup.companyId,
      lookupEnvironment: lookup.environment,
      lookupId: lookup.id,
      profileEnvironment: environment,
    },
  })
  throw new NfeAccessKeyLookupNonRetryableError(
    NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.ENVIRONMENT_MISMATCH,
  )
}

async function processLookup(params: ProcessParams): Promise<void> {
  const { dependencies, envelope } = params
  const { companyId } = envelope
  const lookup = await dependencies.repository.findLookup({
    companyId,
    lookupId: envelope.payload.lookupId,
  })
  if (lookup === undefined || !RESUMABLE_STATUSES.has(lookup.status)) return

  assertEnvelopeMatchesLookup({ envelope, lookup })
  if (await completeFromExistingDocument({ ...params, lookup })) return

  const environment = await resolveProfileEnvironment({ ...params, lookup })
  const now = dependencies.clock.now()
  const reservation = await dependencies.budget.reserve({ companyId, environment, now })
  if (!reservation.reserved) {
    await dependencies.repository.markWaiting({ lookup, notBefore: reservation.notBefore, now })
    logLookupFinished({ entry: { lookup, status: 'waiting' }, logger: dependencies.logger })
    return
  }

  // Queda entre a reserva e a resposta da SEFAZ custa uma unidade do orçamento: é o preço de nunca gastar a cota duas vezes
  await dependencies.repository.markQuerying({ lookup, now })
  const config = await dependencies.profile.loadConfig({ companyId })
  const result = await dependencies.gatewayFactory
    .create({ config })
    .consultarPorChave({ chaveNfe: lookup.accessKey, config })
  await applyLookupOutcome({
    budgetLeft: reservation.budgetLeft,
    config,
    dependencies,
    lookup,
    result,
  })
}

async function abandonLookup(params: ProcessParams): Promise<void> {
  const { dependencies, envelope } = params
  const lookup = await dependencies.repository.findLookup({
    companyId: envelope.companyId,
    lookupId: envelope.payload.lookupId,
  })
  if (lookup === undefined || !RESUMABLE_STATUSES.has(lookup.status)) return

  await dependencies.repository.closeWithoutDocument({
    lookup,
    now: dependencies.clock.now(),
    reason: SEFAZ_UNAVAILABLE_REASON,
    status: 'failed',
  })
  logLookupFinished({
    entry: { lookup, reason: SEFAZ_UNAVAILABLE_REASON, status: 'failed' },
    logger: dependencies.logger,
  })
}

export function createProcessAccessKeyLookupUseCase(
  dependencies: Dependencies,
): ProcessAccessKeyLookupUseCase {
  return {
    abandon: (envelope) => abandonLookup({ dependencies, envelope }),
    async execute(envelope): Promise<{ readonly type: 'ack' }> {
      return dependencies.processedMessages.runOnce({
        companyId: envelope.companyId,
        consumerName: NFE_ACCESS_KEY_LOOKUP_CONSUMER_NAME,
        effect: async () => {
          await processLookup({ dependencies, envelope })
          return ACK
        },
        eventId: envelope.eventId,
        successResult: 'processed',
      })
    },
  }
}
