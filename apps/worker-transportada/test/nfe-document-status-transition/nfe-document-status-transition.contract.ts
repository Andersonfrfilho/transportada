/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NfeDocumentStatus } from '../../src/database/nfe.schema.js'
import {
  isStatusTransitionAllowed,
  resolveEventStatusChange,
  resolveSummaryStatusChange,
} from '../../src/nfe-documents/domain/nfe-document-status-transition.policy.js'

const REGISTERED_STATUS_CODES: string[] = ['135', '136', '155']
const UNREGISTERED_STATUS_CODES: string[] = ['101', '110', '128', '301', '999']
const STATUS_CHANGING_EVENT_TYPES: string[] = ['110111', '110112']
const NON_STATUS_CHANGING_EVENT_TYPES: string[] = ['110110', '210200', '111500', '210220']
const ALL_STATUSES: NfeDocumentStatus[] = ['authorized', 'cancelled', 'denied', 'unsigned']
const ANY_STATUS_CODES: (string | undefined)[] = [
  ...REGISTERED_STATUS_CODES,
  ...UNREGISTERED_STATUS_CODES,
  undefined,
]

describe('nfe-document-status-transition.policy (spec 149 T2)', () => {
  describe('resolveEventStatusChange — D1, D2', () => {
    describe.each(STATUS_CHANGING_EVENT_TYPES)('tpEvento %s (cancelamento)', (eventType) => {
      test.each(REGISTERED_STATUS_CODES)(
        'cStat %s registrado — muda para cancelled',
        (statusCode) => {
          expect(resolveEventStatusChange({ eventType, origin: 'automatic', statusCode })).toEqual({
            kind: 'change',
            to: 'cancelled',
          })
        },
      )

      test.each(UNREGISTERED_STATUS_CODES)(
        'cStat %s fora de {135,136,155} — não aplica',
        (statusCode) => {
          expect(resolveEventStatusChange({ eventType, origin: 'automatic', statusCode })).toEqual({
            kind: 'not-applied',
            reason: 'status-code-not-registered',
          })
        },
      )

      test('sem statusCode — não aplica', () => {
        expect(
          resolveEventStatusChange({ eventType, origin: 'automatic', statusCode: undefined }),
        ).toEqual({
          kind: 'not-applied',
          reason: 'missing-status-code',
        })
      })
    })

    describe.each(NON_STATUS_CHANGING_EVENT_TYPES)('tpEvento %s (não muda status)', (eventType) => {
      test.each(ANY_STATUS_CODES)(
        'cStat %p — ignorado, qualquer que seja o cStat',
        (statusCode) => {
          expect(resolveEventStatusChange({ eventType, origin: 'automatic', statusCode })).toEqual({
            kind: 'ignore',
          })
        },
      )
    })

    test('tipo desconhecido é ignorado', () => {
      expect(
        resolveEventStatusChange({ eventType: 'foo', origin: 'automatic', statusCode: '135' }),
      ).toEqual({ kind: 'ignore' })
    })
  })

  describe('resolveEventStatusChange — só a SEFAZ muda status (revisão final, D21)', () => {
    describe.each(STATUS_CHANGING_EVENT_TYPES)('tpEvento %s por upload', (eventType) => {
      test.each(REGISTERED_STATUS_CODES)(
        'cStat %s registrado — gravado, mas não aplica',
        (statusCode) => {
          expect(resolveEventStatusChange({ eventType, origin: 'manual', statusCode })).toEqual({
            kind: 'not-applied',
            reason: 'unverified-upload',
          })
        },
      )

      test('cStat fora do conjunto continua dizendo por quê', () => {
        expect(
          resolveEventStatusChange({ eventType, origin: 'manual', statusCode: '573' }),
        ).toEqual({ kind: 'not-applied', reason: 'status-code-not-registered' })
      })

      test('sem statusCode continua dizendo por quê', () => {
        expect(
          resolveEventStatusChange({ eventType, origin: 'manual', statusCode: undefined }),
        ).toEqual({ kind: 'not-applied', reason: 'missing-status-code' })
      })
    })

    test.each(NON_STATUS_CHANGING_EVENT_TYPES)(
      'tpEvento %s por upload — ignorado, sem aviso',
      (eventType) => {
        expect(
          resolveEventStatusChange({ eventType, origin: 'manual', statusCode: '135' }),
        ).toEqual({ kind: 'ignore' })
      },
    )
  })

  describe('resolveSummaryStatusChange — D3', () => {
    test("situacao '2' — muda para cancelled", () => {
      expect(resolveSummaryStatusChange({ situation: '2' })).toEqual({
        kind: 'change',
        to: 'cancelled',
      })
    })

    test("situacao '3' — muda para denied", () => {
      expect(resolveSummaryStatusChange({ situation: '3' })).toEqual({
        kind: 'change',
        to: 'denied',
      })
    })

    test("situacao '1' — sem efeito", () => {
      expect(resolveSummaryStatusChange({ situation: '1' })).toEqual({ kind: 'ignore' })
    })

    test("situacao '' (cSitNFe ausente) — sem efeito", () => {
      expect(resolveSummaryStatusChange({ situation: '' })).toEqual({ kind: 'ignore' })
    })

    test('situacao desconhecida — sem efeito', () => {
      expect(resolveSummaryStatusChange({ situation: '9' })).toEqual({ kind: 'ignore' })
    })
  })

  describe('isStatusTransitionAllowed — D4, todas as origens × destinos', () => {
    const EXPECTED: Record<NfeDocumentStatus, ReadonlySet<NfeDocumentStatus>> = {
      authorized: new Set<NfeDocumentStatus>(),
      cancelled: new Set<NfeDocumentStatus>(['authorized', 'unsigned']),
      denied: new Set<NfeDocumentStatus>(['unsigned']),
      unsigned: new Set<NfeDocumentStatus>(),
    }

    for (const to of ALL_STATUSES) {
      for (const from of ALL_STATUSES) {
        const expected = EXPECTED[to].has(from)

        test(`${from} → ${to} é ${expected ? 'permitida' : 'proibida'}`, () => {
          expect(isStatusTransitionAllowed({ from, to })).toBe(expected)
        })
      }
    }

    test.each(ALL_STATUSES)(
      'cancelled é terminal: %s → cancelled só permitido de authorized/unsigned',
      (from) => {
        const expected = from === 'authorized' || from === 'unsigned'
        expect(isStatusTransitionAllowed({ from, to: 'cancelled' })).toBe(expected)
      },
    )

    test.each(ALL_STATUSES)('nenhuma transição sai de cancelled (%s é destino)', (to) => {
      expect(isStatusTransitionAllowed({ from: 'cancelled', to })).toBe(false)
    })

    test.each(ALL_STATUSES)('nenhuma transição sai de denied (%s é destino)', (to) => {
      expect(isStatusTransitionAllowed({ from: 'denied', to })).toBe(false)
    })
  })
})
