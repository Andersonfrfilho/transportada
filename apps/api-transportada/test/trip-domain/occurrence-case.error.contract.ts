/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T3: contrato dos erros de domínio da tratativa de ocorrência — código estável, status
 * HTTP certo e **nenhuma PII na mensagem** (nem nome, nem telefone, nem texto de observação: as
 * mensagens são fixas, nunca interpoladas com dado de negócio).
 */
import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_CASE_TRANSITION_REFUSALS } from '../../src/trips/domain/occurrence-case-state.policy.js'
import {
  OccurrenceCaseNotFoundError,
  OccurrenceCaseRedeliveryNotAllowedError,
  OccurrenceCaseSettlementWithoutItemsError,
  OccurrenceCaseTransitionNotAllowedError,
  OccurrenceSettlementAmountInvalidError,
  OccurrenceSettlementItemUnknownError,
} from '../../src/trips/domain/trip.error.js'

/** Palavras que nunca podem aparecer numa mensagem de erro deste módulo — indício de PII vazada. */
const PII_MARKERS = ['nome', 'name', 'cpf', 'telefone', 'phone', 'e-mail', 'email']

function assertNoPii(message: string): void {
  const lower = message.toLowerCase()
  for (const marker of PII_MARKERS) {
    expect(lower.includes(marker)).toBe(false)
  }
}

describe('occurrence case domain errors', () => {
  test('OccurrenceCaseNotFoundError: 404, código estável', () => {
    const error = new OccurrenceCaseNotFoundError()
    expect(error.status).toBe(404)
    expect(error.code).toBe('OCCURRENCE_CASE_NOT_FOUND')
    assertNoPii(error.message)
  })

  test('OccurrenceCaseTransitionNotAllowedError: 409, casa com a política', () => {
    const error = new OccurrenceCaseTransitionNotAllowedError()
    expect(error.status).toBe(409)
    expect(error.code).toBe(OCCURRENCE_CASE_TRANSITION_REFUSALS.transitionNotAllowed)
    assertNoPii(error.message)
  })

  test('OccurrenceCaseRedeliveryNotAllowedError: 422, padrão é redeliveryNotAllowed', () => {
    const error = new OccurrenceCaseRedeliveryNotAllowedError()
    expect(error.status).toBe(422)
    expect(error.code).toBe(OCCURRENCE_CASE_TRANSITION_REFUSALS.redeliveryNotAllowed)
    assertNoPii(error.message)
  })

  test('OccurrenceCaseRedeliveryNotAllowedError: também cobre redeliveryBlockedHasNoQuestion', () => {
    const error = new OccurrenceCaseRedeliveryNotAllowedError('redeliveryBlockedHasNoQuestion')
    expect(error.status).toBe(422)
    expect(error.code).toBe(OCCURRENCE_CASE_TRANSITION_REFUSALS.redeliveryBlockedHasNoQuestion)
    assertNoPii(error.message)
  })

  test('OccurrenceCaseSettlementWithoutItemsError: 422, casa com a política', () => {
    const error = new OccurrenceCaseSettlementWithoutItemsError()
    expect(error.status).toBe(422)
    expect(error.code).toBe(OCCURRENCE_CASE_TRANSITION_REFUSALS.settlementWithoutItems)
    assertNoPii(error.message)
  })

  test('OccurrenceSettlementItemUnknownError: 422, código próprio (fora da máquina de estados)', () => {
    const error = new OccurrenceSettlementItemUnknownError()
    expect(error.status).toBe(422)
    expect(error.code).toBe('OCCURRENCE_SETTLEMENT_ITEM_UNKNOWN')
    assertNoPii(error.message)
  })

  test('OccurrenceSettlementAmountInvalidError: 422, código próprio', () => {
    const error = new OccurrenceSettlementAmountInvalidError()
    expect(error.status).toBe(422)
    expect(error.code).toBe('OCCURRENCE_SETTLEMENT_AMOUNT_INVALID')
    assertNoPii(error.message)
  })

  test('todo código de recusa da máquina de estados tem uma classe de erro estável', () => {
    const codes: readonly string[] = Object.values(OCCURRENCE_CASE_TRANSITION_REFUSALS)
    expect(codes.includes(new OccurrenceCaseTransitionNotAllowedError().code)).toBe(true)
    expect(codes.includes(new OccurrenceCaseRedeliveryNotAllowedError().code)).toBe(true)
    expect(
      codes.includes(
        new OccurrenceCaseRedeliveryNotAllowedError('redeliveryBlockedHasNoQuestion').code,
      ),
    ).toBe(true)
    expect(codes.includes(new OccurrenceCaseSettlementWithoutItemsError().code)).toBe(true)
  })
})
