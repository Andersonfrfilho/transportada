/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import {
  NfseEmissionProfileNameTakenError,
  NfseEmissionProfileNotFoundError,
  NfseEmissionProfileVersionConflictError,
} from '../domain/nfse-profile.error.js'
import { NFSE_PROFILE_NAME_TAKEN_SIGNAL } from '../infrastructure/nfse-profile.support.js'
import type {
  NfseEmissionProfileDetail,
  NfseEmissionProfileFilters,
  NfseEmissionProfileOption,
  NfseEmissionProfilePage,
  NfseEmissionProfileSettings,
  NfseEmissionProfileStatus,
  NfseProfileCompanyContext,
  NfseProfileFingerprintPort,
  NfseProfileTransactionPort,
  NfseProfileUnitOfWorkPort,
} from './nfse-profile.port.js'

const CREATE_OPERATION = 'nfse.emission-profile.create'
const ENTITY_TYPE = 'nfse_emission_profile'
const PROFILE_ACTION = {
  ACTIVATED: 'nfse.emission-profile.activated',
  CREATED: 'nfse.emission-profile.created',
  DEACTIVATED: 'nfse.emission-profile.deactivated',
  UPDATED: 'nfse.emission-profile.updated',
} as const

const TEXT_ENCODER = new TextEncoder()

export type CreateNfseEmissionProfileInput = {
  readonly context: NfseProfileCompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly settings: NfseEmissionProfileSettings
}

export type UpdateNfseEmissionProfileInput = {
  readonly context: NfseProfileCompanyContext
  readonly correlationId: string
  readonly expectedVersion: string
  readonly profileId: string
  readonly settings: NfseEmissionProfileSettings
}

export type ChangeNfseEmissionProfileStatusInput = {
  readonly context: NfseProfileCompanyContext
  readonly correlationId: string
  readonly expectedVersion: string
  readonly profileId: string
}

export type ListNfseEmissionProfilesInput = {
  readonly context: NfseProfileCompanyContext
  readonly cursor: string | null
  readonly filters?: NfseEmissionProfileFilters
  readonly limit: number
}

export type ListNfseEmissionProfileOptionsInput = {
  readonly context: NfseProfileCompanyContext
}

export type NfseEmissionProfilesUseCase = {
  activate(input: ChangeNfseEmissionProfileStatusInput): Promise<NfseEmissionProfileDetail>
  create(input: CreateNfseEmissionProfileInput): Promise<NfseEmissionProfileDetail>
  deactivate(input: ChangeNfseEmissionProfileStatusInput): Promise<NfseEmissionProfileDetail>
  list(input: ListNfseEmissionProfilesInput): Promise<NfseEmissionProfilePage>
  listOptions(
    input: ListNfseEmissionProfileOptionsInput,
  ): Promise<readonly NfseEmissionProfileOption[]>
  update(input: UpdateNfseEmissionProfileInput): Promise<NfseEmissionProfileDetail>
}

