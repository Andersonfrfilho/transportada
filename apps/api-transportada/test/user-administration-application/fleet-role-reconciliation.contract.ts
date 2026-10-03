/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CompanyRole } from '../../src/database/identity.schema.js'
import { FleetDriverProfileEmptyError } from '../../src/fleet/domain/fleet.error.js'
import { FLEET_DRIVER_PROFILES } from '../../src/fleet/domain/fleet-driver-profile.constant.js'
import { FLEET_LINKED_ROLES } from '../../src/identity/domain/fleet-linked-roles.constant.js'
import {
  reconcileFleetCrewCapabilities,
  resolveInvitedFleetCrewCapabilities,
  type FleetCrewCapabilities,
} from '../../src/identity/domain/fleet-role-reconciliation.policy.js'

const DRIVER_ONLY: FleetCrewCapabilities = { canActAsHelper: false, canDrive: true }
const DRIVER_AND_HELPER: FleetCrewCapabilities = { canActAsHelper: true, canDrive: true }
const HELPER_ONLY: FleetCrewCapabilities = { canActAsHelper: true, canDrive: false }

function reconcile(
  previousRoles: readonly CompanyRole[],
  nextRoles: readonly CompanyRole[],
  current: FleetCrewCapabilities,
) {
  return reconcileFleetCrewCapabilities({ current, nextRoles, previousRoles })
}

/**
 * Spec 235 D4: o papel e as colunas da ficha só conversam quando a troca toca a frota, e cada
 * coluna só muda pelo papel que a ela corresponde — o switch da ficha sobrevive a troca alheia.
 */
describe('reconciliação papel → colunas da ficha de frota', () => {
  test('dar fiscal a um motorista não mexe na ficha', () => {
    expect(reconcile(['driver'], ['driver', 'fiscal'], DRIVER_ONLY)).toEqual({ kind: 'unchanged' })
  })

  test('tirar fiscal de um ajudante puro não mexe na ficha', () => {
    expect(reconcile(['helper', 'fiscal'], ['helper'], HELPER_ONLY)).toEqual({ kind: 'unchanged' })
  })

  test('helper entrou liga can_act_as_helper e preserva can_drive', () => {
    expect(reconcile(['driver'], ['driver', 'helper'], DRIVER_ONLY)).toEqual({
      capabilities: DRIVER_AND_HELPER,
      kind: 'changed',
    })
  })

  test('helper entrou em ficha que já ajudava pelo switch: nada a gravar', () => {
    expect(reconcile(['driver'], ['driver', 'helper'], DRIVER_AND_HELPER)).toEqual({
      kind: 'unchanged',
    })
  })

  test('helper saiu de quem dirige desliga só can_act_as_helper', () => {
    expect(reconcile(['driver', 'helper'], ['driver'], DRIVER_AND_HELPER)).toEqual({
      capabilities: DRIVER_ONLY,
      kind: 'changed',
    })
  })

  test('helper saiu de quem só ajuda é recusado com 409 FLEET_DRIVER_PROFILE_EMPTY', () => {
    let refusal: unknown
    try {
      reconcile(['helper'], ['operator'], HELPER_ONLY)
    } catch (error) {
      refusal = error
    }
    expect(refusal).toBeInstanceOf(FleetDriverProfileEmptyError)
    expect(refusal).toMatchObject({ code: 'FLEET_DRIVER_PROFILE_EMPTY', status: 409 })
  })

  test('driver entrou num ajudante puro liga can_drive', () => {
    expect(reconcile(['helper'], ['helper', 'driver'], HELPER_ONLY)).toEqual({
      capabilities: DRIVER_AND_HELPER,
      kind: 'changed',
    })
  })

  test('aggregate entrou num ajudante puro liga can_drive', () => {
    expect(reconcile(['helper'], ['helper', 'aggregate'], HELPER_ONLY)).toEqual({
      capabilities: DRIVER_AND_HELPER,
      kind: 'changed',
    })
  })

  test('driver saiu mas aggregate ficou: segue dirigindo', () => {
    expect(reconcile(['driver', 'aggregate'], ['aggregate'], DRIVER_ONLY)).toEqual({
      kind: 'unchanged',
    })
  })

  test('troca de driver por aggregate não mexe em can_drive', () => {
    expect(reconcile(['driver'], ['aggregate'], DRIVER_ONLY)).toEqual({ kind: 'unchanged' })
  })

  test('driver e aggregate saíram de quem tem helper: desliga só can_drive', () => {
    expect(reconcile(['driver', 'aggregate', 'helper'], ['helper'], DRIVER_AND_HELPER)).toEqual({
      capabilities: HELPER_ONLY,
      kind: 'changed',
    })
  })

  /** O switch da ficha liga `can_act_as_helper` sem papel `helper`; tirar o driver não o apaga. */
  test('driver saiu de motorista que ajuda pelo switch: o switch fica', () => {
    expect(reconcile(['driver'], ['operator'], DRIVER_AND_HELPER)).toEqual({
      capabilities: HELPER_ONLY,
      kind: 'changed',
    })
  })

  test('driver saiu de quem não ajuda é recusado com 409 FLEET_DRIVER_PROFILE_EMPTY', () => {
    expect(() => reconcile(['driver', 'aggregate'], ['fiscal'], DRIVER_ONLY)).toThrow(
      FleetDriverProfileEmptyError,
    )
  })

  test('driver saiu e helper entrou na mesma troca vira ajudante puro', () => {
    expect(reconcile(['driver'], ['helper'], DRIVER_ONLY)).toEqual({
      capabilities: HELPER_ONLY,
      kind: 'changed',
    })
  })

  test('helper saiu e driver entrou na mesma troca vira só motorista', () => {
    expect(reconcile(['helper'], ['driver'], HELPER_ONLY)).toEqual({
      capabilities: DRIVER_ONLY,
      kind: 'changed',
    })
  })
})

