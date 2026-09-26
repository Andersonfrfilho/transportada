/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import {
  TripDocumentNotReachableError,
  TripOccurrenceUploadNotReachableError,
  TripStopNotReachableError,
} from '../domain/trip.error.js'
import type { SuggestDeliveryChargesPort } from '../../delivery-clients/application/suggest-delivery-charges.use-case.js'
import type { DriverFieldReportUnitOfWork } from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldTripLocator,
} from './field-trip-target.types.js'
import {
  resolveOccurrenceUploadAttachment,
  type OccurrenceUploadAttachmentPort,
} from './resolve-occurrence-upload-attachment.use-case.js'
import { buildOfficeAuditEntry, type OfficeAuditRequest } from './trip-field-office-audit.port.js'
import { resolveFieldReportOperation, withFieldReport } from './trip-field-report.port.js'

const OCCURRENCE_OPERATION = 'stop.occurrence'
/** O único tipo de ocorrência que fala de dinheiro. Os demais viram pendência operacional. */
const CHARGE_OCCURRENCE_KIND = 'unexpected_charge'
/**
 * O motorista não escolhe o tipo da taxa — ele não sabe se o CD chama aquilo de descarga ou de
 * plataforma. A sugestão nasce como `other`, e o escritório corrige junto com o valor.
 */
const OCCURRENCE_CHARGE_TYPE = 'other' as const

/**
 * Spec 082 D8: o aviso da ocorrência de parada, pelo trilho `notification.v1` existente — a API
 * produz a mensagem e o worker consome e renderiza. **Nunca lança**: a ocorrência é o fato, o
 * aviso é conveniência, e quem decide se o motivo tem template é a política — motivo sem template
 * grava e segue, sem aviso.
 */
export type StopOccurrenceNotifierPort = {
  notify(input: {
    readonly companyId: string
    readonly documentId: string | null
    readonly kind: TripStopOccurrenceKind
    readonly occurredAt: Date
    readonly occurrenceId: string
    readonly stopId: string
  }): Promise<void>
}

/**
 * Spec 209: a foto do "Deu problema" é anexo **da ocorrência**, nunca canhoto de entrega. O objeto
 * é o upload confirmado da 179 (`trip_occurrence_uploads`), conferido por empresa, viagem e
 * motorista; e a foto que chega depois (RF3) completa a ocorrência gravada sem ela, uma vez.
 */
export type StopOccurrenceAttachmentPort = OccurrenceUploadAttachmentPort & {
  attachUploadToStopOccurrence(input: {
    readonly companyId: string
    readonly objectId: string
    readonly occurrenceId: string
    readonly stopId: string
  }): Promise<void>
}

export type ReportStopOccurrenceInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly attachmentObjectId: string | null
  /** Spec 209: só o canal do motorista a recebe — sem ela, anexo é recusado, nunca ignorado. */
  readonly attachmentUploads?: StopOccurrenceAttachmentPort
  readonly companyId: string
  readonly description: string
  /** ADR-0057 §3: `null` é não aferida, e ela é aceita — distância nunca é porteiro. */
  readonly distanceMeters: number | null
  readonly documentId: string | null
  readonly idempotencyKey: string
  readonly kind: TripStopOccurrenceKind
  /** Spec 156 T15 M11: só o escritório manda — a trilha nasce na transação da ocorrência. */
  readonly officeAudit?: OfficeAuditRequest
  readonly stopId: string
  /**
   * Spec 060 D4c: a ocorrência de **cobrança** vira sugestão na fila do escritório. Ausente, a
   * ocorrência segue sendo só relato — que é o comportamento da 057 sozinha.
   */
  readonly suggestCharges?: SuggestDeliveryChargesPort
  /** Ausente quando a instalação não tem trilho de notificação — o registro segue igual. */
  readonly notifier?: StopOccurrenceNotifierPort
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export type ReportStopOccurrenceResult = { readonly id: string }

