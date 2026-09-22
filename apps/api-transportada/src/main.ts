/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDatabaseProvider } from './database/database-client.service.js'
import { createLogger } from '@adatechnology/logger'
import { createRabbitMqProvider } from '@adatechnology/rabbitmq-provider'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'
import type { UserModule } from '@adatechnology/user-module'

import { parseEnvironment } from './config/environment.schema'
import { shouldPrettyPrintLogs } from './logging/log-format.policy'
import { createGetCompanySettingsUseCase } from './companies/application/get-company-settings.use-case'
import { createIdempotencyFingerprintService } from './companies/application/idempotency-fingerprint.service'
import { createUpdateCompanySettingsUseCase } from './companies/application/update-company-settings.use-case'
import { createListDigitalCertificatesUseCase } from './companies/application/list-digital-certificates.use-case'
import { createReplaceDigitalCertificateUseCase } from './companies/application/replace-digital-certificate.use-case'
import { createDigitalCertificateSecretService } from './companies/application/digital-certificate-secret.service'
import { createCompanyLogoUseCase } from './companies/application/company-logo.use-case.js'
import { createLandingLogoUseCase } from './landing/application/landing-logo.use-case.js'
import { createLandingSettingsUseCase } from './landing/application/landing-settings.use-case.js'
import { resolveMobileAuthentication } from './landing/domain/mobile-authentication.policy.js'
import { createAggregateApplicationsUseCase } from './fleet/application/aggregate-applications.use-case.js'
import { createAggregateAccountUseCase } from './fleet/application/aggregate-account.use-case.js'
import { createDisableScheduledDistributionUseCase } from './companies/application/disable-scheduled-distribution.use-case.js'
import { createEnableScheduledDistributionUseCase } from './companies/application/enable-scheduled-distribution.use-case.js'
import { createGetScheduledDistributionStatusUseCase } from './companies/application/get-scheduled-distribution-status.use-case.js'
import {
  createClearDefaultVolumeWeightUseCase,
  createGetCargoSettingsUseCase,
  createSetCameraMeasurementEnabledUseCase,
  createSetDefaultVolumeWeightUseCase,
} from './companies/application/cargo-settings.use-case.js'
import { createCompanyContactsUseCase } from './companies/application/company-contacts.use-case.js'
import { DrizzleCompanyContactsRepository } from './companies/infrastructure/drizzle-company-contacts.repository.js'
import { createCompanyContactsRoutes } from './companies/presentation/company-contacts.routes.js'
import { DrizzleCargoSettingsRepository } from './companies/infrastructure/drizzle-cargo-settings.repository.js'
import { DrizzleCargoVolumeFactorRepository } from './companies/infrastructure/drizzle-cargo-volume-factor.repository.js'
import {
  createListCargoVolumeFactorsUseCase,
  createRemoveCargoVolumeFactorUseCase,
  createSaveCargoVolumeFactorUseCase,
} from './companies/application/cargo-volume-factor.use-case.js'
import { createCargoVolumeFactorRoutes } from './companies/presentation/cargo-volume-factor.routes.js'
import { createCargoSettingsRoutes } from './companies/presentation/cargo-settings.routes.js'
import { createAdjustFuelPriceUseCase } from './companies/application/adjust-fuel-price.use-case.js'
import { createClearFuelPriceUseCase } from './companies/application/clear-fuel-price.use-case.js'
import { createListFuelPricesUseCase } from './companies/application/list-fuel-prices.use-case.js'
import { createAdjustTollBoothChargeUseCase } from './companies/application/adjust-toll-booth-charge.use-case.js'
import { createClearTollBoothChargeUseCase } from './companies/application/clear-toll-booth-charge.use-case.js'
import { createListTollBoothChargesUseCase } from './companies/application/list-toll-booth-charges.use-case.js'
import { createListTollBoothCatalogUseCase } from './toll-booths/application/list-toll-booth-catalog.use-case.js'
import { createInMemoryTollBoothAxleChargeGapCache } from './toll-booths/infrastructure/in-memory-toll-booth-axle-charge-gap-cache.js'
import { createDrizzleTollBoothCatalogRepository } from './toll-booths/infrastructure/drizzle-toll-booth-catalog.repository.js'
import { createTollBoothRoutes } from './toll-booths/presentation/toll-booth.routes.js'
import { createCreateTollBoothExtractUseCase } from './toll-booths/application/create-toll-booth-extract.use-case.js'
import { createListTollBoothExtractsUseCase } from './toll-booths/application/list-toll-booth-extracts.use-case.js'
import { createDrizzleTollBoothExtractRepository } from './toll-booths/infrastructure/drizzle-toll-booth-extract.repository.js'
import { createTollBoothExtractStorageGateway } from './toll-booths/infrastructure/toll-booth-extract-storage.gateway.js'
import {
  createTollBoothCatalogReloadRoutes,
  createTollBoothExtractRoutes,
} from './toll-booths/presentation/toll-booth-extract.routes.js'
import { createReloadTollBoothCatalogUseCase } from './toll-booths/application/reload-toll-booth-catalog.use-case.js'
import { createDrizzleTollBoothCatalogReloadRepository } from './toll-booths/infrastructure/drizzle-toll-booth-catalog-reload.repository.js'
import { DrizzleFuelPriceRepository } from './companies/infrastructure/drizzle-fuel-price.repository.js'
import { DrizzleTollBoothChargeRepository } from './companies/infrastructure/drizzle-toll-booth-charge.repository.js'
import { DrizzleTollBoothSightingRepository } from './trips/infrastructure/drizzle-toll-booth-sighting.repository.js'
import { createFuelPriceRoutes } from './companies/presentation/fuel-price.routes.js'
import { createTollBoothChargeRoutes } from './companies/presentation/toll-booth-charge.routes.js'
import { createCompanyScopedTollBoothGateway } from './trips/infrastructure/company-scoped-toll-booth.gateway.js'
import { createChooseEnergyDistributorUseCase } from './companies/application/choose-energy-distributor.use-case.js'
import { createClearEnergyDistributorUseCase } from './companies/application/clear-energy-distributor.use-case.js'
import { createGetCompanyEnergyUseCase } from './companies/application/get-company-energy.use-case.js'
import { DrizzleCompanyEnergyRepository } from './companies/infrastructure/drizzle-company-energy.repository.js'
import { createCompanyEnergyRoutes } from './companies/presentation/company-energy.routes.js'
import { createAdjustDistributionCursorUseCase } from './companies/application/adjust-distribution-cursor.use-case.js'
import { createGetDistributionCursorUseCase } from './companies/application/get-distribution-cursor.use-case.js'
import { DrizzleDistributionCursorRepository } from './companies/infrastructure/drizzle-distribution-cursor.repository.js'
import { createDistributionCursorRoutes } from './companies/presentation/distribution-cursor.routes.js'
import {
  createClearFederalTaxSettingsUseCase,
  createGetFederalTaxSettingsUseCase,
  createSetFederalTaxSettingsUseCase,
} from './companies/application/federal-tax-settings.use-case.js'
import { DrizzleFederalTaxSettingsRepository } from './companies/infrastructure/drizzle-federal-tax-settings.repository.js'
import { createFederalTaxSettingsRoutes } from './companies/presentation/federal-tax-settings.routes.js'
import {
  createClearDriverAllowanceSettingsUseCase,
  createGetDriverAllowanceSettingsUseCase,
  createSetDriverAllowanceSettingsUseCase,
} from './companies/application/driver-allowance-settings.use-case.js'
import { DrizzleDriverAllowanceSettingsRepository } from './companies/infrastructure/drizzle-driver-allowance-settings.repository.js'
import { createDriverAllowanceSettingsRoutes } from './companies/presentation/driver-allowance-settings.routes.js'
import { DrizzleCompanyFiscalEnvironmentRepository } from './companies/infrastructure/drizzle-company-fiscal-environment.repository.js'
import { DrizzleScheduledDistributionRepository } from './companies/infrastructure/drizzle-scheduled-distribution.repository.js'
import { DrizzleScheduledDistributionStatusRepository } from './companies/infrastructure/drizzle-scheduled-distribution-status.repository.js'
import { createScheduledDistributionRoutes } from './companies/presentation/scheduled-distribution.routes.js'
import { DrizzleCompanyLogoRepository } from './companies/infrastructure/drizzle-company-logo.repository.js'
import { createDrizzleCompanyGroupRepository } from './landing/infrastructure/drizzle-company-group.repository.js'
import { createDrizzleLandingSettingsRepository } from './landing/infrastructure/drizzle-landing-settings.repository.js'
import { createDrizzleAggregateApplicationRepository } from './fleet/infrastructure/drizzle-aggregate-application.repository.js'
import { createDrizzleAggregateAccountRepository } from './fleet/infrastructure/drizzle-aggregate-account.repository.js'
import { DrizzleCompanySettingsRepository } from './companies/infrastructure/drizzle-company-settings.repository'
import { DrizzleDigitalCertificateRepository } from './companies/infrastructure/drizzle-digital-certificate.repository'
import { createFiscalCertificateValidationGateway } from './companies/infrastructure/fiscal-certificate-validation.gateway'
import { createFiscalCompanyProfileLookupGateway } from './companies/infrastructure/fiscal-company-profile-lookup.gateway'
import { createPublicCnpjInfoRoutes } from './companies/presentation/public-cnpj-info.routes'
import type { CompanySettingsDatabase } from './companies/infrastructure/drizzle-company-settings.types'
import { createCompanyLogoRoutes } from './companies/presentation/company-logo.routes.js'
import {
  createLandingPublicRoutes,
  createLandingSettingsRoutes,
} from './landing/presentation/landing.routes.js'
import {
  createAggregateApplicationPublicRoutes,
  createAggregateApplicationRoutes,
} from './fleet/presentation/aggregate-application.routes.js'
import { createAggregateAccountPublicRoutes } from './fleet/presentation/aggregate-account.routes.js'
import { createAggregateApplicationAttachmentPublicRoutes } from './fleet/presentation/aggregate-application-attachment.routes.js'
import { createAggregateApplicationAttachmentUseCase } from './fleet/application/aggregate-application-attachment.use-case.js'
import { createDrizzleAggregateApplicationAttachmentRepository } from './fleet/infrastructure/drizzle-aggregate-application-attachment.repository.js'
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
import { createNfseCredentialSecretService } from './nfse-profiles/application/nfse-credential-secret.service.js'
import { createNfseEmissionProfilesUseCase } from './nfse-profiles/application/nfse-emission-profiles.use-case.js'
import { createNfseProviderCredentialsUseCase } from './nfse-profiles/application/nfse-provider-credentials.use-case.js'
import { DrizzleNfseProfileRepository } from './nfse-profiles/infrastructure/drizzle-nfse-profile.repository.js'
import { createNfseEmissionProfileRoutes } from './nfse-profiles/presentation/nfse-emission-profiles.routes.js'
import { createNfseProviderCredentialRoutes } from './nfse-profiles/presentation/nfse-provider-credentials.routes.js'
import { createWhatsAppChannelRoutes } from './whatsapp/presentation/whatsapp-channel.routes'
import { createMetaWhatsAppSendingChannel } from './whatsapp/infrastructure/meta-whatsapp-sending.gateway.js'
import { createWhatsAppNotificationDriver } from './whatsapp/application/whatsapp-notification-driver.service.js'
import { createWhatsAppChannelUseCase } from './whatsapp/application/whatsapp-channel.use-case'
import { createWhatsAppChannelSecretService } from './whatsapp/application/whatsapp-channel-secret.service'
import { DrizzleWhatsAppChannelRepository } from './whatsapp/infrastructure/drizzle-whatsapp-channel.repository'
import { createExportNfseDocumentsUseCase } from './nfse-invoices/application/export-nfse-documents.use-case.js'
import { createNfseInvoiceCancellationUseCase } from './nfse-invoices/application/nfse-invoice-cancellation.use-case.js'
import { createNfseInvoiceDiscardUseCase } from './nfse-invoices/application/nfse-invoice-discard.use-case.js'
import { createNfseInvoiceReissueUseCase } from './nfse-invoices/application/nfse-invoice-reissue.use-case.js'
import { createNfseInvoiceQueryUseCase } from './nfse-invoices/application/nfse-invoice-query.use-case.js'
import { createNfseInvoiceUseCase } from './nfse-invoices/application/nfse-invoice.use-case.js'
import { DrizzleNfseInvoiceRepository } from './nfse-invoices/infrastructure/drizzle-nfse-invoice.repository.js'
import { createNfseArchiveGateway } from './nfse-invoices/infrastructure/nfse-archive.gateway.js'
import { createNfseExportSelection } from './nfse-invoices/infrastructure/nfse-export-selection.query.js'
import { createNfseFiscalDocumentArchiveGateway } from './nfse-invoices/infrastructure/nfse-fiscal-document-archive.gateway.js'
import { createNfseInvoiceRoutes } from './nfse-invoices/presentation/nfse-invoices.routes.js'
import { createNotifyNfseCallbackUseCase } from './nfse-callbacks/application/notify-nfse-callback.use-case.js'
import { DrizzleNfseCallbackRepository } from './nfse-callbacks/infrastructure/drizzle-nfse-callback.repository.js'
import { createWhatsAppWebhookRoutes } from './whatsapp/presentation/whatsapp-webhook.routes.js'
import { createMetaWhatsAppModuleResolver } from './whatsapp/application/meta-whatsapp-module.resolver.js'
import { createDrizzleWebhookNonceStore } from './whatsapp/infrastructure/drizzle-webhook-nonce.store.js'
import { createRateLimiter } from './http/rate-limiter.service.js'
import { DrizzleRateLimiterRepository } from './http/drizzle-rate-limiter.repository.js'
import { FlowGraphRepository } from '@adatechnology/meta-whatsapp-module'
import { createDriverWhatsAppFlowActions } from './whatsapp-commands/application/register-driver-flow-actions.js'
import { createOperatorWhatsAppFlowActions } from './whatsapp-commands/application/register-operator-trip-flow-actions.js'
import { createIssuanceWhatsAppFlowActions } from './whatsapp-commands/application/register-issuance-flow-actions.js'
import { createPreviewDocumentSelectionUseCase } from './whatsapp-commands/application/preview-document-selection.use-case.js'
import { createConfirmDocumentSelectionUseCase } from './whatsapp-commands/application/confirm-document-selection.use-case.js'
import { createNfseCredentialGapFinder } from './whatsapp-commands/application/preview-nfse-blocks.service.js'
import { DrizzleDocumentSelectionRepository } from './whatsapp-commands/infrastructure/drizzle-document-selection.repository.js'
import { DrizzleWhatsAppCommandRepository } from './whatsapp-commands/infrastructure/drizzle-whatsapp-command.repository.js'
import { createResolveWhatsAppActorUseCase } from './whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { createModuleWhatsAppFlowGraphProvider } from './whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { WHATSAPP_ROOT_FLOW_GRAPH_KEY } from './whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'
import { DrizzleWhatsAppPhoneRepository } from './whatsapp-commands/infrastructure/drizzle-whatsapp-phone.repository.js'
import {
  createWhatsAppCommandHookFactory,
  type WhatsAppCommandHookFactory,
} from './whatsapp-commands/infrastructure/whatsapp-command-hook.factory.js'
import { createReadWhatsAppPhoneStateUseCase } from './whatsapp-commands/application/read-whatsapp-phone-state.use-case.js'
import { createRequestWhatsAppPhoneVerificationUseCase } from './whatsapp-commands/application/request-whatsapp-phone-verification.use-case.js'
import { createUnbindWhatsAppPhoneUseCase } from './whatsapp-commands/application/unbind-whatsapp-phone.use-case.js'
import { createVerifyWhatsAppPhoneUseCase } from './whatsapp-commands/application/verify-whatsapp-phone.use-case.js'
import { createWhatsAppPhoneRoutes } from './whatsapp-commands/presentation/whatsapp-phone.routes.js'
import { createNfseCallbackRoutes } from './nfse-callbacks/presentation/nfse-callbacks.routes.js'
import { createSettleWhatsAppCommandUseCase } from './whatsapp-commands/application/settle-whatsapp-command.use-case.js'
import { DrizzleWhatsAppCommandSettlementRepository } from './whatsapp-commands/infrastructure/drizzle-whatsapp-command-settlement.repository.js'
import { createWhatsAppCommandSettlementRoutes } from './whatsapp-commands/presentation/whatsapp-command-settlement.routes.js'
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
import { createReadMdfeDocumentUseCase } from './mdfe-manifests/application/read-mdfe-document.use-case.js'
import { createDamdfePdfGateway } from './mdfe-manifests/infrastructure/damdfe-pdf.gateway.js'
import { createMdfeDocumentDownloadGateway } from './mdfe-manifests/infrastructure/mdfe-document-download.gateway.js'
import { readDeliveryProofs } from './trips/application/read-delivery-proof.use-case.js'
import { readRouteGeometry } from './trips/application/read-route-geometry.use-case.js'
import { readTripRouteGeometry as readTripRouteGeometryUseCase } from './trips/application/read-trip-route-geometry.use-case.js'
import { freezeTripPlannedRoute } from './trips/application/freeze-trip-planned-route.use-case.js'
import { planTripRoute } from './trips/application/plan-trip-route.use-case.js'
import { createOsrmRouteGeometryGateway } from './trips/infrastructure/osrm-route-geometry.gateway.js'
import { createRouteDepotQuery } from './trips/infrastructure/route-depot.query.js'
import { createRouteGeometryVehicleAxlesQuery } from './trips/infrastructure/route-geometry-vehicle-axles.query.js'
import { DrizzleTripPlannedRouteRepository } from './trips/infrastructure/drizzle-trip-planned-route.repository.js'
import { createDrizzleTollBoothRepository } from './toll-booths/infrastructure/drizzle-toll-booth.repository.js'
import { listTripStopCoordinates } from './trips/infrastructure/trip-stop-coordinates.support.js'
import { createDeliveryProofDownloadGateway } from './trips/infrastructure/delivery-proof-download.gateway.js'
import { readTripDocumentProducts } from './trips/application/read-trip-document-products.use-case.js'
import { createRequestCargoLayoutUseCase } from './trips/application/request-cargo-layout.use-case.js'
import { DrizzleCargoLayoutRequestRepository } from './trips/infrastructure/drizzle-cargo-layout-request.repository.js'
import { createReadCargoLayoutUseCase } from './trips/application/read-cargo-layout.use-case.js'
import { createReopenCargoLayoutUseCase } from './trips/application/reopen-cargo-layout.use-case.js'
import { DrizzleCargoLayoutLookupRepository } from './trips/infrastructure/drizzle-cargo-layout-lookup.repository.js'
import { registerDriverOccurrence } from './trips/application/register-driver-occurrence.use-case.js'
import { readTripActionSnapshot } from './trips/application/read-trip-action-snapshot.use-case.js'
import { readTripActionSnapshot as readTripActionSnapshotQuery } from './trips/infrastructure/trip-action-snapshot.query.js'
import { readTripFieldDeliveryDocuments as readTripFieldDeliveryDocumentsQuery } from './trips/infrastructure/trip-field-delivery-documents.query.js'
import { readFieldDeliveryDocuments } from './trips/application/read-field-delivery-documents.use-case.js'
import { createTripFieldDeliveryDocumentsRoutes } from './trips/presentation/trip-field-delivery-documents.routes.js'
import { registerTripOccurrence } from './trips/application/register-trip-occurrence.use-case.js'
import { persistSeparationOccurrenceWithAttachment } from './trips/application/persist-separation-occurrence-attachment.service.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from './trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { attachOccurrencePhoto } from './trips/application/attach-occurrence-photo.use-case.js'
import { DrizzleAttachOccurrencePhotoUnitOfWork } from './trips/infrastructure/drizzle-attach-occurrence-photo.repository.js'
import { DrizzleOccurrenceAttachmentRepository } from './trips/infrastructure/drizzle-occurrence-attachment.repository.js'
import { readOccurrenceAttachments } from './trips/application/occurrence-attachment.service.js'
import { OFFICE_PROOF_MAX_BYTES } from './trips/domain/delivery-proof.policy.js'
import { withFieldReport } from './trips/application/trip-field-report.port.js'
import {
  buildOccurrenceAttachmentAppendFingerprint,
  buildOccurrenceAttachmentCreateFingerprint,
  OCCURRENCE_ATTACHMENT_APPEND_OPERATION,
  OCCURRENCE_ATTACHMENT_CREATE_OPERATION,
  sha256Hex,
} from './trips/domain/occurrence-attachment.policy.js'
import { TRIP_FIELD_CHANNELS } from './trips/domain/trip-field-channel.constant.js'
import { saveOccurrenceTypeWithTemplate } from './trips/application/save-occurrence-type.use-case.js'
import {
  createListTripOccurrenceFeedUseCase,
  createReadTripOccurrenceAttachmentsUseCase,
} from './trips/application/trip-occurrence-feed.use-case.js'
import {
  listTripOccurrenceAttachmentLocations,
  listTripOccurrenceFeed,
} from './trips/infrastructure/trip-occurrence-feed.query.js'
import { createOccurrenceNotifier } from './trips/infrastructure/occurrence-notifier.gateway.js'
import { createStopOccurrenceNotifier } from './trips/infrastructure/stop-occurrence-notifier.gateway.js'
import {
  findDriverReachableDocument,
  findOccurrenceForAttachment,
  findTripOccurrenceById,
  listDeliveryProofs,
  listDocumentProducts,
  findOccurrenceType,
  listOccurrenceTypes,
  listTripOccurrences,
  readOccurrenceLabels,
  readOccurrenceLabelsForDocuments,
  readOccurrenceTemplateValues,
  saveOccurrenceType,
  saveTripOccurrence,
} from './trips/infrastructure/delivery-proof-read.support.js'
import { createMdfeDocumentSource } from './mdfe-manifests/infrastructure/mdfe-document.query.js'
import { createMdfeXmlReaderGateway } from './mdfe-manifests/infrastructure/mdfe-xml-reader.gateway.js'
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
import { createDriverHomeGeocoder } from './fleet/application/driver-home-geocoder.port.js'
import { createPhotonDriverHomeGateway } from './fleet/infrastructure/photon-driver-home.gateway.js'
import { createFleetDriversUseCase } from './fleet/application/fleet-drivers.use-case'
import { createFleetDriverScoresUseCase } from './fleet/application/fleet-driver-scores.use-case'
import type { FleetVehicleCatalogPort } from './fleet/application/fleet-vehicle-catalog.port'
import { createFleetVehiclesUseCase } from './fleet/application/fleet-vehicles.use-case'
import { createCachedVehicleCatalogGateway } from './fleet/infrastructure/cached-vehicle-catalog.gateway'
import { CompanyFuelPriceGateway } from './fleet/infrastructure/company-fuel-price.gateway'
import { createFipeVehicleCatalogGateway } from './fleet/infrastructure/fipe-vehicle-catalog.gateway'
import { DrizzleFleetDriverVehicleRepository } from './fleet/infrastructure/drizzle-fleet-driver-vehicle.repository'
import { DrizzleFleetDriverRepository } from './fleet/infrastructure/drizzle-fleet-driver.repository'
import { DrizzleFleetVehicleRepository } from './fleet/infrastructure/drizzle-fleet-vehicle.repository'
import { createFleetCatalogRoutes } from './fleet/presentation/fleet-catalog.routes'
import { createVehicleReferenceRoutes } from './fleet/presentation/vehicle-reference.routes'
import { DrizzleVehicleReferenceRepository } from './fleet/infrastructure/drizzle-vehicle-reference.repository'
import { createIdentityContactDirectoryGateway } from './fleet/infrastructure/identity-contact-directory.gateway'
import { createFleetRoutes } from './fleet/presentation/fleet.routes'
import { createLookupPostalCodeUseCase } from './addresses/application/lookup-postal-code.use-case.js'
import { createReadAddressReportUseCase } from './addresses/application/read-address-report.use-case.js'
import { createDrizzleAddressReportRepository } from './addresses/infrastructure/drizzle-address-report.repository.js'
import { DrizzlePostalCodeRepository } from './addresses/infrastructure/drizzle-postal-code.repository.js'
import { createPostalCodeGateway } from './addresses/infrastructure/postal-code.gateway.js'
import { createAddressReportRoutes } from './addresses/presentation/address-report.routes.js'
import { createSaveAddressCorrectionDraftUseCase } from './address-correction/application/save-address-correction-draft.use-case.js'
import { createListAddressCorrectionRequestsUseCase } from './address-correction/application/list-address-correction-requests.use-case.js'
import { createFindAddressCorrectionRecipientsUseCase } from './address-correction/application/find-address-correction-recipients.use-case.js'
import { createSendAddressCorrectionMailUseCase } from './address-correction/application/send-address-correction-mail.use-case.js'
import { DrizzleAddressCorrectionRepository } from './address-correction/infrastructure/drizzle-address-correction.repository.js'
import { DrizzleAddressCorrectionMailRepository } from './address-correction/infrastructure/drizzle-address-correction-mail.repository.js'
import { createAddressCorrectionRoutes } from './address-correction/presentation/address-correction.routes.js'
import { createPostalCodeRoutes } from './addresses/presentation/postal-code.routes.js'
import { createTripMdfeManifestUseCase } from './mdfe-manifests/application/create-trip-mdfe-manifest.use-case'
import { createMdfeIssuanceUseCase } from './mdfe-manifests/application/mdfe-issuance.use-case'
import { createMdfeManifestsUseCase } from './mdfe-manifests/application/mdfe-manifests.use-case'
import { createPreviewMdfeManifestUseCase } from './mdfe-manifests/application/preview-mdfe-manifest.use-case'
import { DrizzleMdfeIssuanceRepository } from './mdfe-manifests/infrastructure/drizzle-mdfe-issuance.repository'
import { DrizzleMdfeManifestRepository } from './mdfe-manifests/infrastructure/drizzle-mdfe-manifest.repository'
import { createMdfeIssuanceRoutes } from './mdfe-manifests/presentation/mdfe-issuance.routes'
import { createMdfeManifestRoutes } from './mdfe-manifests/presentation/mdfe-manifests.routes'
import { readTripRevenueTotals } from './trips/application/read-trip-revenue-totals.use-case.js'
import { createTripUseCase } from './trips/application/trip.use-case'
import { createTripLifecycleUseCase } from './trips/application/trip-lifecycle.use-case'
import { listReturnedWithActiveCte } from './trips/application/list-returned-with-active-cte.use-case'
import { createLinkTripDocumentsBatchUseCase } from './trips/application/link-trip-documents-batch.use-case.js'
import { previewTripCargo } from './trips/application/preview-trip-cargo.use-case.js'
import { readCargoPreviewContext } from './trips/infrastructure/trip-cargo-preview.query.js'
import { previewTripValuation } from './trips/application/read-trip-valuation.use-case.js'
import { DrizzleTripRepository } from './trips/infrastructure/drizzle-trip.repository'
import { DrizzleTripDocumentRepository } from './trips/infrastructure/drizzle-trip-document.repository'
import { DrizzleTripDocumentBatchRepository } from './trips/infrastructure/drizzle-trip-document-batch.repository'
import { DrizzleTripRouteRepository } from './trips/infrastructure/drizzle-trip-route.repository'
import { DrizzleTripStopLookupRepository } from './trips/infrastructure/drizzle-trip-stop-lookup.repository'
import { readTripFiscalReadiness } from './trips/application/read-trip-fiscal-readiness.use-case'
import { listTripCosts } from './trips/application/list-trip-costs.use-case'
import { createReadTripTimelineUseCase } from './trips/application/read-trip-timeline.use-case'
import { findTripCompanyScope, listTripTimeline } from './trips/infrastructure/trip-timeline.query'
import { readTripValuation } from './trips/application/read-trip-valuation.use-case'
import { setTripMdfeRequirement } from './trips/application/set-trip-mdfe-requirement.use-case'
import { DrizzleTripValuationQuery } from './trips/infrastructure/trip-valuation.query'
import { DrizzleTripFinancialResultRepository } from './trips/infrastructure/drizzle-trip-financial-result.repository.js'
import { DrizzleFinancialSummaryQuery } from './trips/infrastructure/financial-summary.query.js'
import { buildFinancialSummary } from './trips/domain/financial-summary.policy.js'
import type { RouteChoice } from './trips/domain/route-choice.policy.js'
import {
  CARGO_LAYOUT_MAX_ATTEMPTS,
  resolveCargoLayoutLeaseMs,
} from './trips/domain/cargo-layout-lease.policy.js'
import { createFinancialSummaryRoutes } from './trips/presentation/financial-summary.routes.js'
import { createTripDocumentReviewRoutes } from './trips/presentation/trip-document-review.routes.js'
import { DrizzleTripDocumentReviewRepository } from './trips/infrastructure/drizzle-trip-document-review.repository.js'
import { DrizzleTripCostRepository } from './trips/infrastructure/drizzle-trip-cost.repository.js'
import { freezeTripFinancialResult } from './trips/application/freeze-trip-financial-result.use-case.js'
import { DrizzleApplicableFreightRuleQuery } from './freight/infrastructure/drizzle-freight.repository'
import { createTripCteBatch } from './trips/application/create-trip-cte-batch.use-case'
import { issueTripManifestAutomatically } from './mdfe-manifests/application/issue-trip-manifest-automatically.use-case'
import { DrizzleAutomaticManifestRepository } from './mdfe-manifests/infrastructure/drizzle-automatic-manifest.repository'
import { DrizzleTripFiscalReadinessQuery } from './trips/infrastructure/trip-fiscal-readiness.query'
import { DrizzleDeliveryAddressOverrideRepository } from './trips/infrastructure/drizzle-delivery-address-override.repository'
import { createTripRoutes } from './trips/presentation/trip.routes'
import { createMeTripRoutes } from './trips/presentation/me-trip.routes'
import { createTripFieldOfficeRoutes } from './trips/presentation/trip-field-office.routes'
import { createTripFieldOfficeOccurrenceRoutes } from './trips/presentation/trip-field-office-occurrence.routes.js'
import { createTripFieldDeliverySettingsRoutes } from './trips/presentation/trip-field-delivery-settings.routes.js'
import { listFieldOccurrenceTypes } from './trips/application/list-field-occurrence-types.use-case.js'
import { registerOfficeDocumentOccurrences } from './trips/application/register-office-document-occurrences.use-case.js'
import { DrizzleOfficeOccurrenceBatchUnitOfWork } from './trips/infrastructure/drizzle-office-occurrence-batch.repository.js'
import { DrizzleFieldTripTargetRepository } from './trips/infrastructure/drizzle-field-trip-target.repository'
import { findCurrentDriverTrip } from './trips/application/find-current-driver-trip.use-case'
import { reportStopArrival } from './trips/application/report-stop-arrival.use-case'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from './trips/application/report-document-delivery.use-case'
import { reportStopOccurrence } from './trips/application/report-stop-occurrence.use-case'
import { attachDeliveryProof } from './trips/application/attach-delivery-proof.use-case'
import { reportFieldProof } from './trips/application/report-field-proof.use-case'
import { createDeliveryProofDocumentSecretService } from './trips/application/delivery-proof-document-secret.service'
import { dispatchDriverTrip } from './trips/application/dispatch-driver-trip.use-case'
import { dispatchTrip } from './trips/application/dispatch-trip.use-case'
import { transitionTripDocument } from './trips/application/transition-trip-document.use-case.js'
import { transitionTripDocumentsBatch } from './trips/application/transition-trip-documents-batch.use-case.js'
import { listWarehouseTrips } from './trips/application/list-warehouse-trips.use-case.js'
import { DrizzleWarehouseTripRepository } from './trips/infrastructure/drizzle-warehouse-trip.repository.js'
import { createDeliveryProofStorage } from './trips/infrastructure/delivery-proof-storage.gateway'
import { DrizzleDeliveryProofRepository } from './trips/infrastructure/drizzle-delivery-proof.repository'
import { DrizzleDeliveryProofSettingsRepository } from './trips/infrastructure/drizzle-delivery-proof-settings.repository'
import { createDeliveryProofSettingsRoutes } from './trips/presentation/delivery-proof-settings.routes'
import { DrizzleCurrentDriverTripRepository } from './trips/infrastructure/drizzle-current-driver-trip.repository'
import { DrizzleDriverScoreRepository } from './fleet/infrastructure/drizzle-driver-score.repository'
import type { DriverFieldReportTransactionPort } from './trips/application/driver-field-report.port.js'
import { DrizzleDriverFieldReportUnitOfWork } from './trips/infrastructure/drizzle-driver-field-report.repository'
import { createRouteSuggestionRoutes } from './routing/presentation/route-suggestion.routes'
import { createMultiVehicleSuggestionRoutes } from './routing/presentation/multi-vehicle-suggestion.routes'
import { createMultiVehicleSuggestionUseCase } from './routing/application/multi-vehicle-suggestion.use-case'
import { createDrizzleMultiVehicleSuggestionRepository } from './routing/infrastructure/drizzle-multi-vehicle-suggestion.repository'
import { readSuggestionValuation } from './routing/application/read-suggestion-valuation.use-case'
import { createSuggestionValuationAdapter } from './routing/infrastructure/suggestion-valuation.adapter'
import { createTripComposer } from './routing/infrastructure/trip-composer.adapter'
import { listTripStops } from './trips/application/list-trip-stops.use-case'
import { createRouteSuggestionUseCase } from './routing/application/route-suggestion.use-case'
import { createRefineAddressUseCase } from './routing/application/refine-address.use-case.js'
import { createDrizzleAddressComponentsSource } from './routing/infrastructure/drizzle-address-components.repository.js'
import {
  GEOCODING_REFINEMENT_WINDOW_LIMIT,
  createDrizzleGeocodingRefinementRepository,
} from './routing/infrastructure/drizzle-geocoding-refinement.repository.js'
import { createGoogleGeocodingGateway } from './routing/infrastructure/google-geocoding.gateway.js'
import { createRunJobUseCase } from './operations/application/run-job.use-case.js'
import type { JobRunPublisher } from './operations/application/run-job.port.js'
import { createDrizzleManualExecutionRepository } from './operations/infrastructure/drizzle-manual-execution.repository.js'
import { createJobScheduleControlUseCase } from './operations/application/job-schedule-control.use-case.js'
import { createDrizzleJobScheduleControlRepository } from './operations/infrastructure/drizzle-job-schedule-control.repository.js'
import { buildJobRunRabbitMqTopology } from './operations/infrastructure/job-run-rabbitmq-topology.js'
import { createLazyRabbitMqJobRunPublisher } from './operations/infrastructure/rabbitmq-job-run.publisher.js'
import { createGeocodedAddressCorrectionUseCase } from './routing/application/geocoded-address-correction.use-case'
import { createDrizzleRouteSuggestionRepository } from './routing/infrastructure/drizzle-route-suggestion.repository'
import { createDrizzleGeocodedAddressRepository } from './routing/infrastructure/drizzle-geocoded-address.repository'
import { createDrizzleGeocodedAddressCorrectionRepository } from './routing/infrastructure/drizzle-geocoded-address-correction.repository'
import { createDrizzleTripRouteGate } from './routing/infrastructure/drizzle-trip-route-gate.adapter'
import { createTripStopOrderWriter } from './routing/infrastructure/trip-stop-order.adapter'
import { createLazyRabbitMqRouteOptimizationQueue } from './routing/infrastructure/rabbitmq-route-optimization.queue'
import type { RouteOptimizationQueue } from './routing/application/route-suggestion.use-case'
import { buildRouteOptimizationTopology } from './routing/infrastructure/route-optimization-topology'
import { createFreightSimulationUseCase } from './freight-calculations/application/freight-simulation.use-case'
import {
  DrizzleFreightCalculationListRepository,
  DrizzleFreightRepository,
  DrizzleFreightRuleListRepository,
  DrizzleFreightSimulationRepository,
} from './freight/infrastructure/drizzle-freight.repository'
import { createFreightRoutes } from './freight/presentation/freight.routes'
import { createFreightRulesUseCase } from './freight-rules/application/freight-rules.use-case'
import { createFreightRegionsUseCase } from './freight-regions/application/freight-regions.use-case'
import { createImportFreightRegionsUseCase } from './freight-regions/application/import-freight-regions.use-case'
import { createFleetDriverRegionsUseCase } from './freight-regions/application/fleet-driver-regions.use-case'
import { DrizzleFleetDriverRegionRepository } from './freight-regions/infrastructure/drizzle-fleet-driver-region.repository'
import { DrizzleFreightRegionRepository } from './freight-regions/infrastructure/drizzle-freight-region.repository'
import { createFleetDriverRegionRoutes } from './freight-regions/presentation/fleet-driver-region.routes'
import {
  createContractorsUseCase,
  createMunicipalHolidaysUseCase,
} from './delivery-clients/application/contractors.use-case.js'
import {
  DrizzleContractorRepository,
  DrizzleMunicipalHolidayRepository,
} from './delivery-clients/infrastructure/drizzle-contractor.repository.js'
import { createContractorRoutes } from './delivery-clients/presentation/contractor.routes.js'
import { createContractorContactsUseCase } from './contractor-mail/application/contractor-contacts.use-case.js'
import { createContractorMailCredentialSecretService } from './contractor-mail/application/contractor-mail-credential-secret.service.js'
import { createContractorMailSettingsUseCase } from './contractor-mail/application/contractor-mail-settings.use-case.js'
import { createProcessInboundEmailWebhookUseCase } from './contractor-mail/application/process-inbound-email-webhook.use-case.js'
import { createSendContractorMailTestEmailUseCase } from './contractor-mail/application/send-contractor-mail-test-email.use-case.js'
import { createActorEmailRepository } from './contractor-mail/infrastructure/actor-email.repository.js'
import { DrizzleContractorMailRepository } from './contractor-mail/infrastructure/drizzle-contractor-mail.repository.js'
import { createMxLookupGateway } from './contractor-mail/infrastructure/mx-lookup.gateway.js'
import { createResendAccountGateway } from './contractor-mail/infrastructure/resend-account.gateway.js'
import { createContractorContactRoutes } from './contractor-mail/presentation/contractor-contacts.routes.js'
import { createContractorMailSettingsRoutes } from './contractor-mail/presentation/contractor-mail-settings.routes.js'
import { createContractorMailTemplatesUseCase } from './contractor-mail/application/contractor-mail-templates.use-case.js'
import { DrizzleContractorMailTemplateRepository } from './contractor-mail/infrastructure/drizzle-contractor-mail-template.repository.js'
import { createContractorMailTemplateRoutes } from './contractor-mail/presentation/contractor-mail-templates.routes.js'
import { buildAddressCorrectionMail } from './address-correction/domain/address-correction-mail.template.js'
import { ADDRESS_CORRECTION_MAIL_SAMPLE } from './address-correction/domain/address-correction-mail-sample.constant.js'
import { createPublicInboundEmailRoutes } from './contractor-mail/presentation/public-inbound-email.routes.js'
import { createContractorPortalBindingRoutes } from './contractor-portal/presentation/contractor-portal-binding.routes.js'
import { createContractorDeliveryRoutes } from './contractor-portal/presentation/contractor-delivery.routes.js'
import { createReadContractorDeliveryLocationUseCase } from './contractor-portal/application/read-contractor-delivery-location.use-case.js'
import { createMeLocationRoutes } from './trips/presentation/me-location.routes.js'
import { createRecordTripLocationUseCase } from './trips/application/record-trip-location.use-case.js'
import { DrizzleTripLocationRepository } from './trips/infrastructure/drizzle-trip-location.repository.js'
import { createScheduleContractorDeliveryUseCase } from './contractor-portal/application/schedule-contractor-delivery.use-case.js'
import { createContractorExtraChargesUseCase } from './contractor-portal/application/contractor-extra-charges.use-case.js'
import { createContractorExtraChargeRoutes } from './contractor-portal/presentation/contractor-extra-charge.routes.js'
import { createReadContractorDeliveriesUseCase } from './contractor-portal/application/read-contractor-deliveries.use-case.js'
import { DrizzleContractorPortalRepository } from './contractor-portal/infrastructure/drizzle-contractor-portal.repository.js'
import { DrizzleContractorPortalBindingRepository } from './contractor-portal/infrastructure/drizzle-contractor-portal-binding.repository.js'
import { createDeliveryClientsUseCase } from './delivery-clients/application/delivery-clients.use-case.js'
import { createDeliveryChargesUseCase } from './delivery-clients/application/delivery-charges.use-case.js'
import { createExtraChargeBatchesUseCase } from './delivery-clients/application/extra-charge-batches.use-case.js'
import { DrizzleExtraChargeBatchRepository } from './delivery-clients/infrastructure/drizzle-extra-charge-batch.repository.js'
import { createExtraChargeBatchRoutes } from './delivery-clients/presentation/extra-charge-batch.routes.js'
import { createPublicExtraChargeBatchRoutes } from './delivery-clients/presentation/public-extra-charge-batch.routes.js'
import { createSuggestDeliveryCharges } from './delivery-clients/application/suggest-delivery-charges.use-case.js'
import {
  DrizzleDeliveryChargeRepository,
  DrizzleDeliveryChargeRuleRepository,
} from './delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { createDeliveryChargeRoutes } from './delivery-clients/presentation/delivery-charge.routes.js'
import { createTripStopSchedulesUseCase } from './delivery-clients/application/trip-stop-schedule.use-case.js'
import { DrizzleTripStopScheduleRepository } from './delivery-clients/infrastructure/drizzle-trip-stop-schedule.repository.js'
import { DrizzleDeliveryClientRepository } from './delivery-clients/infrastructure/drizzle-delivery-client.repository.js'
import { createDeliveryClientRoutes } from './delivery-clients/presentation/delivery-client.routes.js'
import { createFreightRegionRoutes } from './freight-regions/presentation/freight-region.routes'
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
import { createInvitationCodeSecretService } from './identity/application/invitation-code-secret.service.js'
import { createConfirmPasswordResetUseCase } from './identity/application/confirm-password-reset.use-case'
import { createPasswordResetCodeSecretService } from './identity/application/password-reset-code.service.js'
import { createRequestPasswordResetUseCase } from './identity/application/request-password-reset.use-case'
import { DrizzlePasswordResetDeliveryOutboxRepository } from './identity/infrastructure/drizzle-password-reset-delivery-outbox.repository'
import { DrizzlePasswordResetRepository } from './identity/infrastructure/drizzle-password-reset.repository'
import { createLoginHintRoutes } from './identity/presentation/login-hint.routes'
import { createResolveLoginHintUseCase } from './identity/application/resolve-login-hint.use-case'
import { createDrizzleLoginIdentifierRepository } from './identity/infrastructure/drizzle-login-identifier.repository'
import { createPasswordResetRoutes } from './identity/presentation/password-reset.routes'
import { DrizzleInvitationDeliveryOutboxRepository } from './identity/infrastructure/drizzle-invitation-delivery-outbox.repository'
import { DrizzleInvitationRepository } from './identity/infrastructure/drizzle-invitation.repository'
import { createKeycloakAccessTokenVerifier } from './identity/infrastructure/keycloak-jwt.gateway'
import {
  createIdentityAccessGateway,
  createIdentityGroupGateway,
  createKeycloakAdminGateway,
} from './identity/infrastructure/keycloak-admin.gateway'
import { createBootstrapRoutes } from './identity/presentation/bootstrap.routes'
import { createUserActivationRoutes } from './identity/presentation/user-activation.routes'
import { createBackfillIdentityDocumentsUseCase } from './identity/application/backfill-identity-documents.use-case'
import { createReconcileCompanyUsersUseCase } from './identity/application/reconcile-company-users.use-case'
import { createListRolePermissionsUseCase } from './identity/application/list-role-permissions.use-case'
import { createAssignCompanyUserRolesUseCase } from './identity/application/assign-company-user-roles.use-case'
import { createManageCompanyGroupsUseCase } from './identity/application/manage-company-groups.use-case'
import { createManageDirectPermissionsUseCase } from './identity/application/manage-direct-permissions.use-case'
import { DrizzleCompanyGroupRepository } from './identity/infrastructure/drizzle-company-group.repository'
import { createDrizzleGroupAudit } from './identity/infrastructure/drizzle-group-audit.gateway'
import { createCompanyGroupRoutes } from './identity/presentation/company-group.routes'
import { createUserPictureUseCase } from './identity/application/user-picture.use-case.js'
import { createUserPictureRoutes } from './identity/presentation/user-picture.routes.js'
import { DrizzleUserPictureRepository } from './identity/infrastructure/drizzle-user-picture.repository.js'
import { createPublicUserPictureRoutes } from './identity/presentation/public-user-picture.routes.js'
import { createPublicUserPictureUseCase } from './identity/application/user-picture.use-case.js'
import { createFillProfilesFromRealmUseCase } from './identity/application/fill-profiles-from-realm.use-case.js'
import { createSynchronizeIdentitiesUseCase } from './identity/application/synchronize-identities.use-case'
import { createRevealCompanyUsersUseCase } from './identity/application/reveal-company-users.use-case'
import { createAdoptRealmFieldsUseCase } from './identity/application/adopt-realm-fields.use-case'
import { createManageCompanyUserIdentifiersUseCase } from './identity/application/manage-company-user-identifiers.use-case'
import { createSendTemplateTestUseCase } from './notification/application/send-template-test.use-case'
import { createNotificationTemplateTestRoutes } from './notification/presentation/notification-template-test.routes'
import { createSetCompanyUserPasswordUseCase } from './identity/application/set-company-user-password.use-case'
import { createActivateCompanyUserUseCase } from './identity/application/activate-company-user.use-case'
import { createUserAdministrationRoutes } from './identity/presentation/user-administration.routes'
import { createRouter, type RegisteredAnonymousRoute } from './http/router.service'
import { createGetNfeDistributionStatusUseCase } from './nfe-imports/application/get-nfe-distribution-status.use-case'
import { createGetNfeImportUseCase } from './nfe-imports/application/get-nfe-import.use-case'
import { createListNfeImportsUseCase } from './nfe-imports/application/list-nfe-imports.use-case'
import { createReprocessNfeImportUseCase } from './nfe-imports/application/reprocess-nfe-import.use-case'
import { createRequestNfeImportUseCase } from './nfe-imports/application/request-nfe-import.use-case'
import { createGetLastJobRunUseCase } from './nfe-imports/application/get-last-job-run.use-case.js'
import { DrizzleNfeDistributionStatusRepository } from './nfe-imports/infrastructure/drizzle-nfe-distribution-status.repository'
import { DrizzleNfeImportRepository } from './nfe-imports/infrastructure/drizzle-nfe-import.repository'
import { createNfeImportRoutes } from './nfe-imports/presentation/nfe-imports.routes'
import { DrizzleNfeDocumentRepository } from './nfe-documents/infrastructure/drizzle-nfe-document.repository'
import { DrizzleNfeDocumentEventRepository } from './nfe-documents/infrastructure/drizzle-nfe-document-event.repository'
import { createListNfeDocumentEvents } from './nfe-documents/application/list-nfe-document-events.use-case'
import { createNfeDocumentRoutes } from './nfe-documents/presentation/nfe-documents.routes'
import { createListPackageBoxes } from './nfe-documents/application/list-package-boxes.use-case'
import { createExportPendingPackageBoxes } from './nfe-documents/application/export-pending-package-boxes.use-case'
import { createListPackageBoxSiblings } from './nfe-documents/application/list-package-box-siblings.use-case'
import { createMeasurePackageBox } from './nfe-documents/application/measure-package-box.use-case'
import { createReplicatePackageBoxMeasurement } from './nfe-documents/application/replicate-package-box-measurement.use-case'
import { createListPackageBoxMeasurements } from './nfe-documents/application/list-package-box-measurements.use-case'
import { DrizzlePackageBoxRepository } from './nfe-documents/infrastructure/drizzle-package-box.repository'
import { DrizzleCameraMeasurementSettingsRepository } from './nfe-documents/infrastructure/drizzle-camera-measurement-settings.repository'
import { DrizzlePackageBoxMeasurementExportRepository } from './nfe-documents/infrastructure/drizzle-package-box-measurement-export.repository'
import { createPackageBoxRoutes } from './nfe-documents/presentation/package-box.routes'
import { createPackageBoxMeasurementExportRoutes } from './nfe-documents/presentation/package-box-measurement-export.routes'
import { createOperationsUseCase } from './operations/application/operations.use-case'
import { DrizzleOperationsRepository } from './operations/infrastructure/drizzle-operations.repository'
import { createOperationsRoutes } from './operations/presentation/operations.routes'
import { createGetViewPreferencesUseCase } from './view-preferences/application/get-view-preferences.use-case'
import { createSaveViewPreferencesUseCase } from './view-preferences/application/save-view-preferences.use-case'
import { DrizzleViewPreferencesRepository } from './view-preferences/infrastructure/drizzle-view-preferences.repository'
import { createViewPreferencesRoutes } from './view-preferences/presentation/view-preferences.routes'
import type { ApiEnvironment, ApiLogger } from './shared/api.types'
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
import { NOTIFICATION_DEFAULT_LOCALE } from './notification/notification.constant.js'
import { createAutomaticManifestNotifier } from './mdfe-manifests/infrastructure/automatic-manifest-notifier.gateway.js'
import type { AutomaticManifestNotifierPort } from './mdfe-manifests/application/issue-trip-manifest-automatically.use-case.js'
import type { NotificationModule } from '@adatechnology/notification-module'
import { createApiNotificationModule } from './notification/infrastructure/notification-module.factory.js'
import { NOTIFICATION_ROUTES_BASE_PATH } from './notification/notification.constant.js'
import { buildNotificationRabbitMqTopology } from './notification/infrastructure/notification-rabbitmq-topology.js'
import { createLazyRabbitMqNotificationQueue } from './notification/infrastructure/rabbitmq-notification-queue.adapter.js'
import { createNotificationAuthResolver } from './notification/presentation/notification-auth.resolver.js'
import { createNotificationHttpRouter } from './notification/presentation/notification-http.router.js'
import { createApiUserModule } from './user/infrastructure/user-module.factory.js'
import {
  createUserHttpRouter,
  USER_ROUTES_BASE_PATH,
} from './user/presentation/user-http.router.js'
import {
  AGGREGATE_PORTAL_ROUTES_BASE_PATH,
  createAggregatePortalHttpRouter,
} from './user/presentation/aggregate-portal.router.js'
import { createAggregatePortalUseCase } from './fleet/application/aggregate-portal.use-case.js'
import { createDrizzleAggregatePortalRepository } from './fleet/infrastructure/drizzle-aggregate-portal.repository.js'
import { createAggregateDocumentUseCase } from './fleet/application/aggregate-document.use-case.js'
import { createAggregateDocumentReviewUseCase } from './fleet/application/aggregate-document-review.use-case.js'
import { createDrizzleAggregateDocumentRepository } from './fleet/infrastructure/drizzle-aggregate-document.repository.js'
import { createAggregateDocumentTextGateway } from './fleet/infrastructure/aggregate-document-text.gateway.js'
import { createHttpAggregateDocumentOcrGateway } from './fleet/infrastructure/http-aggregate-document-ocr.gateway.js'
import { createAggregateDocumentReviewRoutes } from './fleet/presentation/aggregate-document-review.routes.js'
import { createAggregateApplicationAttachmentReviewRoutes } from './fleet/presentation/aggregate-application-attachment-review.routes.js'
import { createAggregateApplicationAttachmentReviewUseCase } from './fleet/application/aggregate-application-attachment-review.use-case.js'
import { createDrizzleAggregateApplicationAttachmentReviewRepository } from './fleet/infrastructure/drizzle-aggregate-application-attachment-review.repository.js'
import { startFieldTrip } from './trips/application/start-field-trip.use-case.js'

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
  const database = createDatabaseProvider({ pool: config.databasePool, url: config.databaseUrl })
  const authentication = new AuthenticationService({
    repository: new DrizzleExternalIdentityRepository(database.db),
    verifier: identityGateway,
  })
  const healthService = new HealthService({
    database,
    identityReadiness: identityGateway,
    migrationStatus: new DrizzleMigrationStatusRepository({ database: database.db }),
    /**
     * Spec 078: a revisão publicada, para o descompasso entre API e bundle deixar de ser mudo.
     * Ausente vira `unknown` no próprio serviço — nunca campo que some do corpo.
     */
    ...(process.env.DEPLOYED_REVISION === undefined
      ? {}
      : { revision: process.env.DEPLOYED_REVISION }),
  })
  const messaging = config.messaging
  const notificationQueue =
    messaging === undefined
      ? undefined
      : createLazyRabbitMqNotificationQueue({
          connect: () =>
            createRabbitMqProvider({
              connection: messaging.url,
              topology: buildNotificationRabbitMqTopology({ queuePrefix: messaging.queuePrefix }),
            }),
          logger,
        })
  /**
   * Sem broker não há quem resolva: pedir sugestão responderia `202` para uma fila que ninguém
   * consome, e a proposta ficaria `queued` para sempre. A rota não sobe, e é honesto — melhor
   * `404` no caminho que não existe do que uma promessa que nunca se cumpre (ADR-0044 §7).
   */
  const routeOptimizationQueue =
    messaging === undefined
      ? undefined
      : createLazyRabbitMqRouteOptimizationQueue({
          connect: () =>
            createRabbitMqProvider({
              connection: messaging.url,
              topology: buildRouteOptimizationTopology({ queuePrefix: messaging.queuePrefix }),
            }),
        })
  if (routeOptimizationQueue === undefined) {
    logger.warn('routing.queue.not_configured')
  }

  if (notificationQueue === undefined) {
    // Sem broker o módulo usa a fila em memória dele: nada consome, e a entrega some no restart.
    logger.warn('notification.queue.not_configured')
  }
  /**
   * Spec 062 T004 — **um caminho de envio, não dois**: quem manda WhatsApp é o módulo de notificação,
   * como já é com e-mail. O driver é registrado sempre, e é ele que descobre a cada envio se a
   * instalação tem canal — a credencial mora no banco, por empresa, e ler isso no boot deixaria
   * token rotacionado e canal desligado esperando um restart.
   *
   * Registrar sempre não força ninguém a receber por WhatsApp: o fan-out cruza os canais disponíveis
   * com a **preferência** do destinatário, e quem não pediu WhatsApp continua recebendo por e-mail.
   */
  const whatsappChannelRepository = new DrizzleWhatsAppChannelRepository(database.db)
  const whatsappDriver = createWhatsAppNotificationDriver({
    buildChannel: (channel) =>
      createMetaWhatsAppSendingChannel({
        accessToken: channel.accessToken,
        apiVersion: config.whatsapp.apiVersion,
        baseUrl: config.whatsapp.baseUrl,
        phoneNumberId: channel.phoneNumberId,
      }),
    logger,
    repository: whatsappChannelRepository,
    secretService: createWhatsAppChannelSecretService({
      envelopeProvider: createSecretEnvelopeProvider(config.cryptography.envelopeKeyRing),
    }),
  })
  const notifications = createApiNotificationModule({
    config,
    db: database.db,
    ...(notificationQueue === undefined ? {} : { queue: notificationQueue }),
    whatsappDriver,
  })
  const automaticManifestNotifier = createAutomaticManifestNotifier({
    database: database.db,
    logger,
    send: (params) =>
      notifications.useCases.sendNotification.execute({
        ...params,
        locale: NOTIFICATION_DEFAULT_LOCALE,
      }),
  })
  const tenantContext = new TenantContextService({
    repository: new DrizzleMembershipRepository(database.db),
  })
  /**
   * Spec 144 T015 — as mesmas dependências compostas de `createMeTripRoutes` (`resolveDriverId`,
   * `reportDocumentDelivery`/`reportDocumentReturn`, `registerDriverOccurrence`), montadas aqui
   * também porque o hook do WhatsApp (abaixo) nasce antes das instâncias de `me-trip` mais adiante
   * neste arquivo. Nenhum caminho paralelo: o motorista pelo WhatsApp grava pelo mesmo repositório.
   */
  const whatsappDriverTripRepository = new DrizzleCurrentDriverTripRepository(database.db)
  const whatsappDriverScoreRepository = new DrizzleDriverScoreRepository(database.db)
  const whatsappDriverFieldReports = new DrizzleDriverFieldReportUnitOfWork(database.db)
  const whatsappDeliveryProofRepository = new DrizzleDeliveryProofRepository(database.db)
  /**
   * Spec 161 T16: a mesma reserva/liquidação de chave que `fieldReportGuardTransaction`
   * (`createApplicationRoutes`) monta para a rota HTTP — instância própria porque este bloco vive
   * em `bootstrap()`, escopo diferente. A idempotência do WhatsApp (sha256 do arquivo) usa a mesma
   * tabela `trip_field_reports`, só a chave muda.
   */
  const whatsappFieldReportGuardTransaction = {
    claim: (input: Parameters<DriverFieldReportTransactionPort['claim']>[0]) =>
      whatsappDriverFieldReports.execute((transaction) => transaction.claim(input)),
    settle: (input: Parameters<DriverFieldReportTransactionPort['settle']>[0]) =>
      whatsappDriverFieldReports.execute((transaction) => transaction.settle(input)),
  }
  const driverWhatsAppFlowActions = createDriverWhatsAppFlowActions({
    findCurrentTrip: (input) =>
      findCurrentDriverTrip({
        ...input,
        now: new Date(),
        repository: whatsappDriverTripRepository,
        scores: whatsappDriverScoreRepository,
      }),
    listOccurrenceTypes: (input) =>
      listOccurrenceTypes(database.db, { companyId: input.companyId }),
    registerOccurrence: (input) =>
      registerDriverOccurrence({
        ...input,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        repository: {
          findOccurrenceType: (query) => findOccurrenceType(database.db, query),
          findReachableDocument: (query) => findDriverReachableDocument(database.db, query),
          listDocumentProducts: (query) => listDocumentProducts(database.db, query),
          saveOccurrence: (query) => saveTripOccurrence(database.db, query),
        },
      }),
    reportDelivery: (input) =>
      reportDocumentDelivery({
        ...input,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        now: new Date(),
        resolveProofSettings: (settings) =>
          whatsappDeliveryProofRepository.resolveProofFieldSettings(settings),
        unitOfWork: whatsappDriverFieldReports,
      }),
    reportReturn: (input) =>
      reportDocumentReturn({
        ...input,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        now: new Date(),
        unitOfWork: whatsappDriverFieldReports,
      }),
    resolveDriverId: (input) => whatsappDriverTripRepository.findDriverIdByMembership(input),
  })
  /**
   * Spec 144 T016 — as mesmas repositórios que `createTripLifecycleUseCase` (T009/T010) injeta nas
   * rotas `/trips/:id/documents/:documentId/{separate,load}`, `.../batch-status` e `/dispatch`,
   * numa segunda instância montada aqui por causa da mesma ordem de construção do T015 acima (o
   * hook nasce antes de `tripLifecycle`, mais adiante neste arquivo). Nenhum caminho paralelo: as
   * funções puras (`transitionTripDocument`, `transitionTripDocumentsBatch`, `dispatchTrip`) e as
   * tabelas são as mesmas do painel.
   */
  const whatsappTripDocumentRepository = new DrizzleTripDocumentRepository(database.db)
  const whatsappTripDocumentBatchRepository = new DrizzleTripDocumentBatchRepository(database.db)
  const whatsappTripRouteRepository = new DrizzleTripRouteRepository(database.db)
  const whatsappWarehouseTripRepository = new DrizzleWarehouseTripRepository(database.db)
  const operatorWhatsAppFlowActions = createOperatorWhatsAppFlowActions({
    /**
     * Spec 161 T16 (RF20b): a chave de idempotência do WhatsApp é o **sha256 do arquivo
     * baixado** — nunca o `media-id` (muda a cada reenvio da mesma foto pelo operador) nem o
     * `occurrenceId` (circular: ele só existe depois que a primeira foto já foi gravada). Mesmo
     * molde de `withFieldReport` que T8 já usa na rota HTTP, com a mesma operação
     * (`OCCURRENCE_ATTACHMENT_APPEND_OPERATION`) — reenviar a mesma foto (mesmo sha256) converge
     * na mesma linha em vez de abrir uma sexta posição; o `media-id` nunca entra na chave nem no
     * log.
     */
    attachOccurrencePhoto: (input) =>
      withFieldReport({
        guard: {
          actorUserId: input.actorUserId,
          authorship: { channel: TRIP_FIELD_CHANNELS.whatsapp, onBehalfOfDriverId: null },
          companyId: input.companyId,
          idempotencyKey: sha256Hex(input.attachment.bytes),
          operation: `${OCCURRENCE_ATTACHMENT_APPEND_OPERATION}:${buildOccurrenceAttachmentAppendFingerprint(
            {
              attachmentSha256: sha256Hex(input.attachment.bytes),
              occurrenceId: input.occurrenceId,
            },
          )}`,
          transaction: whatsappFieldReportGuardTransaction,
        },
        perform: () =>
          attachOccurrencePhoto({
            attachment: input.attachment,
            companyId: input.companyId,
            occurrenceId: input.occurrenceId,
            repository: {
              countOccurrenceAttachments: (query) =>
                new DrizzleOccurrenceAttachmentRepository(database.db).countOccurrenceAttachments(
                  query,
                ),
              findOccurrence: (query) => findOccurrenceForAttachment(database.db, query),
              newObjectId: () => crypto.randomUUID(),
              now: () => new Date(),
              storage: createDeliveryProofStorage({
                bucket: whatsappStorageBucket,
                storage: whatsappStorageGateway,
              }),
              unitOfWork: new DrizzleAttachOccurrencePhotoUnitOfWork(database.db),
            },
          }),
        recall: async (resultId) =>
          new DrizzleOccurrenceAttachmentRepository(database.db).findAttachmentPosition({
            companyId: input.companyId,
            id: resultId,
          }),
      }),
    batchTransition: (input) =>
      transitionTripDocumentsBatch({
        action: input.action,
        actorUserId: input.context.userId,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        companyId: input.context.companyId,
        documentIds: input.documentIds,
        repository: whatsappTripDocumentBatchRepository,
        tripId: input.tripId,
      }),
    dispatchTrip: (input) =>
      dispatchTrip({
        actorUserId: input.context.userId,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        companyId: input.context.companyId,
        repository: whatsappTripRouteRepository,
        tripId: input.tripId,
      }),
    listOccurrenceTypes: (input) =>
      listOccurrenceTypes(database.db, { companyId: input.companyId }),
    listWarehouseTrips: (input) =>
      listWarehouseTrips({
        companyId: input.companyId,
        repository: whatsappWarehouseTripRepository,
      }),
    loadDocument: (input) =>
      transitionTripDocument({
        action: 'load',
        actorUserId: input.context.userId,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        companyId: input.context.companyId,
        documentId: input.documentId,
        repository: whatsappTripDocumentRepository,
        tripId: input.tripId,
      }),
    /**
     * Spec 161 T13 (CA9b/CA9c/RF16): a mesma persistência da rota HTTP
     * (`persistSeparationOccurrenceWithAttachment`, `src/main.ts:2861` na rota
     * `POST .../occurrences`) — nunca `saveTripOccurrence` cru, que não sobe `stored_objects` nem
     * grava purpose/retenção. `attachment` ainda é opcional no tipo: sem ele,
     * `registerTripOccurrence` recusa com `OccurrencePhotoRequiredError` (D1/RF4), como já
     * acontecia antes de T15 ligar o passo de foto.
     *
     * Spec 161 T16 (RF20b): com `attachment`, a chamada inteira entra em `withFieldReport` com a
     * chave de idempotência sendo o **sha256 do arquivo baixado** — mesmo raciocínio de
     * `attachOccurrencePhoto` acima. `occurrenceId` seria circular aqui (é exatamente o que esta
     * chamada cria) e `media-id` muda a cada reenvio; sha256 é o único identificador estável.
     */
    registerOccurrence: (input) => {
      const perform = () =>
        registerTripOccurrence({
          actorUserId: input.actorUserId,
          ...(input.attachment === undefined ? {} : { attachment: input.attachment }),
          companyId: input.companyId,
          documentId: input.documentId,
          note: input.note,
          occurredOn: new Date().toLocaleDateString('pt-BR'),
          occurrenceTypeId: input.occurrenceTypeId,
          productCode: '',
          repository: {
            findOccurrenceType: (query) => findOccurrenceType(database.db, query),
            listDocumentProducts: (query) => listDocumentProducts(database.db, query),
            listOccurrences: (query) => listTripOccurrences(database.db, query),
            readTemplateValues: (query) => readOccurrenceTemplateValues(database.db, query),
            saveOccurrence: (query) =>
              persistSeparationOccurrenceWithAttachment({
                attachment: query.attachment,
                input: {
                  actorUserId: query.actorUserId,
                  companyId: query.companyId,
                  documentId: query.documentId,
                  note: query.note,
                  occurrenceTypeId: query.occurrenceTypeId,
                  productCode: query.productCode,
                  stage: query.stage,
                  tripId: query.tripId,
                  typeName: query.typeName,
                },
                /**
                 * Spec 161 T15 (D13): a foto sai do aparelho do operador, sem o reencode do
                 * navegador (que já limita a web a `OCCURRENCE_PHOTO_MAX_BYTES`, 512 KiB) — o
                 * teto do WhatsApp é `OFFICE_PROOF_MAX_BYTES` (960 KiB, importado de
                 * `delivery-proof.policy.ts`, §16 do code-standart: nenhuma constante nova).
                 */
                maxOriginalBytes: OFFICE_PROOF_MAX_BYTES,
                newObjectId: () => crypto.randomUUID(),
                now: () => new Date(),
                storage: createDeliveryProofStorage({
                  bucket: whatsappStorageBucket,
                  storage: whatsappStorageGateway,
                }),
                unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db),
              }),
          },
          tripId: input.tripId,
        })

      if (input.attachment === undefined) return perform()

      const attachmentSha256 = sha256Hex(input.attachment.bytes)
      return withFieldReport({
        guard: {
          actorUserId: input.actorUserId,
          authorship: { channel: TRIP_FIELD_CHANNELS.whatsapp, onBehalfOfDriverId: null },
          companyId: input.companyId,
          idempotencyKey: attachmentSha256,
          operation: `${OCCURRENCE_ATTACHMENT_CREATE_OPERATION}:${buildOccurrenceAttachmentCreateFingerprint(
            {
              attachmentSha256,
              documentId: input.documentId,
              note: input.note,
              occurrenceTypeId: input.occurrenceTypeId,
              productCode: null,
            },
          )}`,
          transaction: whatsappFieldReportGuardTransaction,
        },
        perform,
        recall: async (resultId) => {
          const occurrence = await findTripOccurrenceById(database.db, {
            companyId: input.companyId,
            occurrenceId: resultId,
          })
          if (occurrence === null) return null
          const attachments = await new DrizzleOccurrenceAttachmentRepository(
            database.db,
          ).listOccurrenceAttachments({ companyId: input.companyId, occurrenceId: resultId })
          return {
            ...occurrence,
            attachments: attachments.map((attachment) => ({
              id: attachment.id,
              position: attachment.position,
            })),
            email: null,
          }
        },
      })
    },
    separateDocument: (input) =>
      transitionTripDocument({
        action: 'separate',
        actorUserId: input.context.userId,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        companyId: input.context.companyId,
        documentId: input.documentId,
        repository: whatsappTripDocumentRepository,
        tripId: input.tripId,
      }),
  })
  /**
   * Spec 144 T012 — a prévia da emissão por seleção. Segunda instância das mesmas classes que as
   * rotas de notas e de NFS-e montam em `createApplicationRoutes` (a mesma ordem de construção da
   * T016): a classificação passa pelo `mapSummary` da listagem, e a prévia de NFS-e é a do painel.
   */
  const whatsappStorageBucket = resolveStorageBucket(process.env)
  const whatsappStorageGateway = createNfeStorageGatewayFromEnvironment({
    environment: process.env,
    finalBucket: whatsappStorageBucket,
    stagingBucket: whatsappStorageBucket,
  })
  const whatsappNfeDocuments = new DrizzleNfeDocumentRepository(database.db, whatsappStorageGateway)
  const whatsappNfseInvoiceRepository = new DrizzleNfseInvoiceRepository(database.db)
  const whatsappNfseInvoices = createNfseInvoiceUseCase({
    now: () => new Date(),
    repository: whatsappNfseInvoiceRepository,
  })
  /**
   * Spec 144 T013 — a confirmação emite pelos **mesmos** casos de uso das rotas `POST /cte-batches`,
   * `POST /cte-batches/:id/issue` e `POST /nfse-service-invoices`, cada um com a sua transação; as
   * instâncias de rota nascem em `createApplicationRoutes`, depois do hook.
   */
  const whatsappFingerprints = createIdempotencyFingerprintService({
    key: config.cryptography.idempotencyHmacKey,
  })
  const whatsappCteBatches = createCteBatchUseCase({
    fingerprintService: whatsappFingerprints,
    profiles: new DrizzleCteEmissionProfileCatalogRepository(
      new DrizzleCteEmissionProfileRepository(database.db),
    ),
    unitOfWork: new DrizzleCteBatchRepository(database.db),
  })
  const whatsappCteIssuance = createCteIssuanceUseCase({
    documentDownload: createCteDocumentDownloadGateway({ storage: whatsappStorageGateway }),
    fingerprintService: whatsappFingerprints,
    unitOfWork: new DrizzleCteIssuanceRepository(database.db),
  })
  const whatsappDocumentSelection = new DrizzleDocumentSelectionRepository(database.db)
  const whatsappPreviewDependencies = {
    classifier: whatsappNfeDocuments,
    clock: () => new Date(),
    commands: new DrizzleWhatsAppCommandRepository(database.db),
    findNfseCredentialGap: createNfseCredentialGapFinder(whatsappNfseInvoiceRepository),
    generateId: () => crypto.randomUUID(),
    previewNfseInvoices: (input: Parameters<typeof whatsappNfseInvoices.preview>[0]) =>
      whatsappNfseInvoices.preview(input),
    selection: whatsappDocumentSelection,
  }
  const whatsappSelectionConfirmation = createConfirmDocumentSelectionUseCase({
    ...whatsappPreviewDependencies,
    authorization: new AuthorizationService(),
    createCteBatch: (input) => whatsappCteBatches.create(input),
    createNfseInvoice: (input) => whatsappNfseInvoices.create(input),
    issueCteBatch: (input) => whatsappCteIssuance.issue(input),
  })
  /**
   * Spec 144 T014 — a liquidação, chamada pelo worker. Fatura pelo **mesmo** caso de uso da rota
   * `POST /billing-invoices`, em nome de quem confirmou, revalidado pelo mesmo caminho do canal.
   */
  const whatsappSettlement = createSettleWhatsAppCommandUseCase({
    authorization: new AuthorizationService(),
    billing: createBillingUseCase({
      clock: { now: () => new Date().toISOString() },
      fingerprintService: whatsappFingerprints,
      unitOfWork: new DrizzleBillingRepository(database.db),
    }),
    clock: () => new Date(),
    commands: new DrizzleWhatsAppCommandRepository(database.db),
    documents: new DrizzleWhatsAppCommandSettlementRepository(database.db),
    logger,
    resolveActor: (input) => tenantContext.resolveCompanyForUser({ ...input, channel: 'whatsapp' }),
    resume: (input) => whatsappSelectionConfirmation.resume(input),
  })
  const issuanceWhatsAppFlowActions = createIssuanceWhatsAppFlowActions({
    clock: () => new Date(),
    confirmSelection: (input) => whatsappSelectionConfirmation.confirm(input),
    listIssueDateEmitters: (input) => whatsappDocumentSelection.listIssueDateEmitters(input),
    listPendingEmitters: (input) => whatsappDocumentSelection.listPendingEmitters(input),
    listPendingSeries: (input) => whatsappDocumentSelection.listPendingSeries(input),
    listRecentTrips: (input) => whatsappDocumentSelection.listRecentTrips(input),
    previewSelection: createPreviewDocumentSelectionUseCase(whatsappPreviewDependencies),
  })
  /**
   * Spec 144 T006 — o despachante das mensagens recebidas. O teto por número é um só para a
   * instalação: a instância do módulo é refeita quando o token muda, e o teto não pode zerar junto.
   */
  const whatsappCommandHook = createWhatsAppCommandHookFactory({
    apiVersion: config.whatsapp.apiVersion,
    authorization: new AuthorizationService(),
    baseUrl: config.whatsapp.baseUrl,
    clock: () => new Date(),
    flowActions: [
      ...driverWhatsAppFlowActions,
      ...operatorWhatsAppFlowActions,
      ...issuanceWhatsAppFlowActions,
    ],
    /**
     * Spec 144 T008 — lê a versão publicada (a linha viva do módulo, a que `create`/`save`
     * escrevem), nunca o grafo em código direto: o comando de republicação é o único que decide
     * quando o código passa a valer para o número real.
     */
    graphs: createModuleWhatsAppFlowGraphProvider({
      repository: new FlowGraphRepository(database.db as never),
      rootFlowKey: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
    }),
    logger,
    rateLimiter: createRateLimiter(),
    resolveActor: createResolveWhatsAppActorUseCase({
      memberships: new DrizzleMembershipRepository(database.db),
      phones: new DrizzleWhatsAppPhoneRepository(database.db),
      tenantContext,
    }),
    verifyPhone: createVerifyWhatsAppPhoneUseCase({
      repository: new DrizzleWhatsAppPhoneRepository(database.db),
    }),
  })
  // Ausente qualquer um dos dois, a conta do agregado não é montada: `tenancy.mode: 'single'` exige
  // a empresa raiz, e sem segredo não há com o que assinar o access token do módulo (064/T1).
  const userModule =
    config.userAccessTokenSecret === undefined || config.companyId === undefined
      ? undefined
      : createApiUserModule({
          accessTokenSecret: config.userAccessTokenSecret,
          companyId: config.companyId,
          db: database.db,
        })
  const router = createRouter({
    anonymousRoutes: createAnonymousRoutes({
      config,
      database: database.db,
      logger,
      userModule,
      whatsappCommandHook,
    }),
    authentication,
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: new DrizzleCompanyFiscalEnvironmentRepository(database.db),
    healthService,
    rateLimitWindows: new DrizzleRateLimiterRepository(database.db),
    moduleRouters: [
      // Sem segredo configurado a rota de recibo não é publicada: sem com o que verificar
      // assinatura, aceitar o corpo seria aceitar qualquer um dizendo que a mensagem chegou.
      {
        basePath: NOTIFICATION_ROUTES_BASE_PATH,
        router: createNotificationHttpRouter({
          authResolver: createNotificationAuthResolver({ authentication, tenantContext }),
          module: notifications,
          ...(config.notificationWebhookSecret === undefined
            ? {}
            : { webhookSecret: config.notificationWebhookSecret }),
        }),
      },
      ...(userModule === undefined || config.companyId === undefined
        ? []
        : [
            {
              basePath: USER_ROUTES_BASE_PATH,
              router: createUserHttpRouter({ companyId: config.companyId, module: userModule }),
            },
            {
              basePath: AGGREGATE_PORTAL_ROUTES_BASE_PATH,
              router: createAggregatePortalHttpRouter({
                accountRepository: createDrizzleAggregatePortalRepository(database.db),
                aggregateDocuments: createAggregateDocumentUseCase({
                  bucket: resolveStorageBucket(process.env),
                  // O leitor existe sempre: PDF é lido pela camada de texto, sem serviço nenhum.
                  // Só a leitura de imagem depende do OCR estar configurado.
                  ocr: createAggregateDocumentTextGateway(
                    config.aggregateDocumentOcrUrl === undefined
                      ? {}
                      : {
                          ocr: createHttpAggregateDocumentOcrGateway({
                            baseUrl: config.aggregateDocumentOcrUrl,
                          }),
                        },
                  ),
                  repository: createDrizzleAggregateDocumentRepository(database.db),
                  storage: createNfeStorageGatewayFromEnvironment({
                    environment: process.env,
                    finalBucket: resolveStorageBucket(process.env),
                    stagingBucket: resolveStorageBucket(process.env),
                  }),
                }),
                aggregatePortal: createAggregatePortalUseCase({
                  repository: createDrizzleAggregatePortalRepository(database.db),
                }),
                companyId: config.companyId,
                module: userModule,
              }),
            },
          ]),
    ],
    routes: [
      ...createApplicationRoutes({
        apiPublicUrl: config.apiPublicUrl,
        automaticManifestNotifier,
        cargoLayoutTimeBudgetMs: config.cargoLayoutTimeBudgetMs,
        contractorMailRateLimit: config.contractorMailRateLimit,
        database: database.db,
        notifications,
        envelopeKeyRing: config.cryptography.envelopeKeyRing,
        environment: process.env,
        googleMapsApiKey: config.googleMapsApiKey,
        messaging: config.messaging,
        idempotencyHmacKey: config.cryptography.idempotencyHmacKey,
        keycloak: config.keycloak,
        logger,
        postalCodeProviders: config.postalCodeProviders,
        routingMatrixUrl: config.routingMatrixUrl,
        routeOptimizationQueue,
        vehicleCatalog: config.vehicleCatalog,
      }),
      ...createWhatsAppCommandSettlementRoutes({ settle: whatsappSettlement }),
    ],
    tenantContext,
    userPictureExistence: new DrizzleUserPictureRepository(database.db),
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
      await notificationQueue?.close()
      await errorTracker.flush()
      await logger.flush()
      logger.stop()
    },
    logger,
    server,
  })

  registerShutdownSignals({ logger, shutdown })
  logger.info('api_started', {
    emailNotificationsEnabled: config.emailChannelEnabled,
    environment: config.appEnv,
    notificationUseCases: Object.keys(notifications.useCases).length,
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
  readonly logger: ApiLogger
  /** Ausente, a rota de cadastro de conta de agregado não é publicada — mesma regra do módulo. */
  readonly userModule: UserModule | undefined
  readonly whatsappCommandHook: WhatsAppCommandHookFactory
}

/** Sem `companyId` de ambiente a rota de arranque fica morta (ADR-0022) — nenhuma rota anônima existe. */
/**
 * ADR-0048 §7: o token é a credencial da página pública. 32 bytes de aleatoriedade criptográfica em
 * base64url — enumerar isso não é um caminho de ataque.
 */
function createExtraChargeBatchToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}

