/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SQL } from 'bun'
import { describe, expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  listMigrationDirectories,
  migrationsDirectory,
  testWithPostgres,
  withDisposableDatabase,
} from './support.js'

type ManifestTripRow = {
  readonly id: string
  readonly trip_id: string
  readonly status: string
}

describe('Trip backfill migration', () => {
  testWithPostgres(
    'gives every pre-existing mdfe manifest a populated trip_id, with drivers copied over',
    async () => {
      await withDisposableDatabase(async (database, connectionString) => {
        const migrationDirectories = await listMigrationDirectories()
        const expansionIndex = migrationDirectories.findIndex((name) =>
          name.endsWith('_trip_planning_expansion'),
        )
        const backfillIndex = migrationDirectories.findIndex((name) =>
          name.endsWith('_trip_backfill_existing_manifests'),
        )
        expect(expansionIndex).toBeGreaterThan(-1)
        expect(backfillIndex).toBe(expansionIndex + 1)

        const preBackfillDirectories = migrationDirectories.slice(0, expansionIndex + 1)
        const preBackfillFolder = await mkdtemp(join(tmpdir(), 'trip-backfill-pre-'))

        try {
          await Promise.all(
            preBackfillDirectories.map((directory) =>
              cp(
                join(migrationsDirectory.pathname, directory),
                join(preBackfillFolder, directory),
                {
                  recursive: true,
                },
              ),
            ),
          )

          // Aplica só até a expansão (trips ainda vazia, mdfe_manifests.trip_id ainda nullable).
          await runDatabaseMigrations({
            connectionString,
            migrationsFolder: `${preBackfillFolder}/`,
          })

          const companyId = crypto.randomUUID()
          const vehicleId = crypto.randomUUID()
          const driverId = crypto.randomUUID()
          const draftManifestId = crypto.randomUUID()
          const authorizedManifestId = crypto.randomUUID()

          await database`insert into companies (id, status) values (${companyId}, 'active')`
          // Esquema histórico: aqui `vehicle_type` ainda não existe — a fusão vem depois, na linha 111
          await database`
            insert into fleet_vehicles (id, company_id, plate, role, wheel_type, state)
            values (${vehicleId}, ${companyId}, 'ABC1D23', 'traction', '03', 'SP')
          `
          await database`
            insert into fleet_drivers (id, company_id, name, tax_id)
            values (${driverId}, ${companyId}, 'Motorista Backfill', '12345678901')
          `
          // Manifesto em rascunho: a viagem backfilled deve nascer 'open'.
          await database`
            insert into mdfe_manifests (
              id, company_id, vehicle_id, fiscal_environment, origin_state, destination_state, status
            )
            values (${draftManifestId}, ${companyId}, ${vehicleId}, 'homologation', 'SP', 'MG', 'draft')
          `
          // Manifesto já autorizado: a viagem backfilled deve nascer 'closed'.
          await database`
            insert into mdfe_manifests (
              id, company_id, vehicle_id, fiscal_environment, origin_state, destination_state,
              status, fiscal_series, fiscal_number
            )
            values (
              ${authorizedManifestId}, ${companyId}, ${vehicleId}, 'homologation', 'SP', 'MG',
              'authorized', '1', 4001
            )
          `
          await database`
            insert into mdfe_manifest_drivers (
              company_id, manifest_id, driver_id, driver_name, driver_tax_id, position
            )
            values (
              ${companyId}, ${authorizedManifestId}, ${driverId}, 'Motorista Backfill', '12345678901', 1
            )
          `

          const preBackfill = await database<Array<{ readonly trip_id: string | null }>>`
            select trip_id from mdfe_manifests where id in (${draftManifestId}, ${authorizedManifestId})
          `
          expect(preBackfill).toHaveLength(2)
          expect(preBackfill.every((row) => row.trip_id === null)).toBeTrue()

          // Aplica o resto — inclui o backfill (spec 027 T002) sobre os manifestos recém-seedados.
          await runDatabaseMigrations({ connectionString })

          const afterBackfill = await database<ManifestTripRow[]>`
            select m.id, m.trip_id, t.status
            from mdfe_manifests m
            join trips t on t.company_id = m.company_id and t.id = m.trip_id
            where m.id in (${draftManifestId}, ${authorizedManifestId})
            order by m.id
          `
          expect(afterBackfill).toHaveLength(2)

          const draftTrip = afterBackfill.find((row) => row.id === draftManifestId)
          const authorizedTrip = afterBackfill.find((row) => row.id === authorizedManifestId)
          expect(draftTrip?.trip_id).toBeString()
          expect(authorizedTrip?.trip_id).toBeString()
          expect(draftTrip?.status).toBe('open')
          expect(authorizedTrip?.status).toBe('closed')

          const authorizedTripDrivers = await database<
            Array<{ readonly driver_id: string; readonly driver_tax_id: string }>
          >`
            select driver_id, driver_tax_id from trip_drivers where trip_id = ${authorizedTrip?.trip_id ?? ''}
          `
          expect(authorizedTripDrivers).toEqual([
            { driver_id: driverId, driver_tax_id: '12345678901' },
          ])

          const draftTripDrivers = await database`
            select 1 as present from trip_drivers where trip_id = ${draftTrip?.trip_id ?? ''}
          `
          expect(draftTripDrivers).toHaveLength(0)
        } finally {
          await rm(preBackfillFolder, { recursive: true, force: true })
        }
      })
    },
  )

  // T005-T011 tornaram a aplicação uma segunda fonte de trips: a viagem do operador também aparece
  // em mdfe_manifests.trip_id, e apagá-la levaria em cascata as notas que o backfill nunca tocou.
  testWithPostgres(
    'refuses to roll back once a trip carries documents linked by the application',
    async () => {
      await withDisposableDatabase(async (database, connectionString) => {
        await runDatabaseMigrations({ connectionString })

        const companyId = crypto.randomUUID()
        const userId = crypto.randomUUID()
        const vehicleId = crypto.randomUUID()
        const tripId = crypto.randomUUID()
        const manifestId = crypto.randomUUID()
        const importId = crypto.randomUUID()
        const xmlObjectId = crypto.randomUUID()
        const nfeDocumentId = crypto.randomUUID()
        const tripDocumentId = crypto.randomUUID()
        const zeroSha256 = '0'.repeat(64)

        await database`insert into companies (id, status) values (${companyId}, 'active')`
        await database`insert into identity_users (id, status) values (${userId}, 'active')`
        await database`
          insert into user_company_memberships (id, company_id, user_id, status)
          values (${crypto.randomUUID()}, ${companyId}, ${userId}, 'active')
        `
        await database`
          insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
          values (${vehicleId}, ${companyId}, 'ABC1D23', 'traction', 'tractor_unit', 'SP')
        `
        await database`
          insert into nfe_imports (
            id, company_id, source, requested_by_user_id, correlation_id, idempotency_key,
            request_fingerprint, status
          )
          values (
            ${importId}, ${companyId}, 'upload', ${userId}, 'correlation-rollback-guard',
            'idem-rollback-guard', 'fingerprint-rollback-guard', 'completed'
          )
        `
        await database`
          insert into stored_objects (
            id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status,
            purpose
          )
          values (
            ${xmlObjectId}, ${companyId}, 's3', 'fiscal', 'nfe/rollback-guard.xml',
            'application/xml', 1024, ${zeroSha256}, 'final', 'nfe_document'
          )
        `
        await database`
          insert into nfe_documents (
            id, company_id, access_key, model, number, series, issued_at, operation_nature,
            operation_type, status, source, total_value, products_value, authorization_protocol,
            xml_object_id, xml_sha256, import_id, created_by_user_id
          )
          values (
            ${nfeDocumentId}, ${companyId}, ${'3'.repeat(44)}, '55', '1001', '1', now(), 'venda',
            '1', 'authorized', 'upload', '1000.00', '1000.00', '135240001',
            ${xmlObjectId}, ${zeroSha256}, ${importId}, ${userId}
          )
        `

        // Viagem nascida na aplicação, com nota vinculada, e só depois manifestada.
        await database`
          insert into trips (id, company_id, vehicle_id) values (${tripId}, ${companyId}, ${vehicleId})
        `
        await database`
          insert into trip_documents (id, company_id, trip_id, nfe_document_id)
          values (${tripDocumentId}, ${companyId}, ${tripId}, ${nfeDocumentId})
        `
        await database`
          insert into mdfe_manifests (
            id, company_id, vehicle_id, trip_id, fiscal_environment, origin_state,
            destination_state, status
          )
          values (
            ${manifestId}, ${companyId}, ${vehicleId}, ${tripId}, 'homologation', 'SP', 'MG', 'draft'
          )
        `

        const directories = await listMigrationDirectories()
        const backfillDirectory = directories.find((name) =>
          name.endsWith('_trip_backfill_existing_manifests'),
        )
        expect(backfillDirectory).toBeString()
        const rollbackSql = await Bun.file(
          join(migrationsDirectory.pathname, backfillDirectory ?? '', 'rollback.sql'),
        ).text()

        // Sessão dedicada: o RAISE aborta a transação aberta pelo próprio script, e a conexão fica
        // inutilizável até um ROLLBACK — descartá-la é mais simples do que recuperá-la.
        const rollbackSession = new SQL(connectionString, { max: 1 })
        let refusal: Error | undefined
        try {
          // `expect(...).rejects` trava sobre a query preguiçosa do cliente SQL do Bun.
          await rollbackSession.unsafe(rollbackSql)
        } catch (caught) {
          refusal = caught as Error
        } finally {
          await rollbackSession.close({ timeout: 0 })
        }

        expect(refusal?.message).toContain('Refusing to roll back the trip backfill')

        const survivors = await database`
          select id from trip_documents where id = ${tripDocumentId}
        `
        expect(survivors).toHaveLength(1)
      })
    },
    30_000,
  )
})
