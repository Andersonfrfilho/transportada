/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import { prepareDistributionItem } from '../../nfe-distribution/infrastructure/nfe-distribution-item.mapper.js'
import { resolveAccessKeyLookupOutcome } from '../domain/access-key-lookup-outcome.policy.js'
import {
  collectAutXmlCnpjs,
  isCompanyPartyOfDocument,
} from '../domain/access-key-lookup-party.policy.js'
import {
  NFE_ACCESS_KEY_LOOKUP_ERROR_CODE,
  NfeAccessKeyLookupNonRetryableError,
} from '../domain/nfe-access-key-lookup.error.js'
import { ACCESS_KEY_LOOKUP_BLOCK_656_MS } from '../domain/nfe-access-key-lookup-budget.constant.js'
import type { AccessKeyLookupGatewayResult } from '../domain/nfe-access-key-lookup.types.js'
import { logLookupFinished } from './access-key-lookup-finished.log.js'
import type {
  AccessKeyLookupRecord,
  AccessKeyLookupRuntimeConfig,
  ProcessAccessKeyLookupDependencies,
} from './process-access-key-lookup.types.js'

const DOCUMENT_FOUND_CSTAT = '138'
const NOT_FOUND_CSTAT = '137'
const BUDGET_BLOCKED_LOG = 'nfe_access_key_lookup_budget_blocked_656'

type Dependencies = ProcessAccessKeyLookupDependencies
type LookupDocumentItem = Extract<AccessKeyLookupGatewayResult, { kind: 'document' }>['item']

export type ApplyLookupOutcomeParams = {
  readonly budgetLeft: number
  readonly dependencies: Dependencies
  readonly config: AccessKeyLookupRuntimeConfig
  readonly lookup: AccessKeyLookupRecord
  readonly result: AccessKeyLookupGatewayResult
}

type ImportParams = ApplyLookupOutcomeParams & { readonly item: LookupDocumentItem }

function resolveCStat(result: AccessKeyLookupGatewayResult): string | undefined {
  if (result.kind === 'sefaz-rejection') return result.cStat
  if (result.kind === 'not-found') return NOT_FOUND_CSTAT
  if (result.kind === 'document') return DOCUMENT_FOUND_CSTAT
  return undefined
}

function withCStat(cStat: string | undefined): { readonly cStat?: string } {
  return cStat === undefined ? {} : { cStat }
}

type PreparedCompleteDocument = Extract<
  Awaited<ReturnType<typeof prepareDistributionItem>>,
  { readonly variant: 'complete' }
>

async function prepareCompleteDocument(
  params: ImportParams,
): Promise<{ readonly importId: string; readonly prepared: PreparedCompleteDocument }> {
  const { dependencies, lookup } = params
  const prepared = await prepareDistributionItem({
    dfe: params.item,
    xmlImporter: dependencies.xmlImporter,
  })
  if (
    prepared.variant !== 'complete' ||
    prepared.normalizedXml.kind === 'nfe-event' ||
    prepared.accessKey !== lookup.accessKey
  ) {
    throw new NfeAccessKeyLookupNonRetryableError(
      NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.DOCUMENT_MISMATCH,
    )
  }
  if (lookup.importId === null) {
    throw new NfeAccessKeyLookupNonRetryableError(NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.IMPORT_MISSING)
  }
  return { importId: lookup.importId, prepared }
}

function isCompanyPartyOfPrepared(
  prepared: PreparedCompleteDocument,
  companyCnpj: string,
): boolean {
  if (prepared.normalizedXml.kind === 'nfe-event') return false
  return isCompanyPartyOfDocument({
    autXmlCnpjs: collectAutXmlCnpjs(new TextDecoder().decode(prepared.sourceBytes)),
    companyCnpj,
    document: prepared.normalizedXml.document,
  })
}

async function importFromSefaz(params: ImportParams): Promise<void> {
  const { dependencies, lookup } = params
  const { importId, prepared } = await prepareCompleteDocument(params)
  if (!isCompanyPartyOfPrepared(prepared, params.config.cnpj)) {
    safeLogWarn({
      logger: dependencies.logger,
      message: 'nfe_access_key_lookup_company_not_a_party',
      metadata: { companyId: lookup.companyId, lookupId: lookup.id },
    })
    await closeLookup({ ...params, reason: 'not_interested', status: 'refused' })
    return
  }

  const storedObject = await dependencies.storage.storeDocument({
    accessKey: lookup.accessKey,
    companyId: lookup.companyId,
    importId,
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
  logLookupFinished({
    entry: {
      budgetLeft: params.budgetLeft,
      cStat: DOCUMENT_FOUND_CSTAT,
      lookup,
      status: 'imported',
    },
    logger: dependencies.logger,
  })
}

async function closeLookup(
  params: ApplyLookupOutcomeParams & {
    readonly reason: Parameters<Dependencies['repository']['closeWithoutDocument']>[0]['reason']
    readonly status: 'failed' | 'refused'
  },
): Promise<void> {
  const { dependencies, lookup, reason, status } = params
  const cStat = resolveCStat(params.result)
  await dependencies.repository.closeWithoutDocument({
    ...withCStat(cStat),
    lookup,
    now: dependencies.clock.now(),
    reason,
    status,
  })
  logLookupFinished({
    entry: { budgetLeft: params.budgetLeft, ...withCStat(cStat), lookup, reason, status },
    logger: dependencies.logger,
  })
}

async function parkLookupAfter656(params: ApplyLookupOutcomeParams): Promise<void> {
  const { dependencies, lookup } = params
  const now = dependencies.clock.now()
  await dependencies.budget.block656({
    companyId: lookup.companyId,
    environment: lookup.environment,
    now,
  })
  await dependencies.repository.markWaiting({
    ...withCStat(resolveCStat(params.result)),
    lookup,
    notBefore: new Date(now.getTime() + ACCESS_KEY_LOOKUP_BLOCK_656_MS),
    now,
  })
  safeLogWarn({
    logger: dependencies.logger,
    message: BUDGET_BLOCKED_LOG,
    metadata: { companyId: lookup.companyId, lookupId: lookup.id },
  })
  logLookupFinished({
    entry: {
      budgetLeft: params.budgetLeft,
      ...withCStat(resolveCStat(params.result)),
      lookup,
      status: 'waiting',
    },
    logger: dependencies.logger,
  })
}

export async function applyLookupOutcome(params: ApplyLookupOutcomeParams): Promise<void> {
  const { dependencies, result } = params
  const outcome = resolveAccessKeyLookupOutcome(result)

  if (outcome.status === 'imported-candidate' && result.kind === 'document') {
    await importFromSefaz({ ...params, item: result.item })
    return
  }
  if (outcome.status === 'waiting') {
    await parkLookupAfter656(params)
    return
  }
  if (outcome.status === 'refused' || outcome.status === 'failed') {
    if ('unmapped' in outcome && outcome.unmapped === true) {
      safeLogWarn({
        logger: dependencies.logger,
        message: 'nfe_access_key_lookup_unmapped_outcome',
        metadata: {
          cStat: resolveCStat(result) ?? 'none',
          companyId: params.lookup.companyId,
          lookupId: params.lookup.id,
          ...(result.kind === 'document' ? { schema: result.item.schema } : {}),
        },
      })
    }
    await closeLookup({ ...params, reason: outcome.reason, status: outcome.status })
  }
}
