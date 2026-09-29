/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-D1: a precedência "o mais específico vence" (destinatário > contratante > geral >
 * padrão) é escrita uma vez, aqui, e reaproveitada por comprovante (RF-C3) e ocorrência (RF-B2) —
 * nenhum dos dois reimplementa `a ?? b ?? c ?? d` com as próprias palavras.
 */
import { describe, expect, it } from 'bun:test'

import { resolveWithOverrides } from '../src/shared/resolve-with-overrides.policy.js'

describe('resolveWithOverrides (spec 218 RF-D1)', () => {
  it('nenhum override presente: vale a configuração geral', () => {
    const resolved = resolveWithOverrides({
      contractorOverride: null,
      fallback: 'fallback',
      general: 'general',
      recipientOverride: null,
    })

    expect(resolved).toBe('general')
  })

  it('só o override de contratante presente: ele vence a geral', () => {
    const resolved = resolveWithOverrides({
      contractorOverride: 'contractor',
      fallback: 'fallback',
      general: 'general',
      recipientOverride: null,
    })

    expect(resolved).toBe('contractor')
  })

  it('só o override de destinatário presente: ele vence a geral', () => {
    const resolved = resolveWithOverrides({
      contractorOverride: null,
      fallback: 'fallback',
      general: 'general',
      recipientOverride: 'recipient',
    })

    expect(resolved).toBe('recipient')
  })

  it('os dois presentes (P4 do spec.md): o destinatário vence o contratante', () => {
    const resolved = resolveWithOverrides({
      contractorOverride: 'contractor',
      fallback: 'fallback',
      general: 'general',
      recipientOverride: 'recipient',
    })

    expect(resolved).toBe('recipient')
  })

  it('sem geral e sem override nenhum: cai no padrão', () => {
    const resolved = resolveWithOverrides({
      contractorOverride: null,
      fallback: 'fallback',
      general: null,
      recipientOverride: null,
    })

    expect(resolved).toBe('fallback')
  })
})
