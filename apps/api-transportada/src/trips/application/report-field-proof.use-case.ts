/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T6, ADR-0067 §2 (emenda 2026-09-18): `field-proof` anexa o canhoto a uma entrega **já
 * feita** — não cria evento, não muda `delivered_at`. Leva `Idempotency-Key`, como as outras rotas
 * do escritório: repetir a mesma chave devolve o mesmo comprovante sem duplicar nada (aceite 7), e a
 * mesma chave usada por outro ator ou outra operação é 409 `TRIP_FIELD_REPORT_KEY_REUSED`.
 *
 * Spec 156 T15 M2: reserva da chave, leitura do evento, upload e comprovante numa transação só —
 * antes, o comprovante gravava pelo pool, fora da transação que reservava a chave. M1: o comprovante
 * que o motorista colheu não é substituído.
 */
import { assertOfficeProofMeetsSettings } from '../domain/office-delivery-proof.policy.js'
import { TripDocumentNotReachableError } from '../domain/trip.error.js'
import type { DriverFieldReportUnitOfWork } from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type ResolvedTripFieldTarget,
} from './field-trip-target.types.js'
import {
  assertOfficeUploadAccepted,
  persistOfficeProof,
  type OfficeDeliveryProofAttachment,
  type OfficeDeliveryProofUpload,
  type OfficeProofPersistResult,
} from './office-delivery-proof.service.js'
import { runWithStoredObjectCleanup } from './stored-object-cleanup.service.js'
import { withFieldReport } from './trip-field-report.port.js'

const FIELD_PROOF_OPERATION = 'office.document.proof'

export type ReportFieldProofInput = {
  readonly actorUserId: string
  readonly attachment: OfficeDeliveryProofAttachment
  readonly companyId: string
  readonly documentId: string
  readonly idempotencyKey: string
  readonly target: ResolvedTripFieldTarget
  readonly unitOfWork: DriverFieldReportUnitOfWork
  readonly upload: OfficeDeliveryProofUpload
}

export async function reportFieldProof(
  input: ReportFieldProofInput,
): Promise<OfficeProofPersistResult> {
  assertOfficeUploadAccepted(input.upload)
  /** Spec 159 T11 item 5: a configuração é lida pelo pool, antes de a transação segurar conexão. */
  const settings = await input.attachment.resolveSettings({
    companyId: input.companyId,
    documentId: input.documentId,
  })
  assertOfficeProofMeetsSettings({ receiver: input.upload, settings })
  const authorship = deriveFieldAuthorship({ target: input.target })

  return runWithStoredObjectCleanup({
    operation: (storage) =>
      input.unitOfWork.execute((transaction) =>
        withFieldReport(
          {
            actorUserId: input.actorUserId,
            authorship,
            companyId: input.companyId,
            idempotencyKey: input.idempotencyKey,
            operation: FIELD_PROOF_OPERATION,
            transaction,
          },
          async () => {
            const event = await transaction.findDeliveryEventForProof({
              companyId: input.companyId,
              documentId: input.documentId,
              target: toFieldTripTarget({ target: input.target }),
            })
            if (event === null) throw new TripDocumentNotReachableError()

            return persistOfficeProof({
              actorUserId: input.actorUserId,
              attachment: input.attachment,
              authorship,
              companyId: input.companyId,
              eventId: event.id,
              storage,
              transaction,
              upload: input.upload,
            })
          },
          async (resultId) => ({ id: resultId, replacedObjectId: null }),
        ),
      ),
    storage: input.attachment.storage,
  })
}
