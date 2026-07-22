/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { parseEnvironment } from './config/environment.schema'
import { createGetCompanySettingsUseCase } from './companies/application/get-company-settings.use-case'
import { createIdempotencyFingerprintService } from './companies/application/idempotency-fingerprint.service'
import { createUpdateCompanySettingsUseCase } from './companies/application/update-company-settings.use-case'
import { createListDigitalCertificatesUseCase } from './companies/application/list-digital-certificates.use-case'
import { createReplaceDigitalCertificateUseCase } from './companies/application/replace-digital-certificate.use-case'
import { createDigitalCertificateSecretService } from './companies/application/digital-certificate-secret.service'
import { DrizzleCompanySettingsRepository } from './companies/infrastructure/drizzle-company-settings.repository'
import { DrizzleDigitalCertificateRepository } from './companies/infrastructure/drizzle-digital-certificate.repository'
import { createFiscalCertificateValidationGateway } from './companies/infrastructure/fiscal-certificate-validation.gateway'
import type { CompanySettingsDatabase } from './companies/infrastructure/drizzle-company-settings.types'
import { createCompanySettingsRoutes } from './companies/presentation/company-settings.routes'
import { createDigitalCertificateRoutes } from './companies/presentation/digital-certificates.routes'
import { HealthService } from './health/health.service'
import { AuthenticationService } from './identity/application/authentication.service'
import { TenantContextService } from './identity/application/tenant-context.service'
import { AuthorizationService } from './identity/application/authorization.service'
import { DrizzleExternalIdentityRepository } from './identity/infrastructure/drizzle-external-identity.repository'
import { DrizzleMembershipRepository } from './identity/infrastructure/drizzle-membership.repository'
import { createKeycloakAccessTokenVerifier } from './identity/infrastructure/keycloak-jwt.gateway'
import { createRouter } from './http/router.service'
import { createGetNfeImportUseCase } from './nfe-imports/application/get-nfe-import.use-case'
import { createListNfeImportsUseCase } from './nfe-imports/application/list-nfe-imports.use-case'
import { createReprocessNfeImportUseCase } from './nfe-imports/application/reprocess-nfe-import.use-case'
import { createRequestNfeImportUseCase } from './nfe-imports/application/request-nfe-import.use-case'
import { DrizzleNfeImportRepository } from './nfe-imports/infrastructure/drizzle-nfe-import.repository'
import { createNfeImportRoutes } from './nfe-imports/presentation/nfe-imports.routes'
import { DrizzleNfeDocumentRepository } from './nfe-documents/infrastructure/drizzle-nfe-document.repository'
import { createNfeDocumentRoutes } from './nfe-documents/presentation/nfe-documents.routes'
import type { ApiEnvironment } from './shared/api.types'
import {
  createShutdownHandler,
  registerShutdownSignals,
  startApiServer,
} from './server/server.service'
import {
  buildNfeImportSourceObjectKey,
  createNfeStorageGatewayFromEnvironment,
  type NfeStorageGateway,
} from './storage/infrastructure/nfe-storage-gateway'
import { DrizzleStoredObjectRepository } from './storage/infrastructure/drizzle-stored-object.repository'

export function bootstrap(): Bun.Server<undefined> {
  const config = parseEnvironment(process.env)
  const logger = createApiLogger(config)
  const identityGateway = createKeycloakAccessTokenVerifier(config.keycloak)
  const database = createDrizzleProvider({ connection: config.databaseUrl })
  const authentication = new AuthenticationService({
    repository: new DrizzleExternalIdentityRepository(database.db),
    verifier: identityGateway,
  })
  const healthService = new HealthService({ database, identityReadiness: identityGateway })
  const tenantContext = new TenantContextService({
    repository: new DrizzleMembershipRepository(database.db),
  })
  const router = createRouter({
    authentication,
    authorization: new AuthorizationService(),
    healthService,
    routes: createApplicationRoutes({
      database: database.db,
      envelopeKeyRing: config.cryptography.envelopeKeyRing,
      environment: process.env,
      idempotencyHmacKey: config.cryptography.idempotencyHmacKey,
    }),
    tenantContext,
  })
  const server = startApiServer({
    config,
    logger,
    router,
  })
  const shutdown = createShutdownHandler({ database, logger, server })

  registerShutdownSignals({ logger, shutdown })
  logger.info('api_started', {
    environment: config.appEnv,
    hostname: server.hostname,
    port: server.port,
  })

  return server
}

function createApiLogger(
  config: Pick<ApiEnvironment, 'appEnv' | 'logLevel'>,
): ReturnType<typeof createLogger> {
  return createLogger({
    logLevel: config.logLevel,
    pretty: config.appEnv !== 'production',
    projectName: 'transportada-api',
    version: '0.1.0',
  })
}

type CreateApplicationRoutesParams = {
  readonly database: CompanySettingsDatabase
  readonly envelopeKeyRing: import('@adatechnology/secret-envelope').SecretKeyRing
  readonly environment: Record<string, string | undefined>
  readonly idempotencyHmacKey: Uint8Array
}

function createApplicationRoutes({
  database,
  envelopeKeyRing,
  environment,
  idempotencyHmacKey,
}: CreateApplicationRoutesParams): readonly ReturnType<
  typeof createCompanySettingsRoutes
