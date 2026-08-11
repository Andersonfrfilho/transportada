/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { parseEnvironment } from './config/environment.schema'
import { shouldPrettyPrintLogs } from './logging/log-format.policy'
import { createGetCompanySettingsUseCase } from './companies/application/get-company-settings.use-case'
import { createIdempotencyFingerprintService } from './companies/application/idempotency-fingerprint.service'
import { createUpdateCompanySettingsUseCase } from './companies/application/update-company-settings.use-case'
import { createListDigitalCertificatesUseCase } from './companies/application/list-digital-certificates.use-case'
import { createReplaceDigitalCertificateUseCase } from './companies/application/replace-digital-certificate.use-case'
import { createDigitalCertificateSecretService } from './companies/application/digital-certificate-secret.service'
import { createCompanyLogoUseCase } from './companies/application/company-logo.use-case.js'
import { createDisableScheduledDistributionUseCase } from './companies/application/disable-scheduled-distribution.use-case.js'
import { createEnableScheduledDistributionUseCase } from './companies/application/enable-scheduled-distribution.use-case.js'
import { createGetScheduledDistributionStatusUseCase } from './companies/application/get-scheduled-distribution-status.use-case.js'
import { createAdjustDistributionCursorUseCase } from './companies/application/adjust-distribution-cursor.use-case.js'
import { createGetDistributionCursorUseCase } from './companies/application/get-distribution-cursor.use-case.js'
import { DrizzleDistributionCursorRepository } from './companies/infrastructure/drizzle-distribution-cursor.repository.js'
import { createDistributionCursorRoutes } from './companies/presentation/distribution-cursor.routes.js'
import { DrizzleCompanyFiscalEnvironmentRepository } from './companies/infrastructure/drizzle-company-fiscal-environment.repository.js'
import { DrizzleScheduledDistributionRepository } from './companies/infrastructure/drizzle-scheduled-distribution.repository.js'
import { DrizzleScheduledDistributionStatusRepository } from './companies/infrastructure/drizzle-scheduled-distribution-status.repository.js'
import { createScheduledDistributionRoutes } from './companies/presentation/scheduled-distribution.routes.js'
import { DrizzleCompanyLogoRepository } from './companies/infrastructure/drizzle-company-logo.repository.js'
import { DrizzleCompanySettingsRepository } from './companies/infrastructure/drizzle-company-settings.repository'
import { DrizzleDigitalCertificateRepository } from './companies/infrastructure/drizzle-digital-certificate.repository'
import { createFiscalCertificateValidationGateway } from './companies/infrastructure/fiscal-certificate-validation.gateway'
import { createFiscalCompanyProfileLookupGateway } from './companies/infrastructure/fiscal-company-profile-lookup.gateway'
import type { CompanySettingsDatabase } from './companies/infrastructure/drizzle-company-settings.types'
import { createCompanyLogoRoutes } from './companies/presentation/company-logo.routes.js'
import { createCompanySettingsRoutes } from './companies/presentation/company-settings.routes'
import { createDigitalCertificateRoutes } from './companies/presentation/digital-certificates.routes'
import { createRetireDigitalCertificateUseCase } from './companies/application/retire-digital-certificate.use-case'
import { createCteBatchUseCase } from './cte-batches/application/cte-batch.use-case'
import { createListCompanyCteItemsUseCase } from './cte-batches/application/list-company-cte-items.use-case'
import { createListCteBatchItemsUseCase } from './cte-batches/application/list-cte-batch-items.use-case'
import { createPreviewCteBatchUseCase } from './cte-batches/application/preview-cte-batch.use-case'
import { createSummarizeCompanyCteItemsUseCase } from './cte-batches/application/summarize-company-cte-items.use-case'
import { DrizzleCteBatchItemRepository } from './cte-batches/infrastructure/drizzle-cte-batch-item.repository'
import { DrizzleCteBatchPreviewRepository } from './cte-batches/infrastructure/drizzle-cte-batch-preview.repository'
import { DrizzleCteBatchRepository } from './cte-batches/infrastructure/drizzle-cte-batch.repository'
import { DrizzleCteEmissionProfileCatalogRepository } from './cte-batches/infrastructure/drizzle-cte-emission-profile-catalog.repository'
import { createCteBatchRoutes } from './cte-batches/presentation/cte-batch.routes'
import { createCteEmissionProfilesUseCase } from './cte-profiles/application/cte-emission-profiles.use-case'
import { DrizzleCteEmissionProfileRepository } from './cte-profiles/infrastructure/drizzle-cte-emission-profile.repository'
import { createCteEmissionProfileRoutes } from './cte-profiles/presentation/cte-emission-profiles.routes'
import { createBillingUseCase } from './billing/application/billing.use-case'
import { createInvoiceDocumentUseCase } from './billing/application/invoice-document.use-case'
import { DrizzleBillingRepository } from './billing/infrastructure/drizzle-billing.repository'
import { DrizzleInvoiceDocumentRepository } from './billing/infrastructure/drizzle-invoice-document.repository'
import { createInvoiceDocumentArchiveGateway } from './billing/infrastructure/invoice-document-archive.gateway'
import { createInvoicePdfGateway } from './billing/infrastructure/invoice-pdf.gateway'
import { createBillingRoutes } from './billing/presentation/billing.routes'
import { toBillingInvoiceListFilters } from './billing/presentation/billing.schema.js'
import { createCteIssuanceUseCase } from './cte-issuance/application/cte-issuance.use-case'
import { createExportCteDocumentsUseCase } from './cte-issuance/application/export-cte-documents.use-case.js'
import { createRenderDacteUseCase } from './cte-issuance/application/render-dacte.use-case.js'
import { createCteArchiveGateway } from './cte-issuance/infrastructure/cte-archive.gateway.js'
import { createDactePdfGateway } from './cte-issuance/infrastructure/dacte-pdf.gateway.js'
import { createDacteLogoGateway } from './cte-issuance/infrastructure/dacte-logo.gateway.js'
import { createDacteRendererGateway } from './cte-issuance/infrastructure/dacte-renderer.gateway.js'
import { createDacteSource } from './cte-issuance/infrastructure/dacte-source.query.js'
import { createDacteXmlReaderGateway } from './cte-issuance/infrastructure/dacte-xml-reader.gateway.js'
import { createCteDocumentDownloadGateway } from './cte-issuance/infrastructure/cte-document-download.gateway.js'
import { createCteExportSelection } from './cte-issuance/infrastructure/cte-export-selection.query.js'
import { DrizzleCteIssuanceRepository } from './cte-issuance/infrastructure/drizzle-cte-issuance.repository'
import { createCteIssuanceRoutes } from './cte-issuance/presentation/cte-issuance.routes'
import { createFleetDriverVehiclesUseCase } from './fleet/application/fleet-driver-vehicles.use-case'
import { createFleetDriversUseCase } from './fleet/application/fleet-drivers.use-case'
import { createFleetVehicleLookupUseCase } from './fleet/application/fleet-vehicle-lookup.use-case'
import { createFleetVehiclesUseCase } from './fleet/application/fleet-vehicles.use-case'
import { createHttpVehicleLookupGateway } from './fleet/infrastructure/http-vehicle-lookup.gateway'
import { DrizzleFleetDriverVehicleRepository } from './fleet/infrastructure/drizzle-fleet-driver-vehicle.repository'
import { DrizzleFleetDriverRepository } from './fleet/infrastructure/drizzle-fleet-driver.repository'
import { DrizzleFleetVehicleRepository } from './fleet/infrastructure/drizzle-fleet-vehicle.repository'
import { createFleetRoutes } from './fleet/presentation/fleet.routes'
import { createTripMdfeManifestUseCase } from './mdfe-manifests/application/create-trip-mdfe-manifest.use-case'
import { createMdfeIssuanceUseCase } from './mdfe-manifests/application/mdfe-issuance.use-case'
import { createMdfeManifestsUseCase } from './mdfe-manifests/application/mdfe-manifests.use-case'
import { createPreviewMdfeManifestUseCase } from './mdfe-manifests/application/preview-mdfe-manifest.use-case'
import { DrizzleMdfeIssuanceRepository } from './mdfe-manifests/infrastructure/drizzle-mdfe-issuance.repository'
import { DrizzleMdfeManifestRepository } from './mdfe-manifests/infrastructure/drizzle-mdfe-manifest.repository'
import { createMdfeIssuanceRoutes } from './mdfe-manifests/presentation/mdfe-issuance.routes'
import { createMdfeManifestRoutes } from './mdfe-manifests/presentation/mdfe-manifests.routes'
import { createTripUseCase } from './trips/application/trip.use-case'
import { DrizzleTripRepository } from './trips/infrastructure/drizzle-trip.repository'
import { createTripRoutes } from './trips/presentation/trip.routes'
import { createFreightSimulationUseCase } from './freight-calculations/application/freight-simulation.use-case'
import {
  DrizzleFreightCalculationListRepository,
  DrizzleFreightRepository,
  DrizzleFreightRuleListRepository,
  DrizzleFreightSimulationRepository,
} from './freight/infrastructure/drizzle-freight.repository'
import { createFreightRoutes } from './freight/presentation/freight.routes'
import { createFreightRulesUseCase } from './freight-rules/application/freight-rules.use-case'
import { DrizzleMigrationStatusRepository } from './database/drizzle-migration-status.repository'
import { HealthService } from './health/health.service'
import { AuthenticationService } from './identity/application/authentication.service'
import { TenantContextService } from './identity/application/tenant-context.service'
import { AuthorizationService } from './identity/application/authorization.service'
import { createBootstrapFirstAdminUseCase } from './identity/application/bootstrap-first-admin.use-case'
import { createActivateInvitationUseCase } from './identity/application/activate-invitation.use-case'
import { createInviteCompanyUserUseCase } from './identity/application/invite-company-user.use-case'
import { createListCompanyUsersUseCase } from './identity/application/list-company-users.use-case'
import { createResendCompanyUserCodeUseCase } from './identity/application/resend-company-user-code.use-case'
import { createChangeCompanyUserStatusUseCase } from './identity/application/change-company-user-status.use-case'
import { createReplaceCompanyUserRolesUseCase } from './identity/application/replace-company-user-roles.use-case'
import { createRemoveCompanyUserMembershipUseCase } from './identity/application/remove-company-user-membership.use-case'
import { createUpdateCompanyUserProfileUseCase } from './identity/application/update-company-user-profile.use-case'
import { DrizzleExternalIdentityRepository } from './identity/infrastructure/drizzle-external-identity.repository'
import { DrizzleBootstrapRepository } from './identity/infrastructure/drizzle-bootstrap.repository'
import { DrizzleMembershipRepository } from './identity/infrastructure/drizzle-membership.repository'
import { DrizzleCompanyUserRepository } from './identity/infrastructure/drizzle-company-user.repository'
import { DrizzleInvitationRepository } from './identity/infrastructure/drizzle-invitation.repository'
import { createKeycloakAccessTokenVerifier } from './identity/infrastructure/keycloak-jwt.gateway'
import {
  createIdentityAccessGateway,
  createKeycloakAdminGateway,
} from './identity/infrastructure/keycloak-admin.gateway'
import { createBootstrapRoutes } from './identity/presentation/bootstrap.routes'
import { createUserActivationRoutes } from './identity/presentation/user-activation.routes'
import { createUserAdministrationRoutes } from './identity/presentation/user-administration.routes'
import { createRouter, type RegisteredAnonymousRoute } from './http/router.service'
import { createGetNfeDistributionStatusUseCase } from './nfe-imports/application/get-nfe-distribution-status.use-case'
import { createGetNfeImportUseCase } from './nfe-imports/application/get-nfe-import.use-case'
import { createListNfeImportsUseCase } from './nfe-imports/application/list-nfe-imports.use-case'
import { createReprocessNfeImportUseCase } from './nfe-imports/application/reprocess-nfe-import.use-case'
import { createRequestNfeImportUseCase } from './nfe-imports/application/request-nfe-import.use-case'
import { DrizzleNfeDistributionStatusRepository } from './nfe-imports/infrastructure/drizzle-nfe-distribution-status.repository'
import { DrizzleNfeImportRepository } from './nfe-imports/infrastructure/drizzle-nfe-import.repository'
import { createNfeImportRoutes } from './nfe-imports/presentation/nfe-imports.routes'
import { DrizzleNfeDocumentRepository } from './nfe-documents/infrastructure/drizzle-nfe-document.repository'
import { createNfeDocumentRoutes } from './nfe-documents/presentation/nfe-documents.routes'
import { createOperationsUseCase } from './operations/application/operations.use-case'
import { DrizzleOperationsRepository } from './operations/infrastructure/drizzle-operations.repository'
import { createOperationsRoutes } from './operations/presentation/operations.routes'
import { createGetViewPreferencesUseCase } from './view-preferences/application/get-view-preferences.use-case'
import { createSaveViewPreferencesUseCase } from './view-preferences/application/save-view-preferences.use-case'
import { DrizzleViewPreferencesRepository } from './view-preferences/infrastructure/drizzle-view-preferences.repository'
import { createViewPreferencesRoutes } from './view-preferences/presentation/view-preferences.routes'
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
import { createErrorTracker } from './observability/sentry.service'

