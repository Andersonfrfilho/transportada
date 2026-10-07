/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import {
  acquireCompanySettingsLock,
  acquireLocationRetentionLock,
} from '../../src/companies/infrastructure/drizzle-company-settings.support'
import type { CompanySettingsTransaction } from '../../src/companies/infrastructure/drizzle-company-settings.types'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'

async function captureLockParameters(
  acquire: (transaction: CompanySettingsTransaction, companyId: string) => Promise<void>,
  companyId: string,
): Promise<readonly unknown[]> {
  let captured: SQL | undefined
  const transaction = {
    execute: (query: SQL) => {
      captured = query
      return Promise.resolve()
    },
  } as unknown as CompanySettingsTransaction
  await acquire(transaction, companyId)
  if (captured === undefined) throw new Error('LOCK_NOT_ACQUIRED')
  const { params, sql } = new PgDialect().sqlToQuery(captured)
  expect(sql).toContain('pg_advisory_xact_lock')
  return params
}

describe('advisory lock da retenção da posição (spec 239)', () => {
  test('a chave é de 64 bits e muda de uma empresa para outra', async () => {
    const first = await captureLockParameters(acquireLocationRetentionLock, COMPANY_ID)
    const second = await captureLockParameters(acquireLocationRetentionLock, OTHER_COMPANY_ID)

    expect(typeof first[0]).toBe('bigint')
    expect(first[0]).not.toEqual(second[0])
  })

  test('não colide com o lock de configuração da mesma empresa', async () => {
    const retention = await captureLockParameters(acquireLocationRetentionLock, COMPANY_ID)
    const settings = await captureLockParameters(acquireCompanySettingsLock, COMPANY_ID)

    expect(retention[0]).not.toEqual(settings[0])
  })
})