>[number][] {
  const settingsRepository = new DrizzleCompanySettingsRepository(database)
  const certificateRepository = new DrizzleDigitalCertificateRepository(database)
  const nfeImportRepository = new DrizzleNfeImportRepository(database)
  const storageBucket = resolveStorageBucket(environment)
  const storageGateway = createNfeStorageGatewayFromEnvironment({
    environment,
    finalBucket: storageBucket,
    stagingBucket: storageBucket,
  })
  const storedObjectRepository = new DrizzleStoredObjectRepository(database)
  const nfeDocumentRepository = new DrizzleNfeDocumentRepository(database, storageGateway)
  const fingerprintService = createIdempotencyFingerprintService({ key: idempotencyHmacKey })
  const requestImport = createRequestNfeImportUseCase({
    fingerprintService,
    unitOfWork: nfeImportRepository,
  })
  const getImport = createGetNfeImportUseCase({ repository: nfeImportRepository })
  const listImports = createListNfeImportsUseCase({ repository: nfeImportRepository })
  const reprocessImport = createReprocessNfeImportUseCase({ unitOfWork: nfeImportRepository })
  const replace = createReplaceDigitalCertificateUseCase({
    certificateValidationGateway: createFiscalCertificateValidationGateway(),
    createCertificateId: () => crypto.randomUUID(),
    fingerprintService,
    repository: certificateRepository,
    secretService: createDigitalCertificateSecretService({
      envelopeProvider: createSecretEnvelopeProvider(envelopeKeyRing),
    }),
  })
  return [
    ...createCompanySettingsRoutes({
      getSettings: createGetCompanySettingsUseCase({ repository: settingsRepository }),
      updateSettings: createUpdateCompanySettingsUseCase({
        fingerprintService,
        unitOfWork: settingsRepository,
      }),
    }),
    ...createDigitalCertificateRoutes({
      listCertificates: createListDigitalCertificatesUseCase({ repository: certificateRepository }),
      replaceCertificate: { execute: (input) => replace.executeWithOutcome(input) },
    }),
    ...createNfeImportRoutes({
      getImport,
      listImports,
      reprocessImport: { execute: (input) => reprocessImport.execute(input) },
      requestDistribution: {
        execute: (input) =>
          requestImport.execute({
            context: input.context,
            correlationId: input.correlationId,
            idempotencyKey: input.idempotencyKey,
            source: 'distribution',
            stagedSources: [],
          }),
      },
      requestUpload: {
        execute: (input) =>
          requestUploadImport({
            input,
            requestImport,
            storageBucket,
            storageGateway,
            storedObjectRepository,
          }),
      },
    }),
    ...createNfeDocumentRoutes({
      downloadDocumentXml: { execute: (input) => nfeDocumentRepository.downloadXml(input) },
      getDocument: { execute: (input) => nfeDocumentRepository.get(input) },
      getEligibility: { execute: (input) => nfeDocumentRepository.getEligibility(input) },
      listDocuments: { execute: (input) => nfeDocumentRepository.list(input) },
    }),
  ]
}

type RequestUploadInput = Parameters<
  Parameters<typeof createNfeImportRoutes>[0]['requestUpload']['execute']
>[0]

type RequestUploadImportParams = {
  readonly input: RequestUploadInput
  readonly requestImport: ReturnType<typeof createRequestNfeImportUseCase>
  readonly storageBucket: string
  readonly storageGateway: NfeStorageGateway
  readonly storedObjectRepository: DrizzleStoredObjectRepository
}

async function requestUploadImport({
  input,
  requestImport,
  storageBucket,
  storageGateway,
  storedObjectRepository,
}: RequestUploadImportParams) {
  const importId = crypto.randomUUID()
  const stagedSources = await Promise.all(
    input.files.map(async (file, index) => {
      const objectId = crypto.randomUUID()
      const objectKey = buildNfeImportSourceObjectKey({
        companyId: input.context.companyId,
        importId,
        objectId,
      })
      const stored = await storageGateway.storeObject({
        body: file.bytes,
        bucket: storageBucket,
        contentLength: file.bytes.byteLength,
        contentType: file.contentType,
        key: objectKey,
        sha256: file.sha256,
      })
      await storedObjectRepository.saveImportSource({
        bucket: stored.bucket,
        companyId: input.context.companyId,
        id: objectId,
        mimeType: stored.contentType,
        objectKey: stored.key,
        provider: stored.provider,
        sha256: stored.sha256,
        sizeBytes: BigInt(stored.contentLength),
      })
      return {
        contentLength: stored.contentLength,
        contentType: stored.contentType,
        objectId,
        sha256: stored.sha256,
        sourceEntry: index === 0 ? '/' : file.name,
        sourceName: file.name,
      }
    }),
  )
  return requestImport.execute({
    context: input.context,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    importId,
    source: 'upload',
    stagedSources,
  })
}

function resolveStorageBucket(environment: Record<string, string | undefined>): string {
  const bucket = environment.OBJECT_STORAGE_BUCKET ?? environment.STORAGE_BUCKET
  if (bucket === undefined || bucket.trim() === '')
    throw new Error('Object storage bucket is required')
  return bucket
}

if (import.meta.main) {
  bootstrap()
}
