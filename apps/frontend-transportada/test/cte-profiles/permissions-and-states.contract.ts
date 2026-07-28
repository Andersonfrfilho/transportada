/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  EMPTY_PROFILE_LIST_PAGE,
  loadFutureModule,
  PROFILE_BODY,
  PROFILE_DETAIL,
  PROFILE_ID,
  PROFILE_LIST_PAGE,
  SETTINGS_MANAGE,
} from './cte-profiles.fixture'

describe('cte emission profiles permissions and states contract', () => {
  test('exposes profile mutations only to settings.manage', async () => {
    const { createCteProfilesController } = await loadFutureModule<CteProfilesHookModule>(
      '../../src/modules/cte-profiles/hooks/useCteProfiles.hook',
    )
    const client = createMutationRecordingClient()

    const forbiddenController = createCteProfilesController({ client, permissions: [] })
    expect(forbiddenController.canManageProfiles).toBe(false)
    expect(
      await forbiddenController.createProfile(PROFILE_BODY).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_PROFILES_FORBIDDEN' }))
    expect(
      await forbiddenController
        .updateProfile({ ...PROFILE_BODY, expectedVersion: '1', profileId: PROFILE_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_PROFILES_FORBIDDEN' }))
    expect(
      await forbiddenController
        .activateProfile({ expectedVersion: '1', profileId: PROFILE_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_PROFILES_FORBIDDEN' }))
    expect(
      await forbiddenController
        .deactivateProfile({ expectedVersion: '1', profileId: PROFILE_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_PROFILES_FORBIDDEN' }))
    expect(client.mutationCount).toBe(0)

    const controller = createCteProfilesController({ client, permissions: [SETTINGS_MANAGE] })
    expect(controller.canManageProfiles).toBe(true)
    await controller.createProfile(PROFILE_BODY)
    await controller.activateProfile({ expectedVersion: '1', profileId: PROFILE_ID })
    expect(client.mutationCount).toBe(2)
  })

  test('maps forbidden, empty, ready and error states without leaking tenant or fiscal payload', async () => {
    const { createCteProfilesViewModel } = await loadFutureModule<CteProfilesViewModelModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesViewModel.service',
    )

    expect(
      createCteProfilesViewModel({
        permissions: [],
        profiles: PROFILE_LIST_PAGE,
        status: 'success',
      }),
    ).toEqual({ canManageProfiles: false, status: 'forbidden' })

    expect(
      createCteProfilesViewModel({
        permissions: [SETTINGS_MANAGE],
        profiles: EMPTY_PROFILE_LIST_PAGE,
        status: 'success',
      }),
    ).toEqual({ canManageProfiles: true, hasActiveProfile: false, status: 'empty' })

    const readyViewModel = createCteProfilesViewModel({
      permissions: [SETTINGS_MANAGE],
      profiles: {
        items: [PROFILE_DETAIL, { ...PROFILE_DETAIL, id: 'other-profile', status: 'active' }],
        nextCursor: null,
      },
      status: 'success',
    })
    expect(readyViewModel.status).toBe('ready')
    expect(readyViewModel.hasActiveProfile).toBe(true)
    expect(readyViewModel.selectedProfileId).toBe(PROFILE_ID)
    expect(JSON.stringify(readyViewModel)).not.toContain('companyId')

    expect(createCteProfilesViewModel({ permissions: [SETTINGS_MANAGE], status: 'error' })).toEqual(
      {
        canManageProfiles: true,
        status: 'error',
      },
    )
    expect(
      createCteProfilesViewModel({ permissions: [SETTINGS_MANAGE], status: 'loading' }),
    ).toEqual({ canManageProfiles: true, status: 'loading' })
  })
})

function createMutationRecordingClient(): CteProfilesClient & { readonly mutationCount: number } {
  let mutationCount = 0
  const recordMutation = (): Promise<unknown> => {
    mutationCount += 1
    return Promise.resolve(PROFILE_DETAIL)
  }

  return {
    activateProfile: recordMutation,
    createProfile: recordMutation,
    deactivateProfile: recordMutation,
    listProfiles: () => Promise.resolve(PROFILE_LIST_PAGE),
    get mutationCount(): number {
      return mutationCount
    },
    updateProfile: recordMutation,
  }
}

type ProfileVersionInput = Readonly<{ expectedVersion: string; profileId: string }>

type CteProfilesClient = {
  activateProfile(input: ProfileVersionInput): Promise<unknown>
  createProfile(input: typeof PROFILE_BODY): Promise<unknown>
  deactivateProfile(input: ProfileVersionInput): Promise<unknown>
  listProfiles(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
  updateProfile(input: typeof PROFILE_BODY & ProfileVersionInput): Promise<unknown>
}

type CteProfilesHookModule = {
  readonly createCteProfilesController: (input: {
    readonly client: CteProfilesClient
    readonly permissions: readonly string[]
  }) => {
    readonly activateProfile: (input: ProfileVersionInput) => Promise<void>
    readonly canManageProfiles: boolean
    readonly createProfile: (input: typeof PROFILE_BODY) => Promise<void>
    readonly deactivateProfile: (input: ProfileVersionInput) => Promise<void>
    readonly updateProfile: (input: typeof PROFILE_BODY & ProfileVersionInput) => Promise<void>
  }
}

type CteProfilesViewModelModule = {
  readonly createCteProfilesViewModel: (input: {
    readonly permissions: readonly string[]
    readonly profiles?: unknown
    readonly status: 'error' | 'loading' | 'success'
  }) => {
    readonly canManageProfiles: boolean
    readonly hasActiveProfile?: boolean
    readonly selectedProfileId?: string
    readonly status: 'empty' | 'error' | 'forbidden' | 'loading' | 'ready'
  }
}
