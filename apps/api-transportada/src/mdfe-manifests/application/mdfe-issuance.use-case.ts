/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  MDFE_MANIFEST_ACTION,
  MDFE_TRANSITION_BLOCK,
  checkManifestTransition,
  isCancellationJustificationValid,
  type MdfeManifestAction,
} from '../domain/mdfe-manifest-state.policy.js'
import {
  MdfeCancellationJustificationError,
  MdfeManifestTransitionBlockedError,
} from '../domain/mdfe-issuance.error.js'
import { MdfeManifestNotFoundError } from '../domain/mdfe-manifest.error.js'
import {
  createRequestFingerprint,
  findReplaySummary,
  scheduleAttempt,
  type MdfeIssuanceSummary,
} from './mdfe-issuance-attempt.service.js'
import { MdfeIssuancePayloadSourceMissingError } from './mdfe-issuance-payload.error.js'
import { assembleMdfeIssuancePayload } from './mdfe-issuance-payload.service.js'
import type {
  MdfeIssuanceRepositoryPort,
  MdfeIssuanceState,
  MdfeIssuanceTransactionPort,
} from './mdfe-issuance.port.js'
import type { MdfeManifestCompanyContext } from './mdfe-manifest.port.js'

export type MdfeIssuanceRequest = {
  readonly context: MdfeManifestCompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly manifestId: string
}

export type CloseMdfeManifestInput = MdfeIssuanceRequest & {
  readonly closureCityCode: string
  readonly closureState: string
}

export type CancelMdfeManifestInput = MdfeIssuanceRequest & {
  readonly justification: string
}

export type MdfeIssuanceUseCase = {
  cancel(input: CancelMdfeManifestInput): Promise<MdfeIssuanceSummary>
  close(input: CloseMdfeManifestInput): Promise<MdfeIssuanceSummary>
  issue(input: MdfeIssuanceRequest): Promise<MdfeIssuanceSummary>
}

