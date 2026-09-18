/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3 (D7, aceite 10): o escritório registra a mesma ocorrência de rua em várias notas
 * da viagem, em nome do motorista. **Uma transação para o lote**: ou as N ocorrências gravam, ou
 * nenhuma — é uma requisição e um fato só ("cliente ausente" nesta parada), e o reenvio da mesma
 * chave é a única saída que a tela precisa explicar. Um aviso por nota criada, depois do commit.
 */
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import {
  buildOccurrenceBatchItemKey,
  buildOccurrenceBatchOperation,
  OFFICE_OCCURRENCE_BATCH_ITEM_OPERATION,
} from '../domain/occurrence-batch.policy.js'
import { OccurrenceTypeNotFieldError, TripDocumentNotReachableError } from '../domain/trip.error.js'
import type { DriverFieldReportTransactionPort } from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldAuthorship,
  type FieldTripTarget,
  type ResolvedTripFieldTarget,
} from './field-trip-target.types.js'
import {
  notifyOccurrence,
  type OccurrenceNotifierPort,
  type OccurrenceTypeRecord,
  type TripOccurrence,
} from './register-trip-occurrence.use-case.js'
import { withFieldReport } from './trip-field-report.port.js'

export type OfficeOccurrenceBatchTransactionPort = Pick<
  DriverFieldReportTransactionPort,
  'claim' | 'settle'
