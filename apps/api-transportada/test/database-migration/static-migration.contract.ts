import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  DESTRUCTIVE_MIGRATION_PATTERN,
  FISCAL_TABLES,
  IDENTITY_TABLES,
  listMigrationDirectories,
  migrationsDirectory,
} from './support.js'

const PRESERVED_MIGRATION_HASHES = {
  '20260718224814_baseline/migration.sql':
    '49a0fa6e06db91f39903f070ad7a4ae2760463f8710ee67ee5848275d3ed7d53',
  '20260718224814_baseline/snapshot.json':
    'b7608eaa4a1ca9ddee5a5f7cc8f855a6ce1d825057eb1997f004b6f2dc4bb781',
  '20260719025322_tenant_identity/migration.sql':
    '7b8308162d50faf727dae4ca8e8bbcb3d60ec36a4b5401f6ef5efe096df012c2',
  '20260719025322_tenant_identity/rollback.sql':
    '428b9a2cd60c62f6ec31d11feb0d19da3aad0d6f9f40f310580689d28b858fbc',
  '20260719025322_tenant_identity/snapshot.json':
    'a355fadb6096062f8839f4456e44a6c05be1a13518927aaa76dce8dcc3133c91',
} as const

const FISCAL_ROLLBACK_ORDER = [
  'audit_logs',
  'idempotency_records',
  'fiscal_sequence_reservations',
  'fiscal_sequences',
  'digital_certificates',
  'company_fiscal_profiles',
] as const

const readMigrationFile = (directory: string, file: string): Promise<string> =>
  Bun.file(join(migrationsDirectory.pathname, directory, file)).text()

