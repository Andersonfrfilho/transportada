/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const OUTPUT_DOCUMENT_MIGRATION_SUFFIX = '_cte_profile_output_document'
const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'

export type CteProfileOutputProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
  fixture: IdentityFixture
}>

/**
 * Spec 144 T009. Duas provas que só um banco de verdade dá: a linha gravada antes da migration
 * atravessa intacta (padrão `cte`, ponteiro nulo), e a FK composta recusa perfil NFS-e de outra
 * empresa — o `company_id` do perfil de CT-e escolhe a empresa do perfil apontado.
 */
export async function assertCteProfileOutputConstraints(
  probe: CteProfileOutputProbe,
): Promise<void> {
  const { database, fixture } = probe
  const directory = probe.directories.find((name) =>
    name.endsWith(OUTPUT_DOCUMENT_MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('CT-e profile output document migration is required')

  const otherCompanyId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${otherCompanyId}, 'active')`
  await database`
    insert into user_company_memberships (id, user_id, company_id, status)
    values (${crypto.randomUUID()}, ${fixture.userId}, ${otherCompanyId}, 'active')
  `
  const ownRuleId = await insertFreightRule(database, fixture.companyId, fixture.userId)
  const otherRuleId = await insertFreightRule(database, otherCompanyId, fixture.userId)

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
  const profileId = crypto.randomUUID()
  await database`
    insert into cte_emission_profiles (
      id, company_id, name, match_mode, grouping_mode, freight_rule_id, taker, cfop_internal,
      cfop_interstate, operation_nature, charge_component_label, icms_cst, municipal_service_policy,
      created_by_user_id
    ) values (
      ${profileId}, ${fixture.companyId}, 'Perfil anterior', 'sender_tax_id', 'per_invoice',
      ${ownRuleId}, '3', '5353', '6353', 'PRESTACAO DE SERVICO', 'Frete', '00', 'block',
      ${fixture.userId}
    )
  `
  const [before] = await database<Array<{ readonly row: Record<string, unknown> }>>`
    select to_jsonb(profile) as row from cte_emission_profiles profile where id = ${profileId}
  `

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  const [after] = await database<
    Array<{
      readonly nfse_emission_profile_id: string | null
      readonly output_document: string
      readonly row: Record<string, unknown>
    }>
  >`
    select output_document, nfse_emission_profile_id,
      to_jsonb(profile) - 'output_document' - 'nfse_emission_profile_id' as row
    from cte_emission_profiles profile where id = ${profileId}
  `
  expect(after?.output_document).toBe('cte')
  expect(after?.nfse_emission_profile_id).toBeNull()
  expect(after?.row).toEqual(before?.row ?? {})

  const ownNfseProfileId = await insertNfseProfile(database, {
    companyId: fixture.companyId,
    freightRuleId: ownRuleId,
    userId: fixture.userId,
  })
  const otherNfseProfileId = await insertNfseProfile(database, {
    companyId: otherCompanyId,
    freightRuleId: otherRuleId,
    userId: fixture.userId,
  })

  await expectQueryToFail(
    database`update cte_emission_profiles set output_document = 'nfse' where id = ${profileId}`,
    CHECK_VIOLATION,
    'cte_emission_profiles_nfse_profile_check',
  )
  await expectQueryToFail(
    database`update cte_emission_profiles set nfse_emission_profile_id = ${ownNfseProfileId} where id = ${profileId}`,
    CHECK_VIOLATION,
    'cte_emission_profiles_nfse_profile_check',
  )
  await expectQueryToFail(
    database`update cte_emission_profiles set output_document = 'mdfe' where id = ${profileId}`,
    CHECK_VIOLATION,
    'cte_emission_profiles_output_document_check',
  )
  await expectQueryToFail(
    database`
      update cte_emission_profiles
      set output_document = 'nfse', nfse_emission_profile_id = ${ownNfseProfileId}
      where id = ${profileId}
    `,
    CHECK_VIOLATION,
    'cte_emission_profiles_output_municipal_check',
  )
  await expectQueryToFail(
    database`
      update cte_emission_profiles
      set output_document = 'nfse', nfse_emission_profile_id = ${otherNfseProfileId},
        municipal_service_policy = 'allow'
      where id = ${profileId}
    `,
    FOREIGN_KEY_VIOLATION,
    'cte_emission_profiles_company_nfse_profile_fk',
  )

  await database`
    update cte_emission_profiles
    set output_document = 'nfse', nfse_emission_profile_id = ${ownNfseProfileId},
      municipal_service_policy = 'allow'
    where id = ${profileId}
  `
  await expectQueryToFail(
    database`delete from nfse_emission_profiles where id = ${ownNfseProfileId}`,
    FOREIGN_KEY_VIOLATION,
    'cte_emission_profiles_company_nfse_profile_fk',
  )

  await database`delete from cte_emission_profiles where id = ${profileId}`
  await database`delete from nfse_emission_profiles where id in (${ownNfseProfileId}, ${otherNfseProfileId})`
  await database`delete from freight_rules where id in (${ownRuleId}, ${otherRuleId})`
}

async function insertFreightRule(
  database: SQL,
  companyId: string,
  userId: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await database`
    insert into freight_rules (
      id, company_id, name, description, type, status, priority, current_version, created_by_user_id
    ) values (
      ${id}, ${companyId}, ${`Regra ${id}`}, '', 'percentage_of_invoice_total', 'active', 1, 1,
      ${userId}
    )
  `
  return id
}

async function insertNfseProfile(
  database: SQL,
  input: Readonly<{ companyId: string; freightRuleId: string; userId: string }>,
): Promise<string> {
  const id = crypto.randomUUID()
  await database`
    insert into nfse_emission_profiles (
      id, company_id, name, status, freight_rule_id, taker, charge_component_label,
      municipality_ibge_code, municipality_name, cnae_code, service_list_item,
      description_template, created_by_user_id
    ) values (
      ${id}, ${input.companyId}, ${`Perfil NFS-e ${id}`}, 'active', ${input.freightRuleId}, '3',
      'Frete', '3543402', 'Ribeirão Preto', '4930202', '1602', 'Transporte {{periodo}}',
      ${input.userId}
    )
  `
  return id
}
