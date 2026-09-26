/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 D7 (ADR-0079 §A4, CA06): quem recebeu escolhido **depois** de a foto já ter subido. Só as
 * linhas do motorista naquele evento de entrega mudam (`photo`/`signature`, `driver_app`) — o canhoto
 * do escritório e a foto da carga ficam como estão. A mesma configuração do anexo decide (D5), e a
 * `Idempotency-Key` segue a guarda das rotas `/me` (`trip_field_reports`).
 */
import type { DeliveryProofFieldSettings } from '../domain/delivery-proof-settings.policy.js'
import { applyReceivedBySettings, type ReceivedByFields } from '../domain/received-by.policy.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'
import { TripDeliveryProofNotFoundError } from '../domain/trip-field-office.error.js'
import type { DriverFieldReportUnitOfWork } from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldTripTarget,
} from './field-trip-target.types.js'
import { withFieldReport } from './trip-field-report.port.js'

const PROOF_RECEIVER_OPERATION = 'document.proof-receiver'

export type DriverProofReceiverPatch = {
  readonly receivedBy?: ReceivedByFields
  readonly receiverName?: string
}

export type UpdateDriverProofReceiverInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly driverId: string
  readonly idempotencyKey: string
  readonly patch: DriverProofReceiverPatch
  /** As mesmas leituras do anexo (`DrizzleDeliveryProofRepository`) — um lugar só decide. */
  readonly proofs: {
    findDeliveryEventId(input: {
      readonly companyId: string
      readonly documentId: string
      readonly target: FieldTripTarget
    }): Promise<string | null>
    resolveProofFieldSettings(input: {
      readonly companyId: string
      readonly documentId: string
    }): Promise<DeliveryProofFieldSettings>
  }
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export type UpdateDriverProofReceiverResult = {
  readonly changed: boolean
  /** O comprovante que a chave liquidou — é o que o reenvio relê. */
  readonly id: string
}

export async function updateDriverProofReceiver(
  input: UpdateDriverProofReceiverInput,
): Promise<UpdateDriverProofReceiverResult> {
  const locator = { driverId: input.driverId }
  const [eventId, settings] = await Promise.all([
    input.proofs.findDeliveryEventId({
      companyId: input.companyId,
      documentId: input.documentId,
      target: toFieldTripTarget(locator),
    }),
    input.proofs.resolveProofFieldSettings({
      companyId: input.companyId,
      documentId: input.documentId,
    }),
  ])
  if (eventId === null) throw new TripDeliveryProofNotFoundError()

  const receivedBy =
    input.patch.receivedBy === undefined
      ? undefined
      : applyReceivedBySettings({
          channel: TRIP_FIELD_CHANNELS.driverApp,
          mode: settings.receivedBy,
          value: input.patch.receivedBy,
        })

  return input.unitOfWork.execute((transaction) =>
    withFieldReport<UpdateDriverProofReceiverResult>({
      guard: {
        actorUserId: input.actorUserId,
        authorship: deriveFieldAuthorship(locator),
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: PROOF_RECEIVER_OPERATION,
        transaction,
      },
      perform: async () => {
        const updated = await transaction.updateDriverProofReceiverWithinTransaction({
          companyId: input.companyId,
          eventId,
          ...(receivedBy === undefined ? {} : { receivedBy }),
          ...(input.patch.receiverName === undefined
            ? {}
            : { receiverName: input.patch.receiverName }),
        })
        if (updated === null) throw new TripDeliveryProofNotFoundError()

        return updated
      },
      /** O reenvio da mesma chave não refaz o efeito: nada mudou desta vez. */
      recall: async (resultId) => ({ changed: false, id: resultId }),
    }),
  )
}
