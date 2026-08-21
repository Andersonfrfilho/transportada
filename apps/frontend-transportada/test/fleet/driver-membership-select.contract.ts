/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const MEMBERSHIP_SERVICE = '../../src/modules/fleet/shared/driverMembership.service'
const MEMBERSHIP_FIELD_PATH = 'src/modules/fleet/components/DriverMembershipField.component.tsx'
const MEMBERSHIP_HOOK_PATH = 'src/modules/fleet/hooks/useDriverMemberships.hook.ts'
const COMPANY_USERS_QUERY_PATH = 'src/modules/identity/queries/useCompanyUsers.query.ts'
const DRIVER_FORM_PATH = 'src/modules/fleet/components/DriverForm.component.tsx'
const QUICK_CREATE_PATH = 'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx'

type CompanyUserSummary = Readonly<{
  id: string
  membershipId: string
  name: string
  status: 'active' | 'invited' | 'suspended'
  username: string
}>

type MembershipChoice = Readonly<{ label: string; value: string }>

type MembershipModule = Readonly<{
  buildDriverMembershipChoices: (
    input: Readonly<{ selected: string; users: readonly CompanyUserSummary[] }>,
  ) => readonly MembershipChoice[]
  resolveMembershipEntryMode: (
    input: Readonly<{ canReadUsers: boolean; choiceCount: number; isLoading: boolean }>,
  ) => string
}>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function loadMembershipService(): Promise<MembershipModule> {
  return loadFutureModule<MembershipModule>(MEMBERSHIP_SERVICE)
}

function user(input: Partial<CompanyUserSummary> & Pick<CompanyUserSummary, 'membershipId'>) {
  return {
    id: `pessoa-${input.membershipId}`,
    name: 'Pessoa',
    status: 'active',
    username: `login-${input.membershipId}`,
    ...input,
  } as CompanyUserSummary
}