> & {
  findOccurrenceType(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<null | OccurrenceTypeRecord>
  /** As notas pedidas que estão na viagem do alvo, vivas, com a viagem despachada. */
  findReachableDocumentIds(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
    readonly target: FieldTripTarget
  }): Promise<readonly string[]>
  saveDocumentOccurrence(input: {
    readonly actorUserId: string
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
    readonly stage: typeof TRIP_OCCURRENCE_STAGE.delivery
    readonly tripId: string
    readonly typeName: string
  }): Promise<null | TripOccurrence>
  /** O `recall` da reserva por nota: a ocorrência que ela já gravou. */
  findDocumentOccurrence(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | { readonly documentId: string; readonly id: string }>
}

export type OfficeOccurrenceBatchUnitOfWork = {
  execute<TResult>(
    operation: (transaction: OfficeOccurrenceBatchTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

export type OfficeOccurrenceNotificationsPort = {
  readonly notifier: OccurrenceNotifierPort | undefined
  readLabels(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<{ readonly documentLabel: string; readonly stopLabel: string }>
}

export type RegisterOfficeDocumentOccurrencesParams = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly idempotencyKey: string
  readonly note: string
  readonly notifications: OfficeOccurrenceNotificationsPort
  readonly occurrenceTypeId: string
  readonly target: ResolvedTripFieldTarget
  readonly unitOfWork: OfficeOccurrenceBatchUnitOfWork
}

export type OfficeOccurrenceBatchItem = {
  readonly documentId: string
  readonly id: string
}

export type RegisterOfficeDocumentOccurrencesResult = {
  readonly items: readonly OfficeOccurrenceBatchItem[]
}

type BatchItemOutcome = OfficeOccurrenceBatchItem & {
  /** Ressalva A3: acesa só dentro do `perform` da nota — o `recall` nunca a acende. */
  readonly createdNow: boolean
}

type BatchContext = RegisterOfficeDocumentOccurrencesParams & {
  readonly authorship: FieldAuthorship
  readonly transaction: OfficeOccurrenceBatchTransactionPort
}

type BatchOutcome = {
  readonly id: string
  readonly items: readonly BatchItemOutcome[]
  readonly occurrenceType: OccurrenceTypeRecord | null
}

export async function registerOfficeDocumentOccurrences(
  params: RegisterOfficeDocumentOccurrencesParams,
): Promise<RegisterOfficeDocumentOccurrencesResult> {
  const authorship = deriveFieldAuthorship({ target: params.target })
  const outcome = await params.unitOfWork.execute((transaction) => {
    const context: BatchContext = { ...params, authorship, transaction }
    return withFieldReport<BatchOutcome>(
      {
        actorUserId: params.actorUserId,
        authorship,
        companyId: params.companyId,
        idempotencyKey: params.idempotencyKey,
        operation: buildOccurrenceBatchOperation({
          documentIds: params.documentIds,
          note: params.note,
          occurrenceTypeId: params.occurrenceTypeId,
          onBehalfOfDriverId: params.target.onBehalfOfDriverId,
        }),
        transaction,
      },
      () => performBatch(context),
      () => recallBatch(context),
    )
  })

  await notifyCreated({ outcome, params })

  return { items: outcome.items.map(({ documentId, id }) => ({ documentId, id })) }
}

/** Ressalva A3: a validação mora **dentro** do `perform` — o reenvio não a refaz. */
async function performBatch(context: BatchContext): Promise<BatchOutcome> {
  const occurrenceType = await context.transaction.findOccurrenceType({
    companyId: context.companyId,
    occurrenceTypeId: context.occurrenceTypeId,
  })
  if (
    occurrenceType === null ||
    !occurrenceType.active ||
    occurrenceType.stage !== TRIP_OCCURRENCE_STAGE.delivery
  ) {
    throw new OccurrenceTypeNotFieldError()
  }

  const reachable = new Set(
    await context.transaction.findReachableDocumentIds({
      companyId: context.companyId,
      documentIds: context.documentIds,
      target: toFieldTripTarget({ target: context.target }),
    }),
  )
  const unreachable = context.documentIds.filter((documentId) => !reachable.has(documentId))
  if (unreachable.length > 0) {
    throw new TripDocumentNotReachableError({ unreachableDocumentIds: unreachable })
  }

  const items = await recordItems({ context, occurrenceType })
  return { id: firstItemId(items), items, occurrenceType }
}

/**
 * Ressalva A3: o lote já liquidado se reconstrói pelas reservas de cada nota, na ordem do pedido.
 * Nunca `null` — `null` faria `withFieldReport` executar o lote de novo.
 */
async function recallBatch(context: BatchContext): Promise<BatchOutcome> {
  const items = await recordItems({ context, occurrenceType: null })
  return { id: firstItemId(items), items, occurrenceType: null }
}

/**
 * Em série, e de propósito (ressalva B3): a transação é uma conexão só, e consulta concorrente nela
 * pode nunca voltar. O lote tem no máximo `MAX_BATCH_DOCUMENTS` notas.
 */
async function recordItems(input: {
  readonly context: BatchContext
  readonly occurrenceType: OccurrenceTypeRecord | null
}): Promise<readonly BatchItemOutcome[]> {
  const items: BatchItemOutcome[] = []
  for (const documentId of input.context.documentIds) {
    items.push(await recordItem({ ...input, documentId }))
  }
  return items
}

async function recordItem(input: {
  readonly context: BatchContext
  readonly documentId: string
  readonly occurrenceType: OccurrenceTypeRecord | null
}): Promise<BatchItemOutcome> {
  const { context, documentId, occurrenceType } = input
  let createdNow = false
  const saved = await withFieldReport<{ readonly id: string }>(
    {
      actorUserId: context.actorUserId,
      authorship: context.authorship,
      companyId: context.companyId,
      idempotencyKey: buildOccurrenceBatchItemKey({
        documentId,
        idempotencyKey: context.idempotencyKey,
      }),
      operation: OFFICE_OCCURRENCE_BATCH_ITEM_OPERATION,
      transaction: context.transaction,
    },
    async () => {
      if (occurrenceType === null) throw new TripDocumentNotReachableError()
      const occurrence = await context.transaction.saveDocumentOccurrence({
        actorUserId: context.actorUserId,
        authorship: context.authorship,
        companyId: context.companyId,
        documentId,
        note: context.note,
        occurrenceTypeId: occurrenceType.id,
        productCode: '',
        stage: TRIP_OCCURRENCE_STAGE.delivery,
        tripId: context.target.tripId,
        typeName: occurrenceType.name,
      })
      if (occurrence === null) throw new TripDocumentNotReachableError()
      createdNow = true
      return { id: occurrence.id }
    },
    async (resultId) => {
      const recalled = await context.transaction.findDocumentOccurrence({
        companyId: context.companyId,
        occurrenceId: resultId,
      })
      return recalled === null ? null : { id: recalled.id }
    },
  )
  return { createdNow, documentId, id: saved.id }
}

function firstItemId(items: readonly BatchItemOutcome[]): string {
  const [first] = items
  if (first === undefined) throw new TripDocumentNotReachableError()
  return first.id
}

/**
 * Um aviso por nota **criada nesta chamada**, depois do commit e fora da transação — por isso o
 * `Promise.all`. A regra (tipo com aviso ligado, destinatário, falha engolida) é a de
 * `notifyOccurrence`, sem cópia. Os avisos vão para quem despachou a viagem (ressalva M4).
 */
async function notifyCreated(input: {
  readonly outcome: BatchOutcome
  readonly params: RegisterOfficeDocumentOccurrencesParams
}): Promise<void> {
  const { occurrenceType } = input.outcome
  if (occurrenceType === null) return

  const { params } = input
  await Promise.all(
    input.outcome.items
      .filter((item) => item.createdNow)
      .map(async (item) =>
        notifyOccurrence({
          companyId: params.companyId,
          notificationParameters: {
            ...(await params.notifications.readLabels({
              companyId: params.companyId,
              documentId: item.documentId,
              tripId: params.target.tripId,
            })),
            documentId: item.documentId,
            occurrenceType: '',
            tripId: params.target.tripId,
          },
          notifier: params.notifications.notifier,
          occurrenceType,
        }),
      ),
  )
}
