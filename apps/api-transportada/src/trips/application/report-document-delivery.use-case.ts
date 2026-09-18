/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 057 P1: "entreguei" e "não entreguei". O caminho da baixa mora em
 * `document-outcome.service.ts`; aqui fica só o que diferencia as duas ações.
 */
import { DELIVERED_EVENT_KIND, RETURNED_EVENT_KIND } from '../domain/delivery-event.constant.js'
import { TRIP_DOCUMENT_ACTION } from '../domain/trip-state.policy.js'
import { runDocumentOutcome } from './document-outcome.service.js'
import type {
  ReportDocumentDeliveryInput,
  ReportDocumentOutcomeResult,
  ReportDocumentReturnInput,
} from './report-document-outcome.types.js'

export type {
  OfficeDeliveryProofInput,
  ReportDocumentDeliveryInput,
  ReportDocumentOutcomeInput,
  ReportDocumentOutcomeResult,
  ReportDocumentReturnInput,
} from './report-document-outcome.types.js'

const DELIVER_OPERATION = 'document.deliver'
const RETURN_OPERATION = 'document.return'

/**
 * Spec 057, P1 "entreguei": a última nota da parada fecha `completed_at`, e a última parada leva a
 * viagem a `completed` sozinha (spec 056 D1). Ninguém no escritório aperta nada para isso.
 */
export async function reportDocumentDelivery(
  input: ReportDocumentDeliveryInput,
): Promise<ReportDocumentOutcomeResult> {
  return runDocumentOutcome({
    action: TRIP_DOCUMENT_ACTION.deliver,
    input,
    kind: DELIVERED_EVENT_KIND,
    operation: DELIVER_OPERATION,
    ...(input.proof === undefined ? {} : { proof: input.proof }),
    ...(input.resolveProofSettings === undefined
      ? {}
      : { resolveProofSettings: input.resolveProofSettings }),
    settle: (transaction, documentId) =>
      transaction.markDocumentDelivered({
        at: input.now,
        companyId: input.companyId,
        documentId,
      }),
  })
}

/**
 * Spec 057, P1 "não entreguei": motivo de lista fechada, e a nota vai a `returned`. Ela sai do eixo
 * do campo do mesmo jeito que a entregue — a parada fecha quando nenhuma nota está mais pendente,
 * seja porque foi entregue, seja porque voltou.
 */
export async function reportDocumentReturn(
  input: ReportDocumentReturnInput,
): Promise<ReportDocumentOutcomeResult> {
  return runDocumentOutcome({
    action: TRIP_DOCUMENT_ACTION.return,
    input,
    kind: RETURNED_EVENT_KIND,
    operation: RETURN_OPERATION,
    settle: (transaction, documentId) =>
      transaction.markDocumentReturned({
        at: input.now,
        companyId: input.companyId,
        documentId,
        reason: input.reason,
      }),
  })
}
