/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteEmissionProfileStatus } from '../../database/cte-emission-profile.schema.js'
import { CteEmissionProfileNotActivatableError } from '../domain/cte-profile.error.js'
import {
  CREATE_OPERATION,
  createIdempotencyConflict,
  createProfileSnapshot,
  ENTITY_TYPE,
  freightRuleChanged,
  insertProfileWithFreightRule,
  loadProfile,
  PROFILE_ACTION,
  replaceChildren,
  requirePersisted,
  withChildren,
} from './cte-emission-profile-write.service.js'
import type {
  CteEmissionProfileComponentInput,
  CteEmissionProfileCompanyContext,
  CteEmissionProfileDetail,
  CteEmissionProfileFilters,
  CteEmissionProfileFingerprintPort,
  CteEmissionProfileFreightRuleInput,
  CteEmissionProfileMatcherInput,
  CteEmissionProfilePage,
  CteEmissionProfileSettings,
  CteEmissionProfileTransactionPort,
  CteEmissionProfilesUnitOfWorkPort,
} from './cte-emission-profile.port.js'

const TEXT_ENCODER = new TextEncoder()

export type CreateCteEmissionProfileInput = {
  readonly components: readonly CteEmissionProfileComponentInput[]
  readonly context: CteEmissionProfileCompanyContext
  readonly correlationId: string
  readonly freightRule: CteEmissionProfileFreightRuleInput
  readonly idempotencyKey: string
  readonly matchers: readonly CteEmissionProfileMatcherInput[]
  readonly settings: CteEmissionProfileSettings
}

export type UpdateCteEmissionProfileInput = {
  readonly components: readonly CteEmissionProfileComponentInput[]
  readonly context: CteEmissionProfileCompanyContext
  readonly correlationId: string
  readonly expectedVersion: string
  readonly freightRule: CteEmissionProfileFreightRuleInput
  readonly matchers: readonly CteEmissionProfileMatcherInput[]
  readonly profileId: string
  readonly settings: CteEmissionProfileSettings
}

export type ChangeCteEmissionProfileStatusInput = {
  readonly context: CteEmissionProfileCompanyContext
  readonly correlationId: string
  readonly expectedVersion: string
  readonly profileId: string
}

export type ListCteEmissionProfilesInput = {
  readonly context: CteEmissionProfileCompanyContext
  readonly cursor: string | null
  readonly filters?: CteEmissionProfileFilters
  readonly limit: number
}

export type CteEmissionProfilesUseCase = {
  activate(input: ChangeCteEmissionProfileStatusInput): Promise<CteEmissionProfileDetail>
  create(input: CreateCteEmissionProfileInput): Promise<CteEmissionProfileDetail>
  deactivate(input: ChangeCteEmissionProfileStatusInput): Promise<CteEmissionProfileDetail>
  list(input: ListCteEmissionProfilesInput): Promise<CteEmissionProfilePage>
  update(input: UpdateCteEmissionProfileInput): Promise<CteEmissionProfileDetail>
}

