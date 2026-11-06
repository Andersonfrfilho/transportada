/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeAccessKeyLookupReason } from '../../database/nfe.schema.js'
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { NfeAccessKeyEnvelopeV1 } from '../../messaging/nfe-access-key-envelope.schema.js'
import { prepareDistributionItem } from '../../nfe-distribution/infrastructure/nfe-distribution-item.mapper.js'
import { ACTIVE_LOOKUP_STATUSES } from '../domain/nfe-access-key-lookup.constant.js'
import { ACCESS_KEY_LOOKUP_BLOCK_656_MS } from '../domain/nfe-access-key-lookup-budget.constant.js'
import { resolveAccessKeyLookupOutcome } from '../domain/access-key-lookup-outcome.policy.js'
import type { AccessKeyLookupGatewayResult } from '../domain/nfe-access-key-lookup.types.js'
import type {
  AccessKeyLookupRecord,
  ProcessAccessKeyLookupDependencies,
  ProcessAccessKeyLookupUseCase,
} from './process-access-key-lookup.types.js'

export const NFE_ACCESS_KEY_LOOKUP_CONSUMER_NAME = 'nfe-access-key-lookup-consumer'

const RESUMABLE_STATUSES: ReadonlySet<string> = new Set(ACTIVE_LOOKUP_STATUSES)
const FINISHED_LOG_MESSAGE = 'nfe_access_key_lookup_finished'
const ACK = { type: 'ack' } as const
const ACCESS_KEY_LAST_DIGITS = 4
const DOCUMENT_FOUND_CSTAT = '138'
const NOT_FOUND_CSTAT = '137'

type FinishedLog = {
  readonly budgetLeft?: number
  readonly cStat?: string
  readonly lookup: AccessKeyLookupRecord
  readonly reason?: NfeAccessKeyLookupReason
  readonly status: 'failed' | 'imported' | 'refused' | 'waiting'
}

type Dependencies = ProcessAccessKeyLookupDependencies

function resolveCStat(result: AccessKeyLookupGatewayResult): string | undefined {
  if (result.kind === 'sefaz-rejection') return result.cStat
  if (result.kind === 'not-found') return NOT_FOUND_CSTAT
  if (result.kind === 'document') return DOCUMENT_FOUND_CSTAT
  return undefined
}

function logFinished(dependencies: Dependencies, entry: FinishedLog): void {
  safeLogInfo({
    logger: dependencies.logger,
    message: FINISHED_LOG_MESSAGE,
    metadata: {
      accessKeyLast4: entry.lookup.accessKey.slice(-ACCESS_KEY_LAST_DIGITS),
      companyId: entry.lookup.companyId,
      lookupId: entry.lookup.id,
      status: entry.status,
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
      ...(entry.cStat === undefined ? {} : { cStat: entry.cStat }),
      ...(entry.budgetLeft === undefined ? {} : { budgetLeft: entry.budgetLeft }),
    },
  })
}

async function importFromSefaz(
  dependencies: Dependencies,
  params: {
    readonly budgetLeft: number
    readonly lookup: AccessKeyLookupRecord
    readonly result: Extract<AccessKeyLookupGatewayResult, { kind: 'document' }>
  },
): Promise<void> {
  const { lookup } = params
  const prepared = await prepareDistributionItem({
    dfe: params.result.item,
    xmlImporter: dependencies.xmlImporter,
  })
  if (prepared.variant !== 'complete' || prepared.accessKey !== lookup.accessKey) {
    throw new Error('NFE_ACCESS_KEY_LOOKUP_DOCUMENT_MISMATCH')
  }
  if (lookup.importId === null) throw new Error('NFE_ACCESS_KEY_LOOKUP_IMPORT_MISSING')

  const storedObject = await dependencies.storage.storeDocument({
    accessKey: lookup.accessKey,
    companyId: lookup.companyId,
    importId: lookup.importId,
    sourceBytes: prepared.sourceBytes,
    sourceSha256: prepared.sourceSha256,
  })
  await dependencies.repository.importDocument({
    cStat: DOCUMENT_FOUND_CSTAT,
    lookup,
    now: dependencies.clock.now(),
    prepared,
    storedObject,
  })
  logFinished(dependencies, {
    budgetLeft: params.budgetLeft,
    cStat: DOCUMENT_FOUND_CSTAT,
    lookup,
    status: 'imported',
  })
}

