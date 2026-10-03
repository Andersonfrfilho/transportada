/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Achado A3 da spec 235: as funções de salvar de `useUserAdministration` faziam `await mutateAsync`, que
 * rejeita com o erro da API, e a página as chama com `void` — a rejeição virava `unhandledrejection`
 * (um `pageerror` no navegador). O erro já está em `mutation.error` e a tela o mostra: o que se prova é
 * que a função **não rejeita** e que o diálogo **continua aberto** na falha, e fecha no sucesso.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { act } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { AUTH_ME_QUERY_KEY } from '@/modules/identity/queries/useAuthMe.query'
import type { CompanyUsersClient } from '@/modules/identity/hooks/useCompanyUsers.hook'
import type { CompanyUser } from '@/modules/identity/shared/companyUsers.types'

import { renderHook, settle, waitFor, type RenderedHook } from './renderHook.helper'

const { useUserAdministration } = await import(
  '@/modules/identity/hooks/useUserAdministration.hook'
)

const ENVIRONMENT = {
  VITE_API_URL: 'https://api.example.test',
  VITE_APP_URL: 'https://app.example.test',
  VITE_KEYCLOAK_CLIENT_ID: 'transportada-web',
  VITE_KEYCLOAK_REALM: 'transportada',
  VITE_KEYCLOAK_URL: 'https://keycloak.example.test',
} as const

const AUTH_ME = {
  data: {
    company: { id: 'company-1' },
    identity: { userId: 'user-self' },
    permissions: ['users.manage'],
  },
}

const TARGET: CompanyUser = {
  contact: { channel: 'email', masked: 'a***@example.test' },
  email: 'a***@example.test',
  emails: ['a***@example.test'],
  hasPicture: false,
  id: 'user-target',
  membershipId: 'membership-target',
  name: 'Pessoa Alvo',
  phone: '',
  roles: ['operator'],
  status: 'active',
  taxId: '',
  username: 'pessoa.alvo',
}

type Behavior = { isFailing: boolean }

function createClient(behavior: Behavior): CompanyUsersClient {
  function respond<TResult>(result: TResult): Promise<TResult> {
    return behavior.isFailing ? Promise.reject(new Error('SAVE_REFUSED')) : Promise.resolve(result)
  }
  return {
    activateUser: () => respond(TARGET),
    assignRoles: () => respond({ roles: ['operator'], userIds: [] }),
    inviteUser: () => respond({ fleetLink: 'not-applicable', user: TARGET }),
    listUsers: () => Promise.resolve({ nextCursor: null, users: [] }),
    removeUser: () => respond(undefined),
    replaceRoles: () => respond(TARGET),
    resendInvitation: () => respond({ sent: true }),
    updateProfile: () => respond(TARGET),
  } as unknown as CompanyUsersClient
}

describe('useUserAdministration — salvar não rejeita a promise (A3)', () => {
  const previousEnvironment = Object.fromEntries(
    Object.keys(ENVIRONMENT).map((name) => [name, process.env[name]]),
  )
  const previousFetch = globalThis.fetch
  let hook: RenderedHook<ReturnType<typeof useUserAdministration>> | undefined
  const behavior: Behavior = { isFailing: true }

  beforeAll(() => {
    Object.assign(process.env, ENVIRONMENT)
    globalThis.fetch = Object.assign(() => Promise.reject(new Error('NETWORK_DISABLED')), {
      preconnect: () => undefined,
    })
  })

  afterAll(() => {
    globalThis.fetch = previousFetch
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  afterEach(() => {
    hook?.unmount()
    hook = undefined
  })

  async function mountHook(isFailing: boolean) {
    behavior.isFailing = isFailing
    const client = createClient(behavior)
    hook = await renderHook(() => {
      const queryClient = useQueryClient()
      const isSeeded = useRef(false)
      if (!isSeeded.current) {
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, AUTH_ME)
        isSeeded.current = true
      }
      return useUserAdministration({ client })
    })
    await waitFor(() => expect(hook?.result().users.usersQuery.isSuccess).toBe(true))
    return hook
  }

  async function run(action: () => Promise<void> | void): Promise<void> {
    await act(async () => {
      await action()
    })
    await settle()
  }

  test('remover: a falha não rejeita e o diálogo segue aberto; o sucesso fecha', async () => {
    const failing = await mountHook(true)
    await run(() => failing.result().openRemove(TARGET))
    await run(() => failing.result().confirmRemove())
    expect(failing.result().removeTarget).toEqual(TARGET)
    expect(failing.result().users.removeUserMutation.isError).toBe(true)
    failing.unmount()

    const succeeding = await mountHook(false)
    await run(() => succeeding.result().openRemove(TARGET))
    await run(() => succeeding.result().confirmRemove())
    expect(succeeding.result().removeTarget).toBeNull()
  })

  test('editar: a falha não rejeita e o diálogo segue aberto; o sucesso fecha', async () => {
    const failing = await mountHook(true)
    await run(() => failing.result().openEdit(TARGET))
    await run(() => failing.result().editForm.setName('Outro Nome'))
    await run(() => failing.result().submitEdit())
    expect(failing.result().editTarget).toEqual(TARGET)
    expect(failing.result().users.updateProfileMutation.isError).toBe(true)
    failing.unmount()

    const succeeding = await mountHook(false)
    await run(() => succeeding.result().openEdit(TARGET))
    await run(() => succeeding.result().editForm.setName('Outro Nome'))
    await run(() => succeeding.result().submitEdit())
    expect(succeeding.result().editTarget).toBeNull()
  })

  test('ativar e reenviar convite: a falha não rejeita e não marca o aviso de sucesso', async () => {
    const failing = await mountHook(true)
    await run(() => failing.result().activateUser(TARGET))
    await run(() => failing.result().resendInvitation(TARGET))
    expect(failing.result().activatedUserId).toBeNull()
    expect(failing.result().resentUserId).toBeNull()
    failing.unmount()

    const succeeding = await mountHook(false)
    await run(() => succeeding.result().activateUser(TARGET))
    await run(() => succeeding.result().resendInvitation(TARGET))
    expect(succeeding.result().activatedUserId).toBe(TARGET.id)
    expect(succeeding.result().resentUserId).toBe(TARGET.id)
  })

  test('convidar: a falha não rejeita e o diálogo segue aberto; o sucesso fecha', async () => {
    async function fillAndSubmit(mounted: NonNullable<typeof hook>) {
      await run(() => mounted.result().openInvite())
      await run(() => {
        mounted.result().inviteForm.setName('Pessoa Nova')
        mounted.result().inviteForm.setEmail('nova@example.test')
      })
      expect(mounted.result().inviteForm.issues).toHaveLength(0)
      await run(() => mounted.result().submitInvite())
    }
    const failing = await mountHook(true)
    await fillAndSubmit(failing)
    expect(failing.result().isInviteOpen).toBe(true)
    failing.unmount()

    const succeeding = await mountHook(false)
    await fillAndSubmit(succeeding)
    expect(succeeding.result().isInviteOpen).toBe(false)
  })

  test('papéis e grupos em lote: a falha não rejeita', async () => {
    const failing = await mountHook(true)
    await run(() => failing.result().assignRoles(['operator']))
    await run(() => failing.result().assignGroups(['group-1']))
    expect(failing.result().users.assignRolesMutation.isError).toBe(true)
  })
})
