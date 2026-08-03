/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  MDFE_CANCELLATION_JUSTIFICATION_MIN_LENGTH,
  MDFE_CANCELLATION_WINDOW_HOURS,
  MDFE_MANIFEST_ACTION,
  MDFE_TRANSITION_BLOCK,
  checkManifestTransition,
  isCancellationJustificationValid,
} from '../../src/mdfe-manifests/domain/mdfe-manifest-state.policy.js'
import type { MdfeManifestStatus } from '../../src/database/mdfe.schema.js'

const AUTHORIZED_AT = '2026-07-28T09:00:00.000Z'
const NOW = new Date('2026-07-28T12:00:00.000Z')

const transition = (
  action: (typeof MDFE_MANIFEST_ACTION)[keyof typeof MDFE_MANIFEST_ACTION],
  status: MdfeManifestStatus,
  overrides: { readonly authorizedAt?: string | null; readonly now?: Date } = {},
) =>
  checkManifestTransition({
    action,
    authorizedAt: overrides.authorizedAt === undefined ? AUTHORIZED_AT : overrides.authorizedAt,
    now: overrides.now ?? NOW,
    status,
  })

describe('MDF-e manifest state policy', () => {
  test('transmits a manifest that is still a draft', () => {
    expect(transition(MDFE_MANIFEST_ACTION.issue, 'draft')).toEqual({
      allowed: true,
      nextStatus: 'issuing',
    })
  })

  test('lets a rejected manifest be transmitted again after the fix', () => {
    expect(transition(MDFE_MANIFEST_ACTION.issue, 'rejected')).toEqual({
      allowed: true,
      nextStatus: 'issuing',
    })
  })

  test('refuses a second transmission while the first is in flight', () => {
    expect(transition(MDFE_MANIFEST_ACTION.issue, 'issuing')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.inFlight,
    })
  })

  test('refuses to transmit what the SEFAZ already authorized', () => {
    for (const status of ['authorized', 'closed', 'cancelled'] as const) {
      expect(transition(MDFE_MANIFEST_ACTION.issue, status)).toEqual({
        allowed: false,
        reason: MDFE_TRANSITION_BLOCK.notIssuable,
      })
    }
  })

  test('closes an authorized manifest', () => {
    expect(transition(MDFE_MANIFEST_ACTION.close, 'authorized')).toEqual({
      allowed: true,
      nextStatus: 'closed',
    })
  })

  test('refuses to close what the SEFAZ never authorized', () => {
    for (const status of ['draft', 'issuing', 'rejected'] as const) {
      expect(transition(MDFE_MANIFEST_ACTION.close, status)).toEqual({
        allowed: false,
        reason: MDFE_TRANSITION_BLOCK.notAuthorized,
      })
    }
  })

  test('refuses to close twice or to close what was cancelled', () => {
    expect(transition(MDFE_MANIFEST_ACTION.close, 'closed')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.alreadyClosed,
    })
    expect(transition(MDFE_MANIFEST_ACTION.close, 'cancelled')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.alreadyCancelled,
    })
  })

  test('cancels an authorized manifest inside the legal window', () => {
    expect(transition(MDFE_MANIFEST_ACTION.cancel, 'authorized')).toEqual({
      allowed: true,
      nextStatus: 'cancelled',
    })
  })

  test('refuses to cancel a closed manifest before spending the SEFAZ call', () => {
    expect(transition(MDFE_MANIFEST_ACTION.cancel, 'closed')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.alreadyClosed,
    })
  })

  test('refuses to cancel twice or to cancel what was never authorized', () => {
    expect(transition(MDFE_MANIFEST_ACTION.cancel, 'cancelled')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.alreadyCancelled,
    })
    for (const status of ['draft', 'issuing', 'rejected'] as const) {
      expect(transition(MDFE_MANIFEST_ACTION.cancel, status)).toEqual({
        allowed: false,
        reason: MDFE_TRANSITION_BLOCK.notAuthorized,
      })
    }
  })

  test('refuses to cancel after the legal window closes', () => {
    const authorizedAt = '2026-07-27T11:59:00.000Z'

    expect(transition(MDFE_MANIFEST_ACTION.cancel, 'authorized', { authorizedAt })).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.windowExpired,
    })
  })

  test('treats the last second of the window as still cancellable', () => {
    const authorizedAt = new Date(
      NOW.getTime() - MDFE_CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString()

    expect(transition(MDFE_MANIFEST_ACTION.cancel, 'authorized', { authorizedAt })).toEqual({
      allowed: true,
      nextStatus: 'cancelled',
    })
  })

  test('refuses to cancel an authorized manifest with no authorization timestamp', () => {
    expect(transition(MDFE_MANIFEST_ACTION.cancel, 'authorized', { authorizedAt: null })).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.notAuthorized,
    })
  })

  test('honours a company window instead of the shipped default', () => {
    const authorizedAt = '2026-07-28T07:00:00.000Z'

    expect(
      checkManifestTransition({
        action: MDFE_MANIFEST_ACTION.cancel,
        authorizedAt,
        cancellationWindowHours: 2,
        now: NOW,
        status: 'authorized',
      }),
    ).toEqual({ allowed: false, reason: MDFE_TRANSITION_BLOCK.windowExpired })
  })

  // ADR-0017: manifesto rejeitado é descartado e devolve o CT-e, em vez de ser corrigido
  test('discards a manifest that never reached the SEFAZ', () => {
    for (const status of ['draft', 'rejected'] as const) {
      expect(transition(MDFE_MANIFEST_ACTION.discard, status)).toEqual({
        allowed: true,
        nextStatus: 'discarded',
      })
    }
  })

  test('refuses to discard while the SEFAZ still decides', () => {
    expect(transition(MDFE_MANIFEST_ACTION.discard, 'issuing')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.inFlight,
    })
  })

  test('refuses to discard what the SEFAZ already authorized', () => {
    for (const status of ['authorized', 'closed', 'cancelled'] as const) {
      expect(transition(MDFE_MANIFEST_ACTION.discard, status)).toEqual({
        allowed: false,
        reason: MDFE_TRANSITION_BLOCK.notDiscardable,
      })
    }
  })

  test('reports a second discard as already discarded', () => {
    expect(transition(MDFE_MANIFEST_ACTION.discard, 'discarded')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.alreadyDiscarded,
    })
  })

  test('closes every other door on a discarded manifest', () => {
    expect(transition(MDFE_MANIFEST_ACTION.issue, 'discarded')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.notIssuable,
    })
    expect(transition(MDFE_MANIFEST_ACTION.close, 'discarded')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.alreadyDiscarded,
    })
    expect(transition(MDFE_MANIFEST_ACTION.cancel, 'discarded')).toEqual({
      allowed: false,
      reason: MDFE_TRANSITION_BLOCK.alreadyDiscarded,
    })
  })

  test('requires the justification length the SEFAZ demands', () => {
    expect(MDFE_CANCELLATION_JUSTIFICATION_MIN_LENGTH).toBe(15)
    expect(isCancellationJustificationValid('curta demais')).toBeFalse()
    expect(isCancellationJustificationValid('               ')).toBeFalse()
    expect(isCancellationJustificationValid('Viagem cancelada pelo embarcador')).toBeTrue()
  })
})
