/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T4: quando o mesmo tipo na mesma nota é recusado. A política é do tipo; a ocorrência cancelada nem chega
 * aqui (a consulta a descarta).
 */
import { describe, expect, test } from 'bun:test'

import {
  blocksDuplicateRequest,
  findBlockingDuplicateRequest,
  type DuplicateRequestCandidate,
} from '../../src/trips/domain/occurrence-duplicate-request.policy.js'

function candidate(overrides: Partial<DuplicateRequestCandidate> = {}): DuplicateRequestCandidate {
  return { id: 'occurrence-1', replyStatus: null, resolutionState: 'open', ...overrides }
}

describe('a trava de pedido repetido na mesma nota (spec 276 T4)', () => {
  test('bloquear enquanto o pedido está aberto: aguardando, atrasado ou com o operador bloqueia', () => {
    for (const replyStatus of [
      null,
      'awaiting_contractor',
      'overdue',
      'reply_received',
      'awaiting_operator',
      'needs_operator',
    ] as const) {
      expect(blocksDuplicateRequest('while_request_open', candidate({ replyStatus }))).toBe(true)
    }
  })

  test('bloquear enquanto o pedido está aberto: entregue, tratado ou cancelado libera', () => {
    for (const replyStatus of ['delivered', 'handled', 'cancelled'] as const) {
      expect(blocksDuplicateRequest('while_request_open', candidate({ replyStatus }))).toBe(false)
    }
  })

  test('até solucionar: o pedido entregue ainda bloqueia enquanto a ocorrência não foi solucionada', () => {
    expect(blocksDuplicateRequest('until_resolved', candidate({ replyStatus: 'delivered' }))).toBe(
      true,
    )
  })

  test('a ocorrência solucionada nunca bloqueia; reaberta volta a bloquear', () => {
    for (const policy of ['while_request_open', 'until_resolved'] as const) {
      expect(blocksDuplicateRequest(policy, candidate({ resolutionState: 'resolved' }))).toBe(false)
    }
  })

  test('permitir sempre nunca bloqueia', () => {
    expect(blocksDuplicateRequest('allow', candidate())).toBe(false)
  })

  test('devolve a mais recente que bloqueia', () => {
    expect(
      findBlockingDuplicateRequest('while_request_open', [
        candidate({ id: 'newest', replyStatus: 'delivered' }),
        candidate({ id: 'older', replyStatus: 'awaiting_contractor' }),
      ])?.id,
    ).toBe('older')
    expect(findBlockingDuplicateRequest('while_request_open', [])).toBeNull()
  })
})