const API_PROJECT_NAME = 'transportada-api'
const API_VERSION = '0.1.0'

export function bootstrap(): Bun.Server<undefined> {
  const config = parseEnvironment(process.env)
  const logger = createApiLogger(config)
  const errorTracker = createErrorTracker({
    configuration: {
      dsn: config.sentryDsn,
      environment: config.sentryEnvironment,
      release: `${API_PROJECT_NAME}@${API_VERSION}`,
    },
  })
  const identityGateway = createKeycloakAccessTokenVerifier(config.keycloak)
  const database = createDrizzleProvider({ connection: config.databaseUrl })
  const authentication = new AuthenticationService({
    repository: new DrizzleExternalIdentityRepository(database.db),
    verifier: identityGateway,
  })
  const healthService = new HealthService({
    database,
    identityReadiness: identityGateway,
    migrationStatus: new DrizzleMigrationStatusRepository({ database: database.db }),
  })
  const tenantContext = new TenantContextService({
    repository: new DrizzleMembershipRepository(database.db),
  })
  const router = createRouter({
    anonymousRoutes: createAnonymousRoutes({ config, database: database.db }),
    authentication,
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: new DrizzleCompanyFiscalEnvironmentRepository(database.db),
    healthService,
    routes: createApplicationRoutes({
      database: database.db,
      envelopeKeyRing: config.cryptography.envelopeKeyRing,
      environment: process.env,
      idempotencyHmacKey: config.cryptography.idempotencyHmacKey,
      keycloak: config.keycloak,
      scheduledDistributionCron: config.scheduledDistributionCron,
      vehicleLookup: config.vehicleLookup,
    }),
    tenantContext,
  })
  const server = startApiServer({
    captureError: (error: unknown) => errorTracker.captureException(error),
    config,
    logger,
    router,
  })
  const shutdown = createShutdownHandler({
    database,
    drainObservability: async (): Promise<void> => {
      await errorTracker.flush()
      await logger.flush()
      logger.stop()
    },
    logger,
    server,
  })

  registerShutdownSignals({ logger, shutdown })
  logger.info('api_started', {
    environment: config.appEnv,
    hostname: server.hostname,
    port: server.port,
  })

  return server
}