describe('fleet driver membership select contract', () => {
  /**
   * O vínculo é o que a frota guarda, não a pessoa: são chaves diferentes na API, e a opção precisa
   * carregar o vínculo — a pessoa no rótulo não serve de valor.
   */
  test('offers the membership as the value and the person as the label', async () => {
    const { buildDriverMembershipChoices } = await loadMembershipService()

    const choices = buildDriverMembershipChoices({
      selected: '',
      users: [user({ membershipId: 'vinculo-1', name: 'Ana Souza' })],
    })

    expect(choices).toEqual([{ label: 'Ana Souza', value: 'vinculo-1' }])
  })

  test('orders the people in pt-BR and falls back to the login without a name', async () => {
    const { buildDriverMembershipChoices } = await loadMembershipService()

    const choices = buildDriverMembershipChoices({
      selected: '',
      users: [
        user({ membershipId: 'vinculo-1', name: 'Ítalo Ramos' }),
        user({ membershipId: 'vinculo-2', name: '   ', username: 'ana.souza' }),
        user({ membershipId: 'vinculo-3', name: 'Zulmira Dias' }),
      ],
    })

    expect(choices.map((choice) => choice.label)).toEqual([
      'ana.souza',
      'Ítalo Ramos',
      'Zulmira Dias',
    ])
  })

  /** Vínculo suspenso não grava motorista: oferecê-lo é erro que só aparece ao salvar. */
  test('never offers a suspended membership', async () => {
    const { buildDriverMembershipChoices } = await loadMembershipService()

    const choices = buildDriverMembershipChoices({
      selected: '',
      users: [
        user({ membershipId: 'ativo', status: 'active' }),
        user({ membershipId: 'convidado', status: 'invited' }),
        user({ membershipId: 'suspenso', status: 'suspended' }),
      ],
    })

    expect(choices.map((choice) => choice.value).sort()).toEqual(['ativo', 'convidado'])
  })

  /**
   * O gatilho do select casa a opção pelo valor: sem a linha, ficha com vínculo preenchido mostraria
   * o placeholder, e salvar sem tocar no campo apagaria o vínculo.
   */
  test('keeps the stored membership selectable when it is suspended or absent', async () => {
    const { buildDriverMembershipChoices } = await loadMembershipService()

    const suspended = buildDriverMembershipChoices({
      selected: 'suspenso',
      users: [
        user({ membershipId: 'ativo' }),
        user({ membershipId: 'suspenso', name: 'Fora do Ar', status: 'suspended' }),
      ],
    })
    const removed = buildDriverMembershipChoices({
      selected: 'vinculo-removido',
      users: [user({ membershipId: 'ativo' })],
    })

    expect(suspended.map((choice) => choice.value).sort()).toEqual(['ativo', 'suspenso'])
    expect(suspended.map((choice) => choice.label)).toContain('Fora do Ar')
    expect(removed.map((choice) => choice.value)).toEqual(['ativo', 'vinculo-removido'])
  })

  test('offers no option when nothing is stored and nobody was listed', async () => {
    const { buildDriverMembershipChoices } = await loadMembershipService()

    expect(buildDriverMembershipChoices({ selected: '', users: [] })).toEqual([])
    expect(buildDriverMembershipChoices({ selected: '   ', users: [] })).toEqual([])
  })

  /** Dois nomes iguais viram duas linhas idênticas, e escolher a errada só aparece no relatório. */
  test('breaks a repeated name with the login, and only the repeated one', async () => {
    const { buildDriverMembershipChoices } = await loadMembershipService()

    const choices = buildDriverMembershipChoices({
      selected: '',
      users: [
        user({ membershipId: 'vinculo-1', name: 'João Silva', username: 'joao.silva' }),
        user({ membershipId: 'vinculo-2', name: 'João Silva', username: 'joao.s2' }),
        user({ membershipId: 'vinculo-3', name: 'Marta Reis', username: 'marta.reis' }),
      ],
    })

    expect(choices.map((choice) => choice.label)).toEqual([
      'João Silva · joao.s2',
      'João Silva · joao.silva',
      'Marta Reis',
    ])
  })

  /**
   * Sem `users.manage` a rota responde 403, e o operador da frota que não administra usuários ainda
   * precisa cadastrar motorista: o campo volta a ser teclado em vez de virar um select sem linha.
   */
  test('falls back to typing without the permission or without a list', async () => {
    const { resolveMembershipEntryMode } = await loadMembershipService()

    expect(
      resolveMembershipEntryMode({ canReadUsers: true, choiceCount: 12, isLoading: false }),
    ).toBe('list')
    expect(
      resolveMembershipEntryMode({ canReadUsers: false, choiceCount: 12, isLoading: false }),
    ).toBe('text')
    expect(
      resolveMembershipEntryMode({ canReadUsers: true, choiceCount: 0, isLoading: false }),
    ).toBe('text')
    expect(
      resolveMembershipEntryMode({ canReadUsers: false, choiceCount: 0, isLoading: true }),
    ).toBe('list')
  })

  /** O teto da API é 100 em `limit`: pedir mais é 400, e ignorar o cursor perde vínculo. */
  test('reads every page of company users within the limit the API accepts', async () => {
    const query = await readApplicationFile(COMPANY_USERS_QUERY_PATH)

    expect(query).toContain('PAGE_LIMIT = 100')
    expect(query).toContain("url.searchParams.set('limit', String(PAGE_LIMIT))")
    expect(query).toContain('result.page.nextCursor')
    expect(query).toContain('MAXIMUM_PAGES')
  })

  /** `membershipId` é o vínculo publicado ao lado da pessoa: sem ele o campo não tem valor a gravar. */
  test('requires the membership beside the person in the wire guard', async () => {
    const query = await readApplicationFile(COMPANY_USERS_QUERY_PATH)

    expect(query).toContain("typeof value.membershipId === 'string'")
    expect(query).toContain("typeof value.id === 'string'")
    expect(query).not.toContain('as CompanyUsersPage)')
  })

  test('keeps the query in the hook and the choices in the declarative field', async () => {
    const hook = await readApplicationFile(MEMBERSHIP_HOOK_PATH)
    const field = await readApplicationFile(MEMBERSHIP_FIELD_PATH)

    expect(hook).toContain('useCompanyUsersQuery')
    expect(hook).toContain('buildDriverMembershipChoices')
    expect(hook).toContain("USERS_MANAGE_PERMISSION = 'users.manage'")
    expect(field).not.toContain('useQuery')
    expect(field).not.toContain('useCompanyUsersQuery')
  })

  test('publishes the membership field as a searchable select of the design system', async () => {
    const field = await readApplicationFile(MEMBERSHIP_FIELD_PATH)

    expect(field).toContain("from '@/components/ui/select'")
    expect(field).toContain("searchPlaceholder={t('driverMembershipSearch')}")
    expect(field).toContain("placeholder={t('driverMembershipUnset')}")
    expect(field).toContain('SkeletonGroup')
    expect(field).not.toContain('<select')
  })

  /** O UUID de 36 caracteres digitado à mão é um dígito errado descoberto no primeiro login. */
  test('replaces the hand-typed identifier in both driver forms', async () => {
    const form = await readApplicationFile(DRIVER_FORM_PATH)
    const dialog = await readApplicationFile(QUICK_CREATE_PATH)

    for (const source of [form, dialog]) {
      expect(source).toContain('<DriverMembershipField')
      expect(source).not.toMatch(/FleetField[\s\S]{0,120}driverMembership/)
    }
  })

  test('names the membership field in both locales', async () => {
    const ptBr = JSON.parse(
      await readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
    ) as Record<string, unknown>
    const english = JSON.parse(
      await readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ) as Record<string, unknown>

    for (const key of [
      'driverMembership',
      'driverMembershipHint',
      'driverMembershipSearch',
      'driverMembershipUnset',
    ]) {
      expect(typeof ptBr[key]).toBe('string')
      expect(typeof english[key]).toBe('string')
    }
    expect(ptBr['driverMembershipHint']).not.toContain('Identificador')
  })
})
