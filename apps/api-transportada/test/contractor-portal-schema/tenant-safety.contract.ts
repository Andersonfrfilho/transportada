/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T651: a conversa da contratante pelo portal lê pela mesma fronteira da listagem da 164.
 * Prova por texto de fonte, como as outras leituras com várias junções: um degrau sem `companyId`
 * compila e passa em todo caminho feliz, e é por ele que a conversa de uma empresa apareceria no
 * portal de outra.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const REPOSITORY = read(
  '../../src/occurrence-conversation/infrastructure/drizzle-contractor-portal-conversation.repository.ts',
)
const OCCURRENCE_QUERY = read(
  '../../src/contractor-portal/infrastructure/contractor-occurrence.query.ts',
)

function joinsOf(source: string): readonly string[] {
  return [...source.split('.innerJoin(').slice(1), ...source.split('.leftJoin(').slice(1)].map(
    (join) => join.slice(0, join.indexOf('),')),
  )
}

describe('portal conversation query tenant safety (spec 183 T651)', () => {
  test('carries the company through every join, in the conversation and in the 164 boundary', () => {
    const joins = [...joinsOf(REPOSITORY), ...joinsOf(OCCURRENCE_QUERY)]

    expect(joins.length).toBeGreaterThan(8)
    for (const join of joins) expect(join).toInclude('ompanyId')
  })

  test('filters every select of the conversation by the tenant of the context', () => {
    const wheres = REPOSITORY.split('.where(').slice(1)

    expect(wheres.length).toBeGreaterThanOrEqual(6)
    for (const where of wheres) expect(where.slice(0, 200)).toInclude('companyId')
  })

  test('finds the conversation only with a contractor of the scope and the 164 visibility', () => {
    const find = REPOSITORY.slice(
      REPOSITORY.indexOf('async findConversation('),
      REPOSITORY.indexOf('async findIdempotency('),
    )
    const ensure = REPOSITORY.slice(
      REPOSITORY.indexOf('async ensureConversationRefs('),
      REPOSITORY.indexOf('async findConversation('),
    )

    for (const read of [find, ensure]) {
      expect(read).toInclude('scope.contractorIds')
      expect(read).toInclude('buildContractorVisibleOccurrenceCondition(')
      expect(read).toInclude("'contractor'")
    }
    expect(find).toInclude('occurrenceConversations.publicRef, ref')
  })

  test('the 164 boundary keeps the visible statuses and the scope of the note', () => {
    const boundary = OCCURRENCE_QUERY.slice(
      OCCURRENCE_QUERY.indexOf('export function buildContractorVisibleOccurrenceCondition('),
      OCCURRENCE_QUERY.indexOf('export async function listContractorOccurrences('),
    )

    expect(boundary).toInclude('CONTRACTOR_VISIBLE_CASE_STATUSES')
    expect(boundary).toInclude('buildScopeCondition(database, input.scope, visibleDocument)')
  })
})
