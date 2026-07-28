import { describe, expect, test } from 'bun:test'

import {
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  indexColumnsByName,
  readFiscalMigrationSql,
  requiredColumnNames,
} from './support.js'
import { auditLogs } from './tables.js'

describe('tenant fiscal schema', () => {
  test('defines tenant-scoped audit data without secret-shaped fields', () => {
    expect(columnNames(auditLogs)).toEqual([
      'id',
      'company_id',
      'actor_user_id',
      'action',
      'entity_type',
      'entity_id',
      'permission',
      'target_type',
      'target_id',
      'result',
      'correlation_id',
      'reason',
      'metadata',
      'before_snapshot',
      'after_snapshot',
      'created_at',
    ])
    expect(requiredColumnNames(auditLogs)).toEqual([
      'id',
      'company_id',
      'actor_user_id',
      'action',
      'entity_type',
      'entity_id',
      'permission',
      'target_type',
      'target_id',
      'result',
      'correlation_id',
      'metadata',
      'created_at',
    ])
    expect(columnSqlTypes(auditLogs)).toEqual({
      id: 'uuid',
      company_id: 'uuid',
      actor_user_id: 'uuid',
      action: 'text',
      entity_type: 'text',
      entity_id: 'uuid',
      permission: 'text',
      target_type: 'text',
      target_id: 'uuid',
      result: 'text',
      correlation_id: 'text',
      reason: 'text',
      metadata: 'jsonb',
      before_snapshot: 'jsonb',
      after_snapshot: 'jsonb',
      created_at: 'timestamp with time zone',
    })
    expectGeneratedUuidPrimaryKey(auditLogs)
    expect(indexColumnsByName(auditLogs)).toMatchObject({
      audit_logs_company_id_created_at_id_idx: ['company_id', 'created_at', 'id'],
    })
  })

  test('rejects updates and deletes from the audit log in the database', async () => {
    const fiscalMigrationSql = await readFiscalMigrationSql()

    expect(fiscalMigrationSql).toMatch(
      /create(?: or replace)? function\s+"?reject_audit_logs_mutation"?\s*\(\)/i,
    )
    expect(fiscalMigrationSql).toMatch(/raise\s+exception/i)
    expect(fiscalMigrationSql).toMatch(
      /create trigger\s+"?audit_logs_append_only_trigger"?[\s\S]*before\s+update\s+or\s+delete\s+on\s+"?audit_logs"?[\s\S]*execute function\s+"?reject_audit_logs_mutation"?\s*\(\)/i,
    )
  })
})
