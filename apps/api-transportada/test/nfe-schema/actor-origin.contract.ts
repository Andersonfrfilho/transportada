import { describe, expect, test } from 'bun:test'

import { checkSqlByName, columnSqlTypes, requiredColumnNames } from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

const NFE_IMPORTS_ORIGIN_CHECK_SQL =
  `("nfe_imports"."triggered_by" = 'user' and "nfe_imports"."automation_job" is null) ` +
  `or ("nfe_imports"."triggered_by" = 'automation' and "nfe_imports"."automation_job" is not null)`

const PROCESSING_OUTBOX_ORIGIN_CHECK_SQL =
  `("processing_outbox"."triggered_by" = 'user' and "processing_outbox"."automation_job" is null) ` +
  `or ("processing_outbox"."triggered_by" = 'automation' and "processing_outbox"."automation_job" is not null)`

describe('NF-e automation origin schema', () => {
  test('marks nfe_imports rows with a coherent human/automation origin while keeping the actor required', () => {
    const nfeImports = requireSchemaTable('nfeImports')

    expect(columnSqlTypes(nfeImports)).toMatchObject({
      triggered_by: 'text',
      automation_job: 'text',
    })
    expect(requiredColumnNames(nfeImports)).toContain('requested_by_user_id')
    expect(requiredColumnNames(nfeImports)).toContain('triggered_by')
    expect(requiredColumnNames(nfeImports)).not.toContain('automation_job')
    expect(checkSqlByName(nfeImports)).toMatchObject({
      nfe_imports_origin_ck: NFE_IMPORTS_ORIGIN_CHECK_SQL,
    })
  })

  test('mirrors the origin discriminator on processing_outbox while keeping the actor required', () => {
    const processingOutbox = requireSchemaTable('processingOutbox')

    expect(columnSqlTypes(processingOutbox)).toMatchObject({
      triggered_by: 'text',
      automation_job: 'text',
    })
    expect(requiredColumnNames(processingOutbox)).toContain('actor_user_id')
    expect(requiredColumnNames(processingOutbox)).toContain('triggered_by')
    expect(requiredColumnNames(processingOutbox)).not.toContain('automation_job')
    expect(checkSqlByName(processingOutbox)).toMatchObject({
      processing_outbox_origin_ck: PROCESSING_OUTBOX_ORIGIN_CHECK_SQL,
    })
  })
})
