/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import type { EventClockFields } from '../domain/occurred-at.policy.js'
import {
  FIELD_INFORMED_TIME,
  assertInformedTimeWithinWindow,
} from '../domain/field-delivery-timing.policy.js'
import { resolveStopOccurrenceKind } from '../domain/stop-occurrence-kind.policy.js'
import {
  assertStopOccurrenceRequirements,
  type StopOccurrenceTypeRequirements,
} from '../domain/stop-occurrence-requirements.policy.js'
import {
  OccurrenceTypeNotStopError,
  TripDocumentNotReachableError,
  TripOccurrenceUploadNotReachableError,
  TripStopNotReachableError,
} from '../domain/trip.error.js'
import type { SuggestDeliveryChargesPort } from '../../delivery-clients/application/suggest-delivery-charges.use-case.js'
import type {
  DriverFieldReportTransactionPort,
  DriverFieldReportUnitOfWork,
  ReportedLocation,
} from './driver-field-report.port.js'
import { resolveFieldTapLocationStamp } from './field-tap-location-stamp.service.js'
import { performSequencedStopArrival } from './recorded-together-steps.service.js'
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

/**
 * Spec 218 D2: o app manda o tipo do catálogo, e o kind sai do `stop_kind` dele — nunca do nome. O
 * corpo antigo (item da fila de antes da troca, e o escritório) manda só o kind, e grava sem tipo.
 */
export type StopOccurrenceReference =
  | { readonly kind: TripStopOccurrenceKind; readonly occurrenceTypeId?: undefined }
  | { readonly kind?: undefined; readonly occurrenceTypeId: string }