function createAnonymousRoutes({
  config,
  database,
  logger,
  userModule,
  whatsappCommandHook,
}: CreateAnonymousRoutesParams): readonly RegisteredAnonymousRoute[] {
  // O callback de NFS-e não depende da empresa de ambiente: quem diz a empresa é o token opaco.
  /**
   * Primeira etapa do login. Ela existe sempre: sem ela a pessoa só entra pelo login canônico, e o
   * documento e o telefone — que o provedor não sabe procurar — deixariam de ser caminho.
   */
  const loginHintRoutes = createLoginHintRoutes({
    resolveLoginHint: createResolveLoginHintUseCase({
      repository: createDrizzleLoginIdentifierRepository(database),
    }),
  })
  const nfseCallbackRoutes = createNfseCallbackRoutes({
    callbackBaseUrl: config.nfseCallbackBaseUrl,
    logger,
    notifyNfseCallback: createNotifyNfseCallbackUseCase({
      repository: new DrizzleNfseCallbackRepository(database),
    }),
  })
  /**
   * Spec 143 T010 (ADR-0063 §7): a terceira superfície anônima, e a primeira assinada. Ela não
   * depende de `config.companyId` — quem diz a empresa é o `webhookId` opaco da URL, achado por
   * `findSettingsByWebhookId` — e por isso existe sempre, como o postback de NFS-e ao lado.
   */
  const contractorMailInboundWebhookRoutes = createPublicInboundEmailRoutes({
    processInboundEmailWebhook: createProcessInboundEmailWebhookUseCase({
      repository: new DrizzleContractorMailRepository(database),
      secretService: createContractorMailCredentialSecretService({
        envelopeProvider: createSecretEnvelopeProvider(config.cryptography.envelopeKeyRing),
      }),
    }),
  })
  /**
   * Spec 062 T006 — o webhook da Meta. Um endereço só para a instalação: a empresa é descoberta pelo
   * `phone_number_id` do corpo **já assinado**, e sem os dois segredos do app a rota não é
   * registrada.
   */
  const whatsappWebhookRoutes = createWhatsAppWebhookRoutes({
    appSecret: config.whatsapp.webhook?.appSecret,
    logger,
    resolver: createMetaWhatsAppModuleResolver({
      apiVersion: config.whatsapp.apiVersion,
      appSecret: config.whatsapp.webhook?.appSecret ?? '',
      baseUrl: config.whatsapp.baseUrl,
      buildMessageHook: whatsappCommandHook,
      database,
      nonceStore: createDrizzleWebhookNonceStore(database),
      repository: new DrizzleWhatsAppChannelRepository(database),
      secretService: createWhatsAppChannelSecretService({
        envelopeProvider: createSecretEnvelopeProvider(config.cryptography.envelopeKeyRing),
      }),
      verifyToken: config.whatsapp.webhook?.verifyToken ?? '',
    }),
    verifyToken: config.whatsapp.webhook?.verifyToken,
  })
  /**
   * ADR-0048 §7: a página de repasse do contratante. Ela existe sempre — o token é a credencial, e
   * um lote só nasce quando alguém fecha um período, então não há superfície ociosa a esconder.
   */
  const publicExtraChargeBatches = createExtraChargeBatchesUseCase({
    batches: new DrizzleExtraChargeBatchRepository(database),
    charges: new DrizzleDeliveryChargeRepository(database),
    createToken: createExtraChargeBatchToken,
  })
  const publicExtraChargeBatchRoutes = createPublicExtraChargeBatchRoutes({
    decideByToken: { execute: (input) => publicExtraChargeBatches.decideByToken(input) },
    readReportByToken: { execute: (input) => publicExtraChargeBatches.readReportByToken(input) },
  })
  // Sem raiz para servir, o produto entrega o padrão do app — não é caso de erro.
  const landingPublicRoutes = createLandingPublicRoutes({
    landingLogo: createLandingLogoUseCase({
      companyLogoRepository: new DrizzleCompanyLogoRepository(database),
      landingCompanyId: config.companyId,
    }),
    landingSettings: createLandingSettingsUseCase({
      companyContactsRepository: new DrizzleCompanyContactsRepository(database),
      companyGroupRepository: createDrizzleCompanyGroupRepository(database),
      landingCompanyId: config.companyId,
      landingSettingsRepository: createDrizzleLandingSettingsRepository(database),
      /* Ambiente, resolvido uma vez: o endereço do realm não muda entre requisições. */
      mobileAuthentication: resolveMobileAuthentication({
        clientId: config.keycloak.mobileClientId,
        issuer: config.keycloak.issuer,
      }),
    }),
  })
  // A consulta de CNPJ já existia atrás de `settings.manage`, para o painel. A landing precisa dela
  // anônima: é o CNPJ que o próprio interessado digita, e o que volta é o que está no cartão CNPJ.
  const publicCnpjInfoGateway = createFiscalCompanyProfileLookupGateway()
  const publicCnpjInfoRoutes = createPublicCnpjInfoRoutes({
    lookupProfileByCnpj: { execute: ({ cnpj }) => publicCnpjInfoGateway.lookupByCnpj({ cnpj }) },
  })
  const aggregateApplicationPublicRoutes = createAggregateApplicationPublicRoutes({
    aggregateApplications: createAggregateApplicationsUseCase({
      companyGroupRepository: createDrizzleCompanyGroupRepository(database),
      landingCompanyId: config.companyId,
      repository: createDrizzleAggregateApplicationRepository(database),
    }),
    ...(config.turnstileSecretKey === undefined
      ? {}
      : { turnstileSecretKey: config.turnstileSecretKey }),
  })
  const aggregateApplicationAttachmentPublicRoutes =
    createAggregateApplicationAttachmentPublicRoutes({
      attachments: createAggregateApplicationAttachmentUseCase({
        bucket: resolveStorageBucket(process.env),
        repository: createDrizzleAggregateApplicationAttachmentRepository(database),
        storage: createNfeStorageGatewayFromEnvironment({
          environment: process.env,
          finalBucket: resolveStorageBucket(process.env),
          stagingBucket: resolveStorageBucket(process.env),
        }),
      }),
      ...(config.turnstileSecretKey === undefined
        ? {}
        : { turnstileSecretKey: config.turnstileSecretKey }),
    })
  // Sem módulo de conta montado (064/T1), o cadastro do agregado não é publicado — mesma regra
  // de capacidade por ausência que o próprio `userModule` já segue.
  const aggregateAccountPublicRoutes =
    userModule === undefined || config.companyId === undefined
      ? []
      : createAggregateAccountPublicRoutes({
          aggregateAccounts: createAggregateAccountUseCase({
            companyGroupRepository: createDrizzleCompanyGroupRepository(database),
            landingCompanyId: config.companyId,
            repository: createDrizzleAggregateAccountRepository(database),
            userModule,
          }),
        })
  if (config.companyId === undefined) {
    return [
      ...nfseCallbackRoutes,
      ...contractorMailInboundWebhookRoutes,
      ...whatsappWebhookRoutes,
      ...publicExtraChargeBatchRoutes,
      /**
       * O endereço público da foto de perfil. Ele existe sempre: o token é a credencial, e uma foto
       * só ganha endereço quando alguém a envia — não há superfície ociosa a esconder.
       */
      ...createPublicUserPictureRoutes({
        userPicture: createPublicUserPictureUseCase({
          repository: new DrizzleUserPictureRepository(database),
        }),
      }),
      ...landingPublicRoutes,
      ...publicCnpjInfoRoutes,
      ...aggregateApplicationPublicRoutes,
      ...aggregateApplicationAttachmentPublicRoutes,
    ]
  }

  return [
    ...loginHintRoutes,
    ...nfseCallbackRoutes,
    ...contractorMailInboundWebhookRoutes,
    ...whatsappWebhookRoutes,
    ...publicExtraChargeBatchRoutes,
    ...landingPublicRoutes,
    ...publicCnpjInfoRoutes,
    ...aggregateApplicationPublicRoutes,
    ...aggregateApplicationAttachmentPublicRoutes,
    ...aggregateAccountPublicRoutes,
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
    ...createPasswordResetRoutes({
      confirmPasswordReset: createConfirmPasswordResetUseCase({
        identities: new DrizzleCompanyUserRepository(database),
        identityProvider: createIdentityAccessGateway({
          clientId: config.keycloak.admin.clientId,
          clientSecret: config.keycloak.admin.clientSecret,
          issuer: config.keycloak.issuer,
        }),
        now: () => new Date(),
        requests: new DrizzlePasswordResetRepository(database),
      }),
      requestPasswordReset: createRequestPasswordResetUseCase({
        envelopeProvider: createPasswordResetCodeSecretService({
          envelopeProvider: createSecretEnvelopeProvider(config.cryptography.envelopeKeyRing),
        }),
        now: () => new Date(),
        outbox: new DrizzlePasswordResetDeliveryOutboxRepository(database),
        requests: new DrizzlePasswordResetRepository(database),
      }),
    }),
  ]
}

