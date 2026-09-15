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
  createNfePackageBoxGtinBackfill,
  type NfePackageBoxGtinBackfillResult,
} from './application/nfe-package-box-gtin-backfill.service.js'
import { DrizzleNfePackageBoxGtinBackfillRepository } from './infrastructure/drizzle-nfe-package-box-gtin-backfill.repository.js'
import { createNfeXmlObjectReader } from './infrastructure/nfe-import-storage.gateway.js'
import { createNfeXmlImporter } from './infrastructure/nfe-xml-importer.gateway.js'
import {
  DEFAULT_STORAGE_BUCKET,
  resolveCompanyIdArgument,
} from './nfe-package-box-backfill.main.js'

const CONFIRM_ARGUMENT = '--confirm'

export async function runNfePackageBoxGtinBackfill(params: {
  readonly batchSize?: number
  readonly companyId?: string
  readonly dryRun: boolean
  readonly environment?: Record<string, string | undefined>
}): Promise<NfePackageBoxGtinBackfillResult> {
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
    const result = await createNfePackageBoxGtinBackfill({
      importer: createNfeXmlImporter(),
      logger,
      repository: new DrizzleNfePackageBoxGtinBackfillRepository(database.db),
      storage: createNfeXmlObjectReader({ gateway: storageGateway }),
    }).execute({
      ...(params.batchSize === undefined ? {} : { batchSize: params.batchSize }),
      ...(params.companyId === undefined ? {} : { companyIds: [params.companyId] }),
      dryRun: params.dryRun,
    })

    safeLogInfo({ logger, message: 'nfe_package_box_gtin_backfill_finished', metadata: result })
    return result
  } finally {
    await storageGateway.close().catch(() => undefined)
    await database.close().catch(() => undefined)
  }
}

/** Sem `--confirm` só conta: gravar é sempre um pedido explícito. */
export function resolveDryRunArgument(argv: readonly string[]): boolean {
  return !argv.includes(CONFIRM_ARGUMENT)
}

if (import.meta.main) {
  const argv = process.argv.slice(2)
  const companyId = resolveCompanyIdArgument(argv)
  void runNfePackageBoxGtinBackfill({
    ...(companyId === undefined ? {} : { companyId }),
    dryRun: resolveDryRunArgument(argv),
  })
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`)
    })
    .catch(() => {
      process.stderr.write('nfe_package_box_gtin_backfill_failed\n')
      process.exitCode = 1
    })
}
