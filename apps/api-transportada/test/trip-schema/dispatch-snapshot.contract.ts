/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { tripDispatchSnapshots } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { listMigrationDirectories, migrationsDirectory } from '../database-migration/support.js'

/**
 * As duas tabelas que a spec 056 tornou append-only. O trigger é escrito à mão na migration —
 * `drizzle-kit generate` não o produz —, então ele é exatamente o tipo de coisa que some sem
 * ninguém perceber num `db:generate` futuro. Este contrato é o que impede isso.
 */
const APPEND_ONLY_TABLES = ['trip_dispatch_snapshots', 'trip_document_events'] as const

describe('trip dispatch snapshot (ADR-0043 §2)', () => {
  test('records one dispatch per trip, because dispatched is irreversible', () => {
    const uniques = uniqueColumnsByName(tripDispatchSnapshots)
    expect(uniques.trip_dispatch_snapshots_company_trip_unique).toEqual(['company_id', 'trip_id'])
  })

  test('carries the frozen route and a sha256 of it', () => {
    const required = requiredColumnNames(tripDispatchSnapshots)
    expect(required).toContain('snapshot')
    expect(required).toContain('snapshot_sha256')

    const checks = checkSqlByName(tripDispatchSnapshots)
    expect(checks.trip_dispatch_snapshots_sha256_check).toContain('[0-9a-f]{64}')
  })

  test('refuses a snapshot whose stops are not an array', () => {
    const checks = checkSqlByName(tripDispatchSnapshots)
    expect(checks.trip_dispatch_snapshots_stops_shape_check).toContain('jsonb_typeof')
    expect(checks.trip_dispatch_snapshots_stops_shape_check).toContain("'stops'")
  })

  test('pairs forced dispatch with a mandatory reason, in both directions', () => {
    const checks = checkSqlByName(tripDispatchSnapshots)
    expect(checks.trip_dispatch_snapshots_force_reason_check).toContain('force_reason')
    expect(checks.trip_dispatch_snapshots_force_reason_check).toContain('forced')
  })

  test('names who dispatched, through a membership of that same company', () => {
    expect(foreignKeys(tripDispatchSnapshots)).toContainEqual({
      columns: ['actor_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'trip_dispatch_snapshots_actor_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('holds the trip with restrict, never cascade — the record outlives the convenience', () => {
    expect(foreignKeys(tripDispatchSnapshots)).toContainEqual({
      columns: ['company_id', 'trip_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trips',
      name: 'trip_dispatch_snapshots_company_trip_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('freezes by not tracking: the stop ids inside the snapshot carry no foreign key', () => {
    // Congelar é parar de acompanhar. Uma FK para trip_stops faria a parada apagada levar o
    // snapshot junto (cascade) ou travar a reconciliação (restrict) — os dois desfazem o congelamento.
    const stopReferences = foreignKeys(tripDispatchSnapshots).filter(
      (reference) => reference.foreignTable === 'trip_stops',
    )
    expect(stopReferences).toEqual([])
  })

  test('is not revisable: no updated_at column', () => {
    expect(columnNames(tripDispatchSnapshots)).not.toContain('updated_at')
  })
})

describe('append-only enforcement (ADR-0043 §2 e §4)', () => {
  test('guards both trails with a trigger, not with a code convention', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_trip_dispatch_snapshots'))
    expect(directory).toBeString()

    const migrationSql = await Bun.file(
      join(migrationsDirectory.pathname, directory ?? '', 'migration.sql'),
    ).text()

    for (const table of APPEND_ONLY_TABLES) {
      expect(migrationSql).toContain(`CREATE FUNCTION "reject_${table}_mutation"()`)
      expect(migrationSql).toContain(`CREATE TRIGGER "${table}_append_only_trigger"`)
      expect(migrationSql).toContain(`BEFORE UPDATE OR DELETE ON "${table}"`)
      expect(migrationSql).toContain(`RAISE EXCEPTION '${table} is append-only'`)
    }
    // Mesmo ERRCODE de audit_logs e fiscal_sequence_reservations, para o tratamento ser um só.
    expect(migrationSql).toContain("ERRCODE = '55000'")
  })
})
