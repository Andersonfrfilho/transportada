/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'

import { parseWorkerEnvironment } from '../config/environment.schema.js'
import { shouldPrettyPrintLogs } from '../logging/log-format.policy.js'
import { safeLogInfo } from '../logging/safe-logger.service.js'
import { createNfeStorageGatewayFromEnvironment } from '../storage/infrastructure/nfe-storage-gateway.js'
import {
  createNfePartyContactBackfill,
  type NfePartyContactBackfillResult,
} from './application/nfe-party-contact-backfill.service.js'
import { DrizzleNfePartyContactBackfillRepository } from './infrastructure/drizzle-nfe-party-contact-backfill.repository.js'
import { createNfeXmlObjectReader } from './infrastructure/nfe-import-storage.gateway.js'
import { createNfeXmlImporter } from './infrastructure/nfe-xml-importer.gateway.js'

const COMPANY_ID_ARGUMENT = '--company-id='
const DEFAULT_STORAGE_BUCKET = 'transportada-private'

export async function runNfePartyContactBackfill(params: {
  readonly batchSize?: number
  readonly companyId: string
  readonly environment?: Record<string, string | undefined>
}): Promise<NfePartyContactBackfillResult> {
  const environment = params.environment ?? process.env
  const config = parseWorkerEnvironment(environment)
  const bucket =
    environment.OBJECT_STORAGE_BUCKET ?? environment.STORAGE_BUCKET ?? DEFAULT_STORAGE_BUCKET
  const logger = createLogger({
    logLevel: config.logLevel,
    pretty: shouldPrettyPrintLogs(config.appEnv),
    projectName: 'transportada-worker',
    version: '0.1.0',
  })
  const database = createDrizzleProvider({ connection: config.databaseUrl })
  const storageGateway = createNfeStorageGatewayFromEnvironment({
    environment,
    finalBucket: bucket,
    stagingBucket: bucket,
  })

  try {
    const backfill = createNfePartyContactBackfill({
      importer: createNfeXmlImporter(),
      logger,
      repository: new DrizzleNfePartyContactBackfillRepository(database.db),
      storage: createNfeXmlObjectReader({ gateway: storageGateway }),
    })
    const result = await backfill.execute({
      ...(params.batchSize === undefined ? {} : { batchSize: params.batchSize }),
      companyId: params.companyId,
    })

    safeLogInfo({
      logger,
      message: 'nfe_party_contact_backfill_finished',
      metadata: { ...result, companyId: params.companyId },
    })

    return result
  } finally {
    await storageGateway.close().catch(() => undefined)
    await database.close().catch(() => undefined)
  }
}

export function resolveCompanyIdArgument(argv: readonly string[]): string | undefined {
  const flagged = argv.find((argument) => argument.startsWith(COMPANY_ID_ARGUMENT))
  return flagged?.slice(COMPANY_ID_ARGUMENT.length) || undefined
}

if (import.meta.main) {
  const companyId = resolveCompanyIdArgument(process.argv.slice(2))
  if (companyId === undefined) {
    process.stderr.write(`missing ${COMPANY_ID_ARGUMENT}<uuid>\n`)
    process.exitCode = 1
  } else {
    void runNfePartyContactBackfill({ companyId }).catch(() => {
      process.stderr.write('nfe_party_contact_backfill_failed\n')
      process.exitCode = 1
    })
  }
}