async function applyOutcome(
  dependencies: Dependencies,
  params: {
    readonly budgetLeft: number
    readonly lookup: AccessKeyLookupRecord
    readonly result: AccessKeyLookupGatewayResult
  },
): Promise<void> {
  const { budgetLeft, lookup, result } = params
  const outcome = resolveAccessKeyLookupOutcome(result)
  const now = dependencies.clock.now()
  const cStat = resolveCStat(result)

  if (outcome.status === 'imported-candidate' && result.kind === 'document') {
    await importFromSefaz(dependencies, { budgetLeft, lookup, result })
    return
  }
  if (outcome.status === 'waiting') {
    await dependencies.budget.block656({
      companyId: lookup.companyId,
      environment: lookup.environment,
      now,
    })
    const notBefore = new Date(now.getTime() + ACCESS_KEY_LOOKUP_BLOCK_656_MS)
    await dependencies.repository.markWaiting({ lookup, notBefore, now })
    safeLogWarn({
      logger: dependencies.logger,
      message: 'nfe_access_key_lookup_budget_blocked_656',
      metadata: { companyId: lookup.companyId, lookupId: lookup.id },
    })
    logFinished(dependencies, { budgetLeft, ...optional({ cStat }), lookup, status: 'waiting' })
    return
  }
  if (outcome.status === 'refused' || outcome.status === 'failed') {
    if ('unmapped' in outcome && outcome.unmapped === true) {
      safeLogWarn({
        logger: dependencies.logger,
        message: 'nfe_access_key_lookup_unmapped_outcome',
        metadata: { companyId: lookup.companyId, lookupId: lookup.id, cStat: cStat ?? 'none' },
      })
    }
    await dependencies.repository.closeWithoutDocument({
      ...optional({ cStat }),
      lookup,
      now,
      reason: outcome.reason,
      status: outcome.status,
    })
    logFinished(dependencies, {
      budgetLeft,
      ...optional({ cStat }),
      lookup,
      reason: outcome.reason,
      status: outcome.status,
    })
  }
}

function optional(value: { readonly cStat: string | undefined }): { readonly cStat?: string } {
  return value.cStat === undefined ? {} : { cStat: value.cStat }
}

async function processLookup(
  dependencies: Dependencies,
  envelope: NfeAccessKeyEnvelopeV1,
): Promise<void> {
  const { companyId } = envelope
  const lookup = await dependencies.repository.findLookup({
    companyId,
    lookupId: envelope.payload.lookupId,
  })
  if (lookup === undefined || !RESUMABLE_STATUSES.has(lookup.status)) return

  const now = dependencies.clock.now()
  const documentId = await dependencies.repository.findDocumentId({
    accessKey: lookup.accessKey,
    companyId,
  })
  if (documentId !== undefined) {
    await dependencies.repository.completeWithExistingDocument({ documentId, lookup, now })
    logFinished(dependencies, { lookup, status: 'imported' })
    return
  }

  await dependencies.repository.markQuerying({ lookup, now })
  const reservation = await dependencies.budget.reserve({
    companyId,
    environment: lookup.environment,
    now,
  })
  if (!reservation.reserved) {
    await dependencies.repository.markWaiting({ lookup, notBefore: reservation.notBefore, now })
    logFinished(dependencies, { lookup, status: 'waiting' })
    return
  }

  const config = await dependencies.profile.loadConfig({ companyId })
  const result = await dependencies.gatewayFactory
    .create({ config })
    .consultarPorChave({ chaveNfe: lookup.accessKey, config })
  await applyOutcome(dependencies, { budgetLeft: reservation.budgetLeft, lookup, result })
}

export function createProcessAccessKeyLookupUseCase(
  dependencies: Dependencies,
): ProcessAccessKeyLookupUseCase {
  return {
    async abandon(envelope): Promise<void> {
      const lookup = await dependencies.repository.findLookup({
        companyId: envelope.companyId,
        lookupId: envelope.payload.lookupId,
      })
      if (lookup === undefined || !RESUMABLE_STATUSES.has(lookup.status)) return

      await dependencies.repository.closeWithoutDocument({
        lookup,
        now: dependencies.clock.now(),
        reason: 'sefaz_unavailable',
        status: 'failed',
      })
      logFinished(dependencies, { lookup, reason: 'sefaz_unavailable', status: 'failed' })
    },
    async execute(envelope): Promise<{ readonly type: 'ack' }> {
      return dependencies.processedMessages.runOnce({
        companyId: envelope.companyId,
        consumerName: NFE_ACCESS_KEY_LOOKUP_CONSUMER_NAME,
        effect: async () => {
          await processLookup(dependencies, envelope)
          return ACK
        },
        eventId: envelope.eventId,
        successResult: 'processed',
      })
    },
  }
}
