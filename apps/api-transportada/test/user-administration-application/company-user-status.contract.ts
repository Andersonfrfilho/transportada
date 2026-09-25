/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Achado I7 do `critic` (spec 191, ADR-0076 §8): `deriveCompanyUserStatus` priorizava o convite
 * pendente sobre a suspensão. Quem suspendia um convidado via a linha continuar "convidado" na
 * listagem — o operador não enxergava que a conta estava desabilitada no provedor.
 *
 * A prioridade certa é a membership: `disabled` é sempre `suspended`, convite pendente ou não.
 * Suspender **não** revoga o convite (ADR-0076 §8) — é por isso que o caso "desabilitado com convite
 * pendente" precisa existir e sair como suspenso, não como convidado.
 */
import { describe, expect, test } from 'bun:test'

import { deriveCompanyUserStatus } from '../../src/identity/domain/company-user.policy.js'

describe('deriveCompanyUserStatus — prioridade da suspensão', () => {
  test('convite pendente com vínculo ativo é convidado', () => {
    expect(
      deriveCompanyUserStatus({ hasPendingInvitation: true, membershipStatus: 'active' }),
    ).toBe('invited')
  })

  test('vínculo desabilitado é suspenso, mesmo com convite pendente', () => {
    expect(
      deriveCompanyUserStatus({ hasPendingInvitation: true, membershipStatus: 'disabled' }),
    ).toBe('suspended')
  })

  test('vínculo desabilitado sem convite pendente continua suspenso', () => {
    expect(
      deriveCompanyUserStatus({ hasPendingInvitation: false, membershipStatus: 'disabled' }),
    ).toBe('suspended')
  })

  test('vínculo ativo sem convite pendente é ativo', () => {
    expect(
      deriveCompanyUserStatus({ hasPendingInvitation: false, membershipStatus: 'active' }),
    ).toBe('active')
  })
})
