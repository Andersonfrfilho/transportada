import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { VEHICLE_COLORS } from '../../src/database/fleet.schema.js'
import {
  DESTRUCTIVE_MIGRATION_PATTERN,
  FISCAL_TABLES,
  IDENTITY_TABLES,
  INVITATION_TABLES,
  NFSE_TABLES,
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

const POSTAL_CODE_INDEX_NAMES = [
  'nfe_addresses_company_postal_code_idx',
  'fleet_drivers_company_postal_code_idx',
  'company_fiscal_profiles_company_postal_code_idx',
  'mdfe_manifests_company_loading_postal_code_idx',
  'mdfe_manifests_company_discharge_postal_code_idx',
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
      '20260804143209_user_invitations',
      '20260805020005_trip_planning_expansion',
      '20260805030010_trip_backfill_existing_manifests',
      '20260805165955_identity_user_profiles',
      '20260806143116_identity_user_profile_username',
      '20260806161903_cte_fiscal_number_advanced_event',
      '20260807022114_cte_issuance_diagnostics',
      '20260807113744_nfe_party_trade_name_and_phone',
      '20260807223440_rntrc_registry_leading_zero',
      '20260809134710_cte_issuance_payload_taker',
      '20260811140230_nfe_distribution_cursor_recovery',
      '20260811164234_billing_description_templates',
      '20260811180555_billing_invoice_item_release',
      '20260812154051_nfse_service_invoices',
      '20260812172200_invitation_delivery',
      '20260812180149_company_activation_channel',
      '20260812180517_nfse_profile_municipality_name',
      '20260813024255_password_reset_requests',
      '20260813151612_fleet_vehicle_model_fields',
      '20260813181604_fleet_vehicle_cost_fields',
      '20260814131353_fleet_vehicle_color',
      '20260814191354_tax_id_alphanumeric',
      '20260814211033_fleet_vehicle_color_list',
      '20260815001423_fuel_price_reference',
      '20260817185545_nfse_credential_municipal_registration',
      '20260817200023_nfse_invoice_cancellation_motive',
      '20260817201606_nfse_invoice_discarded_status',
      '20260819184128_fleet_vehicle_color_market_tones',
      '20260819202712_fleet_vehicle_measure_decimal',
      '20260820000830_freight_regions_and_vehicle_freight_class',
      '20260820002947_fleet_driver_address_and_dates',
      '20260821153330_fleet_vehicle_type',
      '20260821170031_fleet_driver_antt_contact',
      '20260821173515_identity_aggregate_role',
      '20260821201036_fleet_driver_license_category',
      '20260821205503_fleet_driver_first_license',
      '20260821212505_addresses_postal_code_index',
      '20260821214357_fleet_driver_personal_details',
      '20260821232908_fuel_catalog_energy',
      '20260821233830_fleet_vehicle_secondary_fuel',
      '20260822011127_energy_tariff_reference',
      '20260823175600_job_schedule_registry',
      '20260823235210_fleet_driver_identity_document',
      '20260824004030_fleet_driver_linked_address',
      '20260824153250_public_rattler',
      '20260824184702_separator_role',
      '20260824200157_trip_status_machine',
      '20260824202501_trip_stops',
      '20260824204404_trip_document_events',
      '20260824204913_trip_dispatch_snapshots',
      '20260824233118_trip_documents_stop_fk_restrict',
      '20260825014901_delivery_address_overrides',
      '20260825121044_landing_settings',
      '20260825122857_aggregate_applications',
      '20260825172715_polite_carlie_cooper',
      '20260825173416_ancient_ben_parker',
      '20260825215905_quick_flatman',
      '20260826013922_identity_user_profile_contact_and_tax_id',
      '20260826015435_powerful_dakota_north',
      '20260826095930_overconfident_iron_monger',
      '20260826101924_tough_killraven',
      '20260826110441_cold_mattie_franklin',
      '20260826112225_smooth_chameleon',
      '20260826161437_nervous_aqueduct',
      '20260826192739_striped_satana',
      '20260826224111_mushy_invaders',
      '20260826232046_solid_jack_power',
      '20260827023131_delivery_client_registry',
      '20260827023727_delivery_charges_and_scheduling',
      '20260827024209_delivery_charge_dismissed',
      '20260827103032_delivery_charge_suggestion_unique',
      '20260827104939_delivery_charge_suggestion_needs_document',
      '20260827113725_delivery_charge_suggested_amount',
      '20260827124518_trip_financial_result',
      '20260827153311_contractor_portal',
      '20260827184657_route_suggestion_multi_vehicle',
      '20260827200542_aggregate_application_attachments',
      '20260827202356_aggregate_application_attachment_purpose',
      '20260828002117_route_optimization_timezone',
      '20260828033159_whatsapp_channel',
      '20260829030742_whatsapp_webhook_nonce',
      '20260829224254_identity_document_backfill_job',
      '20260830160916_company_groups',
      '20260830193604_login_identifiers',
      '20260830233139_identity_user_picture',
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

  test('versions the user invitations as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_user_invitations'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)
    for (const table of INVITATION_TABLES) {
      expect(migrationSql).toContain(`CREATE TABLE "${table}"`)
    }
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "user_invitations_company_id_user_id_pending_unique"',
    )
    expect(migrationSql).toContain(`WHERE "status" = 'pending'`)
    expect(migrationSql).toContain('user_invitations_membership_fk')
    expect(migrationSql).toContain('user_invitations_code_hash_check')
    // O código em claro nunca chega ao banco: a migration só conhece o hash.
    expect(migrationSql).not.toMatch(/"code"\s+text/i)

    const rolesPosition = rollbackSql.indexOf('DROP TABLE IF EXISTS "user_invitation_roles"')
    const invitationsPosition = rollbackSql.indexOf('DROP TABLE IF EXISTS "user_invitations"')
    expect(rolesPosition).toBeGreaterThan(-1)
    expect(invitationsPosition).toBeGreaterThan(rolesPosition)
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the trip planning expansion as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_trip_planning_expansion'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)
    // A expansão original criou só estas três — trip_stops chega numa migration própria depois
    // (ADR-0043), então este teste fica preso aos três nomes, não ao TRIP_TABLES que cresce.
    for (const table of ['trips', 'trip_drivers', 'trip_documents']) {
      expect(migrationSql).toContain(`CREATE TABLE "${table}"`)
    }
    // ADR-0023: expansão primeiro — trip_id nasce nullable, a contração (T003) vem depois do backfill.
    expect(migrationSql).toContain('ALTER TABLE "mdfe_manifests" ADD COLUMN "trip_id" uuid;')
    expect(migrationSql).not.toMatch(/ADD COLUMN "trip_id" uuid NOT NULL/i)
    expect(migrationSql).toContain('mdfe_manifests_company_trip_fk')
    expect(migrationSql).toContain('trip_documents_entity_xor_check')
    expect(migrationSql).toContain('trip_documents_delivered_locks_release_check')
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "trip_documents_live_nfe_document_unique"')
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "trip_documents_live_freight_calculation_unique"',
    )

    const documentsPosition = rollbackSql.indexOf('DROP TABLE "trip_documents"')
    const driversPosition = rollbackSql.indexOf('DROP TABLE "trip_drivers"')
    const tripsPosition = rollbackSql.indexOf('DROP TABLE "trips"')
    const manifestColumnPosition = rollbackSql.indexOf(
      'ALTER TABLE "mdfe_manifests" DROP COLUMN "trip_id"',
    )
    expect(documentsPosition).toBeGreaterThan(-1)
    expect(driversPosition).toBeGreaterThan(documentsPosition)
    expect(tripsPosition).toBeGreaterThan(driversPosition)
    expect(manifestColumnPosition).toBeGreaterThan(-1)
    expect(manifestColumnPosition).toBeLessThan(documentsPosition)
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the trip backfill as a data-only migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_trip_backfill_existing_manifests'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    // Backfill puro — nenhuma alteração de schema, só DML. A tabela temporária usa
    // "ON COMMIT DROP" (não um DROP TABLE de verdade), por isso o padrão exige um objeto alvo.
    expect(migrationSql).not.toMatch(/\b(create table|create type|create sequence)\b/i)
    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).toContain('FROM "mdfe_manifests" "m"')
    expect(migrationSql).toContain('WHERE "m"."trip_id" IS NULL')
    expect(migrationSql).toContain('INSERT INTO "trips"')
    expect(migrationSql).toContain('INSERT INTO "trip_drivers"')
    expect(migrationSql).toContain('UPDATE "mdfe_manifests" "m"')
    expect(migrationSql).toContain('SET "trip_id" = "map"."trip_id"')

    expect(rollbackSql).toContain('UPDATE "mdfe_manifests"')
    expect(rollbackSql).toContain('SET "trip_id" = NULL')
    expect(rollbackSql).toContain('DELETE FROM "trip_drivers"')
    expect(rollbackSql).toContain('DELETE FROM "trips"')
    // T005-T011 tornaram a aplicação uma segunda fonte de trips: o rollback aborta em vez de
    // apagar viagem de operador e levar junto os trip_documents dela.
    expect(rollbackSql).toContain('Refusing to roll back the trip backfill')
    expect(rollbackSql).toContain('JOIN "mdfe_manifests" "m" ON "m"."trip_id" = "t"."id"')
    expect(rollbackSql).toContain('FROM "trip_documents"')
    expect(rollbackSql.indexOf('RAISE EXCEPTION')).toBeLessThan(
      rollbackSql.indexOf('DELETE FROM "trips"'),
    )
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  // Alargar o cadastro é aditivo; estreitá-lo de volta não é, e o rollback precisa recusar.
  test('versions the RNTRC registry widening with a rollback that refuses to shorten cadastre', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_rntrc_registry_leading_zero'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).toContain(
      `ADD CONSTRAINT "company_fiscal_profiles_rntrc_check" CHECK (length("rntrc") = 0 or "rntrc" ~ '^0?[0-9]{8}$')`,
    )
    expect(migrationSql).toContain(
      `ADD CONSTRAINT "fleet_vehicles_owner_rntrc_check" CHECK (length("owner_rntrc") = 0 or "owner_rntrc" ~ '^0?[0-9]{8}$')`,
    )

    expect(rollbackSql).toContain('Refusing to roll back the RNTRC registry')
    expect(rollbackSql).toContain(`"owner_rntrc" ~ '^[0-9]{8}$'`)
    expect(rollbackSql).toContain('DROP CONSTRAINT "company_fiscal_profiles_rntrc_check"')
    expect(rollbackSql.indexOf('RAISE EXCEPTION')).toBeLessThan(
      rollbackSql.indexOf('ALTER TABLE "fleet_vehicles"'),
    )
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the billing description templates as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_billing_description_templates'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain('CREATE TABLE "billing_description_templates"')
    expect(migrationSql).toContain('billing_description_templates_company_name_unique')
    expect(migrationSql).toContain('billing_description_templates_name_check')
    expect(migrationSql).toContain('billing_description_templates_body_check')
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "billing_description_templates_company_default_unique" ON "billing_description_templates" ("company_id") WHERE "is_default"',
    )
    expect(migrationSql).toContain('ON DELETE RESTRICT ON UPDATE CASCADE')
    // O backfill copia o texto salvo por empresa; a coluna de origem continua intacta.
    expect(migrationSql).toContain(`SELECT "company_id", 'Padrão', "billing_observations", true`)
    expect(migrationSql).toContain('FROM "company_fiscal_profiles"')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  // Trocar unicidade total por parcial é a única destruição aceita aqui: nenhuma linha é apagada,
  // e é o que devolve para o faturamento o CT-e preso numa fatura cancelada.
  test('versions the billing invoice item release with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_billing_invoice_item_release'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain(
      'ALTER TABLE "billing_invoice_items" ADD COLUMN "cancelled_at" timestamp with time zone',
    )
    // O backfill solta agora os CT-es presos nas faturas canceladas antes desta migration.
    expect(migrationSql).toContain('UPDATE "billing_invoice_items"')
    expect(migrationSql).toContain(`"invoice"."status" = 'cancelled'`)
    expect(migrationSql).toContain(
      'ALTER TABLE "billing_invoice_items" DROP CONSTRAINT "billing_invoice_items_company_cte_document_unique"',
    )
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "billing_invoice_items_active_cte_document_unique" ON "billing_invoice_items" ("company_id","cte_document_id") WHERE "cancelled_at" is null',
    )
    // A coluna só nasce depois de existir, e a unicidade parcial só entra depois da total sair.
    expect(migrationSql.indexOf('ADD COLUMN "cancelled_at"')).toBeLessThan(
      migrationSql.indexOf('UPDATE "billing_invoice_items"'),
    )
    expect(migrationSql.indexOf('DROP CONSTRAINT')).toBeLessThan(
      migrationSql.indexOf('CREATE UNIQUE INDEX'),
    )
    expect(rollbackSql).toContain('billing_invoice_items_company_cte_document_unique')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  // A única destruição aqui é a troca do check de propósito de `stored_objects`, no mesmo
  // ALTER TABLE que o recria — nenhuma linha existente é apagada nem invalidada.
  test('versions the nfse service invoices as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_nfse_service_invoices'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    for (const table of NFSE_TABLES) expect(migrationSql).toContain(`CREATE TABLE "${table}"`)
    expect(migrationSql).toContain('ON DELETE RESTRICT ON UPDATE CASCADE')
    // Cancelar a nota de serviço devolve a NF-e: a unicidade nasce parcial, nunca total.
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "nfse_service_invoice_documents_active_nfe_unique" ON "nfse_service_invoice_documents" ("company_id","nfe_document_id") WHERE "cancelled_at" is null',
    )
    // O propósito novo entra no mesmo ALTER TABLE que remove o antigo, sem janela sem check.
    expect(migrationSql).toMatch(
      /ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check",\s*ADD CONSTRAINT "stored_objects_purpose_check"/,
    )
    expect(migrationSql).toContain(`'nfse_document'`)
    // O pedido de cancelamento é estado próprio, e ele varre junto com a autorização pendente.
    expect(migrationSql).toContain(
      `CONSTRAINT "nfse_service_invoices_next_check_state_check" CHECK ("status" in ('pending_authorization', 'cancellation_requested') or "next_status_check_at" is null)`,
    )
    expect(migrationSql).toContain(
      `CONSTRAINT "nfse_service_invoices_cancellation_requested_check" CHECK ("status" <> 'cancellation_requested' or ("cancellation_reason" is not null and "cancelled_at" is null))`,
    )
    for (const table of NFSE_TABLES)
      expect(rollbackSql).toContain(`DROP TABLE IF EXISTS "${table}"`)
    // O rollback desfaz o propósito na ordem inversa: primeiro as tabelas, depois o check.
    expect(rollbackSql.indexOf('nfse_issuance_outbox')).toBeLessThan(
      rollbackSql.indexOf('stored_objects_purpose_check'),
    )
    expect(rollbackSql).toContain(
      `CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document'))`,
    )
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  /**
   * O nome do município não pôde entrar na migration da própria feature: ela deixou de ser a ponta
   * da fila, e regerá-la apagaria as tabelas de NFS-e dos snapshots que vieram depois.
   */
  test('versions the nfse profile municipality name as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_nfse_profile_municipality_name'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)
    expect(migrationSql).toContain(
      'ALTER TABLE "nfse_emission_profiles" ADD COLUMN "municipality_name" text NOT NULL',
    )
    // O nome em branco não descreve município nenhum: o piso é um caractere, não zero.
    expect(migrationSql).toContain(
      'CHECK (length("municipality_name") > 0 and length("municipality_name") <= 60)',
    )
    expect(rollbackSql).toContain(
      'ALTER TABLE "nfse_emission_profiles" DROP COLUMN IF EXISTS "municipality_name"',
    )
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the fleet vehicle model fields as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_vehicle_model_fields'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    for (const column of ['brand', 'model', 'fleet_number', 'model_year', 'axle_count']) {
      expect(migrationSql).toContain(`ADD COLUMN "${column}"`)
    }
    expect(migrationSql).toContain('fleet_vehicles_model_year_check')
    expect(migrationSql).toContain('fleet_vehicles_axle_count_check')
    expect(migrationSql).toContain('fleet_vehicles_brand_check')
    expect(migrationSql).toContain('fleet_vehicles_model_check')
    expect(migrationSql).toContain('fleet_vehicles_fleet_number_check')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the fleet vehicle cost and consumption fields as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_vehicle_cost_fields'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    for (const column of [
      'average_consumption',
      'cost_per_kilometer',
      'acquisition_amount',
      'monthly_installment_amount',
      'annual_vehicle_tax_amount',
      'annual_insurance_amount',
      'costs_updated_at',
    ]) {
      expect(migrationSql).toContain(`ADD COLUMN "${column}"`)
    }
    expect(migrationSql).toContain('fleet_vehicles_cost_check')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the fleet vehicle color as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_vehicle_color'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain('ADD COLUMN "color"')
    expect(migrationSql).toContain('fleet_vehicles_color_check')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  /**
   * Estreitar CHECK reprova linha que passava antes: a migration normaliza o que não casa com a
   * lista para vazio na mesma transação, e é isso que a torna aplicável sem intervenção manual.
   */
  test('narrows the fleet vehicle color to the Denatran list, blanking what falls outside it', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_vehicle_color_list'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain('DROP CONSTRAINT "fleet_vehicles_color_check"')
    expect(migrationSql).toContain('ADD CONSTRAINT "fleet_vehicles_color_check"')
    expect(migrationSql).toMatch(/UPDATE "fleet_vehicles"[\s\S]*SET "color" = ''/i)
    // A lista é literal: a migration congelou as dezesseis do Denatran, e `VEHICLE_COLORS` cresceu
    // depois com os tons de mercado. Lê-la daqui faria o passado seguir o presente.
    for (const color of [
      'amarela',
      'azul',
      'bege',
      'branca',
      'cinza',
      'dourada',
      'fantasia',
      'grena',
      'laranja',
      'marrom',
      'prata',
      'preta',
      'rosa',
      'roxa',
      'verde',
      'vermelha',
    ]) {
      expect(migrationSql).toContain(`'${color}'`)
    }
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  /**
   * Alargar a lista de cor é o inverso do estreitamento acima: nenhuma linha existente deixa de
   * passar, então a migration não normaliza nada. Quem carrega o peso é o rollback — voltar à
   * tabela do Denatran reprova o veículo pintado com um tom de mercado, e por isso ele zera a cor
   * antes de recriar a constraint, na mesma transação.
   */
  test('widens the fleet vehicle color with the market tones and blanks them only on rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_vehicle_color_market_tones'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate|update)\b/im)
    expect(migrationSql).toContain('DROP CONSTRAINT "fleet_vehicles_color_check"')
    expect(migrationSql).toContain('ADD CONSTRAINT "fleet_vehicles_color_check"')
    for (const color of VEHICLE_COLORS) expect(migrationSql).toContain(`'${color}'`)

    expect(rollbackSql).toMatch(/UPDATE "fleet_vehicles"[\s\S]*SET "color" = ''/i)
    for (const tone of ['azul_marinho', 'champanhe', 'creme', 'grafite', 'turquesa']) {
      expect(rollbackSql).toContain(`'${tone}'`)
    }
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  /**
   * Alargar a medida é o caminho fácil: todo bigint cabe em `numeric(12,2)`, e o `USING` só
   * acrescenta as duas casas zeradas. Quem perde é o rollback — a fração que o operador digitou
   * não tem onde morar num inteiro, e por isso ele arredonda de propósito, uma vez e sem volta.
   */
  test('widens tare and capacity to exact decimal with a rollback that rounds on purpose', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_vehicle_measure_decimal'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate|update)\b/im)
    for (const column of ['tare_weight_kg', 'capacity_kg', 'capacity_m3']) {
      expect(migrationSql).toContain(`ALTER COLUMN "${column}" SET DATA TYPE numeric(12,2)`)
      expect(rollbackSql).toContain(
        `ALTER COLUMN "${column}" SET DATA TYPE bigint USING round("${column}")::bigint`,
      )
    }

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  /**
   * Alargar CHECK é aditivo por natureza — nenhuma linha existente deixa de passar —, mas em SQL
   * exige derrubar e recriar a constraint. O que este teste guarda é que a derrubada é sempre
   * seguida da recriação do mesmo nome, e que os CHECK de CPF não vão de arrasto.
   */
  test('versions the alphanumeric tax id as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_tax_id_alphanumeric'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)

    for (const constraint of [
      'company_fiscal_profiles_cnpj_check',
      'company_fiscal_profiles_mdfe_insurer_tax_id_check',
      'digital_certificates_validated_cnpj_check',
      'fleet_drivers_linked_tax_id_check',
      'fleet_vehicles_owner_tax_id_check',
      'cte_emission_profile_matchers_tax_id_check',
      'billing_invoices_customer_document_check',
      'nfse_provider_credentials_tax_id_check',
      'nfse_service_invoices_taker_tax_id_check',
      'mdfe_manifests_contractor_tax_id_check',
      'nfe_documents_access_key_check',
      'nfe_events_access_key_check',
      'nfe_import_items_access_key_check',
      'cte_fiscal_documents_access_key_check',
      'billing_invoice_items_cte_access_key_check',
      'mdfe_fiscal_documents_access_key_check',
      'mdfe_manifest_items_access_key_check',
    ]) {
      expect(migrationSql).toContain(`DROP CONSTRAINT "${constraint}"`)
      expect(migrationSql).toContain(`ADD CONSTRAINT "${constraint}"`)
    }

    expect(migrationSql).toContain('^[A-Z0-9]{12}[0-9]{2}$')
    expect(migrationSql).toContain('^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$')
    expect(migrationSql).toContain('^[A-Z0-9]{8}$')

    for (const untouched of [
      'fleet_drivers_tax_id_check',
      'fleet_drivers_license_number_check',
      'trip_drivers_tax_id_check',
      'mdfe_manifest_drivers_tax_id_check',
    ]) {
      expect(migrationSql).not.toContain(untouched)
    }

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toContain(`~ '^[0-9]{14}$'`)
    expect(rollbackSql).toContain(`~ '^[0-9]{44}$'`)
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  /**
   * A única migration destrutiva do repositório, e ela é destrutiva de propósito: o R$/km passou a
   * ser derivado, e manter a coluna deixaria dois números disputando qual é o custo. O que este
   * teste guarda é o recorte — um `drop column`, nomeado, e nenhuma tabela ou índice de arrasto.
   */
  test('drops the stored cost per kilometer as the single destructive step, with the column recreated on rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fuel_price_reference'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).toContain('DROP COLUMN "cost_per_kilometer"')
    expect(migrationSql.match(/\bDROP COLUMN\b/gi)).toHaveLength(1)
    expect(migrationSql).not.toMatch(/\bdrop\s+(table|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)

    expect(migrationSql).toContain('CREATE TABLE "fuel_price_references"')
    expect(migrationSql).toContain('CREATE TABLE "company_fuel_prices"')
    expect(migrationSql).toContain('ADD COLUMN "fuel_type"')
    expect(migrationSql).toContain('ADD COLUMN "other_costs_per_kilometer"')

    // A coluna volta vazia: o valor antigo era digitado, e recuperá-lo seria inventar dinheiro
    expect(rollbackSql).toContain('ADD COLUMN "cost_per_kilometer"')
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

  /**
   * A tabela de frete é cadastro da empresa, e o pagamento ao motorista é custo: as quatro tabelas
   * nascem com `company_id` e a classe do veículo nasce preenchida pelo rodado onde as duas tabelas
   * coincidem — deixar a frota inteira em branco obrigaria a redigitar veículo por veículo.
   */
  test('versions the freight regions and the vehicle freight class as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) =>
      name.endsWith('_freight_regions_and_vehicle_freight_class'),
    )
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)
    for (const table of [
      'freight_regions',
      'freight_region_cities',
      'freight_region_driver_rates',
      'fleet_driver_regions',
    ]) {
      expect(migrationSql).toContain(`CREATE TABLE "${table}"`)
      expect(migrationSql).toContain(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_company_id_companies_id_fk"`,
      )
    }
    // Chave natural da importação: reimportar a tabela do cliente atualiza, nunca duplica rota
    expect(migrationSql).toContain('CONSTRAINT "freight_regions_company_id_code_unique"')
    // ⚠️ BARRINHA/SP está em duas rotas com preços diferentes — cidade única por empresa recusaria
    expect(migrationSql).toContain(
      'CONSTRAINT "freight_region_cities_region_city_unique" UNIQUE("company_id","region_id","city","state")',
    )
    expect(migrationSql).toContain(
      'ALTER TABLE "fleet_vehicles" ADD COLUMN "freight_class" varchar(20)',
    )
    expect(migrationSql).toContain('fleet_vehicles_freight_class_check')
    // Cavalo mecânico e "Outros" ficam em branco: é onde VUC e 3/4 se escondem, e chutar põe preço errado
    expect(migrationSql).toMatch(
      /UPDATE "fleet_vehicles" SET "freight_class" = CASE "wheel_type"[\s\S]*WHEN '01' THEN 'truck'[\s\S]*WHEN '02' THEN 'toco'[\s\S]*WHEN '04' THEN 'van'[\s\S]*WHEN '05' THEN 'utility'[\s\S]*ELSE ''[\s\S]*END;/,
    )

    // O caminho de volta derruba o filho antes do pai — sem CASCADE, que arrastaria o que não é dele
    const dropOrder = [
      'fleet_driver_regions',
      'freight_region_cities',
      'freight_region_driver_rates',
      'freight_regions',
    ].map((table) => rollbackSql.indexOf(`DROP TABLE IF EXISTS "${table}"`))
    for (const position of dropOrder) {
      expect(position).toBeGreaterThan(0)
    }
    expect(dropOrder.indexOf(Math.max(...dropOrder))).toBe(dropOrder.length - 1)
    expect(rollbackSql).toContain(
      'ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "freight_class"',
    )
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  /**
   * Aqui a migration é destrutiva de propósito — as duas colunas viram uma —, e o que salva o dado é
   * a ordem: o drizzle gera o `ADD` e os dois `DROP` colados, sem backfill nenhum entre eles.
   */
  test('versions the vehicle type merge with the backfill ahead of both drops', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_vehicle_type'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).toContain(
      'ALTER TABLE "fleet_vehicles" ADD COLUMN "vehicle_type" varchar(20)',
    )
    // A classe digitada à mão vence o rodado sugerido: é ela que diz VUC e 3/4, que o rodado não nomeia
    expect(migrationSql).toMatch(
      /UPDATE "fleet_vehicles" SET "vehicle_type" = CASE[\s\S]*WHEN length\("freight_class"\) > 0 THEN "freight_class"[\s\S]*WHEN "wheel_type" = '01' THEN 'truck'[\s\S]*WHEN "wheel_type" = '06' THEN 'other'[\s\S]*ELSE ''[\s\S]*END;/,
    )
    const backfillPosition = migrationSql.indexOf('UPDATE "fleet_vehicles" SET "vehicle_type"')
    for (const column of ['wheel_type', 'freight_class']) {
      const dropPosition = migrationSql.indexOf(
        `ALTER TABLE "fleet_vehicles" DROP COLUMN "${column}"`,
      )
      expect(dropPosition).toBeGreaterThan(backfillPosition)
    }
    expect(migrationSql).toContain('CONSTRAINT "fleet_vehicles_vehicle_type_check"')
    expect(migrationSql).toContain("'motorcycle'")
    expect(migrationSql).toContain("'car'")

    // Volta recuperável: o rodado e a classe se reconstroem do tipo, e o CHECK antigo volta com eles
    expect(rollbackSql).toContain('ADD COLUMN IF NOT EXISTS "wheel_type"')
    expect(rollbackSql).toContain('ADD COLUMN IF NOT EXISTS "freight_class"')
    expect(rollbackSql).toContain('CONSTRAINT "fleet_vehicles_wheel_type_check"')
    expect(rollbackSql).toContain('CONSTRAINT "fleet_vehicles_freight_class_check"')
    expect(rollbackSql).toContain('DROP COLUMN IF EXISTS "vehicle_type"')
    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions the driver contact and ANTT fields as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_driver_antt_contact'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    for (const column of ['linked_legal_name', 'email', 'rntrc', 'antt_category']) {
      expect(migrationSql).toContain(`ADD COLUMN "${column}"`)
      expect(migrationSql).toContain(`"fleet_drivers_${column}_check"`)
    }
    // A razão social pende do CNPJ, e não o contrário: ficha antiga tem CNPJ e nunca teve razão social
    expect(migrationSql).toContain('length("linked_legal_name") = 0 or length("linked_tax_id") > 0')
    // Mesma forma do RNTRC do proprietário do veículo, para o `~` e o Zod não divergirem
    expect(migrationSql).toContain('"rntrc" ~ \'^0?[0-9]{8}$\'')

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })
  test('versions the CNH category as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_driver_license_category'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain('ADD COLUMN "license_category"')
    expect(migrationSql).toContain('"fleet_drivers_license_category_check"')
    // Ficha cadastrada antes deste campo não tem categoria, e ninguém a inventa numa migration
    expect(migrationSql).toContain('length("license_category") = 0')

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })
  test('versions the first-licence date as an additive migration with a guarded rollback', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_driver_first_license'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain('ADD COLUMN "first_license_at"')
    // O CHECK das datas é refeito na mesma instrução que o derruba: a tabela nunca fica sem piso
    expect(migrationSql).toContain(
      'DROP CONSTRAINT "fleet_drivers_dates_check", ADD CONSTRAINT "fleet_drivers_dates_check"',
    )
    expect(migrationSql).toContain('"first_license_at" >= date \'1900-01-01\'')

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    // O rollback devolve o CHECK às duas datas que ele cobria — largar a tabela sem ele é pior
    expect(rollbackSql).toContain('ADD CONSTRAINT "fleet_drivers_dates_check"')
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('versions one postal code index per address origin, partial where the column admits empty', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_addresses_postal_code_index'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    // Nenhuma origem tinha índice por CEP: a consulta da sugestão nasceria varrendo a tabela toda
    for (const indexName of POSTAL_CODE_INDEX_NAMES) {
      expect(migrationSql).toContain(`CREATE INDEX "${indexName}"`)
      expect(rollbackSql).toContain(`DROP INDEX IF EXISTS "${indexName}"`)
    }
    // O `where` não é otimização: a coluna admite vazio, e CEP vazio não é endereço de ninguém
    expect(migrationSql).toContain(
      'ON "fleet_drivers" ("company_id","postal_code") WHERE length("postal_code") > 0',
    )
    expect(migrationSql).toContain(
      'ON "mdfe_manifests" ("company_id","loading_postal_code") WHERE length("loading_postal_code") > 0',
    )
    expect(migrationSql).toContain(
      'ON "mdfe_manifests" ("company_id","discharge_postal_code") WHERE length("discharge_postal_code") > 0',
    )
    // `nfe_addresses` admite nulo em vez de vazio, e a coluna do perfil fiscal não admite nenhum dos dois
    expect(migrationSql).toContain(
      'ON "nfe_addresses" ("company_id","postal_code") WHERE "postal_code" is not null',
    )
    expect(migrationSql).toMatch(
      /ON "company_fiscal_profiles" \("company_id","postal_code"\);\s*(--|$)/,
    )

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  /**
   * O elétrico entra nos três CHECKs de uma vez. Deixar um de fora deixaria o operador escolher o
   * produto no veículo e ser recusado pelo banco ao gravar o preço dele, com a mesma tela.
   */
  test('teaches the three fuel checks the energy, each rebuilt in the statement that drops it', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fuel_catalog_energy'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    for (const [table, constraint] of [
      ['fleet_vehicles', 'fleet_vehicles_fuel_type_check'],
      ['fuel_price_references', 'fuel_price_references_product_check'],
      ['company_fuel_prices', 'company_fuel_prices_product_check'],
    ]) {
      // O CHECK é refeito na mesma instrução que o derruba: a tabela nunca fica sem catálogo
      expect(migrationSql).toContain(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}", ADD CONSTRAINT "${constraint}"`,
      )
      expect(rollbackSql).toContain(`ADD CONSTRAINT "${constraint}"`)
    }
    expect(migrationSql.match(/'eletrico'/g)).toHaveLength(3)
    // O caminho de volta é o catálogo de cinco produtos da ANP, e nenhum deles é energia
    expect(rollbackSql.match(/'eletrico'/g)).toBeNull()
    expect(rollbackSql.match(/'gnv'/g)).toHaveLength(3)

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  /**
   * O segundo tanque é aditivo: o `ADD COLUMN` com default deixa toda ficha já gravada com um
   * combustível só, que é o que ela sempre disse. Só o custo é refeito, e na instrução que o derruba.
   */
  test('adds the second tank without touching the fleet already registered', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_fleet_vehicle_secondary_fuel'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|index|sequence|type|view)\b/i)
    expect(migrationSql).not.toMatch(/^\s*(delete|truncate)\b/im)
    expect(migrationSql).toContain(
      `ALTER TABLE "fleet_vehicles" ADD COLUMN "secondary_fuel_type" varchar(20) DEFAULT '' NOT NULL`,
    )
    expect(migrationSql).toContain(
      `ALTER TABLE "fleet_vehicles" ADD COLUMN "secondary_average_consumption" numeric(6,2) DEFAULT '0' NOT NULL`,
    )
    // As duas metades do CHECK: consumo órfão de um lado, produto repetido do outro
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "fleet_vehicles_secondary_fuel_check" CHECK (case when length("secondary_fuel_type") = 0 then "secondary_average_consumption" = 0',
    )
    expect(migrationSql).toContain('"secondary_fuel_type" <> "fuel_type"')
    expect(migrationSql).toContain(
      'ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_cost_check", ADD CONSTRAINT "fleet_vehicles_cost_check"',
    )

    // O custo volta a nomear cinco campos antes de a coluna sair; sair pela coluna levaria o CHECK inteiro
    const restoredCostCheck = rollbackSql.indexOf('ADD CONSTRAINT "fleet_vehicles_cost_check"')
    const droppedColumn = rollbackSql.indexOf(
      'DROP COLUMN IF EXISTS "secondary_average_consumption"',
    )
    expect(restoredCostCheck).toBeGreaterThan(0)
    expect(droppedColumn).toBeGreaterThan(restoredCostCheck)
    expect(rollbackSql).not.toContain('"secondary_average_consumption" >= 0')
    expect(rollbackSql).toContain('DROP COLUMN IF EXISTS "secondary_fuel_type"')

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })
  /**
   * A tarifa é pública e a escolha é da empresa: duas tabelas na mesma migration, uma sem
   * `company_id` de propósito e a outra ancorada no tenant. O rollback derruba as duas na ordem
   * inversa — a escolha antes da referência, para nenhuma linha ficar apontando para o vazio.
   */
  test('creates the public tariff beside the choice that is the company own', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_energy_tariff_reference'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)
    expect(migrationSql).toContain('CREATE TABLE "energy_tariff_references"')
    expect(migrationSql).toContain('CREATE TABLE "company_energy_settings"')
    expect(migrationSql).toContain('"tusd_per_megawatt_hour" numeric(19,4) NOT NULL')
    expect(migrationSql).toContain('"te_per_megawatt_hour" numeric(19,4) NOT NULL')
    expect(migrationSql).toContain(`"adjustment_factor" numeric(6,4) DEFAULT '1.0000' NOT NULL`)
    expect(migrationSql).toContain('"energy_tariff_references_natural_unique"')
    // A referência pública não alcança empresa nenhuma; só a escolha tem a chave estrangeira
    expect(migrationSql).toContain(
      'ALTER TABLE "company_energy_settings" ADD CONSTRAINT "company_energy_settings_company_id_companies_id_fkey"',
    )
    expect(migrationSql).not.toContain('"energy_tariff_references_company_id"')

    const droppedSettings = rollbackSql.indexOf('DROP TABLE IF EXISTS "company_energy_settings"')
    const droppedReferences = rollbackSql.indexOf('DROP TABLE IF EXISTS "energy_tariff_references"')
    expect(droppedSettings).toBeGreaterThan(0)
    expect(droppedReferences).toBeGreaterThan(droppedSettings)

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })
  /**
   * O relógio das rotinas passa a viver no banco: a cadência é da instalação (por isso `job_schedules`
   * não tem `company_id`) e cada ciclo vira linha em `job_executions`. O índice parcial é o que
   * sustenta o `409` do botão — no máximo uma execução aberta por rotina —, e é o lease, não o
   * índice, que decide se a aberta ainda está viva: `now()` não é imutável e não entra em predicado.
   */
  test('versions the routine clock without lending it to a tenant', async () => {
    const directories = await listMigrationDirectories()
    const directory = directories.find((name) => name.endsWith('_job_schedule_registry'))
    expect(directory).toBeString()

    const migrationSql = await readMigrationFile(directory ?? '', 'migration.sql')
    const rollbackSql = await readMigrationFile(directory ?? '', 'rollback.sql')
    const migrationHash = createHash('sha256').update(migrationSql).digest('hex')

    expect(migrationSql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)
    expect(migrationSql).toContain('CREATE TABLE "job_schedules"')
    expect(migrationSql).toContain('CREATE TABLE "job_executions"')
    expect(migrationSql).not.toMatch(/\bCREATE TYPE\b/i)

    // A cadência é do ambiente: uma empresa não muda o relógio das outras porque não o alcança
    const scheduleTable = migrationSql.slice(
      migrationSql.indexOf('CREATE TABLE "job_schedules"'),
      migrationSql.indexOf(');', migrationSql.indexOf('CREATE TABLE "job_schedules"')),
    )
    expect(scheduleTable).not.toContain('"company_id"')
    expect(scheduleTable).toContain('"interval_seconds" integer NOT NULL')
    expect(scheduleTable).toContain('"next_run_at" timestamp with time zone NOT NULL')
    // Pausa que não diz desde quando e por quem é rotina que morre calada
    expect(scheduleTable).toContain(
      'CHECK ("enabled" = ("paused_at" is null) and ("paused_at" is null) = ("paused_by" is null))',
    )

    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "job_executions_open_unique" ON "job_executions" ("job") WHERE "finished_at" is null',
    )
    // Execução encerrada não segura lease; é assim que a varredura de abandono destrava a rotina
    expect(migrationSql).toContain('CHECK ("finished_at" is null or "lease_expires_at" is null)')
    expect(migrationSql).toContain(
      'ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_company_id_companies_id_fkey"',
    )

    // As quatro rotinas nascem com o intervalo que os quatro `railway.json` declaram hoje
    expect(migrationSql).toContain('INSERT INTO "job_schedules"')
    for (const [job, intervalSeconds] of [
      ['nfe.distribution.pull', 900],
      ['fuel.price.pull', 604800],
      ['nfse.status.pull', 300],
      ['notification.schedules.run', 3600],
    ] as const) {
      expect(migrationSql).toContain(`('${job}', ${intervalSeconds}`)
    }

    const droppedExecutions = rollbackSql.indexOf('DROP TABLE IF EXISTS "job_executions"')
    const droppedSchedules = rollbackSql.indexOf('DROP TABLE IF EXISTS "job_schedules"')
    expect(droppedExecutions).toBeGreaterThan(0)
    expect(droppedSchedules).toBeGreaterThan(droppedExecutions)

    expect(rollbackSql).toContain(`"name" = '${directory}'`)
    expect(rollbackSql).toContain(`"hash" = '${migrationHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).toMatch(/^--[\s\S]*\bBEGIN;/)
    expect(rollbackSql.trimEnd()).toEndWith('COMMIT;')
    expect(rollbackSql).not.toContain('CASCADE')
  })
})
