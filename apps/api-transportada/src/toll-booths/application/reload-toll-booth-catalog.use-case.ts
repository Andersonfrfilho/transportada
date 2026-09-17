/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 RF4/RF5 — recarrega o catálogo de um extrato **registrado**. Tudo o que é rede (head,
 * download, sha256, forma) acontece antes da trava; dentro dela só banco: seed, `reloaded_*` e
 * `audit_logs` na mesma transação. Nada é apagado (D7). Sem `try/catch` (code-standart §7).
 */
import { createHash } from 'node:crypto'

import { APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES } from '../../shared/api.constant.js'
import {
  TollBoothExtractIntegrityError,
  TollBoothExtractNotFoundError,
  TollBoothExtractObjectMissingError,
} from '../domain/toll-booth-extract.error.js'
import {
  buildTollBoothExtractAuditEntityId,
  hasRepeatedOsmNodeId,
  toTollBoothSeedRecords,
  type TollBoothExtractRow,
  type TollBoothExtractRowInput,
} from '../domain/toll-booth-extract.policy.js'
import { tollBoothExtractBodySchema } from '../presentation/toll-booth-extract.schema.js'
import { createSeedTollBoothsUseCase } from './seed-toll-booths.use-case.js'
import type { TollBoothCatalogReloadPort } from './toll-booth-catalog-reload.port.js'
import type {
  TollBoothExtractPort,
  TollBoothExtractStoragePort,
} from './toll-booth-extract.port.js'

const INTEGRITY_MISMATCH_EVENT = 'toll_booth_extract_integrity_mismatch'

export type ReloadTollBoothCatalogInput = Readonly<{
  actorUserId: string
  companyId: string
  correlationId: string
  dataset: string
  observedOn: string
}>

export type ReloadTollBoothCatalogResult = Readonly<{
  boothsMissingFromExtract: number
  catalogBoothCount: number
  dataset: string
  observedOn: string
  reloadedAt: Date
  reloadedByUserId: string
  savedBoothCount: number
}>

export type ReloadTollBoothCatalogDependencies = Readonly<{
  catalogReload: TollBoothCatalogReloadPort
  extracts: TollBoothExtractPort
  logger: Readonly<{ warn: (message: string, metadata?: Record<string, unknown>) => void }>
  storage: TollBoothExtractStoragePort
}>

export function createReloadTollBoothCatalogUseCase(
  dependencies: ReloadTollBoothCatalogDependencies,
): Readonly<{
  execute: (input: ReloadTollBoothCatalogInput) => Promise<ReloadTollBoothCatalogResult>
}> {
  return {
    async execute(input) {
      const extract = await dependencies.extracts.find({
        dataset: input.dataset,
        observedOn: input.observedOn,
      })
      if (extract === undefined) throw new TollBoothExtractNotFoundError()

      const booths = await downloadVerifiedBooths(dependencies, extract)
      return reloadWithinLock({ booths, dependencies, extract, input })
    },
  }
}

async function downloadVerifiedBooths(
  dependencies: ReloadTollBoothCatalogDependencies,
  extract: TollBoothExtractRow,
): Promise<readonly TollBoothExtractRowInput[]> {
  const head = await dependencies.storage.head(extract.objectKey)
  if (head === undefined) {
    await dependencies.extracts.markObjectMissing({
      dataset: extract.dataset,
      observedOn: extract.observedOn,
    })
    throw new TollBoothExtractObjectMissingError()
  }
  if (head.contentLength > APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES) {
    throw new TollBoothExtractIntegrityError()
  }

  const bytes = await dependencies.storage.read({
    key: extract.objectKey,
    maxBytes: APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES,
  })
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== extract.sha256) {
    dependencies.logger.warn(INTEGRITY_MISMATCH_EVENT, {
      actualSha256: sha256,
      dataset: extract.dataset,
      expectedSha256: extract.sha256,
      observedOn: extract.observedOn,
    })
    throw new TollBoothExtractIntegrityError()
  }

  return parseBooths(bytes)
}

function parseBooths(bytes: Uint8Array): readonly TollBoothExtractRowInput[] {
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new TollBoothExtractIntegrityError()
  }
  const result = tollBoothExtractBodySchema.safeParse(json)
  if (!result.success || hasRepeatedOsmNodeId(result.data)) {
    throw new TollBoothExtractIntegrityError()
  }
  return result.data
}

async function reloadWithinLock(params: {
  readonly booths: readonly TollBoothExtractRowInput[]
  readonly dependencies: ReloadTollBoothCatalogDependencies
  readonly extract: TollBoothExtractRow
  readonly input: ReloadTollBoothCatalogInput
}): Promise<ReloadTollBoothCatalogResult> {
  const { booths, extract, input } = params
  const key = { dataset: extract.dataset, observedOn: extract.observedOn }

  return params.dependencies.catalogReload.runExclusive(async (unit) => {
    const seed = createSeedTollBoothsUseCase({ repository: { saveMany: unit.saveMany } })
    const { saved } = await seed.save(
      toTollBoothSeedRecords({ booths, observedOn: extract.observedOn }),
    )
    const summary = await unit.readCatalogSummary()
    const reloaded = await unit.markReloaded({
      ...key,
      reloadedBoothCount: saved,
      reloadedByUserId: input.actorUserId,
    })
    await unit.insertAudit({
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      correlationId: input.correlationId,
      entityId: buildTollBoothExtractAuditEntityId(extract.sha256),
      metadata: { ...key, savedBoothCount: saved },
    })

    return {
      ...key,
      boothsMissingFromExtract: summary.boothCount - saved,
      catalogBoothCount: summary.boothCount,
      reloadedAt: reloaded.reloadedAt,
      reloadedByUserId: input.actorUserId,
      savedBoothCount: saved,
    }
  })
}