function createApiLogger(
  config: Pick<ApiEnvironment, 'appEnv' | 'logLevel' | 'logSinkUrl'>,
): ReturnType<typeof createLogger> {
  return createLogger({
    logLevel: config.logLevel,
    pretty: shouldPrettyPrintLogs(config.appEnv),
    projectName: API_PROJECT_NAME,
    ...(config.logSinkUrl === undefined ? {} : { sinkUrl: config.logSinkUrl }),
    version: API_VERSION,
  })
}

type CreateAnonymousRoutesParams = {
  readonly config: ApiEnvironment
  readonly database: CompanySettingsDatabase
}

/** Sem `companyId` de ambiente a rota de arranque fica morta (ADR-0022) — nenhuma rota anônima existe. */
function createAnonymousRoutes({
  config,
  database,
}: CreateAnonymousRoutesParams): readonly RegisteredAnonymousRoute[] {
  if (config.companyId === undefined) return []

  return [
    ...createBootstrapRoutes({
      bootstrapFirstAdmin: createBootstrapFirstAdminUseCase({
        companyId: config.companyId,
        identityGateway: createKeycloakAdminGateway({
          clientId: config.keycloak.admin.clientId,
          clientSecret: config.keycloak.admin.clientSecret,
          issuer: config.keycloak.issuer,
        }),
        issuer: config.keycloak.issuer,
        repository: new DrizzleBootstrapRepository(database),
        token: config.bootstrapToken,
      }),
    }),
    ...createUserActivationRoutes({
      activateInvitation: createActivateInvitationUseCase({
        identities: new DrizzleCompanyUserRepository(database),
        identityProvider: createIdentityAccessGateway({
          clientId: config.keycloak.admin.clientId,
          clientSecret: config.keycloak.admin.clientSecret,
          issuer: config.keycloak.issuer,
        }),
        invitations: new DrizzleInvitationRepository(database),
        now: () => new Date(),
      }),
    }),
  ]
}