/** Spec 235 D8: quem tem papel de frota procura a ficha pelo CPF, e o papel é o perfil da ficha. */
describe('papéis que casam a ficha de frota no convite', () => {
  test('são exatamente os perfis do cadastro de frota', () => {
    expect([...FLEET_LINKED_ROLES].sort()).toEqual([...FLEET_DRIVER_PROFILES].sort())
  })
})

/**
 * Spec 235 D2 no convite: a ficha órfã que o convite vincula ganha as colunas do perfil quando o papel
 * é `helper`; convite sem `helper` mantém o comportamento de sempre e não toca as colunas.
 */
describe('colunas da ficha órfã vinculada pelo convite', () => {
  test('helper sozinho deixa a ficha só ajudando', () => {
    expect(
      resolveInvitedFleetCrewCapabilities({ current: DRIVER_ONLY, roles: ['helper'] }),
    ).toEqual({
      capabilities: HELPER_ONLY,
      kind: 'changed',
    })
  })

  test('helper com motorista ou agregado mantém quem dirige e liga o ajudar', () => {
    for (const roles of [
      ['helper', 'driver'],
      ['aggregate', 'helper'],
    ] as const) {
      expect(resolveInvitedFleetCrewCapabilities({ current: HELPER_ONLY, roles })).toEqual({
        capabilities: DRIVER_AND_HELPER,
        kind: 'changed',
      })
    }
  })

  test('ficha que já está certa não muda', () => {
    expect(
      resolveInvitedFleetCrewCapabilities({ current: HELPER_ONLY, roles: ['helper'] }),
    ).toEqual({ kind: 'unchanged' })
    expect(
      resolveInvitedFleetCrewCapabilities({
        current: DRIVER_AND_HELPER,
        roles: ['driver', 'helper'],
      }),
    ).toEqual({ kind: 'unchanged' })
  })

  test('convite sem helper não toca as colunas', () => {
    expect(
      resolveInvitedFleetCrewCapabilities({ current: HELPER_ONLY, roles: ['driver'] }),
    ).toEqual({
      kind: 'unchanged',
    })
    expect(
      resolveInvitedFleetCrewCapabilities({ current: DRIVER_ONLY, roles: ['aggregate', 'fiscal'] }),
    ).toEqual({ kind: 'unchanged' })
  })
})
