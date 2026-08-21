/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CLIENT_PATH = 'src/modules/fleet/shared/fleetClient.service.ts'
const CONSTANT_MODULE = '../../src/modules/fleet/shared/fleet.constant'
const DRIVER_FORM_PATH = 'src/modules/fleet/components/DriverForm.component.tsx'
const DRIVER_FORM_HOOK_PATH = 'src/modules/fleet/hooks/useDriverForm.hook.ts'
const FORM_SERVICE = '../../src/modules/fleet/shared/fleetForm.service'
const LOCALE_PATH = 'src/modules/fleet/locales/fleet.locale.json'
const LOCALE_EN_PATH = 'src/modules/fleet/locales/fleet.en.locale.json'
const QUICK_CREATE_PATH = 'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx'
const TYPES_MODULE = '../../src/modules/fleet/shared/fleet.types'

/**
 * O bundle não carrega código da API: a lista é reescrita no frontend, e o que garante que as duas
 * dizem a mesma coisa é esta asserção — a disciplina de `vehicle-type-catalog.contract.ts`.
 */
const PROFILES = ['aggregate', 'driver'] as const

/** Arquivos que o vínculo digitado deixou órfãos: o select saiu, e eles não têm outro consumidor. */
const REMOVED_FILES = [
  'src/modules/fleet/components/DriverMembershipField.component.tsx',
  'src/modules/fleet/hooks/useDriverMemberships.hook.ts',
  'src/modules/fleet/shared/driverMembership.service.ts',
  'src/modules/identity/queries/useCompanyUsers.query.ts',
] as const

type ConstantModule = Readonly<{
  DRIVER_BODY_KEYS: readonly string[]
  DRIVER_CREATE_BODY_KEYS: readonly string[]
  DRIVER_FORM_KEYS: readonly string[]
}>

type FormModule = Readonly<{
  createDriverDraft: (input?: Record<string, unknown>) => Record<string, unknown>
  toDriverBody: (state: Record<string, unknown>) => Record<string, unknown>
  toDriverCreateBody: (state: Record<string, unknown>) => Record<string, unknown>
}>

type TypesModule = Readonly<{ FLEET_DRIVER_PROFILES: readonly string[] }>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('fleet driver profile', () => {
  test('mirrors the API profile catalog, in the same order', async () => {
    const { FLEET_DRIVER_PROFILES } = await loadFutureModule<TypesModule>(TYPES_MODULE)

    expect(FLEET_DRIVER_PROFILES).toEqual(PROFILES)
  })

  /**
   * O motorista nasce usuário do sistema, e o perfil é o papel que a criação abre. Ele não é campo
   * de ficha: a API não o devolve, então editar não o mostra nem o reenvia.
   */
  test('travels only in the create body', async () => {
    const { DRIVER_BODY_KEYS, DRIVER_CREATE_BODY_KEYS } =
      await loadFutureModule<ConstantModule>(CONSTANT_MODULE)

    expect(DRIVER_CREATE_BODY_KEYS).toContain('profile')
    expect(DRIVER_CREATE_BODY_KEYS).not.toContain('membershipId')
    expect(DRIVER_BODY_KEYS).not.toContain('profile')
    expect(DRIVER_BODY_KEYS).toContain('membershipId')
  })

  test('is a form key, and the membership is not', async () => {
    const { DRIVER_FORM_KEYS } = await loadFutureModule<ConstantModule>(CONSTANT_MODULE)

    expect(DRIVER_FORM_KEYS).toContain('profile')
    expect(DRIVER_FORM_KEYS).not.toContain('membershipId')
  })

  test('opens the draft as driver, the profile that drives any vehicle', async () => {
    const { createDriverDraft } = await loadFutureModule<FormModule>(FORM_SERVICE)

    expect(createDriverDraft().profile).toBe('driver')
  })

  test('leaves the update body without profile and the create body without membership', async () => {
    const { createDriverDraft, toDriverBody, toDriverCreateBody } =
      await loadFutureModule<FormModule>(FORM_SERVICE)
    const state = { ...createDriverDraft(), profile: 'aggregate' }

    expect(toDriverCreateBody(state).profile).toBe('aggregate')
    expect(Object.keys(toDriverCreateBody(state))).not.toContain('membershipId')
    expect(Object.keys(toDriverBody(state))).not.toContain('membershipId')
    expect(Object.keys(toDriverBody(state))).not.toContain('profile')
  })

  /**
   * O vínculo é o que o motorista da frota referencia, e a edição não pode soltá-lo: quem o reenvia
   * é a ficha carregada, não o formulário — que deixou de tê-lo como campo.
   */
  test('re-sends the loaded membership on update', async () => {
    const source = await readApplicationFile(DRIVER_FORM_HOOK_PATH)

    expect(source).toContain('membershipId: driver.membershipId')
    expect(source).toContain('toDriverCreateBody')
  })

  test('never picks a key outside the create allowlist', async () => {
    const source = await readApplicationFile(CLIENT_PATH)

    expect(source).toContain('DRIVER_CREATE_BODY_KEYS')
  })

  test('is offered by both driver forms', async () => {
    const [driverForm, quickCreate] = await Promise.all([
      readApplicationFile(DRIVER_FORM_PATH),
      readApplicationFile(QUICK_CREATE_PATH),
    ])

    for (const source of [driverForm, quickCreate]) {
      expect(source).toContain('driverProfileOption')
      expect(source).not.toContain('DriverMembershipField')
      expect(source).not.toContain('driverMembership')
    }
  })

  test('leaves no orphan behind', async () => {
    for (const filePath of REMOVED_FILES) {
      expect(await Bun.file(new URL(filePath, APPLICATION_ROOT)).exists()).toBe(false)
    }
  })

  test('names the two profiles in both locales, and forgets the membership', async () => {
    const [locale, localeEn] = await Promise.all([
      readApplicationFile(LOCALE_PATH),
      readApplicationFile(LOCALE_EN_PATH),
    ])

    for (const source of [locale, localeEn]) {
      const messages = JSON.parse(source) as Record<string, unknown>
      const options = messages.driverProfileOption as Record<string, string>
      expect(typeof messages.driverProfile).toBe('string')
      for (const profile of PROFILES) expect(typeof options[profile]).toBe('string')
      for (const key of Object.keys(messages))
        expect(key.startsWith('driverMembership')).toBe(false)
    }
  })

  test('keeps the client create signature apart from the update one', async () => {
    const source = await readApplicationFile(CLIENT_PATH)

    expect(source).toContain('createDriver: (input: FleetDriverCreateBody)')
    expect(source).toContain('updateDriver: (input: FleetDriverBody & FleetDriverVersionInput)')
  })
})
