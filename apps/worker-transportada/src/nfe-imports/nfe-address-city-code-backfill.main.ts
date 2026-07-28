/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'

import { parseWorkerEnvironment } from '../config/environment.schema.js'
import { safeLogInfo } from '../logging/safe-logger.service.js'
import { createNfeStorageGatewayFromEnvironment } from '../storage/infrastructure/nfe-storage-gateway.js'
import {
  createNfeAddressCityCodeBackfill,
  type NfeAddressCityCodeBackfillResult,
} from './application/nfe-address-city-code-backfill.service.js'
import { DrizzleNfeAddressCityCodeBackfillRepository } from './infrastructure/drizzle-nfe-address-city-code-backfill.repository.js'
import { createNfeXmlObjectReader } from './infrastructure/nfe-import-storage.gateway.js'
import { createNfeXmlImporter } from './infrastructure/nfe-xml-importer.gateway.js'

const COMPANY_ID_ARGUMENT = '--company-id='
const DEFAULT_STORAGE_BUCKET = 'transportada-private'

export async function runNfeAddressCityCodeBackfill(params: {
  readonly batchSize?: number
  readonly companyId: string
  readonly environment?: Record<string, string | undefined>
}): Promise<NfeAddressCityCodeBackfillResult> {
  const environment = params.environment ?? process.env
  const config = parseWorkerEnvironment(environment)
  const bucket =
    environment.OBJECT_STORAGE_BUCKET ?? environment.STORAGE_BUCKET ?? DEFAULT_STORAGE_BUCKET
  const logger = createLogger({
    logLevel: config.logLevel,
    pretty: config.appEnv !== 'production',
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
    const backfill = createNfeAddressCityCodeBackfill({
      importer: createNfeXmlImporter(),
      logger,
      repository: new DrizzleNfeAddressCityCodeBackfillRepository(database.db),
      storage: createNfeXmlObjectReader({ gateway: storageGateway }),
    })
    const result = await backfill.execute({
      ...(params.batchSize === undefined ? {} : { batchSize: params.batchSize }),
      companyId: params.companyId,
    })

    safeLogInfo({
      logger,
      message: 'nfe_address_city_code_backfill_finished',
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
    void runNfeAddressCityCodeBackfill({ companyId }).catch(() => {
      process.stderr.write('nfe_address_city_code_backfill_failed\n')
      process.exitCode = 1
    })
  }
}
