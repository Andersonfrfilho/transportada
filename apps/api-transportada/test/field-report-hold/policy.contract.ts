/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320 (CA2, CA6): a regra "mesma data" com tolerância de 3 h no fuso de Brasília.
 */
import { describe, expect, it } from 'bun:test'

import { resolveFieldReportHold } from '../../src/trips/domain/field-report-hold.policy.js'

const at = (iso: string) => new Date(iso)

describe('resolveFieldReportHold', () => {
  it('retém o toque de ontem recebido hoje', () => {
    const decision = resolveFieldReportHold({
      receivedAt: at('2026-11-10T17:34:00Z'),
      tappedAt: at('2026-11-09T13:02:00Z'),
    })
    expect(decision.hold).toBe(true)
  })

  it('não retém o toque do mesmo dia', () => {
    const decision = resolveFieldReportHold({
      receivedAt: at('2026-11-10T20:00:00Z'),
      tappedAt: at('2026-11-10T11:00:00Z'),
    })
    expect(decision.hold).toBe(false)
  })

  it('CA2: 23:58 de Brasília recebido 00:03 do dia seguinte passa pela tolerância', () => {
    const decision = resolveFieldReportHold({
      receivedAt: at('2026-11-10T03:03:00Z'),
      tappedAt: at('2026-11-10T02:58:00Z'),
    })
    expect(decision.hold).toBe(false)
  })

  it('dia diferente com mais de 3 h de atraso retém, mesmo atravessando só a meia-noite', () => {
    const decision = resolveFieldReportHold({
      receivedAt: at('2026-11-10T07:00:00Z'),
      tappedAt: at('2026-11-10T02:30:00Z'),
    })
    expect(decision.hold).toBe(true)
  })

  it('o dia é o de Brasília, não o de UTC', () => {
    const decision = resolveFieldReportHold({
      receivedAt: at('2026-11-10T23:30:00Z'),
      tappedAt: at('2026-11-10T01:00:00Z'),
    })
    expect(decision.hold).toBe(true)
  })

  it('sem tappedAt não retém (cliente antigo, CA6)', () => {
    expect(resolveFieldReportHold({ receivedAt: at('2026-11-10T17:00:00Z') }).hold).toBe(false)
  })

  it('o desvio do relógio corrige o momento do toque', () => {
    const decision = resolveFieldReportHold({
      clockOffsetMs: 24 * 60 * 60 * 1000,
      receivedAt: at('2026-11-10T17:00:00Z'),
      tappedAt: at('2026-11-09T12:00:00Z'),
    })
    expect(decision.hold).toBe(false)
  })

  it('correção que põe o toque no futuro é descartada e vale o toque cru', () => {
    const decision = resolveFieldReportHold({
      clockOffsetMs: 3 * 24 * 60 * 60 * 1000,
      receivedAt: at('2026-11-10T17:00:00Z'),
      tappedAt: at('2026-11-08T12:00:00Z'),
    })
    expect(decision.hold).toBe(true)
  })

  it('devolve a hora do toque corrigida para a liberação usar', () => {
    const decision = resolveFieldReportHold({
      receivedAt: at('2026-11-10T17:34:00Z'),
      tappedAt: at('2026-11-09T13:02:00Z'),
    })
    expect(decision.hold && decision.occurredAt.toISOString()).toBe('2026-11-09T13:02:00.000Z')
  })
})