export function createCteEmissionProfilesUseCase(dependencies: {
  readonly fingerprintService: CteEmissionProfileFingerprintPort
  readonly unitOfWork: CteEmissionProfilesUnitOfWorkPort
}): CteEmissionProfilesUseCase {
  const { fingerprintService, unitOfWork } = dependencies

  async function changeStatus(
    input: ChangeCteEmissionProfileStatusInput & { readonly nextStatus: CteEmissionProfileStatus },
  ): Promise<CteEmissionProfileDetail> {
    return unitOfWork.execute(async (transaction) => {
      const current = await loadProfile({
        companyId: input.context.companyId,
        profileId: input.profileId,
        transaction,
      })
      if (input.nextStatus === 'active') assertActivatable(current)

      const persisted = await requirePersisted({
        companyId: input.context.companyId,
        persisted: await transaction.updateProfileStatus({
          companyId: input.context.companyId,
          expectedVersion: input.expectedVersion,
          nextStatus: input.nextStatus,
          profileId: input.profileId,
        }),
        profileId: input.profileId,
        transaction,
      })
      await transaction.setFreightRuleStatus({
        companyId: input.context.companyId,
        freightRuleId: persisted.freightRuleId,
        nextStatus: input.nextStatus === 'active' ? 'active' : 'inactive',
      })
      await appendProfileAudit({
        action:
          input.nextStatus === 'active' ? PROFILE_ACTION.ACTIVATED : PROFILE_ACTION.DEACTIVATED,
        before: current,
        context: input.context,
        correlationId: input.correlationId,
        profile: persisted,
        transaction,
      })

      return persisted
    })
  }

  return {
    async activate(input) {
      return changeStatus({ ...input, nextStatus: 'active' })
    },

    async create(input) {
      const fingerprint = await fingerprintService.create({
        fields: createFingerprintFields(input),
        operation: CREATE_OPERATION,
      })

      return unitOfWork.execute(async (transaction) => {
        const replay = await transaction.findIdempotency({
          companyId: input.context.companyId,
          idempotencyKey: input.idempotencyKey,
          operation: CREATE_OPERATION,
        })
        if (replay !== null) {
          if (replay.fingerprint !== fingerprint) throw createIdempotencyConflict()
          return replay.response
        }

        const created = await insertProfileWithFreightRule({
          companyId: input.context.companyId,
          createdByUserId: input.context.userId,
          freightRule: input.freightRule,
          settings: input.settings,
          transaction,
        })
        await replaceChildren({
          companyId: input.context.companyId,
          components: input.components,
          matchers: input.matchers,
          profileId: created.id,
          transaction,
        })
        const response = withChildren({
          components: input.components,
          matchers: input.matchers,
          profile: created,
        })

        await appendProfileAudit({
          action: PROFILE_ACTION.CREATED,
          before: null,
          context: input.context,
          correlationId: input.correlationId,
          profile: response,
          transaction,
        })
        await transaction.saveIdempotency({
          companyId: input.context.companyId,
          fingerprint,
          idempotencyKey: input.idempotencyKey,
          operation: CREATE_OPERATION,
          response,
        })

        return response
      })
    },

    async deactivate(input) {
      return changeStatus({ ...input, nextStatus: 'inactive' })
    },

    async list(input) {
      return unitOfWork.execute(async (transaction) =>
        transaction.listProfiles({
          companyId: input.context.companyId,
          cursor: input.cursor,
          limit: input.limit,
          ...(input.filters === undefined ? {} : { filters: input.filters }),
        }),
      )
    },

    async update(input) {
      return unitOfWork.execute(async (transaction) => {
        const current = await loadProfile({
          companyId: input.context.companyId,
          profileId: input.profileId,
          transaction,
        })

        const persisted = await requirePersisted({
          companyId: input.context.companyId,
          persisted: await transaction.updateProfile({
            companyId: input.context.companyId,
            expectedVersion: input.expectedVersion,
            freightRule: input.freightRule,
            profileId: input.profileId,
            settings: input.settings,
          }),
          profileId: input.profileId,
          transaction,
        })

        if (freightRuleChanged(current.freightRule, input.freightRule)) {
          await transaction.openFreightRuleVersion({
            companyId: input.context.companyId,
            createdByUserId: input.context.userId,
            freightRule: input.freightRule,
            freightRuleId: persisted.freightRuleId,
          })
        }

        await replaceChildren({
          companyId: input.context.companyId,
          components: input.components,
          matchers: input.matchers,
          profileId: persisted.id,
          transaction,
        })
        const response = withChildren({
          components: input.components,
          matchers: input.matchers,
          profile: persisted,
        })

        await appendProfileAudit({
          action: PROFILE_ACTION.UPDATED,
          before: current,
          context: input.context,
          correlationId: input.correlationId,
          profile: response,
          transaction,
        })

        return response
      })
    },
  }
}

async function appendProfileAudit(input: {
  readonly action: string
  readonly before: CteEmissionProfileDetail | null
  readonly context: CteEmissionProfileCompanyContext
  readonly correlationId: string
  readonly profile: CteEmissionProfileDetail
  readonly transaction: CteEmissionProfileTransactionPort
}): Promise<void> {
  await input.transaction.appendAudit({
    action: input.action,
    actorUserId: input.context.userId,
    afterSnapshot: createProfileSnapshot(input.profile),
    beforeSnapshot: input.before === null ? null : createProfileSnapshot(input.before),
    companyId: input.context.companyId,
    correlationId: input.correlationId,
    entityId: input.profile.id,
    entityType: ENTITY_TYPE,
  })
}

function assertActivatable(profile: CteEmissionProfileDetail): void {
  if (profile.matchMode === 'sender_tax_id' && profile.matchers.length === 0) {
    throw new CteEmissionProfileNotActivatableError()
  }
}

function createFingerprintFields(input: CreateCteEmissionProfileInput): readonly Uint8Array[] {
  const values = [
    input.context.companyId,
    stableJson(input.settings),
    stableJson(input.freightRule),
    stableJson(input.matchers),
    stableJson(input.components),
  ]

  return values.map((value) => TEXT_ENCODER.encode(value))
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${key}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
