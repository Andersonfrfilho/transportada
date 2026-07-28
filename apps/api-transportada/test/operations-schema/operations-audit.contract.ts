import { describe, expect, test } from 'bun:test'

import {
  checkSqlByName,
  columnNames,
  expectGeneratedUuidPrimaryKey,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

describe('operations and audit schema', () => {
  test('defines processing jobs for operational status, retry, and dead-letter visibility', () => {
    const processingJobs = requireSchemaTable('processingJobs')

    const processingJobColumns = columnNames(processingJobs)
    for (const columnName of [
      'id',
      'company_id',
      'module',
      'entity_type',
      'entity_id',
      'status',
      'attempt_count',
      'next_attempt_at',
      'last_error_code',
      'last_error_message',
      'correlation_id',
      'metadata',
      'created_at',
      'updated_at',
    ]) {
      expect(processingJobColumns).toContain(columnName)
    }
    expectGeneratedUuidPrimaryKey(processingJobs)
    const requiredProcessingJobColumns = requiredColumnNames(processingJobs)
    for (const columnName of [
      'id',
      'company_id',
      'module',
      'entity_type',
      'entity_id',
      'status',
      'attempt_count',
      'correlation_id',
      'metadata',
      'created_at',
      'updated_at',
    ]) {
      expect(requiredProcessingJobColumns).toContain(columnName)
    }
    expect(indexColumnsByName(processingJobs)).toMatchObject({
      processing_jobs_company_status_next_attempt_idx: ['company_id', 'status', 'next_attempt_at'],
      processing_jobs_company_module_entity_idx: [
        'company_id',
        'module',
        'entity_type',
        'entity_id',
      ],
      processing_jobs_company_correlation_idx: ['company_id', 'correlation_id'],
    })
    expect(checkSqlByName(processingJobs)).toMatchObject({
      processing_jobs_status_check:
        "\"processing_jobs\".\"status\" in ('pending', 'processing', 'succeeded', 'retry_scheduled', 'failed', 'dead_letter', 'cancelled')",
      processing_jobs_attempt_count_check: '"processing_jobs"."attempt_count" >= 0',
      processing_jobs_module_check:
        "\"processing_jobs\".\"module\" in ('nfe', 'freight', 'cte_batch', 'cte_issuance', 'billing')",
      processing_jobs_safe_error_code_check:
        '"processing_jobs"."last_error_code" is null or length("processing_jobs"."last_error_code") between 1 and 80',
      processing_jobs_safe_error_message_check:
        '"processing_jobs"."last_error_message" is null or length("processing_jobs"."last_error_message") <= 500',
    })
  })

  test('defines append-only audit events for critical actions with safe query fields', () => {
    const auditLogs = requireSchemaTable('auditLogs')

    const auditLogColumns = columnNames(auditLogs)
    for (const columnName of [
      'id',
      'company_id',
      'actor_user_id',
      'permission',
      'action',
      'target_type',
      'target_id',
      'result',
      'correlation_id',
      'reason',
      'metadata',
      'created_at',
    ]) {
      expect(auditLogColumns).toContain(columnName)
    }
    expectGeneratedUuidPrimaryKey(auditLogs)
    const requiredAuditLogColumns = requiredColumnNames(auditLogs)
    for (const columnName of [
      'id',
      'company_id',
      'actor_user_id',
      'permission',
      'action',
      'target_type',
      'target_id',
      'result',
      'correlation_id',
      'metadata',
      'created_at',
    ]) {
      expect(requiredAuditLogColumns).toContain(columnName)
    }
    expect(indexColumnsByName(auditLogs)).toMatchObject({
      audit_logs_company_created_at_idx: ['company_id', 'created_at'],
      audit_logs_company_target_idx: ['company_id', 'target_type', 'target_id', 'created_at'],
      audit_logs_company_correlation_idx: ['company_id', 'correlation_id'],
    })
    expect(checkSqlByName(auditLogs)).toMatchObject({
      audit_logs_result_check: "\"audit_logs\".\"result\" in ('allowed', 'denied', 'failed')",
      audit_logs_reason_check:
        '"audit_logs"."reason" is null or length("audit_logs"."reason") <= 500',
      audit_logs_permission_check: 'length("audit_logs"."permission") between 1 and 120',
      audit_logs_action_check: 'length("audit_logs"."action") between 1 and 160',
    })
    expect(foreignKeys(auditLogs)).toContainEqual({
      columns: ['actor_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'audit_logs_actor_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
