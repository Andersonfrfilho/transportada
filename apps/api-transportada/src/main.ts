/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
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
import { createAggregateApplicationsUseCase } from './fleet/application/aggregate-applications.use-case.js'
import { createAggregateAccountUseCase } from './fleet/application/aggregate-account.use-case.js'
import { createDisableScheduledDistributionUseCase } from './companies/application/disable-scheduled-distribution.use-case.js'
import { createEnableScheduledDistributionUseCase } from './companies/application/enable-scheduled-distribution.use-case.js'
import { createGetScheduledDistributionStatusUseCase } from './companies/application/get-scheduled-distribution-status.use-case.js'
import {
  createClearDefaultVolumeWeightUseCase,
  createGetCargoSettingsUseCase,
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
import { DrizzleFuelPriceRepository } from './companies/infrastructure/drizzle-fuel-price.repository.js'
import { createFuelPriceRoutes } from './companies/presentation/fuel-price.routes.js'
import { createChooseEnergyDistributorUseCase } from './companies/application/choose-energy-distributor.use-case.js'
import { createClearEnergyDistributorUseCase } from './companies/application/clear-energy-distributor.use-case.js'
import { createGetCompanyEnergyUseCase } from './companies/application/get-company-energy.use-case.js'
import { DrizzleCompanyEnergyRepository } from './companies/infrastructure/drizzle-company-energy.repository.js'
import { createCompanyEnergyRoutes } from './companies/presentation/company-energy.routes.js'
import { createAdjustDistributionCursorUseCase } from './companies/application/adjust-distribution-cursor.use-case.js'
import { createGetDistributionCursorUseCase } from './companies/application/get-distribution-cursor.use-case.js'
import { DrizzleDistributionCursorRepository } from './companies/infrastructure/drizzle-distribution-cursor.repository.js'
import { createDistributionCursorRoutes } from './companies/presentation/distribution-cursor.routes.js'
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
import { createNfseCallbackRoutes } from './nfse-callbacks/presentation/nfse-callbacks.routes.js'
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
import { createOsrmRouteGeometryGateway } from './trips/infrastructure/osrm-route-geometry.gateway.js'
import { listTripStopCoordinates } from './trips/infrastructure/trip-stop-coordinates.support.js'
import { createDeliveryProofDownloadGateway } from './trips/infrastructure/delivery-proof-download.gateway.js'
import { readTripDocumentProducts } from './trips/application/read-trip-document-products.use-case.js'
import { registerDriverOccurrence } from './trips/application/register-driver-occurrence.use-case.js'
import { registerTripOccurrence } from './trips/application/register-trip-occurrence.use-case.js'
import { createOccurrenceNotifier } from './trips/infrastructure/occurrence-notifier.gateway.js'
import { createStopOccurrenceNotifier } from './trips/infrastructure/stop-occurrence-notifier.gateway.js'
import {
  findDriverReachableDocument,
  listDeliveryProofs,
  listDocumentProducts,
  findOccurrenceType,
  listOccurrenceTypes,
  listTripOccurrences,
  readOccurrenceLabels,
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
import { createFleetDriversUseCase } from './fleet/application/fleet-drivers.use-case'
import type { FleetVehicleCatalogPort } from './fleet/application/fleet-vehicle-catalog.port'
import { createFleetVehiclesUseCase } from './fleet/application/fleet-vehicles.use-case'
import { createCachedVehicleCatalogGateway } from './fleet/infrastructure/cached-vehicle-catalog.gateway'
import { CompanyFuelPriceGateway } from './fleet/infrastructure/company-fuel-price.gateway'
import { createFipeVehicleCatalogGateway } from './fleet/infrastructure/fipe-vehicle-catalog.gateway'
import { DrizzleFleetDriverVehicleRepository } from './fleet/infrastructure/drizzle-fleet-driver-vehicle.repository'
import { DrizzleFleetDriverRepository } from './fleet/infrastructure/drizzle-fleet-driver.repository'
import { DrizzleFleetVehicleRepository } from './fleet/infrastructure/drizzle-fleet-vehicle.repository'
import { createFleetCatalogRoutes } from './fleet/presentation/fleet-catalog.routes'
import { createIdentityContactDirectoryGateway } from './fleet/infrastructure/identity-contact-directory.gateway'
import { createFleetRoutes } from './fleet/presentation/fleet.routes'
import { createLookupPostalCodeUseCase } from './addresses/application/lookup-postal-code.use-case.js'
import { DrizzlePostalCodeRepository } from './addresses/infrastructure/drizzle-postal-code.repository.js'
import { createPostalCodeGateway } from './addresses/infrastructure/postal-code.gateway.js'
import { createPostalCodeRoutes } from './addresses/presentation/postal-code.routes.js'
import { createTripMdfeManifestUseCase } from './mdfe-manifests/application/create-trip-mdfe-manifest.use-case'
import { createMdfeIssuanceUseCase } from './mdfe-manifests/application/mdfe-issuance.use-case'
import { createMdfeManifestsUseCase } from './mdfe-manifests/application/mdfe-manifests.use-case'
import { createPreviewMdfeManifestUseCase } from './mdfe-manifests/application/preview-mdfe-manifest.use-case'
import { DrizzleMdfeIssuanceRepository } from './mdfe-manifests/infrastructure/drizzle-mdfe-issuance.repository'
import { DrizzleMdfeManifestRepository } from './mdfe-manifests/infrastructure/drizzle-mdfe-manifest.repository'
import { createMdfeIssuanceRoutes } from './mdfe-manifests/presentation/mdfe-issuance.routes'
import { createMdfeManifestRoutes } from './mdfe-manifests/presentation/mdfe-manifests.routes'
import { createTripUseCase } from './trips/application/trip.use-case'
import { createTripLifecycleUseCase } from './trips/application/trip-lifecycle.use-case'
import { listReturnedWithActiveCte } from './trips/application/list-returned-with-active-cte.use-case'
import { DrizzleTripRepository } from './trips/infrastructure/drizzle-trip.repository'
import { DrizzleTripDocumentRepository } from './trips/infrastructure/drizzle-trip-document.repository'
import { DrizzleTripDocumentBatchRepository } from './trips/infrastructure/drizzle-trip-document-batch.repository'
import { DrizzleTripRouteRepository } from './trips/infrastructure/drizzle-trip-route.repository'
import { DrizzleTripStopLookupRepository } from './trips/infrastructure/drizzle-trip-stop-lookup.repository'
import { readTripFiscalReadiness } from './trips/application/read-trip-fiscal-readiness.use-case'
import { readTripValuation } from './trips/application/read-trip-valuation.use-case'
import { setTripMdfeRequirement } from './trips/application/set-trip-mdfe-requirement.use-case'
import { DrizzleTripValuationQuery } from './trips/infrastructure/trip-valuation.query'
import { DrizzleTripFinancialResultRepository } from './trips/infrastructure/drizzle-trip-financial-result.repository.js'
import { DrizzleFinancialSummaryQuery } from './trips/infrastructure/financial-summary.query.js'
import { buildFinancialSummary } from './trips/domain/financial-summary.policy.js'
import { createFinancialSummaryRoutes } from './trips/presentation/financial-summary.routes.js'
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
import { findCurrentDriverTrip } from './trips/application/find-current-driver-trip.use-case'
import { reportStopArrival } from './trips/application/report-stop-arrival.use-case'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from './trips/application/report-document-delivery.use-case'
import { reportStopOccurrence } from './trips/application/report-stop-occurrence.use-case'
import { attachDeliveryProof } from './trips/application/attach-delivery-proof.use-case'
import { createDeliveryProofDocumentSecretService } from './trips/application/delivery-proof-document-secret.service'
import { dispatchDriverTrip } from './trips/application/dispatch-driver-trip.use-case'
import { dispatchTrip } from './trips/application/dispatch-trip.use-case'
import { createDeliveryProofStorage } from './trips/infrastructure/delivery-proof-storage.gateway'
import { DrizzleDeliveryProofRepository } from './trips/infrastructure/drizzle-delivery-proof.repository'
import { DrizzleDeliveryProofSettingsRepository } from './trips/infrastructure/drizzle-delivery-proof-settings.repository'
import { createDeliveryProofSettingsRoutes } from './trips/presentation/delivery-proof-settings.routes'
import { DrizzleCurrentDriverTripRepository } from './trips/infrastructure/drizzle-current-driver-trip.repository'
import { DrizzleDriverFieldReportUnitOfWork } from './trips/infrastructure/drizzle-driver-field-report.repository'
import { createRouteSuggestionRoutes } from './routing/presentation/route-suggestion.routes'
import { createMultiVehicleSuggestionRoutes } from './routing/presentation/multi-vehicle-suggestion.routes'
import { createMultiVehicleSuggestionUseCase } from './routing/application/multi-vehicle-suggestion.use-case'
import { createDrizzleMultiVehicleSuggestionRepository } from './routing/infrastructure/drizzle-multi-vehicle-suggestion.repository'
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
import { buildJobRunRabbitMqTopology } from './operations/infrastructure/job-run-rabbitmq-topology.js'
import { createLazyRabbitMqJobRunPublisher } from './operations/infrastructure/rabbitmq-job-run.publisher.js'
import { createGeocodedAddressCorrectionUseCase } from './routing/application/geocoded-address-correction.use-case'
import { createDrizzleRouteSuggestionRepository } from './routing/infrastructure/drizzle-route-suggestion.repository'
import { createDrizzleGeocodedAddressRepository } from './routing/infrastructure/drizzle-geocoded-address.repository'
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
import { createNfeDocumentRoutes } from './nfe-documents/presentation/nfe-documents.routes'
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
    anonymousRoutes: createAnonymousRoutes({ config, database: database.db, logger, userModule }),
    authentication,
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: new DrizzleCompanyFiscalEnvironmentRepository(database.db),
    healthService,
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
    routes: createApplicationRoutes({
      apiPublicUrl: config.apiPublicUrl,
      automaticManifestNotifier,
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
    emailNotificationsEnabled: config.emailDelivery !== undefined,
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
  const cargoSettingsRepository = new DrizzleCargoSettingsRepository(database)
  const cargoVolumeFactorRepository = new DrizzleCargoVolumeFactorRepository(database)
  const fuelPriceRepository = new DrizzleFuelPriceRepository(database)
  const companyEnergyRepository = new DrizzleCompanyEnergyRepository(database)
  const companyLogoRepository = new DrizzleCompanyLogoRepository(database)
  const companyContactsRepository = new DrizzleCompanyContactsRepository(database)
  const companyContacts = createCompanyContactsUseCase({ contacts: companyContactsRepository })
  const landingSettings = createLandingSettingsUseCase({
    companyContactsRepository,
    companyGroupRepository: createDrizzleCompanyGroupRepository(database),
    landingCompanyId: undefined,
    landingSettingsRepository: createDrizzleLandingSettingsRepository(database),
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
  const freightRegionRepository = new DrizzleFreightRegionRepository(database)
  const fleetDriverRegionRepository = new DrizzleFleetDriverRegionRepository(database)
  const fleetDriverVehicleRepository = new DrizzleFleetDriverVehicleRepository({
    database,
    fuelPrices: fleetFuelPriceGateway,
  })
  const mdfeManifestRepository = new DrizzleMdfeManifestRepository(database)
  const mdfeIssuanceRepository = new DrizzleMdfeIssuanceRepository(database)
  const tripRepository = new DrizzleTripRepository(database)
  const tripDocumentRepository = new DrizzleTripDocumentRepository(database)
  const tripDocumentBatchRepository = new DrizzleTripDocumentBatchRepository(database)
  const tripRouteRepository = new DrizzleTripRouteRepository(database)
  const tripStopLookupRepository = new DrizzleTripStopLookupRepository(database)
  const deliveryAddressOverrideRepository = new DrizzleDeliveryAddressOverrideRepository(database)
  const currentDriverTripRepository = new DrizzleCurrentDriverTripRepository(database)
  const tripFiscalReadinessQuery = new DrizzleTripFiscalReadinessQuery(database)
  const tripValuationQuery = new DrizzleTripValuationQuery(database)
  const tripFinancialResultRepository = new DrizzleTripFinancialResultRepository(database)
  const financialSummaryQuery = new DrizzleFinancialSummaryQuery(database)
  const tripCostRepository = new DrizzleTripCostRepository(database)
  const applicableFreightRuleQuery = new DrizzleApplicableFreightRuleQuery(database)
  const automaticManifestRepository = new DrizzleAutomaticManifestRepository({
    database,
    readiness: tripFiscalReadinessQuery,
  })
  const driverFieldReports = new DrizzleDriverFieldReportUnitOfWork(database)
  const deliveryProofRepository = new DrizzleDeliveryProofRepository(database)
  const deliveryProofSettingsRepository = new DrizzleDeliveryProofSettingsRepository(database)
  const tripLifecycle = createTripLifecycleUseCase({
    batchRepository: tripDocumentBatchRepository,
    deliveryAddressOverrideRepository,
    documentRepository: tripDocumentRepository,
    locationRepository: tripStopLookupRepository,
    routeRepository: tripRouteRepository,
    stopRepository: tripStopLookupRepository,
    suggestCharges: suggestDeliveryCharges,
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
  const storedObjectRepository = new DrizzleStoredObjectRepository(database)
  const nfeDocumentRepository = new DrizzleNfeDocumentRepository(database, storageGateway)
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
  const mdfeManifests = createMdfeManifestsUseCase({ repository: mdfeManifestRepository })
  const previewMdfeManifest = createPreviewMdfeManifestUseCase({
    repository: mdfeManifestRepository,
  })
  const mdfeIssuance = createMdfeIssuanceUseCase({
    now: () => new Date(),
    repository: mdfeIssuanceRepository,
  })
  const trips = createTripUseCase({ locations: tripLocationRepository, repository: tripRepository })
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
  const fleetDrivers = createFleetDriversUseCase({
    account: inviteCompanyUser,
    contacts: createIdentityContactDirectoryGateway({ identity: identityAccessGateway }),
    repository: fleetDriverRepository,
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
    ...createCompanyLogoRoutes({
      companyLogo: createCompanyLogoUseCase({ repository: companyLogoRepository }),
    }),
    ...(routeOptimizationQueue === undefined
      ? []
      : createRouteSuggestionRoutes({
          geocodedAddressCorrection: createGeocodedAddressCorrectionUseCase({
            repository: createDrizzleGeocodedAddressRepository(database),
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
      listDrivers: { execute: (input) => fleetDrivers.list(input) },
      listVehicles: { execute: (input) => fleetVehicles.list(input) },
      updateDriver: { execute: (input) => fleetDrivers.update(input) },
      updateVehicle: { execute: (input) => fleetVehicles.update(input) },
      vehicleCatalog: { isAvailable: () => vehicleCatalog !== null },
    }),
    ...createFleetCatalogRoutes({ vehicleCatalog: fleetVehicleCatalog }),
    ...createPostalCodeRoutes({ lookup: lookupPostalCode }),
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
    ...createDeliveryProofSettingsRoutes({
      listOverrides: (input) => deliveryProofSettingsRepository.listOverrides(input),
      readSettings: (input) => deliveryProofSettingsRepository.readSettings(input),
      replaceOverrides: (input) => deliveryProofSettingsRepository.replaceOverrides(input),
      saveSettings: (input) => deliveryProofSettingsRepository.saveSettings(input),
    }),
    ...createMeTripRoutes({
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
              companyId: input.companyId,
              repository: tripRouteRepository,
              tripId: request.tripId,
            }),
          linkage: currentDriverTripRepository,
        }),
      findCurrentTrip: (input) =>
        findCurrentDriverTrip({ ...input, repository: currentDriverTripRepository }),
      readManifestXml: (input) => readMdfeDocument.readXmlDownload(input),
      renderManifestDamdfe: (input) => readMdfeDocument.renderDamdfe(input),
      reportArrival: (input) =>
        reportStopArrival({ ...input, now: new Date(), unitOfWork: driverFieldReports }),
      reportDelivery: (input) =>
        reportDocumentDelivery({ ...input, now: new Date(), unitOfWork: driverFieldReports }),
      reportOccurrence: (input) =>
        reportStopOccurrence({
          ...input,
          attachmentObjectId: null,
          /**
           * Spec 082 D8: o aviso do motivo tipado sai pelo trilho `notification.v1` que já
           * existe — o `sendNotification` do módulo enfileira no RabbitMQ e o worker consome e
           * renderiza. Nenhuma fila nova; motivo sem template grava e segue.
           */
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
          unitOfWork: driverFieldReports,
        }),
      reportReturn: (input) =>
        reportDocumentReturn({ ...input, now: new Date(), unitOfWork: driverFieldReports }),
      resolveDriverId: (input) => currentDriverTripRepository.findDriverIdByMembership(input),
    }),
    ...createTripRoutes({
      batchStatus: { execute: (input) => tripLifecycle.batchStatus.execute(input) },
      cancelTrip: { execute: (input) => tripLifecycle.cancel.execute(input) },
      closeTrip: { execute: (input) => trips.close(input) },
      createTrip: { execute: (input) => trips.create(input) },
      createTripMdfeManifest: { execute: (input) => createTripMdfeManifest.execute(input) },
      deliverTripDocument: { execute: (input) => tripLifecycle.deliver.execute(input) },
      listOccurrenceTypes: {
        execute: (input) => listOccurrenceTypes(database, { companyId: input.context.companyId }),
      },
      saveOccurrenceType: {
        execute: (input) =>
          saveOccurrenceType(database, {
            active: input.active,
            companyId: input.context.companyId,
            emailBody: input.emailBody,
            emailSubject: input.emailSubject,
            name: input.name,
            notifies: input.notifies,
            occurrenceTypeId: input.occurrenceTypeId,
            stage: input.stage,
          }),
      },
      listTripOccurrences: {
        execute: (input) =>
          listTripOccurrences(database, {
            companyId: input.context.companyId,
            documentId: input.documentId,
            tripId: input.tripId,
          }),
      },
      registerTripOccurrence: {
        execute: async (input) =>
          registerTripOccurrence({
            actorUserId: input.context.userId,
            companyId: input.context.companyId,
            documentId: input.documentId,
            note: input.note,
            /**
             * Spec 079: o aviso sai **se** a empresa ligou aquele tipo. A leitura da configuração
             * acontece por registro — é uma consulta pequena, por empresa, e cacheá-la faria a
             * escolha recém-salva demorar a valer sem ninguém entender por quê.
             */
            notificationParameters: {
              ...(await readOccurrenceLabels(database, {
                companyId: input.context.companyId,
                documentId: input.documentId,
                tripId: input.tripId,
              })),
              /** O nome do tipo é preenchido pelo caso de uso, que é quem lê o cadastro. */
              occurrenceType: '',
              tripId: input.tripId,
            },
            notifier: createOccurrenceNotifier({
              logger,
              queryable: database,
              send: (params) =>
                notifications.useCases.sendNotification.execute({
                  ...params,
                  locale: NOTIFICATION_DEFAULT_LOCALE,
                } as never),
            }),
            occurrenceTypeId: input.occurrenceTypeId,
            /** A data que o modelo imprime é a de agora: a ocorrência é registrada quando acontece. */
            occurredOn: new Date().toLocaleDateString('pt-BR'),
            productCode: input.productCode,
            repository: {
              findOccurrenceType: (query) => findOccurrenceType(database, query),
              listDocumentProducts: (query) => listDocumentProducts(database, query),
              listOccurrences: (query) => listTripOccurrences(database, query),
              readTemplateValues: (query) => readOccurrenceTemplateValues(database, query),
              saveOccurrence: (query) => saveTripOccurrence(database, query),
            },
            tripId: input.tripId,
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
      readTripRouteGeometry: {
        execute: async (input) =>
          readRouteGeometry({
            geometry:
              routingMatrixUrl === undefined
                ? { readRouteGeometry: async () => null }
                : createOsrmRouteGeometryGateway({ baseUrl: routingMatrixUrl }),
            stops: await listTripStopCoordinates(database, {
              companyId: input.context.companyId,
              tripId: input.tripId,
            }),
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
      listStops: { execute: (input) => tripLifecycle.listStops.execute(input) },
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
      returnTripDocument: { execute: (input) => tripLifecycle.return.execute(input) },
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
      listDocuments: { execute: (input) => nfeDocumentRepository.list(input) },
      locateTripByAccessKey: { execute: (input) => tripLifecycle.locateByAccessKey.execute(input) },
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
