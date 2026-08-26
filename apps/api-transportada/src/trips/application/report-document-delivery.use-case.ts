/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TripDocumentNotReachableError } from '../domain/trip.error.js'
import type { DriverReturnReason } from '../domain/driver-return-reason.policy.js'
import type {
  DriverFieldReportTransactionPort,
  DriverFieldReportUnitOfWork,
  ReportedLocation,
} from './driver-field-report.port.js'
import { withFieldReport } from './trip-field-report.port.js'

const DELIVER_OPERATION = 'document.deliver'
const RETURN_OPERATION = 'document.return'

/** Depois destes a nota saiu do eixo do campo: reconfirmar não é repetição, é conflito. */
const SETTLED_STATUSES = ['delivered', 'returned'] as const

export type ReportDocumentOutcomeInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly driverId: string
  readonly idempotencyKey: string
  readonly location: ReportedLocation | null
  readonly now: Date
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export type ReportDocumentReturnInput = ReportDocumentOutcomeInput & {
  readonly reason: DriverReturnReason
}

export type ReportDocumentOutcomeResult = {
  readonly id: string
  /** Para a tela do motorista saber que a parada fechou sem precisar recarregar a viagem inteira. */
  readonly stopCompleted: boolean
  readonly tripCompleted: boolean
}

/**
 * Spec 057, P1 "entreguei": a última nota da parada fecha `completed_at`, e a última parada leva a
 * viagem a `completed` sozinha (spec 056 D1). Ninguém no escritório aperta nada para isso.
 */
export async function reportDocumentDelivery(
  input: ReportDocumentOutcomeInput,
): Promise<ReportDocumentOutcomeResult> {
  return runOutcome({
    input,
    operation: DELIVER_OPERATION,
    settle: (transaction, documentId) =>
      transaction.markDocumentDelivered({
        at: input.now,
        companyId: input.companyId,
        documentId,
      }),
    kind: 'delivered',
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
  return runOutcome({
    input,
    operation: RETURN_OPERATION,
    settle: (transaction, documentId) =>
      transaction.markDocumentReturned({
        at: input.now,
        companyId: input.companyId,
        documentId,
        reason: input.reason,
      }),
    kind: 'returned',
  })
}

type RunOutcomeParams = {
  readonly input: ReportDocumentOutcomeInput
  readonly kind: 'delivered' | 'returned'
  readonly operation: string
  readonly settle: (
    transaction: DriverFieldReportTransactionPort,
    documentId: string,
  ) => Promise<void>
}

async function runOutcome(params: RunOutcomeParams): Promise<ReportDocumentOutcomeResult> {
  const { input, kind, operation, settle } = params

  return input.unitOfWork.execute(async (transaction) =>
    withFieldReport(
      {
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation,
        transaction,
      },
      async () => {
        const document = await transaction.findDocumentForDriver({
          companyId: input.companyId,
          documentId: input.documentId,
          driverId: input.driverId,
        })
        /**
         * Confirmação enfileirada de uma nota que o escritório desvinculou, ou que já foi resolvida.
         * O código é estável e a tela mostra o conflito: sumir com o toque do motorista é pior do
         * que recusá-lo com o motivo à vista.
         */
        if (document === null || document.stopId === null) {
          throw new TripDocumentNotReachableError()
        }
        if ((SETTLED_STATUSES as readonly string[]).includes(document.separationStatus)) {
          throw new TripDocumentNotReachableError()
        }

        await settle(transaction, input.documentId)
        const event = await transaction.recordEvent({
          actorUserId: input.actorUserId,
          companyId: input.companyId,
          documentId: input.documentId,
          kind,
          location: input.location,
          stopId: document.stopId,
        })

        const stopCompleted = await transaction.completeStopIfSettled({
          at: input.now,
          companyId: input.companyId,
          stopId: document.stopId,
        })
        const tripCompleted = stopCompleted
          ? await transaction.completeTripIfSettled({
              companyId: input.companyId,
              tripId: document.tripId,
            })
          : false

        return { id: event.id, stopCompleted, tripCompleted }
      },
      async (eventId) => {
        const event = await transaction.findEventById({ companyId: input.companyId, eventId })
        // O reenvio devolve o mesmo evento; o que a parada e a viagem fizeram já está feito.
        return event === null ? null : { id: event.id, stopCompleted: false, tripCompleted: false }
      },
    ),
  )
}
