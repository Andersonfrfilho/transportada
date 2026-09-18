/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryProofFieldSettings } from '../domain/delivery-proof-settings.policy.js'
import { assertOfficeProofMeetsSettings } from '../domain/office-delivery-proof.policy.js'
import type { TripDocumentSeparationStatus } from '../../database/trip.schema.js'
import {
  DELIVERED_DOCUMENT_STATUS,
  DELIVERED_EVENT_KIND,
  PHOTO_PROOF_KIND,
  RETURNED_DOCUMENT_STATUS,
  RETURNED_EVENT_KIND,
  REQUIRED_PROOF_FIELD_MODE,
} from '../domain/delivery-event.constant.js'
import {
  assertInformedTimeWithinWindow,
  FIELD_INFORMED_TIME,
} from '../domain/field-delivery-timing.policy.js'
import type { DriverReturnReason } from '../domain/driver-return-reason.policy.js'
import {
  TripDocumentAlreadySettledError,
  TripDocumentNotReachableError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
import {
  checkTripDocumentTransition,
  TRIP_DOCUMENT_ACTION,
  type TripDocumentAction,
} from '../domain/trip-state.policy.js'
import type {
  DriverFieldReportTransactionPort,
  DriverFieldReportUnitOfWork,
  ReportedLocation,
} from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldAuthorship,
  type FieldTripLocator,
} from './field-trip-target.types.js'
import {
  assertOfficeUploadAccepted,
  persistOfficeProof,
  type OfficeDeliveryProofAttachment,
  type OfficeDeliveryProofUpload,
} from './office-delivery-proof.service.js'
import {
  runWithStoredObjectCleanup,
  type RemovableObjectStoragePort,
} from './stored-object-cleanup.service.js'
import { withFieldReport } from './trip-field-report.port.js'

/**
 * ADR-0067 §2 (emenda): o escritório não herda o no-op do motorista — dias depois, uma segunda baixa
 * sobre a mesma nota seria uma entrega fantasma na linha do tempo. O caso real ("falta só o
 * canhoto") é `field-proof`, que não passa por aqui.
 */
function isSettledDocumentStatus(status: TripDocumentSeparationStatus): boolean {
  return status === DELIVERED_DOCUMENT_STATUS || status === RETURNED_DOCUMENT_STATUS
}

const DELIVER_OPERATION = 'document.deliver'
const RETURN_OPERATION = 'document.return'

export type ReportDocumentOutcomeInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly idempotencyKey: string
  readonly location: ReportedLocation | null
  readonly now: Date
  /** ADR-0067 §3: quando o registro foi gravado. Ausente cai em `now` — é o caso do motorista. */
  readonly recordedAt?: Date
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

/** Spec 156 T6: o canhoto que o escritório sobe junto com a entrega — `null` quando não veio. */
export type OfficeDeliveryProofInput = OfficeDeliveryProofAttachment & {
  readonly upload: OfficeDeliveryProofUpload | null
}

export type ReportDocumentDeliveryInput = ReportDocumentOutcomeInput & {
  /** Spec 156 T6: só o canal `office` manda isto — o motorista anexa depois, por rota própria. */
  readonly proof?: OfficeDeliveryProofInput
  /**
   * ADR-0070 §1, spec 159 RF1/RF2: a configuração resolvida da nota — usada só para saber se a
   * foto é obrigatória (`proofPending`), não para gravar nada. Os três canais de produção mandam a
   * mesma porta que já usam para resolver o comprovante
   * (`DeliveryProofPort.resolveProofFieldSettings`). Opcional para não quebrar chamador que não
   * precisa de `proofPending` (ex.: teste de outra regra) — sem ela, o campo sai sempre `false`.
   */
  readonly resolveProofSettings?: (input: {
    readonly companyId: string
    readonly documentId: string
  }) => Promise<DeliveryProofFieldSettings>
}

export type ReportDocumentReturnInput = ReportDocumentOutcomeInput & {
  readonly reason: DriverReturnReason
}

