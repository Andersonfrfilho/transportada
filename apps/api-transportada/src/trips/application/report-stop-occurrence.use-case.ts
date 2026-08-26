/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import { TripDocumentNotReachableError, TripStopNotReachableError } from '../domain/trip.error.js'
import type { DriverFieldReportUnitOfWork } from './driver-field-report.port.js'
import { withFieldReport } from './trip-field-report.port.js'

const OCCURRENCE_OPERATION = 'stop.occurrence'

export type ReportStopOccurrenceInput = {
  readonly actorUserId: string
  readonly attachmentObjectId: string | null
  readonly companyId: string
  readonly description: string
  readonly documentId: string | null
  readonly driverId: string
  readonly idempotencyKey: string
  readonly kind: TripStopOccurrenceKind
  readonly stopId: string
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export type ReportStopOccurrenceResult = { readonly id: string }

/**
 * Spec 057, P1 "deu problema". Duas regras que fazem isto ser usado em vez de contornado
 * (ADR-0045 §6):
 *
 * - **Não pede decisão.** Não há valor, custo nem culpa no contrato. O motorista descreve o que viu,
 *   e quem decide é o escritório com a 060 na mão.
 * - **É independente da entrega.** Ela não muda o estado de nota nenhuma, e não impede a entrega da
 *   mesma nota logo depois — ele esperou duas horas *e* entregou.
 */
export async function reportStopOccurrence(
  input: ReportStopOccurrenceInput,
): Promise<ReportStopOccurrenceResult> {
  return input.unitOfWork.execute(async (transaction) =>
    withFieldReport(
      {
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: OCCURRENCE_OPERATION,
        transaction,
      },
      async () => {
        const stop = await transaction.findStopForDriver({
          companyId: input.companyId,
          driverId: input.driverId,
          stopId: input.stopId,
        })
        if (stop === null) throw new TripStopNotReachableError()

        if (input.documentId !== null) {
          const document = await transaction.findDocumentForDriver({
            companyId: input.companyId,
            documentId: input.documentId,
            driverId: input.driverId,
          })
          if (document === null) throw new TripDocumentNotReachableError()
        }

        return transaction.recordOccurrence({
          actorUserId: input.actorUserId,
          attachmentObjectId: input.attachmentObjectId,
          companyId: input.companyId,
          description: input.description,
          documentId: input.documentId,
          kind: input.kind,
          stopId: input.stopId,
        })
      },
      (occurrenceId) =>
        transaction.findOccurrenceById({ companyId: input.companyId, occurrenceId }),
    ),
  )
}
