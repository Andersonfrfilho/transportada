/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — o estado final de cada documento e a decisão sobre o pedido (D6.4). A tabela é
 * completa de propósito: `reconciliation_required` é pendente, e `cancelled` é falha — o contrário
 * de `SUCCESSFUL_STATUSES` do progresso do lote, que conta o cancelado como sucesso.
 */
import { describe, expect, test } from 'bun:test'

import {
  classifyWhatsAppCommandDocument,
  decideWhatsAppCommandSettlement,
  WHATSAPP_COMMAND_SETTLEMENT_TIMEOUT_MILLISECONDS,
  WHATSAPP_COMMAND_STUCK_CONFIRMING_MILLISECONDS,
} from '../../src/whatsapp-commands/domain/whatsapp-command-settlement.policy.js'

const NOW = new Date('2026-09-12T12:00:00.000Z')
const MINUTE_MS = 60_000

const minutesAgo = (minutes: number): Date => new Date(NOW.getTime() - minutes * MINUTE_MS)

describe('estado final de cada documento do pedido (spec 144 T014)', () => {
  const table: readonly (readonly [string, 'failure' | 'pending' | 'success'])[] = [
    ['authorized', 'success'],
    ['rejected', 'failure'],
    ['failed', 'failure'],
    ['cancelled', 'failure'],
    ['discarded', 'failure'],
    ['reconciliation_required', 'pending'],
    ['pending', 'pending'],
    ['in_flight', 'pending'],
    ['retry_scheduled', 'pending'],
    ['requested', 'pending'],
    ['issuing', 'pending'],
    ['pending_authorization', 'pending'],
    ['cancellation_requested', 'pending'],
  ]

  for (const [status, expected] of table) {
    test(`${status} é ${expected}`, () => {
      expect(classifyWhatsAppCommandDocument(status)).toBe(expected)
    })
  }

  test('status que ninguém previu é pendente, nunca sucesso', () => {
    expect(classifyWhatsAppCommandDocument('something_new')).toBe('pending')
  })
})

describe('decisão sobre o pedido', () => {
  test('as janelas são duas horas para liquidar e quinze minutos para retomar', () => {
    expect(WHATSAPP_COMMAND_SETTLEMENT_TIMEOUT_MILLISECONDS).toBe(2 * 60 * MINUTE_MS)
    expect(WHATSAPP_COMMAND_STUCK_CONFIRMING_MILLISECONDS).toBe(15 * MINUTE_MS)
  })

  test('todos finais liquida, mesmo com rejeitado no meio', () => {
    expect(
      decideWhatsAppCommandSettlement({
        confirmedAt: minutesAgo(5),
        documents: ['success', 'failure', 'success'],
        now: NOW,
        status: 'dispatched',
      }),
    ).toBe('settle')
  })

  test('pendente dentro das duas horas espera', () => {
    expect(
      decideWhatsAppCommandSettlement({
        confirmedAt: minutesAgo(119),
        documents: ['success', 'pending'],
        now: NOW,
        status: 'dispatched',
      }),
    ).toBe('wait')
  })

  test('pendente depois das duas horas liquida em parte', () => {
    expect(
      decideWhatsAppCommandSettlement({
        confirmedAt: minutesAgo(121),
        documents: ['success', 'pending'],
        now: NOW,
        status: 'dispatched',
      }),
    ).toBe('settle_partial')
  })

  test('confirming parado há mais de quinze minutos é retomado; recente espera', () => {
    const decide = (minutes: number) =>
      decideWhatsAppCommandSettlement({
        confirmedAt: minutesAgo(minutes),
        documents: [],
        now: NOW,
        status: 'confirming',
      })
    expect(decide(16)).toBe('resume')
    expect(decide(14)).toBe('wait')
  })

  test('pedido fora do trabalho em curso não tem o que liquidar', () => {
    for (const status of ['previewed', 'settled', 'settled_partial', 'expired', 'superseded']) {
      expect(
        decideWhatsAppCommandSettlement({
          confirmedAt: minutesAgo(500),
          documents: ['success'],
          now: NOW,
          status,
        }),
      ).toBe('wait')
    }
  })
})
