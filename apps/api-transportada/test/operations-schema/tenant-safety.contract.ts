import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { jobExecutions, jobSchedules } from '../../src/database/database.schema.js'
import { columnNames, foreignKeys } from '../fiscal-schema/support.js'
import { OPERATIONS_SCHEMA_EXPORT_NAMES, requireSchemaTable } from './tables.js'

const FORBIDDEN_OPERATIONAL_PAYLOAD_COLUMNS = [
  'xml',
  'xml_payload',
  'xml_content',
  'storage_key',
  'certificate_password',
  'certificate_base64',
  'private_key',
  'token',
] as const

describe('operations schema tenant safety', () => {
  test('requires company ownership and restrictive company relationship on every table', () => {
    for (const exportName of OPERATIONS_SCHEMA_EXPORT_NAMES) {
      const table = requireSchemaTable(exportName)
      const tableName = getTableConfig(table).name
      const companyId = getTableConfig(table).columns.find((column) => column.name === 'company_id')

      expect(companyId?.getSQLType()).toBe('uuid')
      expect(companyId?.notNull).toBeTrue()
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: `${tableName}_company_id_companies_id_fk`,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
  })

  test('excludes raw XML, object storage keys, certificates, and tokens', () => {
    const tables = OPERATIONS_SCHEMA_EXPORT_NAMES.map(requireSchemaTable)
    const allColumnNames = tables.flatMap((table) => columnNames(table))

    for (const forbiddenColumnName of FORBIDDEN_OPERATIONAL_PAYLOAD_COLUMNS) {
      expect(allColumnNames).not.toContain(forbiddenColumnName)
    }
  })
  /**
   * A cadência das rotinas é da instalação, como o `cronSchedule` que ela substitui: `job_schedules`
   * não tem `company_id` de propósito, e a ausência é assertada aqui para não passar por
   * esquecimento — com ela, uma empresa mudaria o relógio das outras sem saber.
   */
  test('keeps the routine clock tenant-less on purpose, and unable to reach a company', () => {
    expect(columnNames(jobSchedules)).not.toContain('company_id')
    // `paused_by` alcança o usuário da instalação, nunca uma empresa — a pausa é do ambiente
    expect(foreignKeys(jobSchedules).map((foreignKey) => foreignKey.foreignTable)).not.toContain(
      'companies',
    )
  })

  /**
   * A execução é o contrário: o ciclo agendado não tem dono, mas a corrida manual registra quem
   * pediu — e quem pediu tem de ser membro da empresa que pediu, senão o botão vira caminho de
   * gravar ator de outro tenant. `company_id` é anulável, e o par é conferido pela chave composta.
   */
  test('anchors the manual run to the company of whoever asked for it', () => {
    const companyId = columnNames(jobExecutions).includes('company_id')
    expect(companyId).toBeTrue()
    expect(foreignKeys(jobExecutions)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'job_executions_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(jobExecutions)).toContainEqual({
      columns: ['requested_by', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'job_executions_requester_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
