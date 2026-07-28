/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import {
  CteEmissionProfileNameTakenError,
  CteEmissionProfileNotFoundError,
  CteEmissionProfileVersionConflictError,
} from '../domain/cte-profile.error.js'
import type {
  CteEmissionProfileComponentInput,
  CteEmissionProfileDetail,
  CteEmissionProfileFreightRuleInput,
  CteEmissionProfileMatcherInput,
  CteEmissionProfileSettings,
  CteEmissionProfileTransactionPort,
} from './cte-emission-profile.port.js'

const NAME_TAKEN_SIGNAL = 'CTE_PROFILE_NAME_TAKEN'
const FREIGHT_RULE_DESCRIPTION = 'Regra de frete vinculada ao perfil de emissao de CT-e'

export const CREATE_OPERATION = 'cte-emission-profile.create'
export const ENTITY_TYPE = 'cte-emission-profile'

export const PROFILE_ACTION = {
  ACTIVATED: 'cte-emission-profile.activated',
  CREATED: 'cte-emission-profile.created',
  DEACTIVATED: 'cte-emission-profile.deactivated',
  UPDATED: 'cte-emission-profile.updated',
} as const

export function createIdempotencyConflict(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}

export function freightRuleChanged(
  current: CteEmissionProfileFreightRuleInput,
  next: CteEmissionProfileFreightRuleInput,
): boolean {
  return (
    current.maximumAmount !== next.maximumAmount ||
    current.minimumAmount !== next.minimumAmount ||
    current.percentage !== next.percentage ||
    current.validFrom !== next.validFrom ||
    current.validUntil !== next.validUntil
  )
}

export function createProfileSnapshot(
  profile: CteEmissionProfileDetail,
): Readonly<Record<string, unknown>> {
  return {
    freightRuleId: profile.freightRuleId,
    matchMode: profile.matchMode,
    percentage: profile.freightRule.percentage,
    profileId: profile.id,
    status: profile.status,
  }
}

export function withChildren(input: {
  readonly components: readonly CteEmissionProfileComponentInput[]
  readonly matchers: readonly CteEmissionProfileMatcherInput[]
  readonly profile: CteEmissionProfileDetail
}): CteEmissionProfileDetail {
  return { ...input.profile, components: input.components, matchers: input.matchers }
}

export async function loadProfile(input: {
  readonly companyId: string
  readonly profileId: string
  readonly transaction: CteEmissionProfileTransactionPort
}): Promise<CteEmissionProfileDetail> {
  const profile = await input.transaction.findProfile({
    companyId: input.companyId,
    profileId: input.profileId,
  })
  if (profile === null) throw new CteEmissionProfileNotFoundError()
  return profile
}

/** A null write means the row is gone, foreign or stale — only the read tells them apart. */
export async function requirePersisted(input: {
  readonly companyId: string
  readonly persisted: CteEmissionProfileDetail | null
  readonly profileId: string
  readonly transaction: CteEmissionProfileTransactionPort
}): Promise<CteEmissionProfileDetail> {
  if (input.persisted !== null) return input.persisted
  await loadProfile({
    companyId: input.companyId,
    profileId: input.profileId,
    transaction: input.transaction,
  })
  throw new CteEmissionProfileVersionConflictError()
}

export async function insertProfileWithFreightRule(input: {
  readonly companyId: string
  readonly createdByUserId: string
  readonly freightRule: CteEmissionProfileFreightRuleInput
  readonly settings: CteEmissionProfileSettings
  readonly transaction: CteEmissionProfileTransactionPort
}): Promise<CteEmissionProfileDetail> {
  const { freightRuleId } = await input.transaction.createFreightRule({
    companyId: input.companyId,
    createdByUserId: input.createdByUserId,
    description: FREIGHT_RULE_DESCRIPTION,
    name: input.settings.name,
    priority: input.settings.priority,
  })
  await input.transaction.openFreightRuleVersion({
    companyId: input.companyId,
    createdByUserId: input.createdByUserId,
    freightRule: input.freightRule,
    freightRuleId,
  })

  try {
    return await input.transaction.createProfile({
      companyId: input.companyId,
      createdByUserId: input.createdByUserId,
      freightRule: input.freightRule,
      freightRuleId,
      settings: input.settings,
    })
  } catch (error) {
    if (error instanceof Error && error.message === NAME_TAKEN_SIGNAL) {
      throw new CteEmissionProfileNameTakenError()
    }
    throw error
  }
}

export async function replaceChildren(input: {
  readonly companyId: string
  readonly components: readonly CteEmissionProfileComponentInput[]
  readonly matchers: readonly CteEmissionProfileMatcherInput[]
  readonly profileId: string
  readonly transaction: CteEmissionProfileTransactionPort
}): Promise<void> {
  await input.transaction.replaceMatchers({
    companyId: input.companyId,
    matchers: input.matchers,
    profileId: input.profileId,
  })
  await input.transaction.replaceComponents({
    companyId: input.companyId,
    components: input.components,
    profileId: input.profileId,
  })
}