export type ReportDocumentOutcomeResult = {
  /**
   * A nota já estava onde o toque queria pôr — o escritório resolveu, ou foi um segundo toque. Não
   * é conflito: é a idempotência que a 056 já decidiu (`trip-state.policy.ts`, portão 1).
   */
  readonly alreadySettled: boolean
  readonly id: string
  /** `null` quando não veio comprovante (motorista, ou escritório sem foto obrigatória). */
  readonly proofId: string | null
  /**
   * ADR-0070 §1, spec 159 RF1/RF2: a entrega **nunca** é recusada por falta de foto — este campo
   * diz que ela ainda não chegou, para a tela avisar sem bloquear. Sempre `false` num `return`.
   */
  readonly proofPending: boolean
  /** Para a tela do motorista saber que a parada fechou sem precisar recarregar a viagem inteira. */
  readonly stopCompleted: boolean
  readonly tripCompleted: boolean
}

/**
 * Spec 057, P1 "entreguei": a última nota da parada fecha `completed_at`, e a última parada leva a
 * viagem a `completed` sozinha (spec 056 D1). Ninguém no escritório aperta nada para isso.
 */
export async function reportDocumentDelivery(
  input: ReportDocumentDeliveryInput,
): Promise<ReportDocumentOutcomeResult> {
  return runOutcome({
    input,
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
    action: TRIP_DOCUMENT_ACTION.deliver,
    kind: DELIVERED_EVENT_KIND,
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
    action: TRIP_DOCUMENT_ACTION.return,
    kind: RETURNED_EVENT_KIND,
  })
}

type RunOutcomeParams = {
  readonly action: TripDocumentAction
  readonly input: ReportDocumentOutcomeInput
  readonly kind: typeof DELIVERED_EVENT_KIND | typeof RETURNED_EVENT_KIND
  readonly operation: string
  /** Spec 156 T6: só a entrega do escritório manda isto. */
  readonly proof?: OfficeDeliveryProofInput
  /** ADR-0070 §1, spec 159: só `document.deliver` a usa — `document.return` nunca fica pendente. */
  readonly resolveProofSettings?: (input: {
    readonly companyId: string
    readonly documentId: string
  }) => Promise<DeliveryProofFieldSettings>
  readonly settle: (
    transaction: DriverFieldReportTransactionPort,
    documentId: string,
  ) => Promise<void>
}

/**
 * ADR-0067 §5 (emenda 2026-09-18): o canhoto entra **dentro** da transação da entrega — se o anexo
 * for recusado, a entrega inteira desfaz, e não fica uma nota "entregue" sem o comprovante que a
 * configuração exige.
 */
async function persistDeliveryProof(input: {
  readonly actorUserId: string
  readonly authorship: FieldAuthorship
  readonly companyId: string
  readonly eventId: string
  readonly proof: OfficeDeliveryProofInput
  /** Resolvida antes da transação (`resolveOutcomeProofSettings`). */
  readonly settings: DeliveryProofFieldSettings
  readonly storage: RemovableObjectStoragePort
  readonly transaction: DriverFieldReportTransactionPort
}): Promise<string | null> {
  const { upload } = input.proof
  assertOfficeProofMeetsSettings({ receiver: upload, settings: input.settings })
  if (upload === null) return null
  assertOfficeUploadAccepted(upload)

  const persisted = await persistOfficeProof({
    actorUserId: input.actorUserId,
    attachment: input.proof,
    authorship: input.authorship,
    companyId: input.companyId,
    eventId: input.eventId,
    storage: input.storage,
    transaction: input.transaction,
    upload,
  })
  return persisted.id
}

/**
 * ADR-0070 §1, spec 159 RF1/RF2: pendente = entrega (nunca `return`), foto obrigatória resolvida, e
 * nenhuma foto anexada ao evento. Sem `resolveProofSettings` (nenhum canal deixa de mandar hoje, mas
 * a função é pura sobre `RunOutcomeParams`) o campo é `false` — nunca bloqueia por falta dele.
 */
async function resolveProofPendingFlag(params: {
  readonly companyId: string
  readonly eventId: string
  /** `undefined` num `return`, ou quando o canal não mandou `resolveProofSettings`. */
  readonly pendingSettings: DeliveryProofFieldSettings | undefined
  readonly transaction: DriverFieldReportTransactionPort
}): Promise<boolean> {
  if (params.pendingSettings?.photo !== REQUIRED_PROOF_FIELD_MODE) return false

  const hasPhoto = await params.transaction.findProofExistsForEvent({
    companyId: params.companyId,
    eventId: params.eventId,
    kind: PHOTO_PROOF_KIND,
  })
  return !hasPhoto
}

