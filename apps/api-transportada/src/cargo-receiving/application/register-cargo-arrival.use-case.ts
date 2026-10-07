/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: registrar a chegada abre o relógio da separação. A repetição com a mesma chave e o
 * mesmo pedido devolve a mesma chegada; com outro pedido, é reuso (409).
 */
import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import type { CargoArrivalChannel } from '../../shared/cargo-arrival.constant.js'
import { buildArrivalRequestFingerprint } from '../domain/cargo-arrival-candidate.policy.js'
import {
  isArrivedAtTooFarInFuture,
  isArrivedAtTooFarInPast,
} from '../domain/cargo-arrival-transition.policy.js'
import {
  CargoArrivalArrivedAtInFutureError,
  CargoArrivalArrivedAtTooOldError,
  CargoArrivalDocumentsRefusedError,
  CargoArrivalKeyReusedError,
  CargoArrivalNotFoundError,
  CargoReceivingNotEnabledError,
  toDocumentDetails,
} from '../domain/cargo-arrival.error.js'
import type {
  CargoArrivalReadRepositoryPort,
  CargoArrivalRegistrationRepositoryPort,
} from './cargo-arrival.port.js'
import type {
  RegisterCargoArrivalParams,
  RegisterCargoArrivalRecordResult,
} from './cargo-arrival-request.types.js'
import type { CargoArrivalDetail } from './cargo-arrival.types.js'
import { toCargoArrivalDetail } from './cargo-arrival-view.mapper.js'

type Dependencies = {
  readonly channel: CargoArrivalChannel
  readonly now: () => Date
  readonly readRepository: CargoArrivalReadRepositoryPort
  readonly registrationRepository: CargoArrivalRegistrationRepositoryPort
}

export type RegisterCargoArrivalResult = {
  readonly arrival: CargoArrivalDetail
  readonly isReplay: boolean
}

export function createRegisterCargoArrivalUseCase(dependencies: Dependencies): {
  readonly execute: (params: RegisterCargoArrivalParams) => Promise<RegisterCargoArrivalResult>
} {
  return {
    async execute({ context, correlationId, idempotencyKey, input }) {
      const clock = { arrivedAt: input.arrivedAt, now: dependencies.now() }
      if (isArrivedAtTooFarInFuture(clock)) throw new CargoArrivalArrivedAtInFutureError()
      if (isArrivedAtTooFarInPast(clock)) throw new CargoArrivalArrivedAtTooOldError()
      const result = await dependencies.registrationRepository.register({
        ...input,
        actorUserId: context.userId,
        channel: dependencies.channel,
        companyId: context.companyId,
        correlationId,
        idempotencyKey,
        requestFingerprint: buildArrivalRequestFingerprint(input),
      })
      const arrivalId = resolveArrivalId(result)
      const detail = await dependencies.readRepository.findDetail({
        arrivalId,
        companyId: context.companyId,
      })
      if (detail === null) throw new CargoArrivalNotFoundError()
      return {
        arrival: toCargoArrivalDetail({ detail, now: dependencies.now() }),
        isReplay: result.kind === 'replayed',
      }
    },
  }
}

function resolveArrivalId(result: RegisterCargoArrivalRecordResult): string {
  switch (result.kind) {
    case 'created':
    case 'replayed':
      return result.arrivalId
    case 'contractor_not_found':
      throw new ContractorNotFoundError()
    case 'not_enabled':
      throw new CargoReceivingNotEnabledError()
    case 'key_reused':
      throw new CargoArrivalKeyReusedError()
    case 'refused':
      throw new CargoArrivalDocumentsRefusedError(
        toDocumentDetails(
          result.refusals.map((refusal) => ({ index: refusal.index, message: refusal.reason })),
        ),
      )
  }
}
