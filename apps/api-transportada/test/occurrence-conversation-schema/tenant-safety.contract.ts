/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a: o anexo da conversa lê e grava pela empresa do contexto em todo degrau. Prova por
 * texto de fonte, como as outras leituras com junção: um `where` sem `companyId` compila e passa em
 * todo caminho feliz, e é por ele que o arquivo de uma empresa seria ligado à mensagem de outra.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const REPOSITORY = readFileSync(
  new URL(
    '../../src/occurrence-conversation/infrastructure/drizzle-conversation-attachment.repository.ts',
    import.meta.url,
  ),
  'utf8',
)

function section(from: string, to: string): string {
  const start = REPOSITORY.indexOf(from)
  const end = REPOSITORY.indexOf(to, start + from.length)
  expect(start).toBeGreaterThanOrEqual(0)
  return REPOSITORY.slice(start, end < 0 ? undefined : end)
}

describe('conversation attachment tenant safety (spec 183 T702a)', () => {
  test('every join and every where carries the company of the context', () => {
    const joins = REPOSITORY.split('.innerJoin(').slice(1)
    const wheres = REPOSITORY.split('.where(').slice(1)

    expect(joins.length).toBeGreaterThanOrEqual(1)
    for (const join of joins) expect(join.slice(0, join.indexOf('),'))).toInclude('ompanyId')
    expect(wheres.length).toBeGreaterThanOrEqual(3)
    for (const where of wheres) expect(where.slice(0, 200)).toInclude('companyId')
  })

  test('a pending upload comes back only for its own target, locked, and only while pending', () => {
    const lock = section('async lockPendingUploads(', 'export async function')

    for (const field of [
      'companyId, target.companyId',
      'occurrenceKind, target.occurrenceKind',
      'occurrenceId, target.occurrenceId',
      'participant, target.participant',
      'channel, target.channel',
      'requestedByUserId, target.requestedByUserId',
      "status, 'pending'",
    ]) {
      expect(lock).toInclude(field)
    }
    expect(lock).toInclude(".for('update')")
  })

  test('attaching writes the object and the attachment in the company of the target', () => {
    const attach = section('async attachUpload(', 'async lockPendingUploads(')

    expect(attach.match(/companyId: input\.companyId/gu)?.length).toBe(2)
    expect(attach).toInclude('eq(occurrenceConversationUploads.companyId, input.companyId)')
  })
})

/**
 * Spec 183 T903 (achado C2): o critério de conversa aberta lê a mensagem e a tratativa por
 * subconsulta — cada uma amarrada à empresa **da conversa**, nunca solta; senão a tratativa de uma
 * empresa fecharia a conversa de outra que tivesse o mesmo id de ocorrência.
 */
describe('attributable conversation tenant safety (spec 183 T903, C2)', () => {
  const QUERY = readFileSync(
    new URL(
      '../../src/occurrence-conversation/infrastructure/attributable-conversation.query.ts',
      import.meta.url,
    ),
    'utf8',
  )

  const TERMINAL = readFileSync(
    new URL('../../src/trips/infrastructure/terminal-occurrence-case.query.ts', import.meta.url),
    'utf8',
  )

  test('both subqueries join on the company of the conversation', () => {
    expect(QUERY).toContain(
      'eq(occurrenceConversationMessages.companyId, occurrenceConversations.companyId)',
    )
    expect(QUERY).toContain('companyId: occurrenceConversations.companyId,')
    expect(TERMINAL).toContain('eq(tripOccurrenceCases.companyId, input.companyId)')
  })
})