describe('Drizzle migrations', () => {
  test('preserves baseline and identity bytes while versioning additive fiscal migrations', async () => {
    for (const [relativePath, expectedHash] of Object.entries(PRESERVED_MIGRATION_HASHES)) {
      const contents = await Bun.file(
        join(migrationsDirectory.pathname, relativePath),
      ).arrayBuffer()
      const actualHash = createHash('sha256').update(new Uint8Array(contents)).digest('hex')
      expect(actualHash).toBe(expectedHash)
    }

    const directories = await listMigrationDirectories()
    expect(directories).toEqual([
      '20260718224814_baseline',
      '20260719025322_tenant_identity',
      '20260720003709_company_fiscal_settings',
      '20260722024645_boring_leper_queen',
      '20260722170000_nfe_retry_constraints',
      '20260722172720_confused_excalibur',
      '20260722225555_robust_viper',
      '20260723004735_cte_issuance_schema',
      '20260723090000_cte_issuance_outbox',
      '20260723125103_oval_dexter_bennett',
      '20260723153157_clammy_scarlet_spider',
      '20260724115644_unsigned_nfe_document_expand',
      '20260724220724_view_preferences',
      '20260726200635_scheduled_nfe_automation_origin',
      '20260727114820_cte_emission_profiles',
      '20260727133210_cte_batch_item_composition',
      '20260727151037_nfe_address_city_code',
      '20260727190452_cte_issuance_payloads',
      '20260727201344_cte_fiscal_document_storage_purpose',
      '20260727213825_cte_retry_policy',
      '20260728004715_cte_processed_messages',
      '20260728015716_cte_pickup_details',
      '20260728105408_cte_cancellation_event',
      '20260728133253_driver_company_role',
      '20260728140645_fleet_vehicles_and_drivers',
      '20260728150234_mdfe_manifests',
      '20260728162353_mdfe_fiscal_sequence_model',
      '20260728164350_mdfe_processed_messages',
      '20260728165555_mdfe_issuance_payloads',
      '20260728172757_mdfe_document_storage_purpose',
      '20260728201709_mdfe_lotacao_contratante_pagamento_seguro',
      '20260728235419_mdfe_certificate_purpose',
      '20260729105113_mdfe_manifest_discarded_status',
      '20260729114737_mdfe_attempt_last_error_message',
      '20260729182304_cte_predominant_product_highest_quantity',
      '20260730121112_cte_batch_item_company_keyset_index',
      '20260731230527_billing_invoice_observations',
      '20260801040948_company_billing_defaults',
      '20260801043234_company_logos',
      '20260802205604_fleet_driver_linked_tax_id',
      '20260803000529_fleet_driver_vehicle_link',
    ])

    const baselineSql = await readMigrationFile(directories[0] ?? '', 'migration.sql')
    const identitySql = await readMigrationFile(directories[1] ?? '', 'migration.sql')
    const fiscalSql = await readMigrationFile(directories[2] ?? '', 'migration.sql')
    expect(baselineSql).not.toMatch(/\b(create table|create type|create sequence)\b/i)
    expect(identitySql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)
    expect(fiscalSql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)
    for (const table of IDENTITY_TABLES) expect(identitySql).toContain(`CREATE TABLE "${table}"`)
    for (const table of FISCAL_TABLES) expect(fiscalSql).toContain(`CREATE TABLE "${table}"`)
  })

  test('versions a guarded reverse-dependency fiscal rollback', async () => {
    const fiscalDirectory = (await listMigrationDirectories())[2] ?? ''
    const migrationSql = await readMigrationFile(fiscalDirectory, 'migration.sql')
    const rollbackSql = await readMigrationFile(fiscalDirectory, 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')
    const dropOrder = FISCAL_ROLLBACK_ORDER.map((table) =>
      rollbackSql.indexOf(`DROP TABLE "${table}"`),
    )

    expect(migrationSql).toMatch(
      /create function\s+"reject_fiscal_sequence_reservations_mutation"\s*\(\)/i,
    )
    expect(migrationSql).toMatch(
      /create trigger\s+"fiscal_sequence_reservations_append_only_trigger"[\s\S]*before update or delete on "fiscal_sequence_reservations"[\s\S]*execute function "reject_fiscal_sequence_reservations_mutation"\s*\(\)/i,
    )
    expect(dropOrder.every((position) => position >= 0)).toBeTrue()
    expect(dropOrder).toEqual(dropOrder.toSorted((left, right) => left - right))
    expect(rollbackSql).toContain(`"name" = '${fiscalDirectory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    const triggerPosition = rollbackSql.indexOf('DROP TRIGGER "audit_logs_append_only_trigger"')
    const functionPosition = rollbackSql.indexOf('DROP FUNCTION "reject_audit_logs_mutation"()')
    expect(triggerPosition).toBeGreaterThan(-1)
    expect(functionPosition).toBeGreaterThan(triggerPosition)
    expect(dropOrder[0]).toBeGreaterThan(functionPosition)
    const reservationTriggerPosition = rollbackSql.indexOf(
      'DROP TRIGGER "fiscal_sequence_reservations_append_only_trigger"',
    )
    const reservationFunctionPosition = rollbackSql.indexOf(
      'DROP FUNCTION "reject_fiscal_sequence_reservations_mutation"()',
    )
    expect(reservationTriggerPosition).toBeGreaterThan(dropOrder[1] ?? -1)
    expect(reservationFunctionPosition).toBeGreaterThan(reservationTriggerPosition)
    expect(dropOrder[2]).toBeGreaterThan(reservationFunctionPosition)
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the billing invoice observations as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_billing_invoice_observations'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain('ADD COLUMN "observations"')
    expect(migrationSql).toContain('billing_invoices_observations_check')
    // Ampliar um CHECK exige substituí-lo; a única troca permitida re-adiciona na mesma instrução.
    expect(migrationSql).toMatch(
      /DROP CONSTRAINT "billing_invoice_events_name_check", ADD CONSTRAINT "billing_invoice_events_name_check"/,
    )
    expect(migrationSql).toContain('invoice_updated')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the company billing defaults as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_company_billing_defaults'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    for (const column of [
      'billing_bank_name',
      'billing_bank_code',
      'billing_bank_branch',
      'billing_bank_account',
      'billing_pix_key',
      'billing_observations',
    ]) {
      expect(migrationSql).toContain(`ADD COLUMN "${column}"`)
    }
    expect(migrationSql).toContain('company_fiscal_profiles_billing_bank_code_check')
    expect(migrationSql).toContain('company_fiscal_profiles_billing_observations_check')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the driver linked tax id as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_driver_linked_tax_id'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain('ADD COLUMN "linked_tax_id"')
    expect(migrationSql).toContain('fleet_drivers_linked_tax_id_check')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  // Trocar índice é a única destruição aceita aqui: nenhuma linha de vínculo é apagada
  test('versions the driver vehicle link index swap with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_driver_vehicle_link'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "fleet_driver_vehicle_assignments_live_link_unique"',
    )
    expect(migrationSql).toContain(
      'DROP INDEX "fleet_driver_vehicle_assignments_live_vehicle_unique"',
    )
    expect(rollbackSql).toContain('fleet_driver_vehicle_assignments_live_driver_unique')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('does not run migrations from the API startup path', async () => {
    const mainSource = await Bun.file(new URL('../../src/main.ts', import.meta.url)).text()
    const migrationSource = await Bun.file(
      new URL('../../src/database/database-migration.service.ts', import.meta.url),
    ).text()

    expect(mainSource).not.toContain('runDatabaseMigrations')
    expect(mainSource).not.toContain('db:migrate')
    expect(migrationSource).toContain(`const MIGRATIONS_SCHEMA = 'drizzle'`)
    expect(migrationSource).not.toContain('DRIZZLE_MIGRATIONS_SCHEMA')
  })
})
