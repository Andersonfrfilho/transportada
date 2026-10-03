/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import enLocale from '../../src/modules/identity/locales/identity.en.locale.json'
import ptLocale from '../../src/modules/identity/locales/identity.locale.json'
import {
  COMPANY_ROLES,
  FLEET_LINKED_ROLES,
} from '../../src/modules/identity/shared/companyUsers.constant'
import { resolveNoWorkspaceAccessVariant } from '../../src/modules/identity/shared/noWorkspaceAccessVariant.service'
import { buildRoleChoices } from '../../src/modules/identity/shared/companyUsersViewModel.service'
import {
  resolveLandingWorkspace,
  visibleWorkspaceKeys,
} from '../../src/modules/shared/workspaceAccess.service'

/** Papéis que o painel de Acesso não oferece: o contratante tem fluxo próprio, e não se convida um robô. */
const ROLES_OUTSIDE_THE_INVITE = ['contractor', 'automation'] as const

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

function readLiterals(source: string, constantName: string): readonly string[] {
  const block = new RegExp(`${constantName}[^=]*= (?:Object\\.freeze\\()?\\[([^\\]]*)\\]`).exec(
    source,
  )?.[1]
  if (block === undefined) throw new Error(`Expected ${constantName} in the versioned source`)
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1] as string)
}

describe('o papel Ajudante em Acesso (spec 235 T10)', () => {
  test('o convite oferece o ajudante', () => {
    expect(COMPANY_ROLES).toContain('helper')
    expect(buildRoleChoices(['operator'])).toContain('helper')
  })

  test('a lista do convite é a da API, menos os papéis que não se convidam por aqui', () => {
    const apiRoles = readLiterals(
      readSource('../api-transportada/src/database/identity.schema.ts'),
      'COMPANY_ROLES',
    )

    const inviteRoles: readonly string[] = COMPANY_ROLES

    expect(inviteRoles).toEqual(
      apiRoles.filter((role) => !(ROLES_OUTSIDE_THE_INVITE as readonly string[]).includes(role)),
    )
  })

  test('os papéis com ficha de frota são os mesmos que a API vincula pelo CPF', () => {
    const apiLinkedRoles = readLiterals(
      readSource('../api-transportada/src/identity/domain/fleet-linked-roles.constant.ts'),
      'FLEET_LINKED_ROLES',
    )

    expect([...FLEET_LINKED_ROLES].sort()).toEqual([...apiLinkedRoles].sort())
    expect(FLEET_LINKED_ROLES).toContain('helper')
  })

  test('a tabela decide o caminho da ficha por essa lista, não por uma cópia local', () => {
    const source = readSource('src/modules/identity/components/CompanyUserTable.component.tsx')

    expect(source).toContain('FLEET_LINKED_ROLES.includes(role)')
    expect(source).not.toContain("['driver', 'aggregate']")
  })

  test('todo papel convidável tem rótulo nos dois idiomas, e o ajudante se chama Ajudante', () => {
    for (const role of COMPANY_ROLES) {
      expect(ptLocale.users.role[role]).toBeString()
      expect(enLocale.users.role[role]).toBeString()
    }
    expect(ptLocale.users.role.helper).toBe('Ajudante')
    expect(enLocale.users.role.helper).toBe('Helper')
  })

  test('a dica do CPF avisa que o ajudante também é achado pela ficha de frota', () => {
    expect(ptLocale.users.inviteDialog.taxIdHint).toContain('Ajudante')
    expect(enLocale.users.inviteDialog.taxIdHint).toContain('Helper')
  })

  test('a conta só com o papel (trip.read) não abre workspace nenhum e cai na tela de sem acesso', () => {
    const helper = { permissions: ['trip.read'], roles: ['helper'] }

    expect(visibleWorkspaceKeys(helper.permissions)).toEqual([])
    expect(
      resolveLandingWorkspace({ ...helper, current: 'nfe', hasLanded: false, source: 'default' }),
    ).toEqual({ kind: 'no-access' })
    // Spec 239 D5: o landing segue 'no-access'; a tela é que diz que a conta acompanha viagens.
    expect(
      resolveNoWorkspaceAccessVariant({ driverAppUrl: undefined, permissions: helper.permissions }),
    ).toEqual({ kind: 'tracking' })
  })

  test('a recusa FLEET_DRIVER_PROFILE_EMPTY da troca de papéis tem mensagem própria nos dois idiomas', () => {
    const { errors: ptErrors } = ptLocale.users
    const { errors: enErrors } = enLocale.users

    expect(ptErrors.FLEET_DRIVER_PROFILE_EMPTY).toContain('Pode atuar como ajudante')
    expect(ptErrors.FLEET_DRIVER_PROFILE_EMPTY).not.toBe(ptErrors.default)
    expect(enErrors.FLEET_DRIVER_PROFILE_EMPTY).toContain('Can act as a helper')
    expect(enErrors.FLEET_DRIVER_PROFILE_EMPTY).not.toBe(enErrors.default)
  })
})

describe('a recusa de papéis aparece junto dos papéis (spec 235 A4)', () => {
  const source = readSource('src/modules/identity/components/CompanyUserEditDialog.component.tsx')

  test('FLEET_DRIVER_PROFILE_EMPTY vem logo abaixo do grupo de papéis, antes da senha', () => {
    const rolesAt = source.indexOf('<CompanyUserRoleField')
    const roleAlertAt = source.indexOf('<DialogError code={roleErrorCode} />')
    const passwordAt = source.indexOf('<CompanyUserPasswordPanel')

    expect(rolesAt).toBeGreaterThan(-1)
    expect(roleAlertAt).toBeGreaterThan(rolesAt)
    expect(roleAlertAt).toBeLessThan(passwordAt)
  })

  test('o rodapé guarda os outros erros e nunca repete o dos papéis', () => {
    expect(source).toContain(
      "const ROLE_ERROR_CODES: readonly string[] = ['FLEET_DRIVER_PROFILE_EMPTY']",
    )
    expect(source).toContain('<DialogError code={footerErrorCode} />')
    expect(source).toContain('const footerErrorCode = isRoleError ? undefined : errorCode')
    expect(source.match(/role="alert"/g)).toHaveLength(1)
  })
})

describe('o link do ajudante para a ficha se chama ficha de frota (spec 235 A5)', () => {
  const table = readSource('src/modules/identity/components/CompanyUserTable.component.tsx')

  test('o papel helper usa o rótulo próprio; motorista e agregado mantêm o atual', () => {
    expect(table).toContain("fleetRole === 'helper' ? 'users.fleet.helper' : 'users.fleet.driver'")
    expect(ptLocale.users.fleet.helper).toBe('Ficha de frota')
    expect(enLocale.users.fleet.helper).toBe('Fleet record')
    expect(ptLocale.users.fleet.driver).toBe('Ficha do motorista')
    expect(enLocale.users.fleet.driver).toBe('Driver record')
  })
})