type CreateApplicationRoutesParams = {
  readonly database: CompanySettingsDatabase
  readonly envelopeKeyRing: import('@adatechnology/secret-envelope').SecretKeyRing
  readonly environment: Record<string, string | undefined>
  readonly idempotencyHmacKey: Uint8Array
  readonly keycloak: ApiEnvironment['keycloak']
  readonly scheduledDistributionCron: ApiEnvironment['scheduledDistributionCron']
  readonly vehicleLookup: ApiEnvironment['vehicleLookup']
}

function createApplicationRoutes({
  database,
  envelopeKeyRing,
  environment,
  idempotencyHmacKey,
  keycloak,
  scheduledDistributionCron,
  vehicleLookup,
}: CreateApplicationRoutesParams): readonly ReturnType<
  typeof createCompanySettingsRoutes
>[number][] {
  const settingsRepository = new DrizzleCompanySettingsRepository(database)
  const scheduledDistributionRepository = new DrizzleScheduledDistributionRepository(database)
  const distributionCursorRepository = new DrizzleDistributionCursorRepository(database)
  const companyLogoRepository = new DrizzleCompanyLogoRepository(database)
  const certificateRepository = new DrizzleDigitalCertificateRepository(database)
  const companyProfileLookupGateway = createFiscalCompanyProfileLookupGateway()
  const freightRepository = new DrizzleFreightRepository(database)
  const freightSimulationRepository = new DrizzleFreightSimulationRepository(database)
  const freightRuleListRepository = new DrizzleFreightRuleListRepository(database)
  const freightCalculationListRepository = new DrizzleFreightCalculationListRepository(database)
  const fleetVehicleRepository = new DrizzleFleetVehicleRepository(database)
  const fleetDriverRepository = new DrizzleFleetDriverRepository(database)
  const fleetDriverVehicleRepository = new DrizzleFleetDriverVehicleRepository(database)
  const mdfeManifestRepository = new DrizzleMdfeManifestRepository(database)
  const mdfeIssuanceRepository = new DrizzleMdfeIssuanceRepository(database)
  const tripRepository = new DrizzleTripRepository(database)
  const cteBatchRepository = new DrizzleCteBatchRepository(database)
  const cteEmissionProfileRepository = new DrizzleCteEmissionProfileRepository(database)
  const billingRepository = new DrizzleBillingRepository(database)
  const cteIssuanceRepository = new DrizzleCteIssuanceRepository(database)
  const operationsRepository = new DrizzleOperationsRepository(database)
  const nfeImportRepository = new DrizzleNfeImportRepository(database)
  const storageBucket = resolveStorageBucket(environment)
  const storageGateway = createNfeStorageGatewayFromEnvironment({
    environment,
    finalBucket: storageBucket,
    stagingBucket: storageBucket,
  })
  const storedObjectRepository = new DrizzleStoredObjectRepository(database)
  const nfeDocumentRepository = new DrizzleNfeDocumentRepository(database, storageGateway)
  const viewPreferencesRepository = new DrizzleViewPreferencesRepository(database)
  const fingerprintService = createIdempotencyFingerprintService({ key: idempotencyHmacKey })
  const requestImport = createRequestNfeImportUseCase({
    fingerprintService,
    unitOfWork: nfeImportRepository,
  })
  const getDistributionStatus = createGetNfeDistributionStatusUseCase({
    clock: { now: () => new Date() },
    reader: new DrizzleNfeDistributionStatusRepository(database),
  })
  const getScheduledDistribution = createGetScheduledDistributionStatusUseCase({
    clock: { now: () => new Date() },
    port: new DrizzleScheduledDistributionStatusRepository(database),
    scheduledDistributionCron,
  })
  const getImport = createGetNfeImportUseCase({ repository: nfeImportRepository })
  const listImports = createListNfeImportsUseCase({ repository: nfeImportRepository })
  const reprocessImport = createReprocessNfeImportUseCase({ unitOfWork: nfeImportRepository })
  const freightRules = createFreightRulesUseCase({
    fingerprintService,
    unitOfWork: freightRepository,
  })
  const freightSimulation = createFreightSimulationUseCase({
    fingerprintService,
    unitOfWork: freightSimulationRepository,
  })
  const fleetVehicles = createFleetVehiclesUseCase({ repository: fleetVehicleRepository })
  const fleetDrivers = createFleetDriversUseCase({ repository: fleetDriverRepository })
  const fleetDriverVehicles = createFleetDriverVehiclesUseCase({
    driverRepository: fleetDriverRepository,
    repository: fleetDriverVehicleRepository,
  })
  const fleetVehicleLookup = createFleetVehicleLookupUseCase({
    gateway:
      vehicleLookup === null
        ? null
        : createHttpVehicleLookupGateway({
            configuration: vehicleLookup,
            fetch: (target, init) => fetch(target, init),
          }),
  })
  const mdfeManifests = createMdfeManifestsUseCase({ repository: mdfeManifestRepository })
  const previewMdfeManifest = createPreviewMdfeManifestUseCase({
    repository: mdfeManifestRepository,
  })
  const mdfeIssuance = createMdfeIssuanceUseCase({
    now: () => new Date(),
    repository: mdfeIssuanceRepository,
  })
  const trips = createTripUseCase({ repository: tripRepository })
  const createTripMdfeManifest = createTripMdfeManifestUseCase({
    manifests: mdfeManifests,
    trips,
  })
  const cteEmissionProfileCatalog = new DrizzleCteEmissionProfileCatalogRepository(
    cteEmissionProfileRepository,
  )
  const cteBatches = createCteBatchUseCase({
    fingerprintService,
    profiles: cteEmissionProfileCatalog,
    unitOfWork: cteBatchRepository,
  })
  const cteEmissionProfiles = createCteEmissionProfilesUseCase({
    fingerprintService,
    unitOfWork: cteEmissionProfileRepository,
  })
  const previewCteBatches = createPreviewCteBatchUseCase({
    clock: { now: () => new Date() },
    profiles: cteEmissionProfileCatalog,
    reader: new DrizzleCteBatchPreviewRepository(database),
  })
  const cteBatchItemReader = new DrizzleCteBatchItemRepository(database)
  const listCteBatchItems = createListCteBatchItemsUseCase({ reader: cteBatchItemReader })
  const listCompanyCteItems = createListCompanyCteItemsUseCase({ reader: cteBatchItemReader })
  const summarizeCompanyCteItems = createSummarizeCompanyCteItemsUseCase({
    reader: cteBatchItemReader,
  })
  const billing = createBillingUseCase({
    clock: { now: () => new Date().toISOString() },
    fingerprintService,
    unitOfWork: billingRepository,
  })
  const invoiceDocuments = createInvoiceDocumentUseCase({
    archive: createInvoiceDocumentArchiveGateway({
      bucket: storageBucket,
      storage: storageGateway,
    }),
    clock: () => new Date(),
    createObjectId: () => crypto.randomUUID(),
    renderer: createInvoicePdfGateway(),
    repository: new DrizzleInvoiceDocumentRepository(database),
  })
  const cteIssuance = createCteIssuanceUseCase({
    documentDownload: createCteDocumentDownloadGateway({ storage: storageGateway }),
    fingerprintService,
    unitOfWork: cteIssuanceRepository,
  })
  const dactePdfGateway = createDactePdfGateway()
  const dacteXmlReader = createDacteXmlReaderGateway({ storage: storageGateway })
  const dacteLogoGateway = createDacteLogoGateway({ logos: companyLogoRepository })
  const exportCteDocuments = createExportCteDocumentsUseCase({
    archive: createCteArchiveGateway({ storage: storageGateway }),
    clock: () => new Date(),
    dacte: createDacteRendererGateway({ pdf: dactePdfGateway, xmlReader: dacteXmlReader }),
    logos: dacteLogoGateway,
    selection: createCteExportSelection(database),
  })
  const renderDacte = createRenderDacteUseCase({
    logos: dacteLogoGateway,
    renderer: dactePdfGateway,
    source: createDacteSource(database),
    xmlReader: dacteXmlReader,
  })
  const operations = createOperationsUseCase({
    clock: { now: () => new Date().toISOString() },
    repository: operationsRepository,
  })
  const replace = createReplaceDigitalCertificateUseCase({
    certificateValidationGateway: createFiscalCertificateValidationGateway(),
    createCertificateId: () => crypto.randomUUID(),
    fingerprintService,
    repository: certificateRepository,
    secretService: createDigitalCertificateSecretService({
      envelopeProvider: createSecretEnvelopeProvider(envelopeKeyRing),
    }),
  })
  const companyUserRepository = new DrizzleCompanyUserRepository(database)
  const invitationRepository = new DrizzleInvitationRepository(database)
  const identityAccessGateway = createIdentityAccessGateway({
    clientId: keycloak.admin.clientId,
    clientSecret: keycloak.admin.clientSecret,
    issuer: keycloak.issuer,
  })
  const inviteCompanyUser = createInviteCompanyUserUseCase({
    identityGateway: identityAccessGateway,
    invitations: invitationRepository,
    issuer: keycloak.issuer,
    now: () => new Date(),
    repository: companyUserRepository,
  })
  const listCompanyUsers = createListCompanyUsersUseCase({ repository: companyUserRepository })
  const resendCompanyUserCode = createResendCompanyUserCodeUseCase({
    invitations: invitationRepository,
    now: () => new Date(),
    repository: companyUserRepository,
  })
  const changeCompanyUserStatus = createChangeCompanyUserStatusUseCase({
    identityGateway: identityAccessGateway,
    repository: companyUserRepository,
  })
  const replaceCompanyUserRoles = createReplaceCompanyUserRolesUseCase({
    repository: companyUserRepository,
  })
  const removeCompanyUserMembership = createRemoveCompanyUserMembershipUseCase({
    identityGateway: identityAccessGateway,
    repository: companyUserRepository,
  })
  const updateCompanyUserProfile = createUpdateCompanyUserProfileUseCase({
    identityGateway: identityAccessGateway,
    repository: companyUserRepository,
  })
  return [
    ...createCompanySettingsRoutes({
      getSettings: createGetCompanySettingsUseCase({ repository: settingsRepository }),
      lookupProfileByCnpj: {
        execute: ({ cnpj }) => companyProfileLookupGateway.lookupByCnpj({ cnpj }),
      },
      updateSettings: createUpdateCompanySettingsUseCase({
        fingerprintService,
        unitOfWork: settingsRepository,
      }),
    }),
    ...createScheduledDistributionRoutes({
      disable: createDisableScheduledDistributionUseCase({
        unitOfWork: scheduledDistributionRepository,
      }),
      enable: createEnableScheduledDistributionUseCase({
        unitOfWork: scheduledDistributionRepository,
      }),
      getStatus: getScheduledDistribution,
    }),
    ...createDistributionCursorRoutes({
      adjust: createAdjustDistributionCursorUseCase({
        audit: distributionCursorRepository,
        clock: { now: () => new Date() },
        repository: distributionCursorRepository,
      }),
      getStatus: createGetDistributionCursorUseCase({ repository: distributionCursorRepository }),
    }),
    ...createCompanyLogoRoutes({
      companyLogo: createCompanyLogoUseCase({ repository: companyLogoRepository }),
    }),
    ...createDigitalCertificateRoutes({
      listCertificates: createListDigitalCertificatesUseCase({ repository: certificateRepository }),
      replaceCertificate: { execute: (input) => replace.executeWithOutcome(input) },
      retireCertificate: createRetireDigitalCertificateUseCase({
        repository: certificateRepository,
      }),
    }),
    ...createFreightRoutes({
      activateRule: { execute: (input) => freightRules.activate(input) },
      createRule: { execute: (input) => freightRules.create(input) },
      deactivateRule: { execute: (input) => freightRules.deactivate(input) },
      listCalculations: { execute: (input) => freightCalculationListRepository.list(input) },
      listRules: { execute: (input) => freightRuleListRepository.list(input) },
      simulate: { execute: (input) => freightSimulation.execute(input) },
      updateRule: { execute: (input) => freightRules.update(input) },
    }),
    ...createFleetRoutes({
      createDriver: { execute: (input) => fleetDrivers.create(input) },
      createVehicle: { execute: (input) => fleetVehicles.create(input) },
      driverVehicles: {
        list: (input) => fleetDriverVehicles.list(input),
        replace: (input) => fleetDriverVehicles.replace(input),
      },
      listDrivers: { execute: (input) => fleetDrivers.list(input) },
      listVehicles: { execute: (input) => fleetVehicles.list(input) },
      updateDriver: { execute: (input) => fleetDrivers.update(input) },
      updateVehicle: { execute: (input) => fleetVehicles.update(input) },
      vehicleLookup: {
        isAvailable: () => fleetVehicleLookup.isAvailable(),
        lookup: (input) => fleetVehicleLookup.lookup(input),
      },
    }),
    ...createMdfeManifestRoutes({
      createManifest: { execute: (input) => mdfeManifests.create(input) },
      discardManifest: { execute: (input) => mdfeManifests.discard(input) },
      getManifest: { execute: (input) => mdfeManifests.get(input) },
      listManifests: { execute: (input) => mdfeManifests.list(input) },
      previewManifest: { execute: (input) => previewMdfeManifest.execute(input) },
    }),
    ...createMdfeIssuanceRoutes({
      mdfeIssuance: {
        cancel: (input) => mdfeIssuance.cancel(input),
        close: (input) => mdfeIssuance.close(input),
        issue: (input) => mdfeIssuance.issue(input),
      },
    }),
    ...createTripRoutes({
      closeTrip: { execute: (input) => trips.close(input) },
      createTrip: { execute: (input) => trips.create(input) },
      createTripMdfeManifest: { execute: (input) => createTripMdfeManifest.execute(input) },
      deliverTripDocument: { execute: (input) => trips.deliverDocument(input) },
      getTrip: { execute: (input) => trips.get(input) },
      linkTripDocument: { execute: (input) => trips.linkDocument(input) },
      listTrips: { execute: (input) => trips.list(input) },
      releaseTripDocument: { execute: (input) => trips.releaseDocument(input) },
    }),
    ...createCteEmissionProfileRoutes({
      activateProfile: { execute: (input) => cteEmissionProfiles.activate(input) },
      createProfile: { execute: (input) => cteEmissionProfiles.create(input) },
      deactivateProfile: { execute: (input) => cteEmissionProfiles.deactivate(input) },
      listProfiles: { execute: (input) => cteEmissionProfiles.list(input) },
      updateProfile: { execute: (input) => cteEmissionProfiles.update(input) },
    }),
    ...createCteBatchRoutes({
      cteBatches,
      listBatches: { execute: (input) => cteBatchRepository.list(input) },
      listCompanyItems: { execute: (input) => listCompanyCteItems.execute(input) },
      listEvents: { execute: (input) => cteBatchRepository.listEvents(input) },
      listItems: { execute: (input) => listCteBatchItems.execute(input) },
      previewBatches: { execute: (input) => previewCteBatches.execute(input) },
      summarizeCompanyItems: { execute: (input) => summarizeCompanyCteItems.execute(input) },
    }),
    ...createBillingRoutes({
      billingInvoices: {
        cancel: (input) => billing.cancel(input),
        create: (input) =>
          billing.create({
            context: input.context,
            correlationId: input.correlationId,
            cteDocumentIds: input.cteIds,
            dueDate: input.dueDate,
            idempotencyKey: input.idempotencyKey,
          }),
        generateDocument: (input) =>
          invoiceDocuments.generate({ context: input.context, invoiceId: input.invoiceId }),
        get: (input) => billing.get(input),
        list: ({ context, ...input }) =>
          billing.list({
            context,
            cursor: input.cursor,
            filters: toBillingInvoiceListFilters(input),
            limit: input.limit,
          }),
        listDocuments: (input) =>
          invoiceDocuments.list({ context: input.context, invoiceId: input.invoiceId }),
        preview: (input) =>
          billing.preview({ context: input.context, cteDocumentIds: input.cteIds }),
        update: (input) =>
          billing.update({
            context: input.context,
            correlationId: input.correlationId,
            discountAmount: input.discountAmount,
            invoiceId: input.invoiceId,
            observations: input.observations,
            surchargeAmount: input.surchargeAmount,
          }),
      },
      listEligibleBillingCtes: {
        async execute(input) {
          const page = await billing.listEligible({
            context: input.context,
            cursor: input.cursor,
            filters: {
              batchId: input.batchId,
              batchIdIn: input.batchIdIn,
              cteNumber: input.cteNumber,
              cteNumberFrom: input.cteNumberFrom,
              cteNumberIn: input.cteNumberIn,
              cteNumberTo: input.cteNumberTo,
              customerDocument: input.customerDocument,
              customerName: input.customerName,
              from: input.issuedFrom,
              maxAmount: input.maxAmount,
              minAmount: input.minAmount,
              nfeNumberFrom: input.nfeNumberFrom,
              nfeNumberIn: input.nfeNumberIn,
              nfeNumberTo: input.nfeNumberTo,
              to: input.issuedTo,
            },
            limit: input.limit,
          })
          return page
        },
      },
    }),
    ...createCteIssuanceRoutes({
      cteDacte: {
        renderDacte: (input) => renderDacte.renderDacte(input),
      },
      cteExport: {
        exportDocuments: (input) => exportCteDocuments.exportDocuments(input),
      },
      cteIssuance: {
        cancel: (input) => cteIssuance.cancel(input),
        get: (input) => cteIssuance.getIssuance(input),
        issue: (input) => cteIssuance.issue(input),
        reprocess: (input) => cteIssuance.reprocess(input),
        listDocuments: (input) => cteIssuance.listDocuments(input),
      },
    }),
    ...createOperationsRoutes({
      audit: { listEvents: (input) => operations.listAuditEvents(input) },
      operations: {
        getSummary: (input) => operations.getSummary(input),
        listJobs: (input) => operations.listJobs(input),
        listTimeline: (input) => operations.listTimeline(input),
      },
    }),
    ...createNfeImportRoutes({
      getDistributionStatus,
      getImport,
      getScheduledDistribution,
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
    ...createViewPreferencesRoutes({
      getPreferences: createGetViewPreferencesUseCase({ repository: viewPreferencesRepository }),
      savePreferences: createSaveViewPreferencesUseCase({ repository: viewPreferencesRepository }),
    }),
    ...createUserAdministrationRoutes({
      changeStatus: changeCompanyUserStatus,
      invite: inviteCompanyUser,
      list: listCompanyUsers,
      removeMembership: removeCompanyUserMembership,
      replaceRoles: replaceCompanyUserRoles,
      resendCode: resendCompanyUserCode,
      updateProfile: updateCompanyUserProfile,
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