export function createMdfeIssuanceUseCase(dependencies: {
  readonly now: () => Date
  readonly repository: MdfeIssuanceRepositoryPort
}): MdfeIssuanceUseCase {
  const { now, repository } = dependencies

  return {
    async cancel(input) {
      if (!isCancellationJustificationValid(input.justification)) {
        throw new MdfeCancellationJustificationError()
      }

      return repository.transaction({ companyId: input.context.companyId }, async (transaction) => {
        const state = await loadState(transaction, input.manifestId)
        const requestFingerprint = createRequestFingerprint({
          action: MDFE_MANIFEST_ACTION.cancel,
          idempotencyKey: input.idempotencyKey,
          justification: input.justification,
          manifestId: input.manifestId,
        })
        const replay = await findReplaySummary({
          idempotencyKey: input.idempotencyKey,
          manifestStatus: state.status,
          requestFingerprint,
          transaction,
        })
        if (replay !== null) return replay

        assertTransition({ action: MDFE_MANIFEST_ACTION.cancel, now: now(), state })
        await assertNoPendingAttempt({ attemptKind: 'cancel', state, transaction })
        const occurredAt = now().toISOString()
        await transaction.recordCancellationRequest({
          justification: input.justification,
          manifestId: input.manifestId,
          requestedAt: occurredAt,
        })

        return scheduleAttempt({
          attempt: await transaction.createAttempt({
            attemptKind: 'cancel',
            correlationId: input.correlationId,
            fiscalEnvironment: state.fiscalEnvironment,
            idempotencyKey: input.idempotencyKey,
            manifestId: input.manifestId,
            requestFingerprint,
          }),
          correlationId: input.correlationId,
          manifestStatus: state.status,
          occurredAt,
          state,
          transaction,
          userId: input.context.userId,
        })
      })
    },

    async close(input) {
      return repository.transaction({ companyId: input.context.companyId }, async (transaction) => {
        const state = await loadState(transaction, input.manifestId)
        const requestFingerprint = createRequestFingerprint({
          action: MDFE_MANIFEST_ACTION.close,
          closureCityCode: input.closureCityCode,
          closureState: input.closureState,
          idempotencyKey: input.idempotencyKey,
          manifestId: input.manifestId,
        })
        const replay = await findReplaySummary({
          idempotencyKey: input.idempotencyKey,
          manifestStatus: state.status,
          requestFingerprint,
          transaction,
        })
        if (replay !== null) return replay

        assertTransition({ action: MDFE_MANIFEST_ACTION.close, now: now(), state })
        await assertNoPendingAttempt({ attemptKind: 'close', state, transaction })
        await transaction.recordClosureRequest({
          closureCityCode: input.closureCityCode,
          closureState: input.closureState,
          manifestId: input.manifestId,
        })

        return scheduleAttempt({
          attempt: await transaction.createAttempt({
            attemptKind: 'close',
            correlationId: input.correlationId,
            fiscalEnvironment: state.fiscalEnvironment,
            idempotencyKey: input.idempotencyKey,
            manifestId: input.manifestId,
            requestFingerprint,
          }),
          correlationId: input.correlationId,
          manifestStatus: state.status,
          occurredAt: now().toISOString(),
          state,
          transaction,
          userId: input.context.userId,
        })
      })
    },

    async issue(input) {
      return repository.transaction({ companyId: input.context.companyId }, async (transaction) => {
        const state = await loadState(transaction, input.manifestId)
        const requestFingerprint = createRequestFingerprint({
          action: MDFE_MANIFEST_ACTION.issue,
          idempotencyKey: input.idempotencyKey,
          manifestId: input.manifestId,
        })
        const replay = await findReplaySummary({
          idempotencyKey: input.idempotencyKey,
          manifestStatus: state.status,
          requestFingerprint,
          transaction,
        })
        if (replay !== null) return replay

        const nextStatus = assertTransition({
          action: MDFE_MANIFEST_ACTION.issue,
          now: now(),
          state,
        })
        // Antes de gastar número: manifesto sem veículo, condutor ou CT-e não chega à SEFAZ
        const source = await transaction.findPayloadSource({ manifestId: input.manifestId })
        if (source === null) throw new MdfeIssuancePayloadSourceMissingError()

        const reservation = await transaction.reserveNumber({
          environment: state.fiscalEnvironment,
          reservationKey: `mdfe:${input.manifestId}:${state.version}`,
        })
        const attempt = await transaction.createAttempt({
          attemptKind: 'issue',
          correlationId: input.correlationId,
          fiscalEnvironment: state.fiscalEnvironment,
          fiscalNumber: reservation.number,
          fiscalSeries: reservation.series,
          idempotencyKey: input.idempotencyKey,
          manifestId: input.manifestId,
          requestFingerprint,
          reservationId: reservation.reservationId,
        })
        await transaction.savePayload(
          assembleMdfeIssuancePayload({
            attempt: {
              attemptId: attempt.attemptId,
              fiscalEnvironment: state.fiscalEnvironment,
              fiscalNumber: reservation.number,
              fiscalSeries: reservation.series,
              manifestId: input.manifestId,
            },
            source,
          }),
        )
        await transaction.markManifestIssuing({
          fiscalNumber: reservation.number,
          fiscalSeries: reservation.series,
          manifestId: input.manifestId,
        })

        return scheduleAttempt({
          attempt,
          correlationId: input.correlationId,
          manifestStatus: nextStatus,
          occurredAt: now().toISOString(),
          state,
          transaction,
          userId: input.context.userId,
        })
      })
    },
  }
}

async function loadState(
  transaction: MdfeIssuanceTransactionPort,
  manifestId: string,
): Promise<MdfeIssuanceState> {
  const state = await transaction.findIssuanceState({ manifestId })
  if (state === null) throw new MdfeManifestNotFoundError()
  return state
}

function assertTransition(params: {
  readonly action: MdfeManifestAction
  readonly now: Date
  readonly state: MdfeIssuanceState
}) {
  const transition = checkManifestTransition({
    action: params.action,
    authorizedAt: params.state.authorizedAt,
    now: params.now,
    status: params.state.status,
  })
  if (!transition.allowed) throw new MdfeManifestTransitionBlockedError(transition.reason)
  return transition.nextStatus
}

/** Encerrar ou cancelar duas vezes gastaria dois eventos na SEFAZ para o mesmo manifesto. */
async function assertNoPendingAttempt(params: {
  readonly attemptKind: 'cancel' | 'close'
  readonly state: MdfeIssuanceState
  readonly transaction: MdfeIssuanceTransactionPort
}): Promise<void> {
  const pending = await params.transaction.findPendingAttempt({
    attemptKind: params.attemptKind,
    manifestId: params.state.manifestId,
  })
  if (pending !== null) throw new MdfeManifestTransitionBlockedError(MDFE_TRANSITION_BLOCK.inFlight)
}