type CreateApplicationRoutesParams = {
  /** Endereço público desta instalação. Ausente, a foto é gravada e o atributo do realm não. */
  readonly apiPublicUrl: string | undefined
  /** Ausente é instalação sem notificação: a emissão automática recusa igual, e só não avisa. */
  readonly automaticManifestNotifier: AutomaticManifestNotifierPort | undefined
  /** Spec 145 D14: a API reabre planta parada pelo mesmo lease que o worker deriva deste número. */
  readonly cargoLayoutTimeBudgetMs: number
  /** Spec 150 RF18: o teto do envio de correção e do e-mail de teste, do ambiente. */
  readonly contractorMailRateLimit: ApiEnvironment['contractorMailRateLimit']
  readonly database: CompanySettingsDatabase
  /** O módulo de notificação, para o envio de teste do editor de template sair pelo caminho real. */
  readonly notifications: NotificationModule
  readonly envelopeKeyRing: import('@adatechnology/secret-envelope').SecretKeyRing
  readonly environment: Record<string, string | undefined>
  /**
   * ⚠️ Vêm **tipadas**, e não pelo `environment` acima: ele é o registro **cru** do processo, com as
   * chaves em CAIXA ALTA. Ler `environment.googleMapsApiKey` dali compila — o tipo é
   * `Record<string, string | undefined>` e aceita qualquer nome — e devolve `undefined` para sempre.
   * Foi exatamente isso que aconteceu na spec 069: o gateway pago nunca era construído, e a marca
   * responderia "precisão fina não disponível" mesmo com a chave configurada.
   */
  readonly googleMapsApiKey: string | undefined
  readonly messaging: ApiEnvironment['messaging']
  readonly idempotencyHmacKey: Uint8Array
  readonly keycloak: ApiEnvironment['keycloak']
  readonly logger: ApiLogger
  readonly postalCodeProviders: ApiEnvironment['postalCodeProviders']
  readonly routingMatrixUrl: ApiEnvironment['routingMatrixUrl']
  /** Ausente sem broker: sem quem resolva, a rota de sugestão não sobe (ADR-0044 §7). */
  readonly routeOptimizationQueue: RouteOptimizationQueue | undefined
  readonly vehicleCatalog: ApiEnvironment['vehicleCatalog']
}

