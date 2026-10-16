/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: `--reset` removes only what the seeder created. The roots are found by marker (name prefix,
 * bucket, import key) and everything that depends on them is deleted by walking the foreign keys
 * downwards, so a table added later is still reached. Append-only triggers are switched off inside the
 * transaction (the reply events refuse DELETE) and back on before it commits; nothing outside this
 * company's marked rows is touched.
 */
import type { SQL } from 'bun'

import { AUTOMATIC_OCCURRENCE_MAIL_KEY_PREFIX } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import {
  SCENARIO_BUCKET,
  SCENARIO_IMPORT_KEY_PREFIX,
  SCENARIO_PREFIX,
} from './scenario.constant.js'

type ForeignKey = {
  readonly childColumns: readonly string[]
  readonly childTable: string
  readonly deleteAction: string
  readonly parentColumns: readonly string[]
  readonly parentTable: string
}

type Root = { readonly predicate: string; readonly table: string }

const MAXIMUM_DEPTH = 12
const PREFIX_PATTERN = `${SCENARIO_PREFIX}%`
const SET_NULL_OR_DEFAULT = new Set(['n', 'd'])

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

async function loadForeignKeys(sql: SQL): Promise<Map<string, ForeignKey[]>> {
  const rows: {
    child_columns: string[]
    child_table: string
    delete_action: string
    parent_columns: string[]
    parent_table: string
  }[] = await sql`
    select c.conrelid::regclass::text as child_table,
           c.confrelid::regclass::text as parent_table,
           c.confdeltype::text as delete_action,
           (select array_agg(a.attname::text order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as child_columns,
           (select array_agg(a.attname::text order by k.ord)
              from unnest(c.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as parent_columns
      from pg_constraint c
     where c.contype = 'f'`
  const byParent = new Map<string, ForeignKey[]>()
  for (const row of rows) {
    const foreignKey: ForeignKey = {
      childColumns: row.child_columns,
      childTable: row.child_table,
      deleteAction: row.delete_action,
      parentColumns: row.parent_columns,
      parentTable: row.parent_table,
    }
    byParent.set(row.parent_table, [...(byParent.get(row.parent_table) ?? []), foreignKey])
  }
  return byParent
}

function columnList(columns: readonly string[]): string {
  return columns.map((column) => `"${column}"`).join(', ')
}

class DependentDeleter {
  private readonly visited = new Set<string>()
  public statementCount = 0

  public constructor(
    private readonly transaction: SQL,
    private readonly foreignKeys: ReadonlyMap<string, ForeignKey[]>,
  ) {}

  public async deleteWhere(
    table: string,
    predicate: string,
    path: readonly string[],
  ): Promise<void> {
    const key = `${table}|${predicate}`
    if (this.visited.has(key)) return
    this.visited.add(key)
    if (path.length > MAXIMUM_DEPTH) throw new Error(`RESET_TOO_DEEP: ${path.join(' > ')}`)

    for (const foreignKey of this.foreignKeys.get(table) ?? []) {
      if (SET_NULL_OR_DEFAULT.has(foreignKey.deleteAction)) continue
      if (foreignKey.childTable === table || path.includes(foreignKey.childTable)) continue
      const childPredicate = `(${columnList(foreignKey.childColumns)}) in (select ${columnList(foreignKey.parentColumns)} from ${table} where ${predicate})`
      await this.deleteWhere(foreignKey.childTable, childPredicate, [...path, table])
    }
    this.statementCount += 1
    await this.transaction.unsafe(`delete from ${table} where ${predicate}`)
  }
}

async function userTablesWithDeleteTriggers(sql: SQL): Promise<string[]> {
  const rows: { table_name: string }[] = await sql`
    select distinct tgrelid::regclass::text as table_name
      from pg_trigger
     where not tgisinternal and (tgtype & 8) = 8`
  return rows.map((row) => row.table_name)
}

