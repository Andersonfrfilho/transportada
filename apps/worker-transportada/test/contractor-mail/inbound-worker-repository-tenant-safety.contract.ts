/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão do `architect` (T010): a extração de token passou a devolver vários candidatos, e a
 * consulta virou `company_id = ? and reply_token_hash in (...)`. No molde do contrato de tenant da
 * T005 (API, `test/contractor-mail-schema/tenant-safety.contract.ts`): prova, por geração de SQL,
 * que as duas condições entram na **mesma** cláusula — nunca um filtro por hash sozinho, que um
 * token de outra empresa pudesse escapar por engano.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildContractorMailInboundThreadCandidateFilters } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-inbound-worker.repository.js'

const dialect = new PgDialect()

describe('contractor mail inbound worker repository tenant safety (spec 143, T010)', () => {
  test('the thread candidate lookup filters by company id besides the hash list', () => {
    const companyId = '00000000-0000-4000-8000-000000000a01'
    const replyTokenHashes = ['a'.repeat(64), 'b'.repeat(64)]

    const query = dialect.sqlToQuery(
      and(...buildContractorMailInboundThreadCandidateFilters({ companyId, replyTokenHashes }))!,
    )

    expect(query.sql).toContain('"contractor_mail_threads"."company_id" = $')
    expect(query.sql).toContain('"contractor_mail_threads"."reply_token_hash" in')
    expect(query.params).toEqual([companyId, ...replyTokenHashes])
  })
})
