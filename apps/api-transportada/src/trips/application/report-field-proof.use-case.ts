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
import { CARGO_PROOF_KIND, type OfficeProofKind } from '../domain/delivery-event.constant.js'
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
import { buildOfficeAuditEntry, type OfficeAuditRequest } from './trip-field-office-audit.port.js'
import { withFieldReport } from './trip-field-report.port.js'

const FIELD_PROOF_OPERATION = 'office.document.proof'

export type ReportFieldProofInput = {
  readonly actorUserId: string
  readonly attachment: OfficeDeliveryProofAttachment
  readonly companyId: string
  readonly documentId: string
  readonly idempotencyKey: string
  /** Spec 184 RF3: `photo` (padrão) ou `cargo` — nunca `signature` (ADR-0067 §5). */
  readonly kind: OfficeProofKind
  /** Spec 156 T15 M11: a trilha nasce na transação do comprovante, com o objeto substituído. */
  readonly officeAudit: OfficeAuditRequest
  readonly target: ResolvedTripFieldTarget
  readonly unitOfWork: DriverFieldReportUnitOfWork
  readonly upload: OfficeDeliveryProofUpload
}

export async function reportFieldProof(
  input: ReportFieldProofInput,
): Promise<OfficeProofPersistResult> {
  assertOfficeUploadAccepted(input.upload)
  /**
   * Spec 184 (RF4): a foto de carga não é o canhoto — não precisa satisfazer "foto obrigatória" nem
   * "assinatura obrigatória" da configuração, e não carrega nome do recebedor para a exigir.
   */
  if (input.kind !== CARGO_PROOF_KIND) {
    /** Spec 159 T11 item 5: a configuração é lida pelo pool, antes de a transação segurar conexão. */
    const settings = await input.attachment.resolveSettings({
      companyId: input.companyId,
      documentId: input.documentId,
    })
    assertOfficeProofMeetsSettings({ receiver: input.upload, settings })
  }
  const authorship = deriveFieldAuthorship({ target: input.target })

  return runWithStoredObjectCleanup({
    operation: (storage) =>
      input.unitOfWork.execute((transaction) =>
        withFieldReport({
          guard: {
            actorUserId: input.actorUserId,
            authorship,
            companyId: input.companyId,
            idempotencyKey: input.idempotencyKey,
            operation: FIELD_PROOF_OPERATION,
            transaction,
          },
          perform: async () => {
            const event = await transaction.findDeliveryEventForProof({
              companyId: input.companyId,
              documentId: input.documentId,
              target: toFieldTripTarget({ target: input.target }),
            })
            if (event === null) throw new TripDocumentNotReachableError()

            const persisted = await persistOfficeProof({
              actorUserId: input.actorUserId,
              attachment: input.attachment,
              authorship,
              companyId: input.companyId,
              eventId: event.id,
              kind: input.kind,
              storage,
              transaction,
              upload: input.upload,
            })
            const audit = buildOfficeAuditEntry({
              actorUserId: input.actorUserId,
              audit: input.officeAudit,
              companyId: input.companyId,
              details: {
                documentId: input.documentId,
                replacedObjectId: persisted.replacedObjectId,
              },
              locator: { target: input.target },
            })
            if (audit !== undefined) await transaction.recordOfficeAudit(audit)

            return persisted
          },
          recall: async (resultId) => ({ id: resultId, replacedObjectId: null }),
        }),
      ),
    storage: input.attachment.storage,
  })
}