function createApplicationRoutes({
  apiPublicUrl,
  automaticManifestNotifier,
  cargoLayoutTimeBudgetMs,
  contractorMailRateLimit,
  database,
  googleMapsApiKey,
  messaging,
  notifications,
  envelopeKeyRing,
  environment,
  idempotencyHmacKey,
  keycloak,
  logger,
  postalCodeProviders,
  routingMatrixUrl,
  routeOptimizationQueue,
  vehicleCatalog,
}: CreateApplicationRoutesParams): readonly ReturnType<
  typeof createCompanySettingsRoutes
>[number][] {
  const contractorRegistry = createContractorsUseCase({
    repository: new DrizzleContractorRepository(database),
  })
  const contractorPortalBindings = new DrizzleContractorPortalBindingRepository(database)
  const tripLocationRepository = new DrizzleTripLocationRepository(database)
  const recordTripLocation = createRecordTripLocationUseCase({ repository: tripLocationRepository })
  const contractorPortalRepository = new DrizzleContractorPortalRepository(database)
  const readContractorDeliveries = createReadContractorDeliveriesUseCase({
    repository: contractorPortalRepository,
  })
  const municipalHolidays = createMunicipalHolidaysUseCase({
    repository: new DrizzleMunicipalHolidayRepository(database),
  })
  const deliveryChargeRepository = new DrizzleDeliveryChargeRepository(database)
  const deliveryChargeRuleRepository = new DrizzleDeliveryChargeRuleRepository(database)
  const deliveryCharges = createDeliveryChargesUseCase({ repository: deliveryChargeRepository })
  const suggestDeliveryCharges = createSuggestDeliveryCharges({
    charges: deliveryChargeRepository,
    logger,
    rules: deliveryChargeRuleRepository,
  })
  const extraChargeBatches = createExtraChargeBatchesUseCase({
    batches: new DrizzleExtraChargeBatchRepository(database),
    charges: deliveryChargeRepository,
    createToken: createExtraChargeBatchToken,
  })
  const tripStopSchedules = createTripStopSchedulesUseCase({
    repository: new DrizzleTripStopScheduleRepository(database),
  })
  /**
   * O agendamento do portal escreve pela mesma máquina da 060 — a `tripStopSchedules` acima, não uma
   * cópia. É a ADR-0050 §6: nenhuma regra de agendamento mora no portal.
   */
  const readContractorDeliveryLocation = createReadContractorDeliveryLocationUseCase({
    locations: tripLocationRepository,
    repository: contractorPortalRepository,
  })
  const scheduleContractorDelivery = createScheduleContractorDeliveryUseCase({
    repository: contractorPortalRepository,
    schedules: { save: (input) => tripStopSchedules.save(input) },
  })
  /** O ciclo do lançamento é o da 060 — o portal acrescenta o recorte, não uma segunda máquina. */
  const contractorExtraCharges = createContractorExtraChargesUseCase({
    batches: {
      decide: (input) => extraChargeBatches.decide(input),
      readReport: (input) => extraChargeBatches.readReport(input),
    },
    repository: contractorPortalRepository,
  })
  const deliveryClients = createDeliveryClientsUseCase({
    repository: new DrizzleDeliveryClientRepository(database),
  })
  const settingsRepository = new DrizzleCompanySettingsRepository(database)
  const scheduledDistributionRepository = new DrizzleScheduledDistributionRepository(database)
  const distributionCursorRepository = new DrizzleDistributionCursorRepository(database)
  const federalTaxSettingsRepository = new DrizzleFederalTaxSettingsRepository(database)
  const driverAllowanceSettingsRepository = new DrizzleDriverAllowanceSettingsRepository(database)
  const cargoSettingsRepository = new DrizzleCargoSettingsRepository(database)
  const cargoVolumeFactorRepository = new DrizzleCargoVolumeFactorRepository(database)
  const fuelPriceRepository = new DrizzleFuelPriceRepository(database)
  const tollBoothChargeRepository = new DrizzleTollBoothChargeRepository(database)
  const tollBoothSightingRepository = new DrizzleTollBoothSightingRepository(database)
  const companyEnergyRepository = new DrizzleCompanyEnergyRepository(database)
  const companyLogoRepository = new DrizzleCompanyLogoRepository(database)
  const companyContactsRepository = new DrizzleCompanyContactsRepository(database)
  const companyContacts = createCompanyContactsUseCase({ contacts: companyContactsRepository })
  const landingSettings = createLandingSettingsUseCase({
    companyContactsRepository,
    companyGroupRepository: createDrizzleCompanyGroupRepository(database),
    landingCompanyId: undefined,
    landingSettingsRepository: createDrizzleLandingSettingsRepository(database),
    mobileAuthentication: resolveMobileAuthentication({
      clientId: keycloak.mobileClientId,
      issuer: keycloak.issuer,
    }),
  })
  const aggregateApplications = createAggregateApplicationsUseCase({
    companyGroupRepository: createDrizzleCompanyGroupRepository(database),
    landingCompanyId: undefined,
    repository: createDrizzleAggregateApplicationRepository(database),
  })
  const certificateRepository = new DrizzleDigitalCertificateRepository(database)
  const companyProfileLookupGateway = createFiscalCompanyProfileLookupGateway()
  const freightRepository = new DrizzleFreightRepository(database)
  const freightSimulationRepository = new DrizzleFreightSimulationRepository(database)
  const freightRuleListRepository = new DrizzleFreightRuleListRepository(database)
  const freightCalculationListRepository = new DrizzleFreightCalculationListRepository(database)
  const fleetFuelPriceGateway = new CompanyFuelPriceGateway(fuelPriceRepository)
  const fleetVehicleRepository = new DrizzleFleetVehicleRepository({
    database,
    fuelPrices: fleetFuelPriceGateway,
  })
  const fleetDriverRepository = new DrizzleFleetDriverRepository(database)
  const driverScoreRepository = new DrizzleDriverScoreRepository(database)
  const freightRegionRepository = new DrizzleFreightRegionRepository(database)
  const fleetDriverRegionRepository = new DrizzleFleetDriverRegionRepository(database)
  const fleetDriverVehicleRepository = new DrizzleFleetDriverVehicleRepository({
    database,
    fuelPrices: fleetFuelPriceGateway,
  })
  const mdfeManifestRepository = new DrizzleMdfeManifestRepository(database)
  const mdfeIssuanceRepository = new DrizzleMdfeIssuanceRepository(database)
  const cargoLayoutLeaseOptions = {
    cargoLayoutLeaseMs: resolveCargoLayoutLeaseMs({
      baseBudgetMs: cargoLayoutTimeBudgetMs,
      maxAttempts: CARGO_LAYOUT_MAX_ATTEMPTS,
    }),
  }
  const tripRepository = new DrizzleTripRepository(database, cargoLayoutLeaseOptions)
  /** Spec 145 D7 (lazy): transação própria, fora da leitura do detalhe, com o mesmo lease do worker. */
  const cargoLayoutRequestRepository = new DrizzleCargoLayoutRequestRepository(
    database,
    cargoLayoutLeaseOptions,
  )
  const requestCargoLayout = createRequestCargoLayoutUseCase({
    repository: cargoLayoutRequestRepository,
  })
  /** Spec 145 T11: a prévia lê a planta pelo hash, e a tela pergunta de novo pelo id. */
  const cargoLayoutLookup = new DrizzleCargoLayoutLookupRepository(
    database,
    cargoLayoutLeaseOptions,
  )
  const tripDocumentRepository = new DrizzleTripDocumentRepository(database)
  const tripDocumentBatchRepository = new DrizzleTripDocumentBatchRepository(database)
  const tripRouteRepository = new DrizzleTripRouteRepository(database, cargoLayoutLeaseOptions)
  const tripStopLookupRepository = new DrizzleTripStopLookupRepository(database)
  const deliveryAddressOverrideRepository = new DrizzleDeliveryAddressOverrideRepository(
    database,
    cargoLayoutLeaseOptions,
  )
  const currentDriverTripRepository = new DrizzleCurrentDriverTripRepository(database)
  const fieldTripTargetRepository = new DrizzleFieldTripTargetRepository(database)
  /**
   * Spec 079: o aviso configurável da ocorrência de nota, para quem despachou a viagem. Um só para
   * a rota do galpão e para o lote do escritório (spec 156 T7.3).
   */
  const occurrenceNotifier = createOccurrenceNotifier({
    logger,
    queryable: database,
    send: (params) =>
      notifications.useCases.sendNotification.execute({
        ...params,
        locale: NOTIFICATION_DEFAULT_LOCALE,
      } as never),
  })
  const officeOccurrenceBatches = new DrizzleOfficeOccurrenceBatchUnitOfWork(database)
  const tripFiscalReadinessQuery = new DrizzleTripFiscalReadinessQuery(database)
  const tripValuationQuery = new DrizzleTripValuationQuery(database, logger)
  const routeGeometryVehicleAxlesQuery = createRouteGeometryVehicleAxlesQuery(database)
  /**
   * Spec 097: de onde a viagem parte. A porta é montada por empresa nos três chamadores abaixo,
   * porque `readRouteGeometry` conhece pontos, nunca tenant.
   */
  const routeDepotQuery = createRouteDepotQuery(database)
  const tollBoothRepository = createDrizzleTollBoothRepository(database)
  const tollBoothCatalogRepository = createDrizzleTollBoothCatalogRepository(database)
  const tollBoothExtractRepository = createDrizzleTollBoothExtractRepository(database)
  // Spec 154 T503, defeito 2: uma cópia por processo, compartilhada pelas rotas que leem e pelas
  // que invalidam (ajuste, remoção de ajuste, recarga do catálogo).
  const tollBoothAxleChargeGapCache = createInMemoryTollBoothAxleChargeGapCache({
    clock: { now: () => new Date() },
  })
  const tripFinancialResultRepository = new DrizzleTripFinancialResultRepository(database)
  const financialSummaryQuery = new DrizzleFinancialSummaryQuery(database)
  const tripCostRepository = new DrizzleTripCostRepository(database)
  const applicableFreightRuleQuery = new DrizzleApplicableFreightRuleQuery(database)
  const automaticManifestRepository = new DrizzleAutomaticManifestRepository({
    database,
    readiness: tripFiscalReadinessQuery,
  })
  const driverFieldReports = new DrizzleDriverFieldReportUnitOfWork(database)
  /**
   * Spec 161 T8: a reserva e a liquidação da chave para o galpão — cada chamada abre sua própria
   * transação curta (não a mesma da escrita). É o que `FieldReportGuardInput.transaction` exige
   * (`Pick<DriverFieldReportTransactionPort, 'claim' | 'settle'>`); a resiliência do reenvio não
   * depende de as duas estarem na mesma transação — `withFieldReport` já trata `resultId: null`
   * como "roda de novo" (`trip-field-report.port.ts`), então uma falha entre o `claim` e o efeito
   * converge no próximo reenvio, em vez de travar a chave para sempre.
   */
  const fieldReportGuardTransaction = {
    claim: (input: Parameters<DriverFieldReportTransactionPort['claim']>[0]) =>
      driverFieldReports.execute((transaction) => transaction.claim(input)),
    settle: (input: Parameters<DriverFieldReportTransactionPort['settle']>[0]) =>
      driverFieldReports.execute((transaction) => transaction.settle(input)),
  }
  const deliveryProofRepository = new DrizzleDeliveryProofRepository(database)
  const deliveryProofSettingsRepository = new DrizzleDeliveryProofSettingsRepository(database)
  const tripPlannedRouteRepository = new DrizzleTripPlannedRouteRepository(database)
  /**
   * Spec 153 T201 (substitui a spec 090 T11): congela a rota inteira — traçado, métricas e
   * pedágio — na mesma chamada que planeja o roteiro, com o mesmo roteirizador, catálogo de
   * praças e barracão que `readTripRouteGeometry` já usa para o mapa — nunca uma segunda rota,
   * que poderia discordar (D4).
   */
  const tripRouteTollFreezer = {
    freeze: (input: {
      readonly companyId: string
      readonly routeChoice?: RouteChoice
      readonly tripId: string
    }) =>
      freezeTripPlannedRoute({
        ...(input.routeChoice === undefined ? {} : { choice: input.routeChoice }),
        companyId: input.companyId,
        depot: {
          readDepot: () => routeDepotQuery.readDepot({ companyId: input.companyId }),
          readDescription: () => routeDepotQuery.readDescription({ companyId: input.companyId }),
        },
        geometry:
          routingMatrixUrl === undefined
            ? { readRouteGeometry: async () => null }
            : createOsrmRouteGeometryGateway({ baseUrl: routingMatrixUrl }),
        repository: tripPlannedRouteRepository,
        tollBooths: createCompanyScopedTollBoothGateway({
          catalog: tollBoothRepository,
          charges: tollBoothChargeRepository,
          companyId: input.companyId,
        }),
        tripId: input.tripId,
      }),
  }
  /** RF12/D6: a fila de revisão (`move`/`swap`, spec 148) recalcula com o mesmo congelador (T206). */
  const tripDocumentReviewRepository = new DrizzleTripDocumentReviewRepository(
    database,
    cargoLayoutLeaseOptions,
    tripRouteTollFreezer,
  )
  const tripLifecycle = createTripLifecycleUseCase({
    batchRepository: tripDocumentBatchRepository,
    deliveryAddressOverrideRepository,
    documentRepository: tripDocumentRepository,
    locationRepository: tripStopLookupRepository,
    routeRepository: tripRouteRepository,
    stopRepository: tripStopLookupRepository,
    suggestCharges: suggestDeliveryCharges,
    tollFreezer: tripRouteTollFreezer,
    trackingRepository: tripLocationRepository,
  })
  const cteBatchRepository = new DrizzleCteBatchRepository(database)
  const cteEmissionProfileRepository = new DrizzleCteEmissionProfileRepository(database)
  const nfseProfileRepository = new DrizzleNfseProfileRepository(database)
  const nfseInvoiceRepository = new DrizzleNfseInvoiceRepository(database)
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
  const tollBoothExtractStorage = createTollBoothExtractStorageGateway({
    bucket: storageBucket,
    storage: storageGateway,
  })
  const storedObjectRepository = new DrizzleStoredObjectRepository(database)
  const nfeDocumentRepository = new DrizzleNfeDocumentRepository(database, storageGateway)
  const listNfeDocumentEvents = createListNfeDocumentEvents({
    repository: new DrizzleNfeDocumentEventRepository(database),
  })
  const packageBoxRepository = new DrizzlePackageBoxRepository(database)
  const cameraMeasurementSettingsRepository = new DrizzleCameraMeasurementSettingsRepository(
    database,
  )
  const packageBoxMeasurementExportRepository = new DrizzlePackageBoxMeasurementExportRepository(
    database,
  )
  const viewPreferencesRepository = new DrizzleViewPreferencesRepository(database)
  const fingerprintService = createIdempotencyFingerprintService({ key: idempotencyHmacKey })
  const requestImport = createRequestNfeImportUseCase({
    fingerprintService,
    unitOfWork: nfeImportRepository,
  })
  const distributionStatusRepository = new DrizzleNfeDistributionStatusRepository(database)
  const getDistributionStatus = createGetNfeDistributionStatusUseCase({
    clock: { now: () => new Date() },
    reader: distributionStatusRepository,
  })
  const getLastJobRun = createGetLastJobRunUseCase({ reader: distributionStatusRepository })
  const getScheduledDistribution = createGetScheduledDistributionStatusUseCase({
    clock: { now: () => new Date() },
    port: new DrizzleScheduledDistributionStatusRepository(database),
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
  const freightRegions = createFreightRegionsUseCase({ repository: freightRegionRepository })
  const freightRegionImport = createImportFreightRegionsUseCase({
    repository: freightRegionRepository,
  })
  const fleetDriverRegions = createFleetDriverRegionsUseCase({
    drivers: {
      exists: async (input) => (await fleetDriverRepository.findById(input)) !== null,
    },
    repository: fleetDriverRegionRepository,
  })
  const fleetDriverVehicles = createFleetDriverVehiclesUseCase({
    driverRepository: fleetDriverRepository,
    repository: fleetDriverVehicleRepository,
  })
  const fleetVehicleCatalog: FleetVehicleCatalogPort =
    vehicleCatalog === null
      ? {
          listBrands: async () => ({ items: [], source: 'unavailable' }),
          listModels: async () => ({ items: [], source: 'unavailable' }),
        }
      : createCachedVehicleCatalogGateway({
          gateway: createFipeVehicleCatalogGateway({
            configuration: vehicleCatalog,
            fetch: (target, init) => fetch(target, init),
          }),
          logger,
          successTtlMilliseconds: vehicleCatalog.cacheHours * 60 * 60 * 1000,
        })
  // A escada da busca de CEP: as tabelas da instalação correm em paralelo, e os dois provedores
  // públicos só são chamados quando a casa não soube o endereço inteiro (ADR pendente da spec 050)
  const lookupPostalCode = createLookupPostalCodeUseCase({
    directory: new DrizzlePostalCodeRepository(database),
    provider: createPostalCodeGateway({
      configuration: postalCodeProviders,
      fetch: (target, init) => fetch(target, init),
    }),
  })
  /** O relatório de endereços a corrigir, alimentado pelo lote de medição (spec 084, ADR-0061). */
  const addressReportRepository = createDrizzleAddressReportRepository(database)
  const readAddressReport = createReadAddressReportUseCase({ repository: addressReportRepository })
  /** O pedido de correção de endereço à contratante (spec 150). */
  const addressCorrectionRepository = new DrizzleAddressCorrectionRepository(database)
  const saveAddressCorrectionDraft = createSaveAddressCorrectionDraftUseCase({
    addressCorrectionRepository,
    addressReportRepository,
  })
  const listAddressCorrectionRequests = createListAddressCorrectionRequestsUseCase({
    repository: addressCorrectionRepository,
  })
  const mdfeManifests = createMdfeManifestsUseCase({ repository: mdfeManifestRepository })
  const previewMdfeManifest = createPreviewMdfeManifestUseCase({
    repository: mdfeManifestRepository,
  })
  const mdfeIssuance = createMdfeIssuanceUseCase({
    now: () => new Date(),
    repository: mdfeIssuanceRepository,
  })
  const trips = createTripUseCase({
    /**
     * A coluna de valores de `/trips`: uma consulta para as notas da página inteira, e a busca de
     * regra de frete memoizada por chave. Ver `readTripRevenueTotals` — chamar `readTripValuation`
     * por linha seria N+1.
     */
    amounts: {
      read: (input) =>
        readTripRevenueTotals({
          ...input,
          repository: {
            findApplicableRule: (query) => applicableFreightRuleQuery.findApplicableRule(query),
            readDocumentsByTrip: (query) => tripValuationQuery.readDocumentsByTrip(query),
          },
        }),
    },
    locations: tripLocationRepository,
    repository: tripRepository,
    routeFreezer: tripRouteTollFreezer,
  })
  const createTripMdfeManifest = createTripMdfeManifestUseCase({
    manifests: mdfeManifests,
    readiness: {
      countDischargeCities: (input) => tripFiscalReadinessQuery.countDischargeCities(input),
      read: (input) => readTripFiscalReadiness({ ...input, repository: tripFiscalReadinessQuery }),
    },
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
  const envelopeProvider = createSecretEnvelopeProvider(envelopeKeyRing)
  const deliveryProofDocumentSecrets = createDeliveryProofDocumentSecretService({
    envelopeProvider,
  })
  /**
   * Spec 082 D8, spec 060 D4c: o que vem depois da ocorrência de parada — o aviso do motivo tipado
   * pelo trilho `notification.v1` que já existe (o `sendNotification` enfileira no RabbitMQ e o
   * worker renderiza; motivo sem template grava e segue) e a sugestão de cobrança. O motorista e o
   * escritório em nome dele usam os mesmos dois (spec 156 T15 M5).
   */
  const stopOccurrenceFollowUp = {
    notifier: createStopOccurrenceNotifier({
      logger,
      queryable: database,
      send: (params) =>
        notifications.useCases.sendNotification.execute({
          ...params,
          locale: NOTIFICATION_DEFAULT_LOCALE,
        } as never),
    }),
    suggestCharges: suggestDeliveryCharges,
  }
  /** Spec 156 T6/T15: o canhoto do escritório, igual em `field-delivery` e `field-proof`. */
  const officeDeliveryProofAttachment = {
    newObjectId: () => crypto.randomUUID(),
    newProofId: () => crypto.randomUUID(),
    resolveSettings: (settings: { readonly companyId: string; readonly documentId: string }) =>
      deliveryProofRepository.resolveProofFieldSettings(settings),
    sealDocument: (seal: {
      readonly companyId: string
      readonly proofId: string
      readonly receiverDocument: string
    }) => deliveryProofDocumentSecrets.encrypt(seal),
    storage: createDeliveryProofStorage({ bucket: storageBucket, storage: storageGateway }),
  }
  const contractorMailRepository = new DrizzleContractorMailRepository(database)
  const contractorMailCredentialSecretService = createContractorMailCredentialSecretService({
    envelopeProvider,
  })
  const contractorMailSettings = createContractorMailSettingsUseCase({
    mxLookupGateway: createMxLookupGateway(),
    repository: contractorMailRepository,
    resendAccountGateway: createResendAccountGateway({
      fetch: (target, init) => fetch(target, init),
    }),
    secretService: contractorMailCredentialSecretService,
  })
  const sendContractorMailTestEmail = createSendContractorMailTestEmailUseCase({
    actorEmailResolver: createActorEmailRepository({ database }),
    repository: contractorMailRepository,
    secretService: contractorMailCredentialSecretService,
  })
  /** Spec 150 T301 (spec 143 T013): BOLA por `getContractor.execute`, antes de tocar em contatos. */
  const contractorContacts = createContractorContactsUseCase({
    getContractor: { execute: (input) => contractorRegistry.get(input) },
    repository: contractorMailRepository,
  })
  /** Spec 150 T402: a prévia de cada tipo usa os dados fictícios do desenho aprovado. */
  const contractorMailTemplates = createContractorMailTemplatesUseCase({
    previewRenderers: {
      address_correction: (template) =>
        buildAddressCorrectionMail({ ...ADDRESS_CORRECTION_MAIL_SAMPLE, template }),
    },
    repository: new DrizzleContractorMailTemplateRepository(database),
  })
  /** Spec 150 T304: a conversa, a mensagem e o outbox do pedido de correção, numa transação só. */
  const sendAddressCorrectionMail = createSendAddressCorrectionMailUseCase({
    fingerprintService,
    secretService: contractorMailCredentialSecretService,
    unitOfWork: new DrizzleAddressCorrectionMailRepository(database),
  })
  /**
   * Revisão final (item de segurança B3): resolve contratante + contatos ativos a partir do CNPJ
   * do corpo, sem passar pelo CNPJ na URL nem pedir `fleet.read` de `GET /contractors/by-tax-id`.
   */
  const findAddressCorrectionRecipients = createFindAddressCorrectionRecipientsUseCase({
    contractorLookup: addressCorrectionRepository,
    listContacts: { execute: (input) => contractorContacts.list(input) },
  })
  const nfseEmissionProfiles = createNfseEmissionProfilesUseCase({
    fingerprintService,
    unitOfWork: nfseProfileRepository,
  })
  const whatsappChannel = createWhatsAppChannelUseCase({
    newChannelId: () => crypto.randomUUID(),
    repository: new DrizzleWhatsAppChannelRepository(database),
    secrets: createWhatsAppChannelSecretService({ envelopeProvider }),
  })
  const nfseProviderCredentials = createNfseProviderCredentialsUseCase({
    secretService: createNfseCredentialSecretService({ envelopeProvider }),
    unitOfWork: nfseProfileRepository,
  })
  const nfseInvoices = createNfseInvoiceUseCase({
    now: () => new Date(),
    repository: nfseInvoiceRepository,
  })
  const nfseInvoiceQuery = createNfseInvoiceQueryUseCase({
    archive: createNfseFiscalDocumentArchiveGateway({ storage: storageGateway }),
    repository: nfseInvoiceRepository,
  })
  const cancelNfseInvoice = createNfseInvoiceCancellationUseCase({
    now: () => new Date(),
    repository: nfseInvoiceRepository,
  })
  const discardNfseInvoice = createNfseInvoiceDiscardUseCase({
    now: () => new Date(),
    repository: nfseInvoiceRepository,
  })
  const reissueNfseInvoice = createNfseInvoiceReissueUseCase({
    now: () => new Date(),
    repository: nfseInvoiceRepository,
  })
  const exportNfseDocuments = createExportNfseDocumentsUseCase({
    archive: createNfseArchiveGateway({ storage: storageGateway }),
    clock: () => new Date(),
    selection: createNfseExportSelection(database),
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
  const readMdfeDocument = createReadMdfeDocumentUseCase({
    downloads: createMdfeDocumentDownloadGateway({ storage: storageGateway }),
    renderer: createDamdfePdfGateway(),
    source: createMdfeDocumentSource(database),
    xmlReader: createMdfeXmlReaderGateway({ storage: storageGateway }),
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
    secretService: createDigitalCertificateSecretService({ envelopeProvider }),
  })
  const geocodingRefinementRepository = createDrizzleGeocodingRefinementRepository(database)
  const companyUserRepository = new DrizzleCompanyUserRepository(database)
  const invitationRepository = new DrizzleInvitationRepository(database)
  const invitationDeliveryOutbox = new DrizzleInvitationDeliveryOutboxRepository(database)
  const invitationCodeSecret = createInvitationCodeSecretService({ envelopeProvider })
  const identityAccessGateway = createIdentityAccessGateway({
    clientId: keycloak.admin.clientId,
    clientSecret: keycloak.admin.clientSecret,
    issuer: keycloak.issuer,
  })
  const inviteCompanyUser = createInviteCompanyUserUseCase({
    envelopeProvider: invitationCodeSecret,
    identityGateway: identityAccessGateway,
    invitations: invitationRepository,
    issuer: keycloak.issuer,
    now: () => new Date(),
    outbox: invitationDeliveryOutbox,
    repository: companyUserRepository,
  })
  // Depois do convite: cadastrar motorista abre o usuário dele, então a frota depende da identidade
  /**
   * A coordenada da casa do motorista, uma vez por ficha (spec 097 D6). Sem `driverAddressLookupUrl`
   * a dependência nem existe — e o cadastro segue igual, porque o `homeGeocoder` é opcional.
   */
  const driverHomeGeocoder =
    environment.driverAddressLookupUrl === undefined
      ? undefined
      : createDriverHomeGeocoder({
          provider: createPhotonDriverHomeGateway({ baseUrl: environment.driverAddressLookupUrl }),
          repository: fleetDriverRepository,
        })
  const fleetDrivers = createFleetDriversUseCase({
    account: inviteCompanyUser,
    contacts: createIdentityContactDirectoryGateway({ identity: identityAccessGateway }),
    ...(driverHomeGeocoder === undefined ? {} : { homeGeocoder: driverHomeGeocoder }),
    logger,
    repository: fleetDriverRepository,
  })
  const fleetDriverScores = createFleetDriverScoresUseCase({
    clock: () => new Date(),
    drivers: fleetDriverRepository,
    listDrivers: (input) => fleetDrivers.list(input),
    scores: driverScoreRepository,
  })
  const listCompanyUsers = createListCompanyUsersUseCase({ repository: companyUserRepository })
  const backfillIdentityDocuments = createBackfillIdentityDocumentsUseCase({
    gateway: identityAccessGateway,
    repository: companyUserRepository,
  })
  const companyGroupRepository = new DrizzleCompanyGroupRepository(database)
  const groupAudit = createDrizzleGroupAudit(database)
  const identityGroupGateway = createIdentityGroupGateway({
    clientId: keycloak.admin.clientId,
    clientSecret: keycloak.admin.clientSecret,
    issuer: keycloak.issuer,
  })
  const assignCompanyUserRoles = createAssignCompanyUserRolesUseCase({
    repository: companyUserRepository,
  })
  const revealCompanyUsers = createRevealCompanyUsersUseCase({
    gateway: identityAccessGateway,
    repository: companyUserRepository,
  })
  const reconcileCompanyUsers = createReconcileCompanyUsersUseCase({
    gateway: identityAccessGateway,
    repository: companyUserRepository,
  })
  const resendCompanyUserCode = createResendCompanyUserCodeUseCase({
    envelopeProvider: invitationCodeSecret,
    invitations: invitationRepository,
    now: () => new Date(),
    outbox: invitationDeliveryOutbox,
    repository: companyUserRepository,
  })
  const changeCompanyUserStatus = createChangeCompanyUserStatusUseCase({
    identityGateway: identityAccessGateway,
    repository: companyUserRepository,
    whatsappPhones: new DrizzleWhatsAppPhoneRepository(database),
  })
  const replaceCompanyUserRoles = createReplaceCompanyUserRolesUseCase({
    repository: companyUserRepository,
  })
  const removeCompanyUserMembership = createRemoveCompanyUserMembershipUseCase({
    identityGateway: identityAccessGateway,
    repository: companyUserRepository,
    whatsappPhones: new DrizzleWhatsAppPhoneRepository(database),
  })
  const updateCompanyUserProfile = createUpdateCompanyUserProfileUseCase({
    identityGateway: identityAccessGateway,
    pictures: new DrizzleUserPictureRepository(database),
    repository: companyUserRepository,
    ...(apiPublicUrl === undefined ? {} : { publicBaseUrl: apiPublicUrl }),
  })
  const attachmentReviewRepository =
    createDrizzleAggregateApplicationAttachmentReviewRepository(database)

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
    ...createCargoSettingsRoutes({
      clear: createClearDefaultVolumeWeightUseCase({ cargoSettings: cargoSettingsRepository }),
      get: createGetCargoSettingsUseCase({ cargoSettings: cargoSettingsRepository }),
      set: createSetDefaultVolumeWeightUseCase({ cargoSettings: cargoSettingsRepository }),
      setCameraMeasurementEnabled: createSetCameraMeasurementEnabledUseCase({
        cargoSettings: cargoSettingsRepository,
      }),
    }),
    ...createCargoVolumeFactorRoutes({
      list: createListCargoVolumeFactorsUseCase({ factors: cargoVolumeFactorRepository }),
      remove: createRemoveCargoVolumeFactorUseCase({ factors: cargoVolumeFactorRepository }),
      save: createSaveCargoVolumeFactorUseCase({ factors: cargoVolumeFactorRepository }),
    }),
    ...createCompanyContactsRoutes({ companyContacts }),
    ...createFuelPriceRoutes({
      adjust: createAdjustFuelPriceUseCase({ fuelPrices: fuelPriceRepository }),
      clear: createClearFuelPriceUseCase({ fuelPrices: fuelPriceRepository }),
      list: createListFuelPricesUseCase({ fuelPrices: fuelPriceRepository }),
    }),
    ...createContractorMailSettingsRoutes({
      mailRateLimit: contractorMailRateLimit,
      read: { execute: (input) => contractorMailSettings.read(input) },
      runChecks: { execute: (input) => contractorMailSettings.runChecks(input) },
      save: { execute: (input) => contractorMailSettings.save(input) },
      sendTestEmail: { execute: (input) => sendContractorMailTestEmail.execute(input) },
    }),
    ...createContractorMailTemplateRoutes({ templates: contractorMailTemplates }),
    ...createTollBoothChargeRoutes({
      adjust: createAdjustTollBoothChargeUseCase({
        axleChargeGapCache: tollBoothAxleChargeGapCache,
        catalog: tollBoothRepository,
        charges: tollBoothChargeRepository,
      }),
      clear: createClearTollBoothChargeUseCase({
        axleChargeGapCache: tollBoothAxleChargeGapCache,
        charges: tollBoothChargeRepository,
      }),
      list: createListTollBoothChargesUseCase({
        catalog: tollBoothCatalogRepository,
        charges: tollBoothChargeRepository,
        sightings: tollBoothSightingRepository,
      }),
    }),
    ...createTollBoothRoutes({
      listCatalog: createListTollBoothCatalogUseCase({
        axleChargeGapCache: tollBoothAxleChargeGapCache,
        catalog: tollBoothCatalogRepository,
        catalogSummary: tollBoothRepository,
        charges: tollBoothChargeRepository,
        clock: { now: () => new Date() },
        sightings: tollBoothSightingRepository,
      }),
    }),
    ...createTollBoothExtractRoutes({
      createExtract: createCreateTollBoothExtractUseCase({
        extracts: tollBoothExtractRepository,
        storage: tollBoothExtractStorage,
      }),
      listExtracts: createListTollBoothExtractsUseCase({ extracts: tollBoothExtractRepository }),
    }),
    ...createTollBoothCatalogReloadRoutes({
      reloadCatalog: createReloadTollBoothCatalogUseCase({
        axleChargeGapCache: tollBoothAxleChargeGapCache,
        catalogReload: createDrizzleTollBoothCatalogReloadRepository(database),
        extracts: tollBoothExtractRepository,
        logger,
        storage: tollBoothExtractStorage,
      }),
    }),
    ...createCompanyEnergyRoutes({
      choose: createChooseEnergyDistributorUseCase({ energy: companyEnergyRepository }),
      clear: createClearEnergyDistributorUseCase({ energy: companyEnergyRepository }),
      getSettings: createGetCompanyEnergyUseCase({ energy: companyEnergyRepository }),
    }),
    ...createDistributionCursorRoutes({
      adjust: createAdjustDistributionCursorUseCase({
        audit: distributionCursorRepository,
        clock: { now: () => new Date() },
        repository: distributionCursorRepository,
      }),
      getStatus: createGetDistributionCursorUseCase({ repository: distributionCursorRepository }),
    }),
    ...createFederalTaxSettingsRoutes({
      clear: createClearFederalTaxSettingsUseCase({ settings: federalTaxSettingsRepository }),
      get: createGetFederalTaxSettingsUseCase({ settings: federalTaxSettingsRepository }),
      set: createSetFederalTaxSettingsUseCase({ settings: federalTaxSettingsRepository }),
    }),
    ...createDriverAllowanceSettingsRoutes({
      clear: createClearDriverAllowanceSettingsUseCase({
        settings: driverAllowanceSettingsRepository,
      }),
      get: createGetDriverAllowanceSettingsUseCase({ settings: driverAllowanceSettingsRepository }),
      set: createSetDriverAllowanceSettingsUseCase({ settings: driverAllowanceSettingsRepository }),
    }),
    ...createCompanyLogoRoutes({
      companyLogo: createCompanyLogoUseCase({ repository: companyLogoRepository }),
    }),
    ...(routeOptimizationQueue === undefined
      ? []
      : createRouteSuggestionRoutes({
          geocodedAddressCorrection: createGeocodedAddressCorrectionUseCase({
            repository: createDrizzleGeocodedAddressCorrectionRepository(database),
          }),
          refineAddress: createRefineAddressUseCase({
            components: createDrizzleAddressComponentsSource(database),
            /**
             * Spec 069 RF7: sem `GOOGLE_MAPS_API_KEY` o gateway **não é construído**, e a marca
             * responde `provider_not_configured` oferecendo o pino manual. A app sobe igual.
             */
            geocoding:
              googleMapsApiKey === undefined
                ? undefined
                : createGoogleGeocodingGateway({ apiKey: googleMapsApiKey }),
            repository: createDrizzleGeocodedAddressRepository(database),
            trail: geocodingRefinementRepository,
          }),
          refinementQuota: {
            countInWindow: (quotaInput) => geocodingRefinementRepository.countInWindow(quotaInput),
            limit: GEOCODING_REFINEMENT_WINDOW_LIMIT,
          },
          routeSuggestions: createRouteSuggestionUseCase({
            queue: routeOptimizationQueue,
            repository: createDrizzleRouteSuggestionRepository(database),
            /**
             * Spec 153 D7/RF3: o aceite por viagem também congela a rota, pela mesma porta da T201
             * — nunca um segundo caminho de escrita.
             */
            routePlanner: {
              planRoute: (input) =>
                planTripRoute({
                  actorUserId: input.actorUserId,
                  channel: TRIP_FIELD_CHANNELS.backoffice,
                  companyId: input.companyId,
                  repository: tripRouteRepository,
                  ...(input.routeChoice === undefined ? {} : { routeChoice: input.routeChoice }),
                  tollFreezer: tripRouteTollFreezer,
                  tripId: input.tripId,
                }).then(() => undefined),
            },
            stopOrder: createTripStopOrderWriter(tripRouteRepository),
            trips: createDrizzleTripRouteGate(database),
          }),
        })),
    /**
     * Spec 058 P2: a multi-veículo mora fora da árvore `/trips/:id` — ela existe **antes** de as
     * viagens existirem. Ela só é registrada com a fila de pé, pela mesma razão da sugestão de
     * viagem: sem broker, pedir sugestão é pedir algo que ninguém vai processar.
     */
    ...(routeOptimizationQueue === undefined
      ? []
      : createMultiVehicleSuggestionRoutes({
          multiVehicleSuggestions: createMultiVehicleSuggestionUseCase({
            multiVehicle: createDrizzleMultiVehicleSuggestionRepository(database),
            queue: routeOptimizationQueue,
            suggestions: createDrizzleRouteSuggestionRepository(database),
            trips: createTripComposer({
              create: (input) => trips.create(input),
              link: (input) => trips.linkDocument(input),
              /**
               * A leitura vai direto ao caso de uso de listar parada, e não ao ciclo de vida com um
               * contexto meia-boca: aqui só o `companyId` importa, e é o que `listTripStops` recebe.
               */
              listStops: async (input) =>
                (await listTripStops({ ...input, repository: tripStopLookupRepository })).stops,
              planRoute: (input) => tripLifecycle.planRoute.execute(input),
              reorder: (input) => tripLifecycle.reorderStops.execute(input),
              /** Spec 148 T7: o aceite que vincula e solta as notas que não couberam na prévia. */
              readReleasePlan: (input) =>
                tripDocumentReviewRepository.readReleasePlan({
                  companyId: input.context.companyId,
                  layoutId: input.layoutId,
                }),
              linkAndRelease: (input) =>
                tripDocumentReviewRepository.linkAndReleaseForReview({
                  companyId: input.context.companyId,
                  correlationId: input.correlationId,
                  layoutId: input.layoutId,
                  nfeDocumentId: input.nfeDocumentId,
                  reason: input.reason,
                  tripId: input.tripId,
                  userId: input.context.userId,
                }),
              /** Spec 107 D3: o ETA da sugestão vira o ETA da viagem, com o carimbo do momento. */
              writeEstimatedArrivals: (input) =>
                tripRouteRepository.writeEstimatedArrivals({
                  arrivals: input.arrivals,
                  companyId: input.context.companyId,
                  plannedDepartureAt: input.plannedDepartureAt,
                  tripId: input.tripId,
                }),
            }),
          }),
          /**
           * Spec 101: a conta da sugestão. ⚠️ **Nenhuma porta de geometria entra aqui** — a
           * distância sai das paradas que o solver já escolheu (D1), e passar o roteirizador para
           * este caminho é justamente o que a spec proíbe.
           */
          readSuggestionValuation: (query) =>
            readSuggestionValuation({
              ...query,
              repository: createSuggestionValuationAdapter({
                multiVehicle: createDrizzleMultiVehicleSuggestionRepository(database),
                valuation: {
                  findApplicableRule: (rule) => applicableFreightRuleQuery.findApplicableRule(rule),
                  readContext: (trip) => tripValuationQuery.readContext(trip),
                  readPreviewContext: (preview) => tripValuationQuery.readPreviewContext(preview),
                },
              }),
            }),
        })),
    ...createLandingSettingsRoutes({ landingSettings }),
    ...createAggregateApplicationRoutes({ aggregateApplications }),
    ...createAggregateApplicationAttachmentReviewRoutes({
      attachmentReview: createAggregateApplicationAttachmentReviewUseCase({
        repository: attachmentReviewRepository,
      }),
      createSignedDownload: (input) => storageGateway.createSignedDownload(input),
      findDownloadLocation: (input) => attachmentReviewRepository.findDownloadLocation(input),
    }),
    ...createAggregateDocumentReviewRoutes({
      aggregateDocumentReview: createAggregateDocumentReviewUseCase({
        bucket: storageBucket,
        repository: createDrizzleAggregateDocumentRepository(database),
        storage: storageGateway,
      }),
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
      driverAvailability: { execute: (input) => fleetDrivers.checkAvailability(input) },
      driverVehicles: {
        list: (input) => fleetDriverVehicles.list(input),
        listPairs: (input) => fleetDriverVehicles.listPairs(input),
        replace: (input) => fleetDriverVehicles.replace(input),
      },
      driverScore: { execute: (input) => fleetDriverScores.read(input) },
      listDrivers: { execute: (input) => fleetDriverScores.list(input) },
      listVehicles: { execute: (input) => fleetVehicles.list(input) },
      updateDriver: { execute: (input) => fleetDrivers.update(input) },
      updateVehicle: { execute: (input) => fleetVehicles.update(input) },
      vehicleCatalog: { isAvailable: () => vehicleCatalog !== null },
    }),
    ...createFleetCatalogRoutes({ vehicleCatalog: fleetVehicleCatalog }),
    ...createVehicleReferenceRoutes({
      vehicleReferences: new DrizzleVehicleReferenceRepository({ database }),
    }),
    ...createPostalCodeRoutes({ lookup: lookupPostalCode }),
    ...createAddressReportRoutes({ readReport: readAddressReport }),
    ...createAddressCorrectionRoutes({
      findRecipients: findAddressCorrectionRecipients,
      listRequests: listAddressCorrectionRequests,
      mailRateLimit: contractorMailRateLimit,
      saveDraft: saveAddressCorrectionDraft,
      sendMail: sendAddressCorrectionMail,
    }),
    ...createFleetDriverRegionRoutes({
      listCoverage: { execute: (input) => fleetDriverRegions.list(input) },
      replaceCoverage: { execute: (input) => fleetDriverRegions.replace(input) },
    }),
    ...createFinancialSummaryRoutes({
      readSummary: {
        execute: async (input) => {
          const filters = {
            companyId: input.context.companyId,
            from: input.from,
            groupBy: input.groupBy,
            to: input.to,
          }

          return buildFinancialSummary({
            payrollAmount: await financialSummaryQuery.readPayroll(filters),
            rows: await financialSummaryQuery.listGroups(filters),
          })
        },
      },
    }),
    /** Spec 148 T7: a fila de revisão das notas que não couberam. */
    ...createTripDocumentReviewRoutes({ reviews: tripDocumentReviewRepository }),
    ...createExtraChargeBatchRoutes({
      closeBatch: { execute: (input) => extraChargeBatches.close(input) },
      decideBatch: { execute: (input) => extraChargeBatches.decide(input) },
      readReport: { execute: (input) => extraChargeBatches.readReport(input) },
    }),
    ...createDeliveryChargeRoutes({
      confirmCharges: { execute: (input) => deliveryCharges.confirm(input) },
      deactivateRule: {
        execute: async (input) => {
          await deliveryChargeRuleRepository.deactivate({
            actorUserId: input.context.userId,
            companyId: input.context.companyId,
            ruleId: input.ruleId,
          })
        },
      },
      dismissCharge: { execute: (input) => deliveryCharges.dismiss(input) },
      listCharges: { execute: (input) => deliveryCharges.list(input) },
      listRules: {
        execute: (input) =>
          deliveryChargeRuleRepository.listByClient({
            companyId: input.context.companyId,
            deliveryClientId: input.deliveryClientId,
          }),
      },
      recordCharge: { execute: (input) => deliveryCharges.record(input) },
      upsertRule: {
        execute: (input) =>
          deliveryChargeRuleRepository.upsert({
            actorUserId: input.context.userId,
            chargeType: input.chargeType,
            companyId: input.context.companyId,
            deliveryClientId: input.deliveryClientId,
            expectedAmount: input.expectedAmount,
          }),
      },
    }),
    ...createContractorRoutes({
      createContractor: { execute: (input) => contractorRegistry.create(input) },
      getByTaxId: { execute: (input) => contractorRegistry.getByTaxId(input) },
      getContractor: { execute: (input) => contractorRegistry.get(input) },
      listContractors: { execute: (input) => contractorRegistry.list(input) },
      listHolidays: { execute: (input) => municipalHolidays.list(input) },
      removeHoliday: { execute: (input) => municipalHolidays.remove(input) },
      saveHoliday: { execute: (input) => municipalHolidays.save(input) },
      updateContractor: { execute: (input) => contractorRegistry.update(input) },
    }),
    ...createContractorContactRoutes({
      createContact: { execute: (input) => contractorContacts.create(input) },
      listContacts: { execute: (input) => contractorContacts.list(input) },
      updateContact: { execute: (input) => contractorContacts.update(input) },
    }),
    ...createContractorDeliveryRoutes({
      listDeliveries: { execute: (input) => readContractorDeliveries(input) },
      readDeliveryLocation: { execute: (input) => readContractorDeliveryLocation(input) },
      scheduleDelivery: { execute: (input) => scheduleContractorDelivery(input) },
    }),
    ...createContractorExtraChargeRoutes({
      decideBatch: { execute: (input) => contractorExtraCharges.decide(input) },
      listBatches: { execute: (input) => contractorExtraCharges.list(input) },
    }),
    ...createContractorPortalBindingRoutes({
      bindPortalUser: { execute: (input) => contractorPortalBindings.bind(input) },
      listPortalUsers: { execute: (input) => contractorPortalBindings.list(input) },
      unbindPortalUser: { execute: (input) => contractorPortalBindings.unbind(input) },
    }),
    ...createDeliveryClientRoutes({
      createClient: { execute: (input) => deliveryClients.create(input) },
      getByTaxId: { execute: (input) => deliveryClients.getByTaxId(input) },
      getClient: { execute: (input) => deliveryClients.get(input) },
      listClients: { execute: (input) => deliveryClients.list(input) },
      replaceExceptions: { execute: (input) => deliveryClients.replaceExceptions(input) },
      replaceWindows: { execute: (input) => deliveryClients.replaceWindows(input) },
      updateClient: { execute: (input) => deliveryClients.update(input) },
    }),
    ...createFreightRegionRoutes({
      createRegion: { execute: (input) => freightRegions.create(input) },
      deleteRegion: { execute: (input) => freightRegions.delete(input) },
      importRegions: { execute: (input) => freightRegionImport.import(input) },
      listRegions: { execute: (input) => freightRegions.list(input) },
      updateRegion: { execute: (input) => freightRegions.update(input) },
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
    ...createMeLocationRoutes({
      recordLocation: (input) => recordTripLocation(input),
      resolveDriverId: (input) => currentDriverTripRepository.findDriverIdByMembership(input),
      setConsent: (input) => tripLocationRepository.setConsent(input),
    }),
    ...createWhatsAppPhoneRoutes({
      readState: createReadWhatsAppPhoneStateUseCase({
        clock: () => new Date(),
        repository: new DrizzleWhatsAppPhoneRepository(database),
      }),
      requestVerification: createRequestWhatsAppPhoneVerificationUseCase({
        clock: () => new Date(),
        repository: new DrizzleWhatsAppPhoneRepository(database),
      }),
      unbind: createUnbindWhatsAppPhoneUseCase({
        memberships: new DrizzleMembershipRepository(database),
        repository: new DrizzleWhatsAppPhoneRepository(database),
      }),
    }),
    ...createDeliveryProofSettingsRoutes({
      listOverrides: (input) => deliveryProofSettingsRepository.listOverrides(input),
      readSettings: (input) => deliveryProofSettingsRepository.readSettings(input),
      replaceOverrides: (input) => deliveryProofSettingsRepository.replaceOverrides(input),
      saveSettings: (input) => deliveryProofSettingsRepository.saveSettings(input),
    }),
    ...createTripFieldDeliverySettingsRoutes({
      readCanhotoOcrEnabled: (input) =>
        deliveryProofSettingsRepository.readCanhotoOcrEnabled(input),
    }),
    ...createTripFieldDeliveryDocumentsRoutes({
      readFieldDeliveryDocuments: (input) =>
        readFieldDeliveryDocuments({
          ...input,
          repository: {
            readTripFieldDeliveryDocuments: (query) =>
              readTripFieldDeliveryDocumentsQuery(database, query),
          },
        }),
    }),
    ...createMeTripRoutes({
      startFieldTrip: (input) =>
        startFieldTrip({ ...input, repository: currentDriverTripRepository }),
      /**
       * Spec 079: o motorista registra a ocorrência do celular. **Sem notificador**: quem despachou
       * a viagem é justamente quem receberia o aviso, e ele não precisa ser avisado de algo que o
       * motorista acabou de contar por rádio. O aviso configurável é do registro feito no
       * escritório.
       */
      registerDriverOccurrence: (input) =>
        registerDriverOccurrence({
          ...input,
          repository: {
            findOccurrenceType: (query) => findOccurrenceType(database, query),
            findReachableDocument: (query) => findDriverReachableDocument(database, query),
            listDocumentProducts: (query) => listDocumentProducts(database, query),
            saveOccurrence: (query) => saveTripOccurrence(database, query),
          },
        }),
      attachProof: (input) =>
        attachDeliveryProof({
          ...input,
          newObjectId: () => crypto.randomUUID(),
          newProofId: () => crypto.randomUUID(),
          now: new Date(),
          repository: deliveryProofRepository,
          sealDocument: (seal) => deliveryProofDocumentSecrets.encrypt(seal),
          storage: createDeliveryProofStorage({
            bucket: storageBucket,
            storage: storageGateway,
          }),
        }),
      /** ADR-0058: o mesmo `dispatchTrip` do escritório, recortado pelo vínculo — sem `force`. */
      dispatchCurrentTrip: (input) =>
        dispatchDriverTrip({
          ...input,
          dispatch: (request) =>
            dispatchTrip({
              actorUserId: request.actorUserId,
              channel: TRIP_FIELD_CHANNELS.driverApp,
              companyId: input.companyId,
              repository: tripRouteRepository,
              tripId: request.tripId,
            }),
          linkage: currentDriverTripRepository,
        }),
      /** Spec 157: a mesma projeção da lista do escritório (L2 da spec 156) — só rua, só id e nome. */
      listFieldOccurrenceTypes: (input) =>
        listFieldOccurrenceTypes({
          companyId: input.companyId,
          repository: { listOccurrenceTypes: (query) => listOccurrenceTypes(database, query) },
        }),
      findCurrentTrip: (input) =>
        findCurrentDriverTrip({
          ...input,
          now: new Date(),
          repository: currentDriverTripRepository,
          scores: driverScoreRepository,
        }),
      readManifestXml: (input) => readMdfeDocument.readXmlDownload(input),
      renderManifestDamdfe: (input) => readMdfeDocument.renderDamdfe(input),
      reportArrival: (input) =>
        reportStopArrival({ ...input, now: new Date(), unitOfWork: driverFieldReports }),
      reportDelivery: (input) =>
        reportDocumentDelivery({
          ...input,
          now: new Date(),
          resolveProofSettings: (settings) =>
            deliveryProofRepository.resolveProofFieldSettings(settings),
          unitOfWork: driverFieldReports,
        }),
      reportOccurrence: (input) =>
        reportStopOccurrence({
          ...input,
          ...stopOccurrenceFollowUp,
          attachmentObjectId: null,
          unitOfWork: driverFieldReports,
        }),
      reportReturn: (input) =>
        reportDocumentReturn({ ...input, now: new Date(), unitOfWork: driverFieldReports }),
      resolveDriverId: (input) => currentDriverTripRepository.findDriverIdByMembership(input),
    }),
    ...createTripFieldOfficeRoutes({
      /**
       * Spec 156 T6/T15 M2: reserva da chave (`office.document.proof`), evento, upload e comprovante
       * numa transação só. O canhoto do escritório não classifica pontualidade (spec 159 T11).
       */
      attachProof: (input) =>
        reportFieldProof({
          actorUserId: input.actorUserId,
          attachment: officeDeliveryProofAttachment,
          companyId: input.companyId,
          documentId: input.documentId,
          idempotencyKey: input.idempotencyKey,
          officeAudit: input.officeAudit,
          target: input.target,
          unitOfWork: driverFieldReports,
          upload: input.proof,
        }),
      /** Spec 156 T15 A1: a hora informada é a da chegada; a da gravação vai em `recordedAt`. */
      reportArrival: (input) =>
        reportStopArrival({
          ...input,
          location: null,
          now: input.arrivedAt,
          recordedAt: new Date(),
          unitOfWork: driverFieldReports,
        }),
      /**
       * Spec 156 T6, D9: entrega + comprovante na mesma transação — o alvo já resolveu o motorista
       * em nome de quem se registra, e `proof.upload` pode ser `null` (a foto é opcional conforme a
       * configuração da empresa; quem barra é o caso de uso, aceite 9).
       */
      reportDelivery: (input) =>
        reportDocumentDelivery({
          ...input,
          location: null,
          now: input.deliveredAt,
          proof: { ...officeDeliveryProofAttachment, upload: input.proof },
          recordedAt: new Date(),
          resolveProofSettings: (settings) =>
            deliveryProofRepository.resolveProofFieldSettings(settings),
          unitOfWork: driverFieldReports,
        }),
      /** Spec 156 T15 M5: o mesmo aviso e a mesma sugestão de cobrança da ocorrência do motorista. */
      reportOccurrence: (input) =>
        reportStopOccurrence({
          ...input,
          ...stopOccurrenceFollowUp,
          attachmentObjectId: null,
          unitOfWork: driverFieldReports,
        }),
      reportReturn: (input) =>
        reportDocumentReturn({
          ...input,
          location: null,
          now: input.returnedAt,
          recordedAt: new Date(),
          unitOfWork: driverFieldReports,
        }),
      startFieldTrip: (input) =>
        startFieldTrip({ ...input, repository: currentDriverTripRepository }),
      targets: fieldTripTargetRepository,
    }),
    ...createTripFieldOfficeOccurrenceRoutes({
      listFieldOccurrenceTypes: (input) =>
        listFieldOccurrenceTypes({
          companyId: input.companyId,
          repository: { listOccurrenceTypes: (query) => listOccurrenceTypes(database, query) },
        }),
      /** Spec 156 T7b, D9: a mesma foto para as N notas — um `stored_objects` só, no molde do canhoto. */
      registerOccurrences: (input) =>
        registerOfficeDocumentOccurrences({
          ...input,
          attachment: {
            newObjectId: () => crypto.randomUUID(),
            storage: createDeliveryProofStorage({ bucket: storageBucket, storage: storageGateway }),
            upload: input.attachment,
          },
          notifications: {
            logger,
            notifier: occurrenceNotifier,
            readLabels: (query) => readOccurrenceLabelsForDocuments(database, query),
          },
          unitOfWork: officeOccurrenceBatches,
        }),
      targets: fieldTripTargetRepository,
    }),
    ...createTripRoutes({
      batchStatus: { execute: (input) => tripLifecycle.batchStatus.execute(input) },
      cancelTrip: { execute: (input) => tripLifecycle.cancel.execute(input) },
      closeTrip: { execute: (input) => trips.close(input) },
      createTrip: { execute: (input) => trips.create(input) },
      createTripMdfeManifest: { execute: (input) => createTripMdfeManifest.execute(input) },
      listOccurrenceTypes: {
        execute: (input) => listOccurrenceTypes(database, { companyId: input.context.companyId }),
      },
      saveOccurrenceType: {
        execute: (input) =>
          saveOccurrenceTypeWithTemplate({
            companyId: input.context.companyId,
            save: (values) =>
              saveOccurrenceType(database, { ...values, companyId: input.context.companyId }),
            templates: {
              /**
               * O predicado consulta o catálogo do módulo — a mesma fonte que a tela de templates
               * edita. Chave sem template ativo de e-mail é recusada na gravação, não no envio.
               */
              hasActiveEmailTemplate: async ({ companyId, templateKey }) => {
                const templates = await notifications.useCases.listTemplates.execute({ companyId })
                return templates.some(
                  (template) =>
                    template.key === templateKey && template.channel === 'email' && template.active,
                )
              },
            },
            values: {
              active: input.active,
              emailBody: input.emailBody,
              emailSubject: input.emailSubject,
              emailTemplateKey: input.emailTemplateKey,
              name: input.name,
              notifies: input.notifies,
              occurrenceTypeId: input.occurrenceTypeId,
              stage: input.stage,
            },
          }),
      },
      /**
       * Spec 156 T7b: mesma `anyPermission` da leitura de ocorrências (D11) — o anexo do lote sai
       * por URL assinada nesta resposta, sem uma segunda rota com política diferente.
       */
      /**
       * Spec 161 T9 (RF8/RF9/CA5): `attachments[]` no lugar do `attachment` singular, pelo ponto
       * único de leitura (`readOccurrenceAttachments`, T3) — tabela nova quando existem linhas,
       * senão a coluna antiga (D6). Ordenado por `position`, com `thumbnailUrl` ausente quando não
       * há miniatura e sem URL nenhuma para anexo com retenção vencida.
       */
      listTripOccurrences: {
        execute: async (input) => {
          const occurrences = await listTripOccurrences(database, {
            companyId: input.context.companyId,
            documentId: input.documentId,
            tripId: input.tripId,
          })
          const downloads = createDeliveryProofDownloadGateway({ storage: storageGateway })
          const attachmentRepository = new DrizzleOccurrenceAttachmentRepository(database)

          return Promise.all(
            occurrences.map(async (occurrence) => ({
              ...occurrence,
              attachments: await readOccurrenceAttachments({
                companyId: input.context.companyId,
                downloads,
                occurrenceId: occurrence.id,
                repository: attachmentRepository,
              }),
            })),
          )
        },
      },
      listTripOccurrenceFeed: createListTripOccurrenceFeedUseCase({
        reader: {
          listAttachmentLocations: (query) =>
            listTripOccurrenceAttachmentLocations(database, query),
          listFeed: (query) => listTripOccurrenceFeed(database, query),
        },
      }),
      readTripOccurrenceAttachments: createReadTripOccurrenceAttachmentsUseCase({
        downloads: createDeliveryProofDownloadGateway({ storage: storageGateway }),
        reader: {
          listAttachmentLocations: (query) =>
            listTripOccurrenceAttachmentLocations(database, query),
          listFeed: (query) => listTripOccurrenceFeed(database, query),
        },
      }),
      /**
       * Spec 161 T8 (CA18): `Idempotency-Key` + impressão do conteúdo (sha256 do **original**,
       * nunca da miniatura — RF3) na operação, no mesmo molde do lote do escritório
       * (`buildOccurrenceBatchOperation`). Reenviar a mesma chave com a mesma foto devolve a
       * ocorrência já gravada (`recall`); com outra foto (ou outro texto/tipo/produto) é 409
       * `TRIP_FIELD_REPORT_KEY_REUSED` — chave reaproveitada é erro do cliente, não repetição.
       * ⚠️ Autoria `driver_app`/`onBehalfOfDriverId: null`: o galpão não tem `FieldTripTarget`
       * (D6, `saveTripOccurrence`) — é o mesmo padrão da coluna que este fluxo já grava.
       */
      registerTripOccurrence: {
        execute: async (input) =>
          withFieldReport({
            guard: {
              actorUserId: input.context.userId,
              authorship: { channel: TRIP_FIELD_CHANNELS.driverApp, onBehalfOfDriverId: null },
              companyId: input.context.companyId,
              idempotencyKey: input.idempotencyKey,
              operation: `${OCCURRENCE_ATTACHMENT_CREATE_OPERATION}:${buildOccurrenceAttachmentCreateFingerprint(
                {
                  attachmentSha256: sha256Hex(input.attachment.bytes),
                  documentId: input.documentId,
                  note: input.note,
                  occurrenceTypeId: input.occurrenceTypeId,
                  productCode: input.productCode,
                },
              )}`,
              transaction: fieldReportGuardTransaction,
            },
            perform: async () =>
              registerTripOccurrence({
                actorUserId: input.context.userId,
                attachment: input.attachment,
                companyId: input.context.companyId,
                documentId: input.documentId,
                note: input.note,
                /**
                 * Spec 079: o aviso sai **se** a empresa ligou aquele tipo. A leitura da
                 * configuração acontece por registro — é uma consulta pequena, por empresa, e
                 * cacheá-la faria a escolha recém-salva demorar a valer sem ninguém entender por
                 * quê.
                 */
                notificationParameters: {
                  ...(await readOccurrenceLabels(database, {
                    companyId: input.context.companyId,
                    documentId: input.documentId,
                    tripId: input.tripId,
                  })),
                  documentId: input.documentId,
                  /** O nome do tipo é preenchido pelo caso de uso, que é quem lê o cadastro. */
                  occurrenceType: '',
                  tripId: input.tripId,
                },
                notifier: occurrenceNotifier,
                occurrenceTypeId: input.occurrenceTypeId,
                /** A data que o modelo imprime é a de agora — a ocorrência é registrada quando
                 * acontece. */
                occurredOn: new Date().toLocaleDateString('pt-BR'),
                productCode: input.productCode,
                repository: {
                  findOccurrenceType: (query) => findOccurrenceType(database, query),
                  listDocumentProducts: (query) => listDocumentProducts(database, query),
                  listOccurrences: (query) => listTripOccurrences(database, query),
                  readTemplateValues: (query) => readOccurrenceTemplateValues(database, query),
                  /**
                   * Spec 161 T6: já validado (teto/tipo/assinatura) pelo caso de uso — aqui sobem
                   * o original e a miniatura opcional e grava a linha de anexo, tudo na transação
                   * de `DrizzleSeparationOccurrenceUnitOfWork`. Se algo falhar depois do upload,
                   * `runWithStoredObjectCleanup` desfaz o que subiu.
                   */
                  saveOccurrence: (query) =>
                    persistSeparationOccurrenceWithAttachment({
                      attachment: query.attachment,
                      input: {
                        actorUserId: query.actorUserId,
                        companyId: query.companyId,
                        documentId: query.documentId,
                        note: query.note,
                        occurrenceTypeId: query.occurrenceTypeId,
                        productCode: query.productCode,
                        stage: query.stage,
                        tripId: query.tripId,
                        typeName: query.typeName,
                      },
                      newObjectId: () => crypto.randomUUID(),
                      now: () => new Date(),
                      storage: createDeliveryProofStorage({
                        bucket: storageBucket,
                        storage: storageGateway,
                      }),
                      unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database),
                    }),
                },
                tripId: input.tripId,
              }),
            recall: async (resultId) => {
              const occurrence = await findTripOccurrenceById(database, {
                companyId: input.context.companyId,
                occurrenceId: resultId,
              })
              if (occurrence === null) return null
              const attachments = await new DrizzleOccurrenceAttachmentRepository(
                database,
              ).listOccurrenceAttachments({
                companyId: input.context.companyId,
                occurrenceId: resultId,
              })
              return {
                ...occurrence,
                attachments: attachments.map((attachment) => ({
                  id: attachment.id,
                  position: attachment.position,
                })),
                /** Reenvio não reconstrói o e-mail pronto — quem precisa dele releu no primeiro. */
                email: null,
              }
            },
          }),
      },
      /**
       * Spec 161 T7/T8 (RF6, CA18): a segunda foto em diante. Mesmo molde de idempotência do
       * registro, com a operação de anexo (`buildOccurrenceAttachmentAppendFingerprint`) — a
       * mesma chave com a mesma foto converge; com outra foto, a mesma chave já usada é 409
       * `TRIP_FIELD_REPORT_KEY_REUSED`, não um sexto anexo.
       */
      attachOccurrencePhoto: {
        execute: (input) =>
          withFieldReport({
            guard: {
              actorUserId: input.context.userId,
              authorship: { channel: TRIP_FIELD_CHANNELS.driverApp, onBehalfOfDriverId: null },
              companyId: input.context.companyId,
              idempotencyKey: input.idempotencyKey,
              operation: `${OCCURRENCE_ATTACHMENT_APPEND_OPERATION}:${buildOccurrenceAttachmentAppendFingerprint(
                {
                  attachmentSha256: sha256Hex(input.attachment.bytes),
                  occurrenceId: input.occurrenceId,
                },
              )}`,
              transaction: fieldReportGuardTransaction,
            },
            perform: () =>
              attachOccurrencePhoto({
                attachment: input.attachment,
                companyId: input.context.companyId,
                occurrenceId: input.occurrenceId,
                repository: {
                  countOccurrenceAttachments: (query) =>
                    new DrizzleOccurrenceAttachmentRepository(database).countOccurrenceAttachments(
                      query,
                    ),
                  findOccurrence: (query) => findOccurrenceForAttachment(database, query),
                  newObjectId: () => crypto.randomUUID(),
                  now: () => new Date(),
                  storage: createDeliveryProofStorage({
                    bucket: storageBucket,
                    storage: storageGateway,
                  }),
                  unitOfWork: new DrizzleAttachOccurrencePhotoUnitOfWork(database),
                },
              }),
            recall: async (resultId) =>
              new DrizzleOccurrenceAttachmentRepository(database).findAttachmentPosition({
                companyId: input.context.companyId,
                id: resultId,
              }),
          }),
      },
      readTripDocumentProducts: {
        execute: (input) =>
          readTripDocumentProducts({
            companyId: input.context.companyId,
            documentId: input.documentId,
            repository: {
              listDocumentProducts: (query) => listDocumentProducts(database, query),
            },
            tripId: input.tripId,
          }),
      },
      /**
       * Spec 079: a linha da estrada para o mapa. Sem `ROUTING_MATRIX_URL` a porta devolve `null` e
       * a tela volta a ligar as paradas em reta — **dizendo que são retas**, nunca fingindo estrada.
       */
      /**
       * A mesma porta e o mesmo caso de uso da geometria da viagem — muda só a origem dos pontos.
       * Sem `ROUTING_MATRIX_URL` ela devolve `unavailable`, e a tela volta a ligar em reta **dizendo
       * que são retas**.
       */
      readRouteGeometry: {
        execute: async (input) => {
          const vehicleContext =
            input.vehicleId === null
              ? null
              : await routeGeometryVehicleAxlesQuery.readVehicleContext({
                  companyId: input.context.companyId,
                  vehicleId: input.vehicleId,
                })

          return readRouteGeometry({
            axles: vehicleContext?.axles ?? null,
            multiplier: vehicleContext?.multiplier ?? null,
            depot: {
              readDepot: () => routeDepotQuery.readDepot({ companyId: input.context.companyId }),
              readDescription: () =>
                routeDepotQuery.readDescription({ companyId: input.context.companyId }),
            },
            fuelBaseline: vehicleContext?.fuelBaseline ?? null,
            hasAutomaticTollPayment: vehicleContext?.hasAutomaticTollPayment ?? false,
            geometry:
              routingMatrixUrl === undefined
                ? { readRouteGeometry: async () => null }
                : createOsrmRouteGeometryGateway({ baseUrl: routingMatrixUrl }),
            now: () => new Date(),
            stops: input.points,
            tollBooths: createCompanyScopedTollBoothGateway({
              catalog: tollBoothRepository,
              charges: tollBoothChargeRepository,
              companyId: input.context.companyId,
            }),
          })
        },
      },
      readTripRouteGeometry: {
        execute: (input) =>
          readTripRouteGeometryUseCase({
            companyId: input.context.companyId,
            readLiveRoute: async () => {
              const trip = await trips.get(input)
              const vehicleContext = await routeGeometryVehicleAxlesQuery.readVehicleContext({
                companyId: input.context.companyId,
                vehicleId: trip.vehicleId,
              })

              return readRouteGeometry({
                axles: vehicleContext.axles,
                multiplier: vehicleContext.multiplier,
                /** A viagem já criada parte do mesmo barracão: duas telas, uma conta (spec 097). */
                depot: {
                  readDepot: () =>
                    routeDepotQuery.readDepot({ companyId: input.context.companyId }),
                  readDescription: () =>
                    routeDepotQuery.readDescription({ companyId: input.context.companyId }),
                },
                fuelBaseline: vehicleContext.fuelBaseline,
                hasAutomaticTollPayment: vehicleContext.hasAutomaticTollPayment,
                geometry:
                  routingMatrixUrl === undefined
                    ? { readRouteGeometry: async () => null }
                    : createOsrmRouteGeometryGateway({ baseUrl: routingMatrixUrl }),
                now: () => new Date(),
                stops: await listTripStopCoordinates(database, {
                  companyId: input.context.companyId,
                  tripId: input.tripId,
                }),
                tollBooths: createCompanyScopedTollBoothGateway({
                  catalog: tollBoothRepository,
                  charges: tollBoothChargeRepository,
                  companyId: input.context.companyId,
                }),
              })
            },
            route: tripPlannedRouteRepository,
            tollBooths: createCompanyScopedTollBoothGateway({
              catalog: tollBoothRepository,
              charges: tollBoothChargeRepository,
              companyId: input.context.companyId,
            }),
            tripId: input.tripId,
          }),
      },
      readDeliveryProofs: {
        execute: (input) =>
          readDeliveryProofs({
            companyId: input.context.companyId,
            documentId: input.documentId,
            downloads: createDeliveryProofDownloadGateway({ storage: storageGateway }),
            repository: {
              listDeliveryProofs: (query) => listDeliveryProofs(database, query),
            },
            tripId: input.tripId,
          }),
      },
      dispatchTrip: { execute: (input) => tripLifecycle.dispatch.execute(input) },
      createTripCteBatch: {
        execute: async (input) => {
          const batch = await createTripCteBatch({
            companyId: input.companyId,
            correlationId: input.correlationId,
            createBatch: async (batchInput) => {
              const created = await cteBatches.create({
                context: { companyId: batchInput.companyId, userId: batchInput.userId },
                correlationId: batchInput.correlationId,
                documentIds: batchInput.documentIds,
                idempotencyKey: batchInput.idempotencyKey,
                name: batchInput.name,
              })
              return { id: String(created.id) }
            },
            idempotencyKey: input.idempotencyKey,
            readReadiness: (readinessInput) =>
              readTripFiscalReadiness({
                ...readinessInput,
                repository: tripFiscalReadinessQuery,
              }),
            tripId: input.tripId,
            userId: input.userId,
          })
          return batch
        },
      },
      getTrip: { execute: (input) => trips.get(input) },
      logger,
      requestCargoLayout,
      readCargoLayout: createReadCargoLayoutUseCase({ repository: cargoLayoutLookup }),
      reopenCargoLayout: createReopenCargoLayoutUseCase({
        repository: cargoLayoutRequestRepository,
      }),
      listSchedules: { execute: (input) => tripStopSchedules.list(input) },
      readFinancialResult: {
        execute: (input) =>
          tripFinancialResultRepository.findCurrent({
            companyId: input.context.companyId,
            tripId: input.tripId,
          }),
      },
      recalculateFinancialResult: {
        execute: async (input) =>
          freezeTripFinancialResult({
            actorUserId: input.context.userId,
            assumptions: {},
            companyId: input.context.companyId,
            reason: input.reason,
            repository: tripFinancialResultRepository,
            tripId: input.tripId,
            valuation: await readTripValuation({
              companyId: input.context.companyId,
              repository: {
                findApplicableRule: (query) => applicableFreightRuleQuery.findApplicableRule(query),
                readContext: (query) => tripValuationQuery.readContext(query),
              },
              tripId: input.tripId,
            }),
          }),
      },
      recordTripCost: {
        execute: (input) =>
          tripCostRepository.record({
            actorUserId: input.context.userId,
            amount: input.amount,
            companyId: input.context.companyId,
            description: input.description,
            kind: input.kind,
            tripId: input.tripId,
          }),
      },
      listTripCosts: {
        execute: (input) => listTripCosts({ ...input, repository: tripCostRepository }),
      },
      readTripTimeline: createReadTripTimelineUseCase({
        existence: { findTripCompanyScope: (input) => findTripCompanyScope(database, input) },
        reader: { listTripTimeline: (input) => listTripTimeline(database, input) },
      }),
      saveSchedule: { execute: (input) => tripStopSchedules.save(input) },
      issueManifestAutomatically: {
        execute: (input) =>
          issueTripManifestAutomatically({
            context: { companyId: input.companyId, userId: input.userId },
            correlationId: input.correlationId,
            createManifest: createTripMdfeManifest,
            ...(automaticManifestNotifier === undefined
              ? {}
              : { notifier: automaticManifestNotifier }),
            repository: automaticManifestRepository,
            tripId: input.tripId,
          }),
      },
      readFiscalReadiness: {
        execute: (input) =>
          readTripFiscalReadiness({ ...input, repository: tripFiscalReadinessQuery }),
      },
      readValuation: {
        execute: (input) =>
          readTripValuation({
            ...input,
            repository: {
              findApplicableRule: (query) => applicableFreightRuleQuery.findApplicableRule(query),
              readContext: (query) => tripValuationQuery.readContext(query),
            },
          }),
      },
      setMdfeRequirement: {
        execute: (input) =>
          setTripMdfeRequirement({
            ...input,
            readinessRepository: tripFiscalReadinessQuery,
            repository: tripFiscalReadinessQuery,
          }),
      },
      linkTripDocument: { execute: (input) => trips.linkDocument(input) },
      linkTripDocumentsBatch: createLinkTripDocumentsBatchUseCase({
        repository: tripRepository,
        routeFreezer: tripRouteTollFreezer,
      }),
      previewCargo: {
        execute: (input) =>
          previewTripCargo({
            ...input,
            layouts: cargoLayoutLookup,
            requestCargoLayout,
            repository: {
              readCargoPreviewContext: (query) => readCargoPreviewContext(database, query),
            },
          }),
      },
      previewValuation: {
        execute: (input) =>
          previewTripValuation({
            ...input,
            /** Spec 097: a prévia parte do mesmo barracão que o mapa da montagem desenha. */
            depot: {
              readDepot: () => routeDepotQuery.readDepot({ companyId: input.companyId }),
              readDescription: () =>
                routeDepotQuery.readDescription({ companyId: input.companyId }),
            },
            /**
             * A mesma porta e o mesmo caso de uso da geometria da viagem — spec 090 D3. Sem
             * `ROUTING_MATRIX_URL` ela devolve `unavailable`, e a distância continua `null`.
             */
            geometry:
              routingMatrixUrl === undefined
                ? { readRouteGeometry: async () => null }
                : createOsrmRouteGeometryGateway({ baseUrl: routingMatrixUrl }),
            repository: {
              findApplicableRule: (query) => applicableFreightRuleQuery.findApplicableRule(query),
              readContext: (query) => tripValuationQuery.readContext(query),
              readPreviewContext: (query) => tripValuationQuery.readPreviewContext(query),
              readPreviewStopCoordinates: (query) =>
                tripValuationQuery.readPreviewStopCoordinates(query),
            },
            /** Spec 090 T9: o mesmo catálogo de praças que o `/route-geometry` da montagem usa. */
            tollBooths: createCompanyScopedTollBoothGateway({
              catalog: tollBoothRepository,
              charges: tollBoothChargeRepository,
              companyId: input.companyId,
            }),
          }),
      },
      listStops: { execute: (input) => tripLifecycle.listStops.execute(input) },
      readTripActionSnapshot: {
        execute: (input) =>
          readTripActionSnapshot({
            companyId: input.context.companyId,
            repository: {
              readTripActionSnapshot: (query) => readTripActionSnapshotQuery(database, query),
            },
            tripId: input.tripId,
          }),
      },
      listTrips: { execute: (input) => trips.list(input) },
      loadTripDocument: { execute: (input) => tripLifecycle.load.execute(input) },
      planTripRoute: { execute: (input) => tripLifecycle.planRoute.execute(input) },
      listDeliveryAddressHistory: {
        execute: (input) => tripLifecycle.listDeliveryAddressHistory.execute(input),
      },
      overrideDeliveryAddress: {
        execute: (input) => tripLifecycle.overrideDeliveryAddress.execute(input),
      },
      listReturnedWithActiveCte: {
        execute: (input) =>
          listReturnedWithActiveCte({
            companyId: input.context.companyId,
            repository: tripDocumentRepository,
          }),
      },
      releaseTripDocument: { execute: (input) => trips.releaseDocument(input) },
      reorderStops: { execute: (input) => tripLifecycle.reorderStops.execute(input) },
      separateTripDocument: { execute: (input) => tripLifecycle.separate.execute(input) },
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
    ...createNfseEmissionProfileRoutes({
      activateProfile: { execute: (input) => nfseEmissionProfiles.activate(input) },
      createProfile: { execute: (input) => nfseEmissionProfiles.create(input) },
      deactivateProfile: { execute: (input) => nfseEmissionProfiles.deactivate(input) },
      listProfileOptions: { execute: (input) => nfseEmissionProfiles.listOptions(input) },
      listProfiles: { execute: (input) => nfseEmissionProfiles.list(input) },
      updateProfile: { execute: (input) => nfseEmissionProfiles.update(input) },
    }),
    ...createWhatsAppChannelRoutes({
      readChannel: { execute: (input) => whatsappChannel.read(input) },
      removeChannel: { execute: (input) => whatsappChannel.remove(input) },
      saveChannel: { execute: (input) => whatsappChannel.save(input) },
    }),
    ...createNfseProviderCredentialRoutes({
      readCredential: { execute: (input) => nfseProviderCredentials.read(input) },
      saveCredential: { execute: (input) => nfseProviderCredentials.save(input) },
    }),
    ...createNfseInvoiceRoutes({
      cancelNfseInvoice: { execute: (input) => cancelNfseInvoice.execute(input) },
      discardNfseInvoice: { execute: (input) => discardNfseInvoice.execute(input) },
      exportNfseDocuments: {
        exportDocuments: (input) => exportNfseDocuments.exportDocuments(input),
      },
      nfseInvoice: {
        create: (input) => nfseInvoices.create(input),
        preview: (input) => nfseInvoices.preview(input),
      },
      nfseInvoiceQuery: {
        detail: (input) => nfseInvoiceQuery.detail(input),
        documents: (input) => nfseInvoiceQuery.documents(input),
        download: (input) => nfseInvoiceQuery.download(input),
        list: (input) => nfseInvoiceQuery.list(input),
      },
      reissueNfseInvoice: { execute: (input) => reissueNfseInvoice.execute(input) },
    }),
    ...createOperationsRoutes({
      audit: { listEvents: (input) => operations.listAuditEvents(input) },
      /**
       * Spec 072: sem `messaging` a API não publica, e o botão precisa recusar em vez de fingir —
       * então ele responde `409` como se houvesse execução aberta seria mentira. Aqui a ausência
       * vira erro explícito no disparo, que é o único momento em que ela importa.
       */
      runJob: createRunJobUseCase({
        executions: createDrizzleManualExecutionRepository(database),
        publisher: buildJobRunPublisher(messaging),
      }),
      jobSchedules: createJobScheduleControlUseCase({
        repository: createDrizzleJobScheduleControlRepository(database),
      }),
      operations: {
        getSummary: (input) => operations.getSummary(input),
        listJobs: (input) => operations.listJobs(input),
        listTimeline: (input) => operations.listTimeline(input),
      },
    }),
    ...createNfeImportRoutes({
      getDistributionStatus,
      getImport,
      getLastJobRun,
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
      listDocumentEvents: { execute: (input) => listNfeDocumentEvents.execute(input) },
      listDocuments: { execute: (input) => nfeDocumentRepository.list(input) },
      locateTripByAccessKey: { execute: (input) => tripLifecycle.locateByAccessKey.execute(input) },
    }),
    ...createPackageBoxRoutes({
      cameraMeasurementSettings: cameraMeasurementSettingsRepository,
      exportPendingPackageBoxes: createExportPendingPackageBoxes({
        listPackageBoxes: createListPackageBoxes({ repository: packageBoxRepository }),
      }),
      listPackageBoxes: createListPackageBoxes({ repository: packageBoxRepository }),
      listPackageBoxSiblings: createListPackageBoxSiblings({ repository: packageBoxRepository }),
      measurePackageBox: createMeasurePackageBox({
        cameraMeasurementSettings: cameraMeasurementSettingsRepository,
        repository: packageBoxRepository,
      }),
      replicatePackageBoxMeasurement: createReplicatePackageBoxMeasurement({
        repository: packageBoxRepository,
      }),
    }),
    ...createPackageBoxMeasurementExportRoutes({
      listPackageBoxMeasurements: createListPackageBoxMeasurements({
        repository: packageBoxMeasurementExportRepository,
      }),
    }),
    ...createViewPreferencesRoutes({
      getPreferences: createGetViewPreferencesUseCase({ repository: viewPreferencesRepository }),
      savePreferences: createSaveViewPreferencesUseCase({ repository: viewPreferencesRepository }),
    }),
    ...createCompanyGroupRoutes({
      groups: createManageCompanyGroupsUseCase({
        audit: groupAudit,
        realm: identityGroupGateway,
        repository: companyGroupRepository,
      }),
      permissions: createManageDirectPermissionsUseCase({
        audit: groupAudit,
        repository: companyGroupRepository,
      }),
    }),
    ...createNotificationTemplateTestRoutes({
      sendTemplateTest: createSendTemplateTestUseCase({
        module: notifications,
        newDedupeKey: () => `template-test-${crypto.randomUUID()}`,
      }),
    }),
    ...createUserPictureRoutes({
      userPicture: createUserPictureUseCase({
        identityGateway: identityAccessGateway,
        ...(apiPublicUrl === undefined ? {} : { publicBaseUrl: apiPublicUrl }),
        repository: new DrizzleUserPictureRepository(database),
      }),
    }),
    ...createUserAdministrationRoutes({
      activate: createActivateCompanyUserUseCase({
        audit: groupAudit,
        identityGateway: identityAccessGateway,
        invitations: invitationRepository,
        now: () => new Date(),
        repository: companyUserRepository,
      }),
      changeStatus: changeCompanyUserStatus,
      invite: inviteCompanyUser,
      list: listCompanyUsers,
      backfillDocuments: backfillIdentityDocuments,
      reconcile: reconcileCompanyUsers,
      assignRoles: assignCompanyUserRoles,
      rolePermissions: createListRolePermissionsUseCase(),
      reveal: revealCompanyUsers,
      adoptRealmFields: createAdoptRealmFieldsUseCase({
        audit: groupAudit,
        gateway: identityAccessGateway,
        repository: companyUserRepository,
      }),
      identifiers: createManageCompanyUserIdentifiersUseCase({
        repository: companyUserRepository,
      }),
      fillProfiles: createFillProfilesFromRealmUseCase({
        audit: groupAudit,
        gateway: identityAccessGateway,
        issuer: keycloak.issuer,
        repository: companyUserRepository,
      }),
      synchronize: createSynchronizeIdentitiesUseCase({
        audit: groupAudit,
        gateway: identityAccessGateway,
        issuer: keycloak.issuer,
        repository: companyUserRepository,
      }),
      removeMembership: removeCompanyUserMembership,
      replaceRoles: replaceCompanyUserRoles,
      resendCode: resendCompanyUserCode,
      setPassword: createSetCompanyUserPasswordUseCase({
        audit: groupAudit,
        gateway: identityAccessGateway,
        repository: companyUserRepository,
      }),
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

/**
 * Spec 072: sem `messaging` a API não publica, e o botão precisa **recusar em vez de fingir** —
 * responder como se tivesse enfileirado deixaria o operador esperando um ciclo que ninguém pediu.
 * A ausência vira erro no disparo, que é o único momento em que ela importa.
 */
function buildJobRunPublisher(
  messaging: { readonly queuePrefix: string; readonly url: string } | undefined,
): JobRunPublisher {
  if (messaging === undefined) {
    return {
      publish: () => Promise.reject(new Error('job run publisher is not configured')),
    }
  }

  return createLazyRabbitMqJobRunPublisher({
    connect: () =>
      createRabbitMqProvider({
        connection: messaging.url,
        topology: buildJobRunRabbitMqTopology({ queuePrefix: messaging.queuePrefix }),
      }),
  })
}