/**
 * Spec 209 RF2: o anexo só vale se o upload é desta empresa, desta viagem e deste motorista. Roda
 * no registro novo **e** no reenvio — a foto que chega depois passa pela mesma barreira.
 */
async function assertStopAttachmentReachable(
  input: ReportStopOccurrenceInput,
  tripId: string,
): Promise<void> {
  if (input.attachmentObjectId === null) return
  if (input.attachmentUploads === undefined || input.driverId === undefined) {
    throw new TripOccurrenceUploadNotReachableError()
  }
  await resolveOccurrenceUploadAttachment({
    companyId: input.companyId,
    driverId: input.driverId,
    objectId: input.attachmentObjectId,
    repository: input.attachmentUploads,
    tripId,
  })
}

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
  const authorship = deriveFieldAuthorship(input)

  const recorded = await input.unitOfWork.execute(async (transaction) =>
    withFieldReport({
      guard: {
        actorUserId: input.actorUserId,
        authorship,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: resolveFieldReportOperation({ locator: input, operation: OCCURRENCE_OPERATION }),
        transaction,
      },
      perform: async () => {
        const stop = await transaction.findStopForDriver({
          companyId: input.companyId,
          stopId: input.stopId,
          target: toFieldTripTarget(input),
        })
        if (stop === null) throw new TripStopNotReachableError()
        await assertStopAttachmentReachable(input, stop.tripId)

        if (input.documentId !== null) {
          const document = await transaction.findDocumentForDriver({
            companyId: input.companyId,
            documentId: input.documentId,
            target: toFieldTripTarget(input),
          })
          if (document === null) throw new TripDocumentNotReachableError()
        }

        const audit = buildOfficeAuditEntry({
          actorUserId: input.actorUserId,
          audit: input.officeAudit,
          companyId: input.companyId,
          details: {
            ...(input.documentId === null ? {} : { documentId: input.documentId }),
            stopId: input.stopId,
          },
          locator: input,
        })
        if (audit !== undefined) await transaction.recordOfficeAudit(audit)

        return transaction.recordOccurrence({
          actorUserId: input.actorUserId,
          attachmentObjectId: input.attachmentObjectId,
          authorship,
          companyId: input.companyId,
          description: input.description,
          distanceMeters: input.distanceMeters,
          documentId: input.documentId,
          kind: input.kind,
          stopId: input.stopId,
        })
      },
      recall: async (occurrenceId) => {
        if (input.attachmentObjectId !== null) {
          const stop = await transaction.findStopForDriver({
            companyId: input.companyId,
            stopId: input.stopId,
            target: toFieldTripTarget(input),
          })
          if (stop === null) throw new TripStopNotReachableError()
          await assertStopAttachmentReachable(input, stop.tripId)
        }
        return transaction.findOccurrenceById({ companyId: input.companyId, occurrenceId })
      },
    }),
  )

  /**
   * Spec 209 RF3: a foto é um item próprio da fila, atrás da ocorrência, e chega pela mesma chave.
   * No registro novo o anexo já nasceu na transação e isto não muda nada; no reenvio, completa a
   * ocorrência gravada sem foto — nunca troca a que já está lá.
   */
  if (input.attachmentObjectId !== null) {
    await input.attachmentUploads?.attachUploadToStopOccurrence({
      companyId: input.companyId,
      objectId: input.attachmentObjectId,
      occurrenceId: recorded.id,
      stopId: input.stopId,
    })
  }

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

  /**
   * Spec 082 D8: o aviso sai **depois** da transação, como a sugestão de cobrança — falhar aqui
   * não desfaz o relato. A hora é a do registro no servidor: é quando o evento da fila offline
   * sincronizou, e é o que o escritório precisa saber para agir agora.
   */
  await input.notifier?.notify({
    companyId: input.companyId,
    documentId: input.documentId,
    kind: input.kind,
    occurredAt: new Date(),
    occurrenceId: recorded.id,
    stopId: input.stopId,
  })

  return recorded
}