/**
 * Spec 159 T11 (item 5): a configuração do comprovante é lida **antes** de abrir a transação da
 * entrega. As duas portas leem pelo pool — chamadas lá dentro, cada baixa segurava uma conexão na
 * transação e pedia outra ao pool, e sob carga as duas esperas se somavam.
 */
async function resolveOutcomeProofSettings(params: RunOutcomeParams): Promise<{
  readonly officeSettings: DeliveryProofFieldSettings | undefined
  readonly pendingSettings: DeliveryProofFieldSettings | undefined
}> {
  const { input, kind, proof, resolveProofSettings } = params
  const query = { companyId: input.companyId, documentId: input.documentId }
  const officeSettings = proof === undefined ? undefined : await proof.resolveSettings(query)
  if (kind !== DELIVERED_EVENT_KIND || resolveProofSettings === undefined) {
    return { officeSettings, pendingSettings: undefined }
  }

  return { officeSettings, pendingSettings: officeSettings ?? (await resolveProofSettings(query)) }
}

/**
 * Spec 156 T15: o canhoto sobe dentro da transação; se ela desfizer depois do upload, o objeto sai
 * do bucket (`runWithStoredObjectCleanup`). Sem canhoto, a transação corre como sempre correu.
 */
async function runOutcome(params: RunOutcomeParams): Promise<ReportDocumentOutcomeResult> {
  const settings = await resolveOutcomeProofSettings(params)
  if (params.proof === undefined) return runOutcomeTransaction({ params, settings })

  return runWithStoredObjectCleanup({
    operation: (storage) => runOutcomeTransaction({ params, settings, storage }),
    storage: params.proof.storage,
  })
}

