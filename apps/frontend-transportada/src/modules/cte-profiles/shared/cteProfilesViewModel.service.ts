/* Copyright (c) 2026 Ada Technology. MIT License. */
import { SETTINGS_MANAGE_PERMISSION } from './cteProfiles.constant'
import type { CteProfileDetail, CteProfileListPage } from './cteProfiles.types'

export type CteProfilesViewModel = Readonly<{
  canManageProfiles: boolean
  hasActiveProfile?: boolean
  profiles?: readonly CteProfileDetail[]
  selectedProfileId?: string
  status: 'empty' | 'error' | 'forbidden' | 'loading' | 'ready'
}>

type ViewModelInput = Readonly<{
  permissions: readonly string[]
  profiles?: CteProfileListPage
  status: 'error' | 'loading' | 'success'
}>

export function createCteProfilesViewModel(input: ViewModelInput): CteProfilesViewModel {
  const canManageProfiles = input.permissions.includes(SETTINGS_MANAGE_PERMISSION)
  if (!canManageProfiles) return { canManageProfiles, status: 'forbidden' }
  if (input.status !== 'success') return { canManageProfiles, status: input.status }

  const profiles = input.profiles?.items ?? []
  const hasActiveProfile = profiles.some((profile) => profile.status === 'active')
  if (profiles.length === 0) return { canManageProfiles, hasActiveProfile, status: 'empty' }

  return {
    canManageProfiles,
    hasActiveProfile,
    profiles,
    ...(profiles[0] === undefined ? {} : { selectedProfileId: profiles[0].id }),
    status: 'ready',
  }
}
