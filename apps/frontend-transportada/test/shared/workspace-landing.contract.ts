/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { resolveLandingWorkspace } from '@/modules/shared/workspaceAccess.service'

/**
 * Spec 221 RF-C2 a RF-C7 (CA06, CA07, CA08, CA14, CA15, CA16, CA18). Permissões e papéis transcritos
 * de `COMPANY_ROLE_PERMISSIONS` (`api-transportada/src/identity/domain/authorization.policy.ts`).
 */
const SEPARATOR = {
  permissions: ['invoices.read', 'fleet.read', 'trip.read', 'trip.manage', 'cargo.measure'],
  roles: ['separator'],
}
const DRIVER_SEPARATOR = {
  permissions: [...SEPARATOR.permissions, 'trip.report'],
  roles: ['driver', 'separator'],
}
const SEPARATOR_OPERATOR = {
  permissions: [...SEPARATOR.permissions, 'settings.manage', 'trip.financials', 'billing.create'],
  roles: ['separator', 'operator'],
}

describe('a aterrissagem respeita a permissão (spec 221 RF-C2/C5)', () => {
  it('endereço pedido pela pessoa nunca é trocado — a parede da página responde (CA07)', () => {
    expect(resolveLandingWorkspace({ ...SEPARATOR, current: 'billing', source: 'path' })).toEqual({
      kind: 'stay',
    })
  })

  it('a última tela da sessão é respeitada quando a conta pode abri-la (RF-C1)', () => {
    expect(resolveLandingWorkspace({ ...SEPARATOR, current: 'fleet', source: 'stored' })).toEqual({
      kind: 'stay',
    })
  })

  it('a última tela que a conta não abre cede lugar, e com replace (CA06)', () => {
    expect(resolveLandingWorkspace({ ...SEPARATOR, current: 'billing', source: 'stored' })).toEqual(
      {
        kind: 'replace',
        workspace: 'trip',
      },
    )
  })

  it('conta sem nenhum workspace visível é tela de sem acesso, nunca parede (CA08)', () => {
    expect(
      resolveLandingWorkspace({
        current: 'nfe',
        permissions: [],
        roles: ['viewer'],
        source: 'default',
      }),
    ).toEqual({ kind: 'no-access' })
  })

  it('destino igual ao atual não navega — é o que impede o laço com o próprio efeito', () => {
    expect(resolveLandingWorkspace({ ...SEPARATOR, current: 'trip', source: 'default' })).toEqual({
      kind: 'stay',
    })
  })
})

describe('a preferência do separador (spec 221 RF-C6/C7)', () => {
  it('o separador começa em Viagens, não no primeiro item do menu (CA14)', () => {
    expect(resolveLandingWorkspace({ ...SEPARATOR, current: 'nfe', source: 'default' })).toEqual({
      kind: 'replace',
      workspace: 'trip',
    })
  })

  it('o motorista que também é separador começa em Viagens (CA16)', () => {
    expect(
      resolveLandingWorkspace({ ...DRIVER_SEPARATOR, current: 'nfe', source: 'default' }),
    ).toEqual({ kind: 'replace', workspace: 'trip' })
  })

  it('separador que também é do escritório cai na regra geral (CA15)', () => {
    expect(
      resolveLandingWorkspace({ ...SEPARATOR_OPERATOR, current: 'nfe', source: 'default' }),
    ).toEqual({ kind: 'stay' })
  })

  /**
   * CA18: a preferência é ignorada quando a conta não abre o destino dela. Sem `fleet.read` e sem
   * `trip.report-on-behalf`, Viagens não abre — e aterrissar numa parede é o defeito que a RF-C5
   * existe para evitar.
   */
  it('preferência que a conta não pode abrir é ignorada (CA18)', () => {
    expect(
      resolveLandingWorkspace({
        current: 'billing',
        permissions: ['invoices.read'],
        roles: ['separator'],
        source: 'default',
      }),
    ).toEqual({ kind: 'replace', workspace: 'nfe' })
  })
})
