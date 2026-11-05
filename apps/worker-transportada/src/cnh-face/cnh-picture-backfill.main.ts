/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: foto da CNH para quem já tem a CNH anexada e nenhuma foto de perfil.
 * `bun run backfill:cnh-picture` conta e imprime (dry-run, padrão); `--confirm` grava.
 * Escrever é mudança de dados em ambiente real: pede aprovação antes de rodar em staging ou produção.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'

import { createStorageAttachmentReaderGateway } from '../aggregate-attachment/infrastructure/storage-attachment-reader.gateway.js'
import { parseWorkerEnvironment } from '../config/environment.schema.js'
import { shouldPrettyPrintLogs } from '../logging/log-format.policy.js'
import { createNfeStorageGatewayFromEnvironment } from '../storage/infrastructure/nfe-storage-gateway.js'
import {
  runCnhPictureBackfill,
  type CnhPictureBackfillMode,
  type CnhPictureBackfillResult,
} from './application/cnh-picture-backfill.service.js'
import { createCnhPictureApiGateway } from './infrastructure/cnh-picture-api.gateway.js'
import { createDrizzleCnhPictureBackfillRepository } from './infrastructure/drizzle-cnh-picture-backfill.repository.js'
import { createThreadedCnhFaceGateway } from './infrastructure/threaded-cnh-face.gateway.js'

const CONFIRM_ARGUMENT = '--confirm'
const DEFAULT_STORAGE_BUCKET = 'transportada-private'

export function resolveBackfillMode(argv: readonly string[]): CnhPictureBackfillMode {
  return argv.includes(CONFIRM_ARGUMENT) ? 'confirm' : 'dry-run'
}

export async function runCnhPictureBackfillFromEnvironment(params: {
  readonly environment?: Record<string, string | undefined>
  readonly mode: CnhPictureBackfillMode
}): Promise<CnhPictureBackfillResult> {
  const environment = params.environment ?? process.env
  const config = parseWorkerEnvironment(environment)
  const bucket =
    environment.OBJECT_STORAGE_BUCKET ?? environment.STORAGE_BUCKET ?? DEFAULT_STORAGE_BUCKET
  const database = createDrizzleProvider({ connection: config.databaseUrl })
  const storageGateway = createNfeStorageGatewayFromEnvironment({
    environment,
    finalBucket: bucket,
    stagingBucket: bucket,
  })

  try {
    const source = createDrizzleCnhPictureBackfillRepository(database.db)
    if (params.mode === 'dry-run') return await runCnhPictureBackfill({ mode: 'dry-run', source })
    if (config.cnhPicture === undefined) {
      throw new Error('the CNH picture credential is required to apply pictures')
    }
    const logger = createLogger({
      logLevel: config.logLevel,
      pretty: shouldPrettyPrintLogs(config.appEnv),
      projectName: 'transportada-worker',
      version: '0.1.0',
    })
    return await runCnhPictureBackfill({
      mode: 'confirm',
      picture: {
        extractor: createThreadedCnhFaceGateway(),
        onOutcome: ({ outcome, reason }) => {
          logger.info(`cnh_picture_backfill_${outcome}`, { reason })
        },
        picture: createCnhPictureApiGateway({ configuration: config.cnhPicture }),
      },
      reader: createStorageAttachmentReaderGateway({ storage: storageGateway }),
      source,
    })
  } finally {
    await storageGateway.close().catch(() => undefined)
    await database.close().catch(() => undefined)
  }
}

if (import.meta.main) {
  void runCnhPictureBackfillFromEnvironment({ mode: resolveBackfillMode(process.argv.slice(2)) })
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`)
    })
    .catch(() => {
      process.stderr.write('cnh_picture_backfill_failed\n')
      process.exitCode = 1
    })
}
