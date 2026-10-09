import { join } from 'node:path'

import { describe, expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { assertContractorMailBodyHtml } from './contractor-mail-body-html.assertion.js'
import { assertBusinessCalendar } from './business-calendar.assertion.js'
import { assertCanhotoReadQueue } from './canhoto-read-queue.assertion.js'
import { assertCteProfileOutputConstraints } from './cte-profile-output-constraints.assertion.js'
import { assertDeliveryProofCargoSumsAndGuardsRollback } from './delivery-proof-cargo.assertion.js'
import { assertDeliveryProofContractorOverridesBackfill } from './delivery-proof-contractor-overrides.assertion.js'
import { assertDeliveryProofReceivedBy } from './delivery-proof-received-by.assertion.js'
import { assertEventLocationWhatsappRollbackRefusesRecordedPoints } from './event-location-whatsapp-rollback.assertion.js'
import { assertDriverAllowanceRollbackRefusesRecordedMoney } from './driver-allowance-rollback.assertion.js'
import { assertFiscalConstraints } from './fiscal-constraints.assertion.js'
import { assertFleetConstraints } from './fleet-constraints.assertion.js'
import { assertFreightRegionConstraints } from './freight-region-constraints.assertion.js'
import { assertHelperRoleRollbackRefusesHelpers } from './helper-role-rollback.assertion.js'
import { assertHolidayProviderImport } from './holiday-provider-import.assertion.js'
import { assertHolidayProviderSettings } from './holiday-provider-settings.assertion.js'
import { assertIdentityConstraints } from './identity-constraints.assertion.js'
import { assertInvitationConstraints } from './invitation-constraints.assertion.js'
import { assertCargoPreviewFailureCodes } from './cargo-preview-failure-codes.assertion.js'
import { assertCargoPreviewSecurityFailureCodes } from './cargo-preview-security-failure-codes.assertion.js'
import { assertCargoPreviewEmailIntake } from './cargo-preview-email-intake.assertion.js'
import { assertArrivalReferenceLabel } from './contractor-receiving-arrival-reference-label.assertion.js'
import { assertLocationRetentionRollbackRefusesRecordedSettings } from './location-retention-rollback.assertion.js'
import { assertMdfeConstraints } from './mdfe-constraints.assertion.js'
import { assertConversationProtocol } from './conversation-protocol.assertion.js'
import { assertConversationSubject } from './conversation-subject.assertion.js'
import { assertNfeAddressesParticipantIndex } from './nfe-addresses-participant-index.assertion.js'
import { assertNfeDocumentListingOrderIndex } from './nfe-document-listing-order-index.assertion.js'
import { assertNfeDocumentProtocolPresence } from './nfe-document-protocol-presence.assertion.js'
import { assertNfeEventHistory } from './nfe-event-history.assertion.js'
import { assertNfeRecipientEmailRollback } from './nfe-recipient-email.assertion.js'
import { assertOccurrenceDeclaredAmountRollback } from './occurrence-declared-amount.assertion.js'
import { assertOccurrenceTypeIconRollback } from './occurrence-type-icon.assertion.js'
import { assertOccurrenceStopFlowBackfill } from './occurrence-stop-flow.assertion.js'
import { assertOccurrenceStopKindBackfill } from './occurrence-stop-kind.assertion.js'
import { assertOccurrenceTypeItemsModeBackfill } from './occurrence-type-items-mode.assertion.js'
import { assertOccurrenceTypeRequirementModesRollback } from './occurrence-type-requirement-modes.assertion.js'
import { assertOccurrenceTypeQuantityMinimumsRollback } from './occurrence-type-quantity-minimums.assertion.js'
import { assertOccurrenceTypeMomentsRollback } from './occurrence-type-moments.assertion.js'
import { assertRntrcRollbackRefusesNinePositions } from './rntrc-rollback.assertion.js'
import { assertStopDepartureRollback } from './stop-departure-rollback.assertion.js'
import { assertTollBoothExtractConstraints } from './toll-booth-extract-constraints.assertion.js'
import { assertTripConstraints } from './trip-constraints.assertion.js'
import { assertNfseNationalTaxation } from './nfse-national-taxation.assertion.js'
import { assertTripCrewEvents } from './trip-crew-events.assertion.js'
import { assertTripStatusEventRollbackRefusesRecordedHistory } from './trip-status-event-rollback.assertion.js'
import {
  FISCAL_TABLES,
  FLEET_TABLES,
  FREIGHT_TABLES,
  IDENTITY_TABLES,
  INVITATION_DELIVERY_TABLES,
  PASSWORD_RESET_TABLES,
  INVITATION_TABLES,
  NFE_TABLES,
  CTE_BATCH_TABLES,
  CTE_ISSUANCE_TABLES,
  CTE_PROFILE_TABLES,
  BILLING_TABLES,
  OPERATIONS_TABLES,
  MDFE_TABLES,
  NFSE_TABLES,
  DELIVERY_CLIENT_TABLES,
  HOLIDAY_PROVIDER_TABLES,
  HOLIDAY_PROVIDER_SETTINGS_TABLES,
  CONTRACTOR_PORTAL_TABLES,
  MULTI_VEHICLE_SUGGESTION_TABLES,
  WHATSAPP_CHANNEL_TABLES,
  WHATSAPP_PHONE_TABLES,
  WHATSAPP_FLOW_GRAPH_TABLES,
  WHATSAPP_COMMAND_TABLES,
  TRIP_FINANCIAL_TABLES,
  TRIP_TABLES,
  listMigrationDirectories,
  migrationsDirectory,
  readBusinessTables,
  readMigrationNames,
  testWithPostgres,
  withDisposableDatabase,
} from './support.js'

describe('Drizzle migration integration', () => {
  testWithPostgres(
    'applies, constrains, rolls back, and reapplies the fiscal migration',
    async () => {
      await withDisposableDatabase(async (database, connectionString) => {
        const migrationDirectories = await listMigrationDirectories()
        const postIdentityDirectories = migrationDirectories.slice(2)
        const identityDirectory = migrationDirectories[1]
        if (postIdentityDirectories.length === 0 || identityDirectory === undefined) {
          throw new Error('Identity and fiscal migrations are required')
        }

        await runDatabaseMigrations({ connectionString })
        expect(await readBusinessTables(database)).toEqual(
          [
            ...IDENTITY_TABLES,
            ...INVITATION_TABLES,
            ...INVITATION_DELIVERY_TABLES,
            ...PASSWORD_RESET_TABLES,
            ...FISCAL_TABLES,
            ...FREIGHT_TABLES,
            ...NFE_TABLES,
            ...CTE_BATCH_TABLES,
            ...CTE_ISSUANCE_TABLES,
            ...CTE_PROFILE_TABLES,
            ...BILLING_TABLES,
            ...OPERATIONS_TABLES,
            ...FLEET_TABLES,
            ...MDFE_TABLES,
            ...NFSE_TABLES,
            ...TRIP_TABLES,
            ...DELIVERY_CLIENT_TABLES,
            ...HOLIDAY_PROVIDER_TABLES,
            ...HOLIDAY_PROVIDER_SETTINGS_TABLES,
            ...TRIP_FINANCIAL_TABLES,
            ...CONTRACTOR_PORTAL_TABLES,
            ...MULTI_VEHICLE_SUGGESTION_TABLES,
            ...WHATSAPP_CHANNEL_TABLES,
            ...WHATSAPP_PHONE_TABLES,
            ...WHATSAPP_FLOW_GRAPH_TABLES,
            ...WHATSAPP_COMMAND_TABLES,
          ].toSorted(),
        )
        expect(await readMigrationNames(database)).toEqual(migrationDirectories)

        const identityFixture = await assertIdentityConstraints(database)
        await assertInvitationConstraints(database, identityFixture)
        await assertFiscalConstraints(database, identityFixture)
        const fleetFixture = await assertFleetConstraints(database, identityFixture)
        await assertFreightRegionConstraints(database, identityFixture, fleetFixture)
        await assertMdfeConstraints(database, identityFixture, fleetFixture)
        await assertTripConstraints(database, identityFixture, fleetFixture)

        const rollbackProbeTripId = crypto.randomUUID()
        await database`
          insert into trips (id, company_id, vehicle_id)
          values (${rollbackProbeTripId}, ${identityFixture.companyId}, ${fleetFixture.vehicleId})
        `
        await assertTripStatusEventRollbackRefusesRecordedHistory({
          companyId: identityFixture.companyId,
          database,
          directories: migrationDirectories,
          tripId: rollbackProbeTripId,
          userId: identityFixture.userId,
        })

        await assertEventLocationWhatsappRollbackRefusesRecordedPoints({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          tripId: rollbackProbeTripId,
          userId: identityFixture.userId,
        })

        await assertDeliveryProofCargoSumsAndGuardsRollback({
          companyId: identityFixture.companyId,
          database,
          directories: migrationDirectories,
          tripId: rollbackProbeTripId,
          userId: identityFixture.userId,
        })

        await assertDeliveryProofReceivedBy({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          driverId: fleetFixture.driverId,
          tripId: rollbackProbeTripId,
          userId: identityFixture.userId,
        })

        await assertDeliveryProofContractorOverridesBackfill({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
        })

        await assertOccurrenceStopFlowBackfill({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          tripId: rollbackProbeTripId,
          userId: identityFixture.userId,
        })

        await assertOccurrenceStopKindBackfill({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          tripId: rollbackProbeTripId,
          userId: identityFixture.userId,
        })

        await assertNfeRecipientEmailRollback({
          connectionString,
          database,
          directories: migrationDirectories,
        })

        await assertOccurrenceTypeIconRollback({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
        })

        // Ordem inversa do histórico: a 247 sai antes da 246, e a 241 derruba `items_mode` e, com
        // ele, as CHECKs que o leem.
        await assertOccurrenceDeclaredAmountRollback({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
        })

        await assertOccurrenceTypeQuantityMinimumsRollback({
          connectionString,
          database,
          directories: migrationDirectories,
        })

        await assertOccurrenceTypeItemsModeBackfill({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
        })

        await assertOccurrenceTypeRequirementModesRollback({
          connectionString,
          database,
          directories: migrationDirectories,
        })

        await assertOccurrenceTypeMomentsRollback({
          connectionString,
          database,
          directories: migrationDirectories,
        })

        await assertStopDepartureRollback({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          tripId: rollbackProbeTripId,
          userId: identityFixture.userId,
        })

        await assertRntrcRollbackRefusesNinePositions({
          database,
          directories: migrationDirectories,
        })
        await assertCteProfileOutputConstraints({
          connectionString,
          database,
          directories: migrationDirectories,
          fixture: identityFixture,
        })
        await assertNfeDocumentListingOrderIndex({
          connectionString,
          database,
          directories: migrationDirectories,
        })
        await assertCanhotoReadQueue({
          connectionString,
          database,
          directories: migrationDirectories,
        })
        await assertNfeEventHistory({
          connectionString,
          database,
          directories: migrationDirectories,
          fixture: identityFixture,
        })
        await assertNfeDocumentProtocolPresence({
          connectionString,
          database,
          directories: migrationDirectories,
          fixture: identityFixture,
        })
        await assertContractorMailBodyHtml({
          connectionString,
          database,
          directories: migrationDirectories,
          fixture: identityFixture,
        })
        await assertDriverAllowanceRollbackRefusesRecordedMoney({
          database,
          directories: migrationDirectories,
        })
        await assertTollBoothExtractConstraints({
          database,
          directories: migrationDirectories,
        })
        await assertHelperRoleRollbackRefusesHelpers({
          companyId: identityFixture.companyId,
          database,
          directories: migrationDirectories,
          driverId: fleetFixture.driverId,
          membershipId: identityFixture.membershipId,
          userId: identityFixture.userId,
        })
        await assertLocationRetentionRollbackRefusesRecordedSettings({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          userId: identityFixture.userId,
        })
        await assertCargoPreviewFailureCodes({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          userId: identityFixture.userId,
        })
        await assertCargoPreviewSecurityFailureCodes({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          userId: identityFixture.userId,
        })
        await assertArrivalReferenceLabel({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
        })
        await assertCargoPreviewEmailIntake({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          userId: identityFixture.userId,
        })
        await assertTripCrewEvents({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          tripId: rollbackProbeTripId,
          userId: identityFixture.userId,
        })
        await assertBusinessCalendar({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
        })
        await assertNfseNationalTaxation({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          userId: identityFixture.userId,
        })
        await assertHolidayProviderImport({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          userId: identityFixture.userId,
        })
        await assertNfeAddressesParticipantIndex({
          connectionString,
          database,
          directories: migrationDirectories,
        })
        await assertHolidayProviderSettings({
          connectionString,
          database,
          directories: migrationDirectories,
        })
        await assertConversationSubject({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          tripId: rollbackProbeTripId,
          userId: identityFixture.userId,
        })
        await assertConversationProtocol({
          companyId: identityFixture.companyId,
          connectionString,
          database,
          directories: migrationDirectories,
          userId: identityFixture.userId,
        })

        const postIdentityRollbacks = await Promise.all(
          postIdentityDirectories
            .toReversed()
            .map((directory) =>
              Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text(),
            ),
        )
        for (const rollback of postIdentityRollbacks) await database.unsafe(rollback)
        expect(await readBusinessTables(database)).toEqual([...IDENTITY_TABLES].toSorted())
        expect(await readMigrationNames(database)).toEqual(migrationDirectories.slice(0, 2))

        await runDatabaseMigrations({ connectionString })
        expect(await readBusinessTables(database)).toEqual(
          [
            ...IDENTITY_TABLES,
            ...INVITATION_TABLES,
            ...INVITATION_DELIVERY_TABLES,
            ...PASSWORD_RESET_TABLES,
            ...FISCAL_TABLES,
            ...FREIGHT_TABLES,
            ...NFE_TABLES,
            ...CTE_BATCH_TABLES,
            ...CTE_ISSUANCE_TABLES,
            ...CTE_PROFILE_TABLES,
            ...BILLING_TABLES,
            ...OPERATIONS_TABLES,
            ...FLEET_TABLES,
            ...MDFE_TABLES,
            ...NFSE_TABLES,
            ...TRIP_TABLES,
            ...DELIVERY_CLIENT_TABLES,
            ...HOLIDAY_PROVIDER_TABLES,
            ...HOLIDAY_PROVIDER_SETTINGS_TABLES,
            ...TRIP_FINANCIAL_TABLES,
            ...CONTRACTOR_PORTAL_TABLES,
            ...MULTI_VEHICLE_SUGGESTION_TABLES,
            ...WHATSAPP_CHANNEL_TABLES,
            ...WHATSAPP_PHONE_TABLES,
            ...WHATSAPP_FLOW_GRAPH_TABLES,
            ...WHATSAPP_COMMAND_TABLES,
          ].toSorted(),
        )
        expect(await readMigrationNames(database)).toEqual(migrationDirectories)

        for (const rollback of postIdentityRollbacks) await database.unsafe(rollback)
        const identityRollback = await Bun.file(
          join(migrationsDirectory.pathname, identityDirectory, 'rollback.sql'),
        ).text()
        await database.unsafe(identityRollback)
        expect(await readBusinessTables(database)).toHaveLength(0)
        expect(await readMigrationNames(database)).toEqual(migrationDirectories.slice(0, 1))
      })
    },
    30_000,
  )
})
