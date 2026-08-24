/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  countAwaitingAuthorization,
  NFSE_AUTHORIZATION_REFRESH_INTERVAL_MS,
  resolveNextRefreshIso,
  resolveNfseAuthorizationRefreshState,
} from '@/modules/nfse-invoice/shared/nfseAuthorizationRefresh.service'
import type { NfseInvoiceStatus } from '@/modules/nfse-invoice/shared/nfseInvoice.types'

function invoices(...statuses: readonly NfseInvoiceStatus[]) {
  return statuses.map((status) => ({ status }))
}

describe('NFS-e authorization refresh contract', () => {
  test('runs only while some invoice still waits for the city hall', () => {
    const waiting = resolveNfseAuthorizationRefreshState({
      invoices: invoices('authorized', 'pending_authorization', 'cancelled'),
    })

    expect(waiting.enabled).toBe(true)
    expect(waiting.intervalMs).toBe(NFSE_AUTHORIZATION_REFRESH_INTERVAL_MS)
    expect(waiting.pendingCount).toBe(1)
  })

  /**
   * Uma tela aberta e esquecida bateria na API para sempre, e nenhuma dessas batidas traria
   * resposta diferente da anterior.
   */
  test('stops for good once nothing is pending', () => {
    const settled = resolveNfseAuthorizationRefreshState({
      invoices: invoices('authorized', 'rejected', 'cancelled', 'discarded', 'failed'),
    })

    expect(settled.enabled).toBe(false)
    expect(settled.intervalMs).toBeNull()
    expect(settled.pendingCount).toBe(0)

    expect(resolveNfseAuthorizationRefreshState({ invoices: [] }).enabled).toBe(false)
  })

  /** Só `pending_authorization` conta: nenhum outro estado espera resposta da prefeitura. */
  test('counts only the status that waits on the city hall', () => {
    expect(countAwaitingAuthorization(invoices('pending_authorization'))).toBe(1)
    expect(
      countAwaitingAuthorization(invoices('requested', 'issuing', 'cancellation_requested')),
    ).toBe(0)
    expect(
      countAwaitingAuthorization(invoices('pending_authorization', 'pending_authorization')),
    ).toBe(2)
  })

  test('aims the countdown one interval ahead, and drops it when the cycle stops', () => {
    const fromEpochMs = Date.parse('2026-08-24T13:25:00.000Z')

    expect(
      resolveNextRefreshIso({
        enabled: true,
        fromEpochMs,
        intervalMs: NFSE_AUTHORIZATION_REFRESH_INTERVAL_MS,
      }),
    ).toBe('2026-08-24T13:26:00.000Z')

    expect(
      resolveNextRefreshIso({
        enabled: false,
        fromEpochMs,
        intervalMs: NFSE_AUTHORIZATION_REFRESH_INTERVAL_MS,
      }),
    ).toBeNull()
    expect(resolveNextRefreshIso({ enabled: true, fromEpochMs, intervalMs: null })).toBeNull()
  })
})
