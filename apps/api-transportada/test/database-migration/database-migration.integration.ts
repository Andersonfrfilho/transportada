import { join } from 'node:path'

import { describe, expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { assertFiscalConstraints } from './fiscal-constraints.assertion.js'
import { assertFleetConstraints } from './fleet-constraints.assertion.js'
import { assertFreightRegionConstraints } from './freight-region-constraints.assertion.js'
import { assertIdentityConstraints } from './identity-constraints.assertion.js'
import { assertInvitationConstraints } from './invitation-constraints.assertion.js'
import { assertMdfeConstraints } from './mdfe-constraints.assertion.js'
import { assertRntrcRollbackRefusesNinePositions } from './rntrc-rollback.assertion.js'
import { assertTripConstraints } from './trip-constraints.assertion.js'
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
  CONTRACTOR_PORTAL_TABLES,
  MULTI_VEHICLE_SUGGESTION_TABLES,
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
            ...TRIP_FINANCIAL_TABLES,
            ...CONTRACTOR_PORTAL_TABLES,
            ...MULTI_VEHICLE_SUGGESTION_TABLES,
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
        await assertRntrcRollbackRefusesNinePositions({
          database,
          directories: migrationDirectories,
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
            ...TRIP_FINANCIAL_TABLES,
            ...CONTRACTOR_PORTAL_TABLES,
            ...MULTI_VEHICLE_SUGGESTION_TABLES,
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
