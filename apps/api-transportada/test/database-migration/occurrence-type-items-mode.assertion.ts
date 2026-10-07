/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 CA01 e CA09: a migration de `items_mode` roda contra tipos gravados **antes** dela. A
 * segunda via do boleto, com o nome exato do catálogo, etapa `delivery` e fluxo `document`, sai
 * `off` + `unset` — inclusive a que o operador tinha posto em `blocked`, senão a CHECK da forma
 * recusaria a linha e a migration falharia. Todo o resto fica `optional`, com a política intocada.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME } from '../../src/shared/occurrence-type-catalog.constant.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_items_mode'
const SHAPE_CHECK = 'company_occurrence_types_items_off_shape_check'
const VOCABULARY_CHECK = 'company_occurrence_types_items_mode_check'

export type OccurrenceTypeItemsModeProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

type SeededType = Readonly<{
  id: string
  companyId: string
  name: string
  stage: string
  flow: string
  redeliveryPolicy: string
  stopKind: string | null
}>

type StoredType = Readonly<{ items_mode: string; redelivery_policy: string }>

/**
 * O nome é único por empresa (`company_occurrence_types_company_name_unique`), então cada variante
 * da segunda via mora numa empresa própria — como em instalações diferentes.
 */
function buildSeededTypes(companyId: string): readonly SeededType[] {
  const seed = (fields: Omit<SeededType, 'id' | 'companyId'>, ownCompany = true): SeededType => ({
    id: crypto.randomUUID(),
    companyId: ownCompany ? crypto.randomUUID() : companyId,
    ...fields,
  })

  return [
    seed({
      name: SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME,
      stage: 'delivery',
      flow: 'document',
      redeliveryPolicy: 'unset',
      stopKind: null,
    }),
    seed({
      name: SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME,
      stage: 'delivery',
      flow: 'document',
      redeliveryPolicy: 'blocked',
      stopKind: null,
    }),
    seed(
      {
        name: 'Recusa total',
        stage: 'delivery',
        flow: 'document',
        redeliveryPolicy: 'blocked',
        stopKind: null,
      },
      false,
    ),
    seed({
      name: SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME,
      stage: 'separation',
      flow: 'document',
      redeliveryPolicy: 'allowed',
      stopKind: null,
    }),
    seed({
      name: SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME,
      stage: 'delivery',
      flow: 'stop',
      redeliveryPolicy: 'allowed',
      stopKind: 'other',
    }),
    seed(
      {
        name: 'Cliente pediu segunda via do boleto (renomeado)',
        stage: 'delivery',
        flow: 'document',
        redeliveryPolicy: 'blocked',
        stopKind: null,
      },
      false,
    ),
  ]
}

async function readStoredType(database: SQL, id: string): Promise<StoredType> {
  const [row] = (await database`
    select items_mode, redelivery_policy from company_occurrence_types where id = ${id}
  `) as StoredType[]
  if (row === undefined) throw new Error(`Seeded occurrence type ${id} vanished`)
  return row
}

async function assertBackfill(database: SQL, seeded: readonly SeededType[]): Promise<void> {
  const [secondCopyUnset, secondCopyBlocked, ...untouched] = seeded
  if (secondCopyUnset === undefined || secondCopyBlocked === undefined) {
    throw new Error('Second copy seeds are required')
  }

  expect(await readStoredType(database, secondCopyUnset.id)).toEqual({
    items_mode: 'off',
    redelivery_policy: 'unset',
  })
  expect(await readStoredType(database, secondCopyBlocked.id)).toEqual({
    items_mode: 'off',
    redelivery_policy: 'unset',
  })
  expect(untouched).toHaveLength(4)
  for (const type of untouched) {
    expect(await readStoredType(database, type.id)).toEqual({
      items_mode: 'optional',
      redelivery_policy: type.redeliveryPolicy,
    })
  }
}

async function assertShapeCheck(
  database: SQL,
  companyId: string,
  secondCopyId: string,
): Promise<void> {
  await expectQueryToFail(
    database`
      insert into company_occurrence_types (company_id, name, stage, items_mode, redelivery_policy)
      values (${companyId}, 'Prova off + blocked', 'delivery', 'off', 'blocked')
    `,
    '23514',
    SHAPE_CHECK,
  )
  await expectQueryToFail(
    database`
      update company_occurrence_types set redelivery_policy = 'allowed' where id = ${secondCopyId}
    `,
    '23514',
    SHAPE_CHECK,
  )
  await expectQueryToFail(
    database`
      insert into company_occurrence_types (company_id, name, stage, items_mode)
      values (${companyId}, 'Prova vocabulário', 'delivery', 'always')
    `,
    '23514',
    VOCABULARY_CHECK,
  )
}

export async function assertOccurrenceTypeItemsModeBackfill(
  probe: OccurrenceTypeItemsModeProbe,
): Promise<void> {
  const { companyId, connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_type_items_mode migration is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  // Desfaz só esta migration: `items_mode` e as duas CHECKs somem, como antes de ela existir.
  await database.unsafe(rollback)

  const seeded = buildSeededTypes(companyId)
  const ownCompanyIds = seeded
    .map((type) => type.companyId)
    .filter((seededCompanyId) => seededCompanyId !== companyId)
  for (const ownCompanyId of ownCompanyIds) {
    await database`insert into companies (id, status) values (${ownCompanyId}, 'active')`
  }
  for (const type of seeded) {
    await database`
      insert into company_occurrence_types
        (id, company_id, name, stage, flow, redelivery_policy, stop_kind)
      values (${type.id}, ${type.companyId}, ${type.name}, ${type.stage}, ${type.flow},
        ${type.redeliveryPolicy}, ${type.stopKind})
    `
  }

  await runDatabaseMigrations({ connectionString })

  await assertBackfill(database, seeded)
  await assertShapeCheck(database, companyId, seeded[0]?.id ?? '')

  const seededIds = seeded.map((type) => type.id)
  await database`delete from company_occurrence_types where id in ${database(seededIds)}`
  await database`delete from companies where id in ${database(ownCompanyIds)}`
}
