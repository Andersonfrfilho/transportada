/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 057 P1 e spec 156 T6/T15: o caminho único da baixa de uma nota — entregar ou devolver, pelo
 * motorista ou pelo escritório. Cada passo é uma função; `performOutcome` os encadeia na mesma
 * transação, dentro da reserva da chave de idempotência (`withFieldReport`).
 */
import { PHOTO_PROOF_KIND } from '../domain/delivery-event.constant.js'
import {
  persistDeliveryProof,
  resolveOutcomeProofSettings,
  resolveProofPendingFlag,
} from './document-outcome-proof.service.js'
import {
  assertOfficeOutcomeAllowed,
  closeStopAndTrip,
  findReachableDocument,
  recordOutcomeAudit,
  settleAndRecordEvent,
} from './document-outcome-steps.service.js'
import { deriveFieldAuthorship } from './field-trip-target.types.js'
import type {
  DocumentOutcomeParams,
  DocumentOutcomeSettings,
  OutcomeContext,
  ReportDocumentOutcomeResult,
} from './report-document-outcome.types.js'
import {
  runWithStoredObjectCleanup,
  type RemovableObjectStoragePort,
} from './stored-object-cleanup.service.js'
import { resolveFieldReportOperation, withFieldReport } from './trip-field-report.port.js'

/**
 * Spec 156 T15: o canhoto sobe dentro da transação; se ela desfizer depois do upload, o objeto sai
 * do bucket (`runWithStoredObjectCleanup`). Sem canhoto, a transação corre como sempre correu.
 */
export async function runDocumentOutcome(
  params: DocumentOutcomeParams,
): Promise<ReportDocumentOutcomeResult> {
  const settings = await resolveOutcomeProofSettings(params)
  if (params.proof === undefined) return runOutcomeTransaction({ params, settings })

  return runWithStoredObjectCleanup({
    operation: (storage) => runOutcomeTransaction({ params, settings, storage }),
    storage: params.proof.storage,
  })
}

function runOutcomeTransaction(input: {
  readonly params: DocumentOutcomeParams
  readonly settings: DocumentOutcomeSettings
  readonly storage?: RemovableObjectStoragePort
}): Promise<ReportDocumentOutcomeResult> {
  const report = input.params.input
  const authorship = deriveFieldAuthorship(report)

  return report.unitOfWork.execute((transaction) => {
    const context: OutcomeContext = {
      authorship,
      isOffice: report.target !== undefined,
      params: input.params,
      settings: input.settings,
      storage: input.storage,
      transaction,
    }
    return withFieldReport({
      guard: {
        actorUserId: report.actorUserId,
        authorship,
        companyId: report.companyId,
        idempotencyKey: report.idempotencyKey,
        operation: resolveFieldReportOperation({
          locator: report,
          operation: input.params.operation,
        }),
        transaction,
      },
      perform: () => performOutcome(context),
      recall: (eventId) => recallOutcome({ context, eventId }),
    })
  })
}

async function performOutcome(context: OutcomeContext): Promise<ReportDocumentOutcomeResult> {
  const document = await findReachableDocument(context)
  await assertOfficeOutcomeAllowed({ context, document })
  const { alreadySettled, eventId } = await settleAndRecordEvent({ context, document })
  const proofId = await persistOfficeProofIfSent({ context, eventId })
  const { stopCompleted, tripCompleted } = await closeStopAndTrip({
    alreadySettled,
    context,
    document,
  })
  const proofPending = await resolveProofPendingFlag({
    companyId: context.params.input.companyId,
    eventId,
    pendingSettings: context.settings.pendingSettings,
    transaction: context.transaction,
  })
  await recordOutcomeAudit({ context, document })

  return { alreadySettled, id: eventId, proofId, proofPending, stopCompleted, tripCompleted }
}

function persistOfficeProofIfSent(input: {
  readonly context: OutcomeContext
  readonly eventId: string
}): Promise<string | null> {
  const { context } = input
  const { proof } = context.params
  const { officeSettings } = context.settings
  if (proof === undefined || officeSettings === undefined || context.storage === undefined) {
    return Promise.resolve(null)
  }

  return persistDeliveryProof({
    actorUserId: context.params.input.actorUserId,
    authorship: context.authorship,
    companyId: context.params.input.companyId,
    eventId: input.eventId,
    proof,
    settings: officeSettings,
    storage: context.storage,
    transaction: context.transaction,
  })
}

/** O reenvio devolve o mesmo evento; o que a parada e a viagem fizeram já está feito. */
async function recallOutcome(input: {
  readonly context: OutcomeContext
  readonly eventId: string
}): Promise<ReportDocumentOutcomeResult | null> {
  const { context } = input
  const report = context.params.input
  const event = await context.transaction.findEventById({
    companyId: report.companyId,
    eventId: input.eventId,
  })
  if (event === null) return null

  const attachmentKey = context.params.proof?.upload?.attachmentKey ?? ''
  const proofId =
    attachmentKey === ''
      ? null
      : await context.transaction.findProofIdByAttachmentKeyWithinTransaction({
          attachmentKey,
          companyId: report.companyId,
          eventId: event.id,
          kind: PHOTO_PROOF_KIND,
        })
  const proofPending = await resolveProofPendingFlag({
    companyId: report.companyId,
    eventId: event.id,
    pendingSettings: context.settings.pendingSettings,
    transaction: context.transaction,
  })

  return {
    alreadySettled: true,
    id: event.id,
    proofId,
    proofPending,
    stopCompleted: false,
    tripCompleted: false,
  }
}
