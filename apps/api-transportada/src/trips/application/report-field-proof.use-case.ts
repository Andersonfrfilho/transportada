/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T6, ADR-0067 §2 (emenda 2026-09-18): `field-proof` anexa o canhoto a uma entrega **já
 * feita** — não cria evento, não muda `delivered_at`. Ainda assim leva `Idempotency-Key`, como as
 * outras rotas do escritório: repetir a mesma chave devolve o mesmo comprovante sem duplicar nada
 * (aceite 7), e a mesma chave usada por outro ator ou outra operação é 409
 * `TRIP_FIELD_REPORT_KEY_REUSED` (`withFieldReport`).
 */
import type { DriverFieldReportUnitOfWork } from './driver-field-report.port.js'
import {
  attachDeliveryProof,
  type AttachDeliveryProofInput,
} from './attach-delivery-proof.use-case.js'
import { deriveFieldAuthorship } from './field-trip-target.types.js'
import { withFieldReport } from './trip-field-report.port.js'

const FIELD_PROOF_OPERATION = 'office.document.proof'

export type ReportFieldProofInput = AttachDeliveryProofInput & {
  readonly idempotencyKey: string
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export async function reportFieldProof(
  input: ReportFieldProofInput,
): Promise<{ readonly id: string }> {
  const authorship = deriveFieldAuthorship(input)

  return input.unitOfWork.execute((transaction) =>
    withFieldReport(
      {
        actorUserId: input.actorUserId,
        authorship,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: FIELD_PROOF_OPERATION,
        transaction,
      },
      () => attachDeliveryProof(input),
      async (resultId) => ({ id: resultId }),
    ),
  )
}