function buildRoots(companyId: string, userIds: readonly string[]): Root[] {
  const company = quoteLiteral(companyId)
  const vehicles = `select id from fleet_vehicles where company_id = ${company} and model like ${quoteLiteral(PREFIX_PATTERN)}`
  const trips = `select id from trips where company_id = ${company} and vehicle_id in (${vehicles})`
  const occurrences = `select o.id from trip_document_occurrences o join trip_documents d on d.company_id = o.company_id and d.id = o.trip_document_id where o.company_id = ${company} and d.trip_id in (${trips})`
  const userList =
    userIds.length === 0
      ? 'select null::uuid'
      : userIds.map((id) => `${quoteLiteral(id)}::uuid`).join(', ')
  return [
    {
      predicate: `company_id = ${company} and idempotency_key in (select ${quoteLiteral(AUTOMATIC_OCCURRENCE_MAIL_KEY_PREFIX)} || id::text from (${occurrences}) as marked)`,
      table: 'idempotency_records',
    },
    {
      predicate: `company_id = ${company} and occurrence_id in (${occurrences})`,
      table: 'occurrence_conversations',
    },
    { predicate: `company_id = ${company} and id in (${trips})`, table: 'trips' },
    {
      predicate: `company_id = ${company} and idempotency_key like ${quoteLiteral(`${SCENARIO_IMPORT_KEY_PREFIX}%`)}`,
      table: 'nfe_imports',
    },
    {
      predicate: `company_id = ${company} and name like ${quoteLiteral(PREFIX_PATTERN)}`,
      table: 'company_occurrence_types',
    },
    {
      predicate: `company_id = ${company} and name like ${quoteLiteral(PREFIX_PATTERN)}`,
      table: 'contractor_mail_templates',
    },
    { predicate: `company_id = ${company} and id in (${vehicles})`, table: 'fleet_vehicles' },
    {
      predicate: `company_id = ${company} and name like ${quoteLiteral(PREFIX_PATTERN)}`,
      table: 'fleet_drivers',
    },
    {
      predicate: `company_id = ${company} and user_id in (${userList})`,
      table: 'user_company_memberships',
    },
    { predicate: `id in (${userList})`, table: 'identity_users' },
    {
      predicate: `company_id = ${company} and display_name like ${quoteLiteral(PREFIX_PATTERN)}`,
      table: 'contractors',
    },
    {
      predicate: `company_id = ${company} and bucket = ${quoteLiteral(SCENARIO_BUCKET)}`,
      table: 'stored_objects',
    },
    {
      predicate: `company_id = ${company} and sender_name like ${quoteLiteral(PREFIX_PATTERN)}`,
      table: 'contractor_mail_settings',
    },
  ]
}

/** The accounts of the seeded drivers, read before the drivers go away. */
async function findDriverUserIds(sql: SQL, companyId: string): Promise<string[]> {
  const rows: { user_id: string }[] = await sql`
    select m.user_id
      from fleet_drivers d
      join user_company_memberships m on m.company_id = d.company_id and m.id = d.membership_id
     where d.company_id = ${companyId} and d.name like ${PREFIX_PATTERN}`
  return rows.map((row) => row.user_id)
}

export async function resetScenarios(sql: SQL, companyId: string): Promise<number> {
  const foreignKeys = await loadForeignKeys(sql)
  const userIds = await findDriverUserIds(sql, companyId)
  const guardedTables = await userTablesWithDeleteTriggers(sql)
  let statementCount = 0
  await sql.begin(async (transaction) => {
    for (const table of guardedTables) {
      await transaction.unsafe(`alter table ${table} disable trigger user`)
    }
    const deleter = new DependentDeleter(transaction, foreignKeys)
    for (const root of buildRoots(companyId, userIds)) {
      await deleter.deleteWhere(root.table, root.predicate, [])
    }
    for (const table of guardedTables) {
      await transaction.unsafe(`alter table ${table} enable trigger user`)
    }
    statementCount = deleter.statementCount
  })
  return statementCount
}
