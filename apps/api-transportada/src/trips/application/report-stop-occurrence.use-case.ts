/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import { TripDocumentNotReachableError, TripStopNotReachableError } from '../domain/trip.error.js'
import type { SuggestDeliveryChargesPort } from '../../delivery-clients/application/suggest-delivery-charges.use-case.js'
import type { DriverFieldReportUnitOfWork } from './driver-field-report.port.js'
import { withFieldReport } from './trip-field-report.port.js'

const OCCURRENCE_OPERATION = 'stop.occurrence'
/** O único tipo de ocorrência que fala de dinheiro. Os demais viram pendência operacional. */
const CHARGE_OCCURRENCE_KIND = 'unexpected_charge'
/**
 * O motorista não escolhe o tipo da taxa — ele não sabe se o CD chama aquilo de descarga ou de
 * plataforma. A sugestão nasce como `other`, e o escritório corrige junto com o valor.
 */
const OCCURRENCE_CHARGE_TYPE = 'other' as const

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
  /**
   * Spec 060 D4c: a ocorrência de **cobrança** vira sugestão na fila do escritório. Ausente, a
   * ocorrência segue sendo só relato — que é o comportamento da 057 sozinha.
   */
  readonly suggestCharges?: SuggestDeliveryChargesPort
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
  const recorded = await input.unitOfWork.execute(async (transaction) =>
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

  /**
   * Spec 060 D4c: **a ocorrência não é uma cobrança; ela é o aviso de que talvez exista uma.** A
   * sugestão nasce fora da transação do relato de campo, e falhar aqui não desfaz a ocorrência —
   * perder o aviso do motorista para salvar a fila do escritório seria trocar o certo pelo errado.
   *
   * Sem nota não há sugestão: a taxa é cobrada por nota, e "alguém cobrou algo nesta parada" não diz
   * de qual carga — isso o escritório resolve lendo a ocorrência.
   */
  if (input.kind === CHARGE_OCCURRENCE_KIND && input.documentId !== null) {
    await input.suggestCharges?.onDelivered({
      chargeType: OCCURRENCE_CHARGE_TYPE,
      companyId: input.companyId,
      deliveredOn: new Date().toISOString().slice(0, 10),
      origin: 'occurrence',
      tripDocumentId: input.documentId,
    })
  }

  return recorded
}