export function createNfseEmissionProfilesUseCase(dependencies: {
  readonly fingerprintService: NfseProfileFingerprintPort
  readonly unitOfWork: NfseProfileUnitOfWorkPort
}): NfseEmissionProfilesUseCase {
  const { fingerprintService, unitOfWork } = dependencies

  async function changeStatus(
    input: ChangeNfseEmissionProfileStatusInput & {
      readonly nextStatus: NfseEmissionProfileStatus
    },
  ): Promise<NfseEmissionProfileDetail> {
    return unitOfWork.execute(async (transaction) => {
      const current = await loadProfile({
        companyId: input.context.companyId,
        profileId: input.profileId,
        transaction,
      })
      const persisted = await requirePersisted({
        companyId: input.context.companyId,
        persisted: await transaction.updateProfileStatus({
          companyId: input.context.companyId,
          expectedVersion: input.expectedVersion,
          profileId: input.profileId,
          status: input.nextStatus,
        }),
        profileId: input.profileId,
        transaction,
      })
      await appendAudit({
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
        fields: [
          TEXT_ENCODER.encode(input.context.companyId),
          TEXT_ENCODER.encode(JSON.stringify(input.settings)),
        ],
        operation: CREATE_OPERATION,
      })

      return unitOfWork.execute(async (transaction) => {
        const replay = await transaction.findIdempotency({
          companyId: input.context.companyId,
          idempotencyKey: input.idempotencyKey,
          operation: CREATE_OPERATION,
        })
        if (replay !== null) {
          if (replay.fingerprint !== fingerprint) throw idempotencyConflict()
          return replay.response
        }

        const created = await guardNameConflict(() =>
          transaction.insertProfile({
            companyId: input.context.companyId,
            profileId: crypto.randomUUID(),
            settings: input.settings,
            userId: input.context.userId,
          }),
        )
        await appendAudit({
          action: PROFILE_ACTION.CREATED,
          before: null,
          context: input.context,
          correlationId: input.correlationId,
          profile: created,
          transaction,
        })
        await transaction.saveIdempotency({
          companyId: input.context.companyId,
          fingerprint,
          idempotencyKey: input.idempotencyKey,
          operation: CREATE_OPERATION,
          response: created,
        })

        return created
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

    async listOptions(input) {
      return unitOfWork.execute(async (transaction) =>
        transaction.listActiveProfileOptions({ companyId: input.context.companyId }),
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
          persisted: await guardNameConflict(() =>
            transaction.updateProfile({
              companyId: input.context.companyId,
              expectedVersion: input.expectedVersion,
              profileId: input.profileId,
              settings: input.settings,
            }),
          ),
          profileId: input.profileId,
          transaction,
        })
        await appendAudit({
          action: PROFILE_ACTION.UPDATED,
          before: current,
          context: input.context,
          correlationId: input.correlationId,
          profile: persisted,
          transaction,
        })

        return persisted
      })
    },
  }
}

async function appendAudit(input: {
  readonly action: string
  readonly before: NfseEmissionProfileDetail | null
  readonly context: NfseProfileCompanyContext
  readonly correlationId: string
  readonly profile: NfseEmissionProfileDetail
  readonly transaction: NfseProfileTransactionPort
}): Promise<void> {
  await input.transaction.appendAudit({
    action: input.action,
    after: { ...input.profile },
    before: input.before === null ? null : { ...input.before },
    companyId: input.context.companyId,
    correlationId: input.correlationId,
    targetId: input.profile.id,
    targetType: ENTITY_TYPE,
    userId: input.context.userId,
  })
}

async function guardNameConflict<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error: unknown) {
    if (error instanceof Error && error.message === NFSE_PROFILE_NAME_TAKEN_SIGNAL) {
      throw new NfseEmissionProfileNameTakenError()
    }
    throw error
  }
}

function idempotencyConflict(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}

async function loadProfile(input: {
  readonly companyId: string
  readonly profileId: string
  readonly transaction: NfseProfileTransactionPort
}): Promise<NfseEmissionProfileDetail> {
  const profile = await input.transaction.findProfile({
    companyId: input.companyId,
    profileId: input.profileId,
  })
  if (profile === null) throw new NfseEmissionProfileNotFoundError()
  return profile
}

/**
 * Persistência nula significa `version` diferente da esperada **ou** perfil de outra empresa —
 * a consulta filtra pelas duas coisas. Reler dentro da transação separa 409 de 404 sem vazar
 * a existência do perfil alheio.
 */
async function requirePersisted(input: {
  readonly companyId: string
  readonly persisted: NfseEmissionProfileDetail | null
  readonly profileId: string
  readonly transaction: NfseProfileTransactionPort
}): Promise<NfseEmissionProfileDetail> {
  if (input.persisted !== null) return input.persisted
  await loadProfile({
    companyId: input.companyId,
    profileId: input.profileId,
    transaction: input.transaction,
  })
  throw new NfseEmissionProfileVersionConflictError()
}