async function runOutcomeTransaction(context: {
  readonly params: RunOutcomeParams
  readonly settings: Awaited<ReturnType<typeof resolveOutcomeProofSettings>>
  readonly storage?: RemovableObjectStoragePort
}): Promise<ReportDocumentOutcomeResult> {
  const { action, input, kind, operation, proof, settle } = context.params
  const { officeSettings, pendingSettings } = context.settings
  const { storage } = context
  const authorship = deriveFieldAuthorship(input)
  const isOffice = 'target' in input && input.target !== undefined

  return input.unitOfWork.execute(async (transaction) =>
    withFieldReport(
      {
        actorUserId: input.actorUserId,
        authorship,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation,
        transaction,
      },
      async () => {
        const document = await transaction.findDocumentForDriver({
          companyId: input.companyId,
          documentId: input.documentId,
          target: toFieldTripTarget(input),
        })
        /**
         * Confirmação enfileirada de uma nota que o escritório desvinculou. O código é estável e a
         * tela mostra o conflito: sumir com o toque do motorista é pior do que recusá-lo com o
         * motivo à vista.
         */
        if (document === null || document.stopId === null) {
          throw new TripDocumentNotReachableError()
        }

        /**
         * Spec 156 T15 M6: no canal `office`, nota já fechada — entregue **ou** devolvida — é 409
         * antes de qualquer outra conferência. Sem isto, a data fora da janela ou a transição
         * bloqueada respondiam no lugar, e a tela não sabia que era só "essa nota já foi baixada".
         */
        if (isOffice && isSettledDocumentStatus(document.separationStatus)) {
          throw new TripDocumentAlreadySettledError()
        }

        /**
         * ADR-0067 §3: só o escritório manda "quando aconteceu" — o motorista sempre reporta agora.
         * A janela é contra o relógio do servidor e contra o despacho congelado da viagem.
         */
        if (isOffice) {
          assertInformedTimeWithinWindow({
            informedAt: input.now,
            kind:
              kind === DELIVERED_EVENT_KIND
                ? FIELD_INFORMED_TIME.delivered
                : FIELD_INFORMED_TIME.returned,
            now: input.recordedAt ?? new Date(),
            windowStart: await transaction.findInformedTimeWindowStart({
              companyId: input.companyId,
              tripId: document.tripId,
            }),
          })
        }

        /**
         * Quem decide se a transição vale é a política da 056, não uma segunda lista aqui. Ela põe o
         * no-op idempotente **antes** do estado da viagem de propósito: a fila offline drena muito
         * depois do toque, e uma entrega que funcionou voltaria como 409 para o motorista que fez
         * tudo certo.
         */
        const transition = checkTripDocumentTransition({
          action,
          documentStatus: document.separationStatus,
          tripStatus: document.tripStatus,
        })
        if (transition.outcome === 'blocked') {
          throw new TripStateTransitionNotAllowedError(transition.reason)
        }
        const alreadySettled = transition.outcome === 'unchanged'

        if (!alreadySettled) await settle(transaction, input.documentId)
        /**
         * Spec 159 T11: o no-op devolve o evento que já existe. Gravar outro fazia o reenvio virar o
         * "último" `delivered` da nota — sem foto — e esconder a foto do evento verdadeiro da nota
         * do motorista e do `proofPending`.
         */
        const existingEvent = alreadySettled
          ? await transaction.findLatestEventForDocument({
              companyId: input.companyId,
              documentId: input.documentId,
              kind,
            })
          : null
        const event =
          existingEvent ??
          (await transaction.recordEvent({
            actorUserId: input.actorUserId,
            authorship,
            companyId: input.companyId,
            documentId: input.documentId,
            kind,
            location: input.location,
            ...(isOffice
              ? { occurredAt: input.now, recordedAt: input.recordedAt ?? new Date() }
              : {}),
            ...(input.driverId === undefined ? {} : { reportedByDriverId: input.driverId }),
            stopId: document.stopId,
          }))

        const proofId =
          proof === undefined || officeSettings === undefined || storage === undefined
            ? null
            : await persistDeliveryProof({
                actorUserId: input.actorUserId,
                authorship,
                companyId: input.companyId,
                eventId: event.id,
                proof,
                settings: officeSettings,
                storage,
                transaction,
              })

        const stopCompleted = await transaction.completeStopIfSettled({
          at: input.now,
          companyId: input.companyId,
          fillMissingArrival: isOffice,
          stopId: document.stopId,
        })
        const tripCompleted = stopCompleted
          ? await transaction.completeTripIfSettled({
              actorUserId: input.actorUserId,
              at: input.now,
              authorship,
              companyId: input.companyId,
              tripId: document.tripId,
            })
          : false
        /**
         * ADR-0058 §3, spec 156 T15 M4: a nota que fechou adianta a viagem para `on_delivery_route`
         * — o caminho do barracão (removido na T8b) fazia isso, e a baixa de campo não fazia.
         */
        if (!alreadySettled && !tripCompleted) {
          await transaction.advanceTripFromSettledDocuments({
            actorUserId: input.actorUserId,
            at: input.now,
            authorship,
            companyId: input.companyId,
            tripId: document.tripId,
          })
        }
        const proofPending = await resolveProofPendingFlag({
          companyId: input.companyId,
          eventId: event.id,
          pendingSettings,
          transaction,
        })

        return { alreadySettled, id: event.id, proofId, proofPending, stopCompleted, tripCompleted }
      },
      async (eventId) => {
        const event = await transaction.findEventById({ companyId: input.companyId, eventId })
        if (event === null) return null

        const proofId =
          proof?.upload === undefined || proof.upload === null || proof.upload.attachmentKey === ''
            ? null
            : await transaction.findProofIdByAttachmentKeyWithinTransaction({
                attachmentKey: proof.upload.attachmentKey,
                companyId: input.companyId,
                eventId: event.id,
                kind: PHOTO_PROOF_KIND,
              })
        const proofPending = await resolveProofPendingFlag({
          companyId: input.companyId,
          eventId: event.id,
          pendingSettings,
          transaction,
        })

        // O reenvio devolve o mesmo evento; o que a parada e a viagem fizeram já está feito.
        return {
          alreadySettled: true,
          id: event.id,
          proofId,
          proofPending,
          stopCompleted: false,
          tripCompleted: false,
        }
      },
    ),
  )
}