export type ReportStopOccurrenceInput = FieldTripLocator &
  EventClockFields &
  StopOccurrenceReference & {
    readonly actorUserId: string
    /**
     * Spec 315 (D4, D5, D10): o horário de chegada informado. O motorista o informa quando o tipo pede e a parada não tem
     * "Cheguei"; o escritório, quando a parada não tem chegada e o tipo tem espera mínima. Com chegada já gravada, é
     * descartado.
     */
    readonly arrivedAt?: Date
    readonly attachmentObjectId: string | null
    /** Spec 315 (D5): a chegada gravada junto passa pela ordem da parada; o escritório nunca manda. */
    readonly confirmOutOfOrder?: boolean
    /** O relógio do servidor; só os testes o injetam. */
    readonly now?: Date
    /** Spec 209: só o canal do motorista a recebe — sem ela, anexo é recusado, nunca ignorado. */
    readonly attachmentUploads?: StopOccurrenceAttachmentPort
    readonly companyId: string
    readonly description: string
    /** ADR-0057 §3: `null` é não aferida, e ela é aceita — distância nunca é porteiro. */
    readonly distanceMeters: number | null
    readonly documentId: string | null
    readonly idempotencyKey: string
    /** Spec 196 T3.3: o ponto do toque do motorista; o escritório não manda. */
    readonly location?: ReportedLocation | null | undefined
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

export type ReportStopOccurrenceResult = {
  /** Spec 315 (RF4): o horário informado gravou a chegada da parada nesta ocorrência. */
  readonly arrivalRecorded: boolean
  readonly id: string
}

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
async function resolveStopOccurrenceReference(
  input: ReportStopOccurrenceInput,
  transaction: DriverFieldReportTransactionPort,
): Promise<{
  readonly kind: TripStopOccurrenceKind
  readonly occurrenceTypeId: string | null
  readonly requirements: StopOccurrenceTypeRequirements | null
}> {
  if (input.occurrenceTypeId === undefined) {
    return { kind: input.kind, occurrenceTypeId: null, requirements: null }
  }

  const type = await transaction.findStopOccurrenceType({
    companyId: input.companyId,
    occurrenceTypeId: input.occurrenceTypeId,
  })
  if (type === null) throw new OccurrenceTypeNotStopError()
  return {
    kind: resolveStopOccurrenceKind(type.stopKind),
    occurrenceTypeId: input.occurrenceTypeId,
    requirements: type.requirements ?? null,
  }
}

type RecordInformedArrivalParams = {
  readonly authorship: ReturnType<typeof deriveFieldAuthorship>
  readonly input: ReportStopOccurrenceInput
  readonly informedAt: Date
  readonly now: Date
  readonly transaction: DriverFieldReportTransactionPort
}

/**
 * Spec 315 (D5): grava a chegada da parada na hora informada, pelo caminho que já existe. O escritório já informa a hora
 * em `now` (spec 156 A1, janela conferida lá); o motorista passa pela ordem da parada (spec 294) e pela mesma janela
 * (não no futuro, não antes do despacho). A coordenada da ocorrência **não** vai: é de outro momento e criaria sugestão
 * de endereço errada.
 */
async function recordInformedArrival(params: RecordInformedArrivalParams): Promise<void> {
  const { authorship, informedAt, input, now, transaction } = params
  const isOffice = input.target !== undefined
  if (!isOffice) {
    const stop = await transaction.findStopForDriver({
      companyId: input.companyId,
      stopId: input.stopId,
      target: toFieldTripTarget(input),
    })
    if (stop === null) throw new TripStopNotReachableError()
    assertInformedTimeWithinWindow({
      informedAt,
      kind: FIELD_INFORMED_TIME.arrived,
      now,
      windowStart: await transaction.findInformedTimeWindowStart({
        companyId: input.companyId,
        tripId: stop.tripId,
      }),
    })
  }
  const locator: FieldTripLocator =
    input.target === undefined
      ? {
          driverId: input.driverId,
          ...(input.channel === undefined ? {} : { channel: input.channel }),
        }
      : { target: input.target }
  await performSequencedStopArrival({
    authorship,
    input: {
      ...locator,
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      ...(input.confirmOutOfOrder === undefined
        ? {}
        : { confirmOutOfOrder: input.confirmOutOfOrder }),
      ...(isOffice ? { recordedAt: now } : { informedAt }),
      location: null,
      now: isOffice ? informedAt : now,
      stopId: input.stopId,
    },
    transaction,
  })
}

export async function reportStopOccurrence(
  input: ReportStopOccurrenceInput,
): Promise<ReportStopOccurrenceResult> {
  const authorship = deriveFieldAuthorship(input)

  const now = input.now ?? new Date()
  const recorded = await input.unitOfWork.execute(async (transaction) => {
    let arrivalRecorded = false
    const reference = await resolveStopOccurrenceReference(input, transaction)
    const occurrence = await withFieldReport({
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

        /**
         * Spec 315: o tipo cobra o que declarou (espera mínima, localização, foto, observação, horário) **antes** de
         * qualquer escrita. Só vale quando o corpo manda o tipo do catálogo; o corpo antigo (só o kind) não tem o que cobrar.
         */
        if (reference.requirements !== null) {
          const decision = assertStopOccurrenceRequirements({
            arrivedAt: stop.arrivedAt,
            attachmentCount: input.attachmentObjectId === null ? 0 : 1,
            hasLocation: input.location !== null && input.location !== undefined,
            informedArrivalAt: input.arrivedAt ?? null,
            isOffice: input.target !== undefined,
            note: input.description,
            now,
            requirements: reference.requirements,
          })
          if (decision.kind === 'record') {
            await recordInformedArrival({
              authorship,
              informedAt: decision.arrivalAt,
              input,
              now,
              transaction,
            })
            arrivalRecorded = true
          }
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

        const recordedOccurrence = await transaction.recordOccurrence({
          actorUserId: input.actorUserId,
          attachmentObjectId: input.attachmentObjectId,
          authorship,
          companyId: input.companyId,
          description: input.description,
          distanceMeters: input.distanceMeters,
          documentId: input.documentId,
          kind: reference.kind,
          locationStamp: resolveFieldTapLocationStamp({
            location: input.location,
            locator: input,
          }),
          occurrenceTypeId: reference.occurrenceTypeId,
          stopId: input.stopId,
        })
        await transaction.onStopEvent({
          channel: authorship.channel,
          companyId: input.companyId,
          kind: 'occurrence',
          occurredAt: new Date(),
          target: { stopId: input.stopId },
        })
        return recordedOccurrence
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
    })
    return { arrivalRecorded, id: occurrence.id, kind: reference.kind }
  })

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
  if (recorded.kind === CHARGE_OCCURRENCE_KIND && input.documentId !== null) {
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
    kind: recorded.kind,
    occurredAt: new Date(),
    occurrenceId: recorded.id,
    stopId: input.stopId,
  })

  return { arrivalRecorded: recorded.arrivalRecorded, id: recorded.id }
}
